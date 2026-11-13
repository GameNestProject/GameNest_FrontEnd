// The signed-in user's own games (games that are not in the catalog), through the GameNest API.
// Not the library: library items point to catalog games, user games are private records of the user.
//   GET    /api/UserGames        — own games
//   GET    /api/UserGames/{id}   — one own game (404 for other users' games)
//   POST   /api/UserGames        — create { title, description, coverUrl, developer, publisher, releaseDate }
//   PUT    /api/UserGames/{id}   — replace the same fields
//   DELETE /api/UserGames/{id}   — delete the game
// The backend stores only these fields (DTOs/UserCreatedGameDtos.cs): no status, rating, review or notes.
(() => {
    'use strict';

    const api = window.GameNestApi;
    const catalog = window.GameNestCatalog;

    // Backend limit for the title; the other fields have none on the server, the form keeps them reasonable.
    const LIMITS = Object.freeze({ title: 200, description: 5000, name: 200, url: 2048 });

    const text = v => (typeof v === 'string' ? v.trim() : '');

    function normalize(x) {
        if (!x || typeof x !== 'object' || !Number.isInteger(x.id)) return null;
        const parsed = typeof x.releaseDate === 'string' ? Date.parse(x.releaseDate) : NaN;
        const releaseDate = Number.isNaN(parsed) ? null : new Date(parsed);
        return Object.freeze({
            id: x.id,
            title: text(x.title) || 'Без назви',
            description: text(x.description),
            developer: text(x.developer),
            publisher: text(x.publisher),
            coverUrl: catalog.safeHttpsUrl(x.coverUrl),
            rawCoverUrl: text(x.coverUrl),
            releaseDate,
            releaseYear: releaseDate ? releaseDate.getUTCFullYear() : null
        });
    }

    /** Request body (UserCreatedGameDto). Strings are never null: the backend columns are NOT NULL. */
    function body(values) {
        return {
            title: values.title,
            description: values.description || '',
            coverUrl: values.coverUrl || '',
            developer: values.developer || '',
            publisher: values.publisher || '',
            releaseDate: values.releaseDate ? `${values.releaseDate}T00:00:00Z` : null
        };
    }

    const list = data => {
        if (!Array.isArray(data)) throw new api.ApiError(500, 'invalid_user_games', 'Сервер повернув некоректний список ігор.');
        return data.map(normalize).filter(Boolean);
    };

    window.GameNestUserGames = Object.freeze({
        LIMITS,
        list: () => api.get('/api/UserGames').then(list),
        get: id => api.get(`/api/UserGames/${encodeURIComponent(id)}`).then(normalize),
        create: values => api.post('/api/UserGames', body(values)).then(normalize),
        update: (id, values) => api.put(`/api/UserGames/${encodeURIComponent(id)}`, body(values)).then(normalize),
        remove: id => api.delete(`/api/UserGames/${encodeURIComponent(id)}`)
    });
})();
