// Profile, privacy and public profiles through the GameNest API.
//   GET /api/Profile               — own profile (loaded by session.js)
//   PUT /api/Profile               — change the own username { username } (409 username_already_exists)
//   GET /api/Profile/privacy       — { isProfilePublic, isLibraryPublic }
//   PUT /api/Profile/privacy       — save both switches
//   GET /api/Profile/{username}    — public profile { id, username }; 404 when it does not exist or is private
(() => {
    'use strict';

    const api = window.GameNestApi;
    const session = window.GameNestSession;

    // Same limits as UpdateProfileDto.
    const USERNAME = Object.freeze({ min: 3, max: 100 });

    function validateUsername(value) {
        const name = typeof value === 'string' ? value.trim() : '';
        if (name.length < USERNAME.min) return `Ім’я — щонайменше ${USERNAME.min} символи.`;
        if (name.length > USERNAME.max) return `Ім’я — до ${USERNAME.max} символів.`;
        return null;
    }

    /** Saves the username; the session profile is reloaded from GET /api/Profile so every page shows the new name. */
    async function updateUsername(username) {
        const result = await api.put('/api/Profile', { username: username.trim() });
        await session.reloadProfile();
        return result;
    }

    function normalizePrivacy(p) {
        if (!p || typeof p !== 'object') throw new api.ApiError(500, 'invalid_privacy', 'Сервер повернув некоректні налаштування.');
        return { isProfilePublic: p.isProfilePublic === true, isLibraryPublic: p.isLibraryPublic === true };
    }

    /** Public profile, or null when it does not exist or is private (the backend answers 404 for both). */
    async function getPublic(username) {
        try {
            const p = await api.get(`/api/Profile/${encodeURIComponent(username)}`, { auth: false });
            if (!p || typeof p.username !== 'string') throw new api.ApiError(500, 'invalid_profile', 'Сервер повернув некоректний профіль.');
            return { id: p.id, username: p.username };
        } catch (error) {
            if (error instanceof api.ApiError && error.status === 404) return null;
            throw error;
        }
    }

    window.GameNestProfile = Object.freeze({
        USERNAME,
        validateUsername,
        updateUsername,
        getPrivacy: () => api.get('/api/Profile/privacy').then(normalizePrivacy),
        updatePrivacy: ({ isProfilePublic, isLibraryPublic }) =>
            api.put('/api/Profile/privacy', { isProfilePublic: !!isProfilePublic, isLibraryPublic: !!isLibraryPublic }).then(normalizePrivacy),
        getPublic
    });
})();
