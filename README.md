# GameNest Frontend
 
![Vanilla JS](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![No build step](https://img.shields.io/badge/build-none-lightgrey)
![Cloudflare](https://img.shields.io/badge/hosted%20on-Cloudflare-F38020?logo=cloudflare&logoColor=white)
 
Web client for **GameNest** — browse a video game catalog, keep a personal game library, suggest new games and track their moderation. The interface is in Ukrainian.
 
- Live site: <https://gamenest.pp.ua>
- Backend API: [GameNest_BackEnd](https://github.com/GameNestProject/GameNest_BackEnd) (`https://api.gamenest.pp.ua`)
## Features
 
- **Sign in with Google** (Google Identity Services). The Google credential is exchanged once for a GameNest JWT and is never stored
- Game catalog with search and sorting, and a page for each game (with trailer link)
- Personal library: add games from the catalog, set a status (`Planned`, `Playing`, `Completed`, `Dropped`, `OnHold`), mark as purchased, library statistics
- "My games": games you create yourself, visible only to you
- Game submissions: propose a new game or a correction to an existing one, edit or delete it while it is pending, see the moderator's comment after review
- Public user profiles and privacy settings (profile and library visibility), change of username
- **Admin area** (role `Admin`): moderate submissions (approve / reject with a comment), add games, edit and archive catalog games
- Clear error messages for API error codes, rate limiting (`429`) and a sleeping backend (the free Render instance can take about a minute to wake up)
- - Game catalog with search and sorting, hover previews on cards, and a page for each game (with trailer link)
## Tech Stack
 
- Plain HTML, CSS and JavaScript — **no framework, no bundler, no `npm install`**
- Client-side routing with the History API (`pushState`)
- [Google Identity Services](https://developers.google.com/identity/gsi/web) for sign-in
- [Cloudflare](https://developers.cloudflare.com/workers/static-assets/) static assets (`wrangler.jsonc`)
## Quick Start
 
The site is a set of static files, so any static server works. It must be served on **port 3000**, because the backend allows CORS in Development only from `http://localhost:3000`.
 
1. Start the backend locally (see its README): the API must listen on `http://localhost:5096`.
2. Serve this folder on port 3000 **with single-page-app fallback** (the app has real URLs such as `/catalog` or `/library`, so a refresh on them must return `index.html`):
```bash
npx serve -s . -l 3000
```
 
3. Open <http://localhost:3000>.
`config.js` picks the environment from the host name: `localhost`, `127.0.0.1` and `[::1]` use `development` (API at `http://localhost:5096`), anything else uses `production`.
 
### Google sign-in locally
 
- In Google Cloud Console, the OAuth **Web application** client must list `http://localhost` and `http://localhost:3000` as *Authorized JavaScript origins*.
- The local backend needs the same client ID:
```powershell
dotnet user-secrets set "Google:ClientId" "<client id>"
```
 
## Configuration
 
All settings live in [`config.js`](config.js). This file is served to every browser, so it may contain **public values only** — never a Google client secret, API keys or tokens.
 
| Setting | Description |
| --- | --- |
| `apiBaseUrl` | Backend base URL (production: `https://api.gamenest.pp.ua`, development: `http://localhost:5096`) |
| `googleClientId` | OAuth 2.0 Web client ID (`….apps.googleusercontent.com`). It is public and must equal `Google__ClientId` on the backend |
| `requestTimeoutMs` | Request timeout, `70000` ms (long enough for a waking Render instance) |
 
## Project Structure
 
```
GameNest_FrontEnd/
├── index.html        # Single page shell; loads the scripts below in order
├── styles.css        # All styles
├── config.js         # Environment-dependent public settings
├── api.js            # HTTP client: JWT header, timeouts, ApiError, user-facing error messages
├── session.js        # Google sign-in, JWT in localStorage, current user and role
├── catalog.js        # /api/Games, /api/GameTitles
├── library.js        # /api/Library
├── userGames.js      # /api/UserGames
├── profile.js        # /api/Profile, privacy settings
├── submissions.js    # /api/Submissions, admin moderation
├── app.js            # Routing, pages and UI
├── assets/           # Logo and images
├── wrangler.jsonc    # Cloudflare deployment config
└── .assetsignore     # Files that are not uploaded to Cloudflare
```
 
Scripts are loaded as classic `<script>` tags and talk to each other through globals (`GameNestConfig`, `GameNestApi`, `GameNestSession`, …), so the **order in `index.html` matters**.
 
## Pages
 
| URL | Page | Access |
| --- | --- | --- |
| `/` | Home | everyone |
| `/catalog` | Game catalog | everyone |
| `/game/{id}` | Game page | everyone |
| `/user/{username}` | Public profile | everyone (if the profile is public) |
| `/login` | Sign in with Google | everyone |
| `/library` | Personal library | signed in |
| `/my-games` | Games created by you | signed in |
| `/submit` | Suggest a game | signed in |
| `/submissions` | Your submissions and their status | signed in |
| `/profile`, `/settings` | Profile and privacy | signed in |
| `/admin/moderation`, `/admin/create`, `/admin/catalog`, `/admin/submissions/{id}` | Admin area | `Admin` |
 
Showing a page does not grant access: the real checks are done by the backend, which also re-reads the user's role from the database on every request.
 
## Authentication
 
1. Google Identity Services shows the "Sign in with Google" button and returns an ID token.
2. The app sends it to `POST /api/Auth/google` and receives a **GameNest JWT**.
3. The JWT is kept in `localStorage` (key `gamenest_jwt`), so the user stays signed in after closing the browser until the token expires (30 days by default, set by the backend). An expired token is dropped locally.
4. The user and their role are loaded from `GET /api/Profile` and kept in memory only.
5. A `401` response to an authenticated request ends the session; signing in or out in another tab applies to all tabs.
Password sign-in is switched off on the server for the MVP, so the app offers Google only.
 
## Deployment (Cloudflare)
 
The repository is deployed as static assets: [`wrangler.jsonc`](wrangler.jsonc) uploads the repository root, and [`.assetsignore`](.assetsignore) keeps `.git`, `.github`, `README.md` and the Wrangler files out of the upload. There is no build command.
 
```bash
npx wrangler deploy
```
 
Or connect the GitHub repository to Cloudflare so that every push to `main` deploys automatically. The Worker name in `wrangler.jsonc` must match the project name in Cloudflare.
 
> **Important:** the app uses real URLs (`/catalog`, `/library`, …). Static assets hosting must be told to return `index.html` for unknown paths, otherwise opening or refreshing such a URL gives a 404. In `wrangler.jsonc` this is `"assets": { "not_found_handling": "single-page-application" }`.
 
On the backend side, `CORS_ALLOWED_ORIGINS` must contain the exact origin the site is served from (`https://gamenest.pp.ua`), and the same origin must be an *Authorized JavaScript origin* of the Google client.
 
## Known Limitations
 
- There is no `/confirm-email` page. It is needed only if email/password registration is enabled on the backend (it is off for the MVP).
- The catalog is empty until an administrator adds games (the backend has no seed data).
- The first request after a pause can take up to about a minute (free Render and Neon plans).
- The JWT lives in `localStorage`, so the site must not run any untrusted third-party scripts.
- There are no automated frontend tests.
## License
 
The frontend repository has no license file yet. The backend is released under the MIT License.
 
