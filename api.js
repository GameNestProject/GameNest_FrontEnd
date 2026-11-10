// Central API client for the GameNest backend. All HTTP calls go through here.
// Tokens and request bodies are never logged.
(() => {
    'use strict';

    const config = window.GameNestConfig;

    class ApiError extends Error {
        constructor(status, code, message, details = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = status;        // HTTP status, 0 for network errors / timeouts
            this.code = code;            // backend "code" or a client-side code
            this.retryAfter = details.retryAfter ?? null; // seconds, for 429
            this.errors = details.errors ?? null;         // ASP.NET validation errors (400)
        }
    }

    // Messages shown to the user, by backend error code (see GameNest_BackEnd README).
    const codeMessages = {
        invalid_google_token: 'Google не підтвердив вхід. Спробуй ще раз.',
        google_email_not_verified: 'Електронна пошта цього Google-акаунта не підтверджена.',
        email_registered_unconfirmed: 'Акаунт із цією поштою вже існує, але пошту не підтверджено. Звернись до адміністратора.',
        account_linked_to_another_google_account: 'Акаунт із цією поштою вже прив’язаний до іншого Google-акаунта.',
        account_link_required: 'Акаунт із цією поштою вже існує. Його потрібно прив’язати до Google — звернись до адміністратора.',
        duplicate_accounts_for_email: 'Для цієї пошти знайдено кілька акаунтів. Звернись до адміністратора.',
        google_auth_unavailable: 'Сервіс Google тимчасово недоступний. Спробуй пізніше.',
        google_auth_not_configured: 'Вхід через Google ще не налаштовано на сервері.',
        google_sign_in_busy: 'Сервер зайнятий. Спробуй ще раз за мить.',
        too_many_requests: 'Забагато спроб. Зачекай трохи й спробуй знову.',
        network_error: 'Не вдалося з’єднатися із сервером. Перевір інтернет-з’єднання.',
        timeout: 'Сервер не відповів вчасно. Можливо, він прокидається — спробуй ще раз.'
    };

    const statusMessages = {
        400: 'Запит містить некоректні дані.',
        401: 'Сесія завершилась. Увійди знову.',
        403: 'Недостатньо прав для цієї дії.',
        404: 'Не знайдено.',
        409: 'Конфлікт даних.',
        429: codeMessages.too_many_requests,
        500: 'Помилка сервера. Спробуй пізніше.'
    };

    const statusCodes = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'too_many_requests' };

    let tokenProvider = () => null;
    let unauthorizedHandler = null;

    function messageFor(status, code) {
        return codeMessages[code] || statusMessages[status] || (status >= 500 ? statusMessages[500] : 'Сталася помилка.');
    }

    async function readBody(response) {
        if (response.status === 204 || response.status === 205) return null;
        const text = await response.text();
        if (!text) return null;
        const type = response.headers.get('Content-Type') || '';
        if (type.includes('json')) {
            try { return JSON.parse(text); } catch { return null; }
        }
        return null; // non-JSON bodies (e.g. HTML error pages) are not exposed
    }

    function retryAfterSeconds(response) {
        const value = response.headers.get('Retry-After');
        if (!value) return null;
        const seconds = Number(value);
        if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
        const date = Date.parse(value);
        return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
    }

    /**
     * Sends a request. `auth` (default true) adds the GameNest JWT when one exists.
     * Resolves with the parsed JSON (or null for empty responses); rejects with ApiError.
     */
    async function request(method, path, { body, auth = true, signal } = {}) {
        const headers = { Accept: 'application/json' };
        const init = { method, headers, mode: 'cors', credentials: 'omit', cache: 'no-store' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
        const token = auth ? tokenProvider() : null;
        if (token) headers.Authorization = `Bearer ${token}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort('timeout'), config.requestTimeoutMs);
        if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        init.signal = controller.signal;

        let response;
        try {
            response = await fetch(config.apiBaseUrl + path, init);
        } catch (error) {
            if (signal?.aborted) throw error;
            const code = controller.signal.aborted ? 'timeout' : 'network_error';
            throw new ApiError(0, code, messageFor(0, code));
        } finally {
            clearTimeout(timer);
        }

        const data = await readBody(response);
        if (response.ok) return data;

        const status = response.status;
        const code = (data && typeof data.code === 'string' && data.code)
            || (status === 400 && data?.errors ? 'validation_error' : null)
            || statusCodes[status]
            || (status >= 500 ? 'server_error' : 'http_error');
        const error = new ApiError(status, code, messageFor(status, code), {
            retryAfter: status === 429 ? retryAfterSeconds(response) : null,
            errors: data?.errors
        });

        // An authenticated request rejected with 401 means the stored session is no longer valid.
        if (status === 401 && token && unauthorizedHandler) unauthorizedHandler(error);
        throw error;
    }

    window.GameNestApi = Object.freeze({
        ApiError,
        get: (path, options) => request('GET', path, options),
        post: (path, body, options) => request('POST', path, { ...options, body }),
        put: (path, body, options) => request('PUT', path, { ...options, body }),
        delete: (path, options) => request('DELETE', path, options),
        /** Supplies the current GameNest JWT (called for every authenticated request). */
        setTokenProvider(fn) { tokenProvider = typeof fn === 'function' ? fn : () => null; },
        /** Called once per failed authenticated request with status 401. */
        onUnauthorized(fn) { unauthorizedHandler = typeof fn === 'function' ? fn : null; },
        /** User-facing text for any error thrown by the client. */
        describeError(error) {
            if (error instanceof ApiError) {
                if (error.status === 429 && error.retryAfter) return `${error.message} (≈ ${error.retryAfter} с)`;
                return error.message;
            }
            return 'Сталася неочікувана помилка.';
        }
    });
})();
