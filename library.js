// The signed-in user's library of official catalog games, through the GameNest API (no local storage).
//   GET    /api/Library            — own library items, each with its game
//   POST   /api/Library/{gameId}   — add a catalog game { status, purchased }   (409 game_already_in_library)
//   PUT    /api/Library/{gameId}   — change { status, purchased }
//   DELETE /api/Library/{gameId}   — remove the game from the library
// One in-memory copy per session; it is cleared on sign-out and replaced by the server's answer after every change.
(() => {
    'use strict';

    const api = window.GameNestApi;
    const catalog = window.GameNestCatalog;
    const session = window.GameNestSession;

    // Backend values (DTOs/LibraryDtos.cs) with the labels shown in the UI, in display order.
    const STATUSES = Object.freeze([
        { value: 'Planned', label: 'Заплановано', css: 'wishlist' },
        { value: 'Playing', label: 'Граю', css: 'playing' },
        { value: 'Completed', label: 'Пройдено', css: 'completed' },
        { value: 'OnHold', label: 'Відкладено', css: 'pending' },
        { value: 'Dropped', label: 'Покинуто', css: 'rejected' }
    ]);
    const statusInfo = value => STATUSES.find(s => s.value === value) || { value, label: String(value || ''), css: '' };

    // status: 'idle' | 'loading' | 'success' | 'error'
    let state = { status: 'idle', items: [], error: null, errorStatus: null, userId: null };
    let pending = null;
    const listeners = new Set();

    function setState(next) {
        state = { ...state, ...next };
        listeners.forEach(fn => { try { fn(state); } catch (e) { console.error('Library listener failed', e); } });
    }

    /** Maps a LibraryItemResponse; the game uses the catalog's view model. */
    function normalize(item) {
        if (!item || typeof item !== 'object' || !Number.isInteger(item.gameId)) return null;
        const info = statusInfo(item.status);
        return Object.freeze({
            id: item.id,
            gameId: item.gameId,
            status: item.status,
            statusLabel: info.label,
            statusCss: info.css,
            purchased: item.purchased === true,
            game: catalog.normalize(item.game)
        });
    }

    function currentUserId() {
        return session.isAuthenticated ? session.user?.id ?? null : null;
    }

    /** Loads the library of the signed-in user once; `force` reloads. Resolves with the items (never rejects). */
    function load({ force = false } = {}) {
        const userId = currentUserId();
        if (userId === null) {
            setState({ status: 'idle', items: [], error: null, errorStatus: null, userId: null });
            return Promise.resolve([]);
        }
        if (pending) return pending;
        if (!force && state.status === 'success' && state.userId === userId) return Promise.resolve(state.items);
        setState({ status: 'loading', error: null, errorStatus: null, userId });
        pending = api.get('/api/Library')
            .then(data => {
                if (!Array.isArray(data)) throw new api.ApiError(500, 'invalid_library', 'Сервер повернув некоректну бібліотеку.');
                // A response for a user who has signed out (or switched) meanwhile is dropped.
                if (currentUserId() !== userId) return [];
                const items = data.map(normalize).filter(Boolean);
                setState({ status: 'success', items, error: null, errorStatus: null });
                return items;
            })
            .catch(error => {
                if (currentUserId() === userId) setState({ status: 'error', error: api.describeError(error), errorStatus: error?.status ?? null });
                return [];
            })
            .finally(() => { pending = null; });
        return pending;
    }

    /** The library item for a catalog game (from the loaded copy), or null. */
    function itemFor(gameId) {
        return state.status === 'success' ? state.items.find(i => i.gameId === gameId) || null : null;
    }

    function replaceItem(item) {
        if (!item) return;
        const others = state.items.filter(i => i.gameId !== item.gameId);
        setState({ items: [item, ...others] });
    }

    // Every change is confirmed by the server before the local copy changes.
    async function add(gameId, { status = 'Planned', purchased = false } = {}) {
        const item = normalize(await api.post(`/api/Library/${encodeURIComponent(gameId)}`, { status, purchased }));
        if (state.status === 'success') replaceItem(item);
        return item;
    }

    async function update(gameId, { status, purchased }) {
        const item = normalize(await api.put(`/api/Library/${encodeURIComponent(gameId)}`, { status, purchased: !!purchased }));
        if (state.status === 'success') replaceItem(item);
        return item;
    }

    async function remove(gameId) {
        await api.delete(`/api/Library/${encodeURIComponent(gameId)}`);
        if (state.status === 'success') setState({ items: state.items.filter(i => i.gameId !== gameId) });
    }

    // Sign-out (or another user) drops the copy; a new sign-in loads it again on demand.
    session.subscribe(() => {
        if (state.userId !== null && state.userId !== currentUserId())
            setState({ status: 'idle', items: [], error: null, errorStatus: null, userId: null });
    });

    window.GameNestLibrary = Object.freeze({
        STATUSES, statusInfo,
        get state() { return state; },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        load, itemFor, add, update, remove
    });
})();
