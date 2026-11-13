// Session management: Google Identity Services → POST /api/Auth/google → GameNest JWT → GET /api/Profile.
// The GameNest JWT is kept in localStorage (stays signed in across browser restarts until it expires or the user signs
// out); the user (and role) live in memory and always come from the backend.
// The Google credential is used once to obtain the GameNest JWT and is never stored.
(() => {
    'use strict';

    const config = window.GameNestConfig;
    const api = window.GameNestApi;
    const TOKEN_KEY = 'gamenest_jwt';
    const GIS_SRC = 'https://accounts.google.com/gsi/client';

    // status: 'anonymous' | 'loading' | 'authenticated' | 'error' (token present, but the profile could not be loaded)
    let state = { status: 'anonymous', user: null, error: null };
    const listeners = new Set();

    function setState(next) {
        state = { ...state, ...next };
        listeners.forEach(fn => { try { fn(state); } catch (e) { console.error('Session listener failed', e); } });
    }

    // The JWT is kept in localStorage so the user stays signed in after closing the browser (the backend issues
    // long-lived tokens, Jwt:LifetimeDays). An expired token is dropped locally instead of costing a 401 round trip.
    function isExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
        } catch {
            return true; // not a JWT
        }
    }
    function readToken() {
        try {
            // One-time move of a token from the previous sessionStorage-based version.
            const legacy = sessionStorage.getItem(TOKEN_KEY);
            if (legacy) {
                sessionStorage.removeItem(TOKEN_KEY);
                if (!localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, legacy);
            }
            const token = localStorage.getItem(TOKEN_KEY);
            if (token && isExpired(token)) {
                localStorage.removeItem(TOKEN_KEY);
                return null;
            }
            return token;
        } catch {
            return null;
        }
    }
    function writeToken(token) {
        try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable: session lasts for this page only */ }
        memoryToken = token;
    }
    function removeToken() {
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        memoryToken = null;
    }
    let memoryToken = readToken();

    // Signing in or out in another tab applies here too.
    window.addEventListener('storage', event => {
        if (event.key !== TOKEN_KEY || event.storageArea !== localStorage || event.newValue === memoryToken) return;
        memoryToken = event.newValue;
        if (memoryToken) loadProfile();
        else setState({ status: 'anonymous', user: null, error: null });
    });

    api.setTokenProvider(() => memoryToken);
    api.onUnauthorized(() => {
        removeToken();
        setState({ status: 'anonymous', user: null, error: 'Сесія завершилась. Увійди знову.' });
    });

    function normalizeUser(profile) {
        if (!profile || typeof profile !== 'object') throw new api.ApiError(500, 'invalid_profile', 'Сервер повернув некоректний профіль.');
        const role = typeof profile.role === 'string' ? profile.role : '';
        return Object.freeze({
            id: profile.id,
            username: profile.username || '',
            email: profile.email || '',
            role,
            emailConfirmed: profile.emailConfirmed === true,
            isAdmin: role.toLowerCase() === 'admin'
        });
    }

    /** Loads the current user from GET /api/Profile (role included). */
    async function loadProfile() {
        if (!memoryToken) {
            setState({ status: 'anonymous', user: null });
            return null;
        }
        setState({ status: 'loading', error: null });
        try {
            const user = normalizeUser(await api.get('/api/Profile'));
            setState({ status: 'authenticated', user, error: null });
            return user;
        } catch (error) {
            if (error instanceof api.ApiError && error.status === 401) return null; // session already cleared by onUnauthorized
            setState({ status: 'error', user: null, error: api.describeError(error) });
            return null;
        }
    }

    /** Exchanges a Google ID token for a GameNest JWT, then loads the profile. */
    async function signInWithGoogle(credential) {
        if (!credential) throw new api.ApiError(0, 'invalid_google_token', 'Google не повернув дані для входу.');
        const previous = state;
        setState({ status: 'loading', error: null });
        let result;
        try {
            result = await api.post('/api/Auth/google', { idToken: credential }, { auth: false });
        } catch (error) {
            // A failed sign-in leaves the previous session (if any) as it was.
            setState({ status: previous.status === 'loading' ? 'anonymous' : previous.status, user: previous.user, error: api.describeError(error) });
            throw error;
        }
        if (!result || typeof result.token !== 'string' || !result.token) {
            setState({ status: 'anonymous', error: 'Сервер не повернув токен входу.' });
            throw new api.ApiError(500, 'invalid_auth_response', 'Сервер не повернув токен входу.');
        }
        writeToken(result.token);
        const user = await loadProfile();
        return { user, isNewUser: result.isNewUser === true };
    }

    function signOut() {
        removeToken();
        try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* GIS not loaded */ }
        setState({ status: 'anonymous', user: null, error: null });
    }

    let gisPromise = null;
    /** Loads the Google Identity Services script once. */
    function loadGoogleIdentity() {
        if (window.google?.accounts?.id) return Promise.resolve(window.google);
        if (gisPromise) return gisPromise;
        gisPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = GIS_SRC;
            script.async = true;
            script.defer = true;
            script.onload = () => window.google?.accounts?.id ? resolve(window.google) : reject(new Error('GIS unavailable'));
            script.onerror = () => { gisPromise = null; reject(new Error('GIS failed to load')); };
            document.head.appendChild(script);
        });
        return gisPromise;
    }

    let gisInitializedFor = null;
    /**
     * Renders the "Sign in with Google" button into `container`.
     * `onCredential(credential)` receives the Google ID token from the button.
     */
    async function renderGoogleButton(container, onCredential) {
        if (!config.googleClientId) throw new Error('google_client_id_missing');
        const google = await loadGoogleIdentity();
        if (gisInitializedFor !== config.googleClientId) {
            google.accounts.id.initialize({
                client_id: config.googleClientId,
                callback: response => onCredential(response?.credential),
                auto_select: false,
                cancel_on_tap_outside: true,
                use_fedcm_for_prompt: true
            });
            gisInitializedFor = config.googleClientId;
        }
        container.innerHTML = '';
        google.accounts.id.renderButton(container, {
            type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill',
            locale: 'uk', width: Math.min(360, Math.max(220, Math.floor(container.clientWidth || 320)))
        });
    }

    window.GameNestSession = Object.freeze({
        get state() { return state; },
        get user() { return state.user; },
        get isAuthenticated() { return state.status === 'authenticated' && !!state.user; },
        get isAdmin() { return state.status === 'authenticated' && !!state.user?.isAdmin; },
        hasToken: () => !!memoryToken,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        restore: loadProfile,
        reloadProfile: loadProfile,
        signInWithGoogle,
        signOut,
        renderGoogleButton,
        clearError() { setState({ error: null }); }
    });
})();
