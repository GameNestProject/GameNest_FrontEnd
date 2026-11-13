// Game submissions and moderation through the GameNest API (no local storage).
//   POST   /api/Submissions                 — propose a new game, or a correction of a catalog game (authenticated user)
//   GET    /api/Submissions/mine?status=…   — the caller's own submissions
//   GET    /api/Submissions?status=…        — admin: all submissions (users only get their own)
//   GET    /api/Submissions/{id}            — one submission (owner or admin)
//   PUT    /api/Submissions/{id}            — edit a pending submission (owner or admin)
//   DELETE /api/Submissions/{id}            — withdraw an own pending submission
//   PUT    /api/Submissions/{id}/approve    — admin: approve → game added to (or corrected in) the catalog
//   PUT    /api/Submissions/{id}/reject     — admin: reject with an optional reason
//   POST   /api/Games                       — admin: add a game to the catalog directly
// The backend validates everything again; the checks here only give faster feedback.
(() => {
    'use strict';

    const api = window.GameNestApi;
    const catalog = window.GameNestCatalog;

    // Same limits as the backend (DTOs/GameFieldValidation.cs).
    const LIMITS = Object.freeze({ title: 200, description: 5000, name: 200, url: 2048, reason: 2000, minYear: 1950, maxYearsAhead: 10 });
    const FIELDS = ['title', 'description', 'developer', 'publisher', 'releaseDate', 'coverUrl', 'trailerUrl'];
    const STATUS = Object.freeze({
        Pending: { label: 'На розгляді', css: 'pending' },
        Approved: { label: 'Схвалено', css: 'approved' },
        Rejected: { label: 'Відхилено', css: 'rejected' }
    });
    const TYPE = Object.freeze({ NewGame: 'Нова гра', Correction: 'Виправлення' });

    const text = v => (typeof v === 'string' ? v.trim() : '');

    function isValidDateString(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const d = new Date(value + 'T00:00:00Z');
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    }

    /** Reads the form fields into trimmed values. */
    function readForm(form) {
        const data = new FormData(form);
        return Object.fromEntries(FIELDS.map(f => [f, text(data.get(f) ?? '')]));
    }

    /** Returns { field: message } for invalid values (empty object when valid). */
    function validate(values) {
        const errors = {};
        if (!values.title) errors.title = 'Вкажи назву гри.';
        else if (values.title.length > LIMITS.title) errors.title = `Назва — до ${LIMITS.title} символів.`;
        if (values.description.length > LIMITS.description) errors.description = `Опис — до ${LIMITS.description} символів.`;
        if (values.developer.length > LIMITS.name) errors.developer = `До ${LIMITS.name} символів.`;
        if (values.publisher.length > LIMITS.name) errors.publisher = `До ${LIMITS.name} символів.`;
        for (const f of ['coverUrl', 'trailerUrl']) {
            const v = values[f];
            if (v && (v.length > LIMITS.url || !catalog.safeHttpsUrl(v))) errors[f] = 'Потрібна повна адреса, що починається з https://';
        }
        if (values.releaseDate) {
            if (!isValidDateString(values.releaseDate)) errors.releaseDate = 'Некоректна дата.';
            else {
                const year = Number(values.releaseDate.slice(0, 4));
                const max = new Date(); max.setUTCFullYear(max.getUTCFullYear() + LIMITS.maxYearsAhead);
                if (year < LIMITS.minYear || new Date(values.releaseDate + 'T00:00:00Z') > max)
                    errors.releaseDate = `Дата має бути між ${LIMITS.minYear} роком і ${LIMITS.maxYearsAhead} роками наперед.`;
            }
        }
        return errors;
    }

    /** Request body shared by submissions and direct creation. The date is sent as UTC midnight. */
    function gameBody(values) {
        return {
            title: values.title,
            description: values.description,
            developer: values.developer,
            publisher: values.publisher,
            releaseDate: values.releaseDate ? `${values.releaseDate}T00:00:00Z` : null,
            coverUrl: values.coverUrl,
            trailerUrl: values.trailerUrl
        };
    }

    /** Maps ASP.NET validation errors ({ errors: { CoverUrl: [...] , "$.releaseDate": [...] } }) to form fields. */
    function fieldErrors(error) {
        const out = {};
        if (!(error instanceof api.ApiError) || !error.errors || typeof error.errors !== 'object') return out;
        for (const [key, messages] of Object.entries(error.errors)) {
            const name = key.replace(/^\$\.?/, '').replace(/^dto\.?/i, '');
            const field = FIELDS.find(f => f.toLowerCase() === name.toLowerCase());
            const message = Array.isArray(messages) && messages.length ? 'Сервер відхилив значення.' : null;
            if (field && message) out[field] = message;
        }
        return out;
    }

    /** Normalizes a SubmissionResponse for rendering (unknown statuses stay visible as text). */
    function normalize(s) {
        if (!s || typeof s !== 'object' || !Number.isInteger(s.id)) return null;
        const created = typeof s.createdAt === 'string' ? Date.parse(s.createdAt) : NaN;
        const reviewed = typeof s.reviewedAt === 'string' ? Date.parse(s.reviewedAt) : NaN;
        const release = typeof s.releaseDate === 'string' ? Date.parse(s.releaseDate) : NaN;
        return Object.freeze({
            id: s.id,
            type: s.type,
            typeLabel: TYPE[s.type] || String(s.type || ''),
            status: s.status,
            statusLabel: STATUS[s.status]?.label || String(s.status || ''),
            statusCss: STATUS[s.status]?.css || 'pending',
            title: text(s.title) || 'Без назви',
            description: text(s.description),
            developer: text(s.developer),
            publisher: text(s.publisher),
            coverUrl: catalog.safeHttpsUrl(s.coverUrl),
            trailerUrl: catalog.safeHttpsUrl(s.trailerUrl),
            rawCoverUrl: text(s.coverUrl),
            rawTrailerUrl: text(s.trailerUrl),
            releaseDate: Number.isNaN(release) ? null : new Date(release),
            createdAt: Number.isNaN(created) ? null : new Date(created),
            reviewedAt: Number.isNaN(reviewed) ? null : new Date(reviewed),
            adminComment: text(s.adminComment),
            gameId: Number.isInteger(s.gameId) ? s.gameId : null,
            submittedByUserId: s.submittedByUserId,
            submittedBy: text(s.submittedByUsername)
        });
    }
    const list = data => (Array.isArray(data) ? data.map(normalize).filter(Boolean) : []);

    const statusQuery = status => (status ? `?status=${encodeURIComponent(status)}` : '');
    // A submission keeps its type; a correction keeps the game it corrects.
    const submissionBody = (values, type, gameId) =>
        ({ type, gameId: type === 'Correction' ? gameId : null, ...gameBody(values) });

    window.GameNestSubmissions = Object.freeze({
        LIMITS, STATUS, TYPE,
        readForm, validate, fieldErrors, gameBody,
        submit: values => api.post('/api/Submissions', submissionBody(values, 'NewGame')).then(normalize),
        submitCorrection: (gameId, values) => api.post('/api/Submissions', submissionBody(values, 'Correction', gameId)).then(normalize),
        update: (submission, values) =>
            api.put(`/api/Submissions/${encodeURIComponent(submission.id)}`, submissionBody(values, submission.type, submission.gameId)).then(normalize),
        remove: id => api.delete(`/api/Submissions/${encodeURIComponent(id)}`),
        mine: (status = '') => api.get('/api/Submissions/mine' + statusQuery(status)).then(list),
        adminList: (status = 'Pending') => api.get('/api/Submissions' + statusQuery(status)).then(list),
        get: id => api.get(`/api/Submissions/${encodeURIComponent(id)}`).then(normalize),
        approve: id => api.put(`/api/Submissions/${encodeURIComponent(id)}/approve`).then(normalize),
        reject: (id, reason) => api.put(`/api/Submissions/${encodeURIComponent(id)}/reject`, { adminComment: text(reason) || null }).then(normalize),
        createGame: values => api.post('/api/Games', gameBody(values))
    });
})();
