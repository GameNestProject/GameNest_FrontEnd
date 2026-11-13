// Game catalog from the GameNest API. Kept in memory only — never written to localStorage.
//   GET    /api/Games                      — public catalog (archived games are not listed)
//   GET    /api/Games/{id}                 — one game
//   GET    /api/GameTitles/{id}/versions   — all catalog versions sharing a game title
//   PUT    /api/Games/{id}                 — admin: edit a game
//   DELETE /api/Games/{id}                 — admin: archive a game (soft delete)
// (POST /api/Games — admin: add a game — lives in submissions.js next to the shared game form.)
(() => {
    'use strict';

    const api = window.GameNestApi;

    // status: 'idle' | 'loading' | 'success' | 'error'
    let state = { status: 'idle', games: [], error: null, errorStatus: null };
    let pending = null;
    const listeners = new Set();

    function setState(next) {
        state = { ...state, ...next };
        listeners.forEach(fn => { try { fn(state); } catch (e) { console.error('Catalog listener failed', e); } });
    }

    /** Returns an https URL (normalized) or null. Rejects other schemes, credentials and malformed values. */
    function safeHttpsUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const url = new URL(value.trim());
            if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
            return url.href;
        } catch {
            return null;
        }
    }

    function text(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    /** Maps a backend GameResponse to the view model. Fields the backend does not have (genre, platform, ...) are not invented. */
    function normalize(game) {
        if (!game || typeof game !== 'object' || !Number.isInteger(game.id) || game.id <= 0) return null;
        const parsed = typeof game.releaseDate === 'string' ? Date.parse(game.releaseDate) : NaN;
        const releaseDate = Number.isNaN(parsed) ? null : new Date(parsed);
        return Object.freeze({
            source: 'api',
            id: game.id,
            title: text(game.title) || 'Без назви',
            description: text(game.description),
            developer: text(game.developer),
            publisher: text(game.publisher),
            coverUrl: safeHttpsUrl(game.coverUrl),
            trailerUrl: safeHttpsUrl(game.trailerUrl),
            releaseDate,
            // UTC parts: the backend stores dates as UTC midnight, local time could shift them by a day.
            releaseYear: releaseDate ? releaseDate.getUTCFullYear() : null,
            gameTitleId: Number.isInteger(game.gameTitleId) ? game.gameTitleId : null,
            // Archived games never appear in the catalog, but library items can still point to them.
            isArchived: game.isArchived === true
        });
    }

    /** Loads the catalog once; later calls reuse the result. `force` reloads (e.g. "retry"). */
    function load({ force = false } = {}) {
        if (pending) return pending;
        if (!force && state.status === 'success') return Promise.resolve(state.games);
        setState({ status: 'loading', error: null, errorStatus: null });
        pending = api.get('/api/Games', { auth: false })
            .then(data => {
                if (!Array.isArray(data)) throw new api.ApiError(500, 'invalid_catalog', 'Сервер повернув некоректний каталог.');
                const games = data.map(normalize).filter(Boolean);
                setState({ status: 'success', games, error: null });
                return games;
            })
            .catch(error => {
                setState({ status: 'error', error: api.describeError(error), errorStatus: error?.status ?? null });
                return [];
            })
            .finally(() => { pending = null; });
        return pending;
    }

    /** A game from the already loaded list (no request), or null. */
    function cachedById(id) {
        return state.games.find(g => g.id === id) || null;
    }

    /** Fetches one game: resolves with the game, or null for 404; rejects with ApiError otherwise. */
    async function fetchById(id) {
        if (!Number.isInteger(id) || id <= 0) return null;
        try {
            const game = normalize(await api.get(`/api/Games/${id}`, { auth: false }));
            if (!game) throw new api.ApiError(500, 'invalid_game', 'Сервер повернув некоректні дані гри.');
            return game;
        } catch (error) {
            if (error instanceof api.ApiError && error.status === 404) return null;
            throw error;
        }
    }

    /** Other catalog versions of a game title (the given game excluded). 404 (unknown title) gives an empty list. */
    async function versions(gameTitleId, exceptGameId) {
        if (!Number.isInteger(gameTitleId) || gameTitleId <= 0) return [];
        try {
            const data = await api.get(`/api/GameTitles/${gameTitleId}/versions`, { auth: false });
            if (!Array.isArray(data)) throw new api.ApiError(500, 'invalid_versions', 'Сервер повернув некоректний список версій.');
            return data.map(normalize).filter(g => g && g.id !== exceptGameId);
        } catch (error) {
            if (error instanceof api.ApiError && error.status === 404) return [];
            throw error;
        }
    }

    /**
     * Admin: saves a game (PUT /api/Games/{id}). `body` uses the CreateGameDto fields; the game keeps its game title
     * (versions stay grouped) unless gameTitleId is passed explicitly. The catalog list is reloaded afterwards.
     */
    async function updateGame(id, body) {
        const game = normalize(await api.put(`/api/Games/${encodeURIComponent(id)}`, body));
        if (!game) throw new api.ApiError(500, 'invalid_game', 'Сервер повернув некоректні дані гри.');
        load({ force: true });
        return game;
    }

    /** Admin: archives a game (DELETE /api/Games/{id}); it disappears from the public catalog. */
    async function archiveGame(id) {
        await api.delete(`/api/Games/${encodeURIComponent(id)}`);
        setState({ games: state.games.filter(g => g.id !== id) });
        load({ force: true });
    }

    const collator = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });

    /** Client-side search (title, developer, publisher, description) and sort by title ('asc' | 'desc'). */
    function query(games, { search = '', sort = 'asc' } = {}) {
        const needle = search.trim().toLocaleLowerCase('uk');
        const found = needle
            ? games.filter(g => [g.title, g.developer, g.publisher, g.description]
                .some(v => v && v.toLocaleLowerCase('uk').includes(needle)))
            : games.slice();
        found.sort((a, b) => collator.compare(a.title, b.title) || a.id - b.id);
        return sort === 'desc' ? found.reverse() : found;
    }

    window.GameNestCatalog = Object.freeze({
        get state() { return state; },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        load,
        cachedById,
        fetchById,
        versions,
        updateGame,
        archiveGame,
        query,
        normalize,
        safeHttpsUrl
    });
})();
