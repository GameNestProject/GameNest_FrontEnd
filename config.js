// GameNest frontend configuration.
// Only PUBLIC values belong here: this file is served to every browser.
// Never put the Google Client Secret, API keys or any other secret into the frontend.
(() => {
    'use strict';

    const environments = {
        production: {
            apiBaseUrl: 'https://api.gamenest.pp.ua',
            // OAuth 2.0 "Web application" Client ID from Google Cloud Console (ends with .apps.googleusercontent.com).
            // It is public. Use the same value as Google__ClientId in Render.
            googleClientId: '7853240997-j69a8m89bkv98llurs35e2nlda5fjn7f.apps.googleusercontent.com'
        },
        development: {
            // GameNest_BackEnd, Properties/launchSettings.json → profile "http".
            // The backend allows CORS only from http://localhost:3000 in Development (appsettings.Development.json),
            // so serve the frontend on port 3000.
            apiBaseUrl: 'http://localhost:5096',
            // Same Client ID; http://localhost and http://localhost:3000 must be Authorized JavaScript origins.
            // The local backend needs it too: dotnet user-secrets set "Google:ClientId" "<client id>"
            googleClientId: '7853240997-j69a8m89bkv98llurs35e2nlda5fjn7f.apps.googleusercontent.com'
        }
    };

    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    const name = isLocal ? 'development' : 'production';

    window.GameNestConfig = Object.freeze({
        environment: name,
        ...environments[name],
        // Render Free can take up to about a minute to wake up.
        requestTimeoutMs: 70000
    });
})();
