# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No tests or linter are configured.

```bash
npm run install:all   # install root, server/ and client/ deps
npm run server        # backend on :3001 (cd server && node index.js)
npm run client        # Vite dev server on :5173, proxies /api -> localhost:3001
npm run build         # build client to client/dist
npm start             # build + run server (serves client/dist when it exists)
docker compose up --build   # production container (port 127.0.0.1:80 -> 3001)
```

## Architecture

Kiosk display for a Raspberry Pi. What each screen shows (blocks, titles, widths, products) is defined on a remote Flask server; the device only reads and renders it. Three separate npm projects (root scripts only, `server/`, `client/`); `server/` is CommonJS, `client/` is ESM.

- **`server/index.js`** is a thin proxy to the Flask server (`SCREEN_SERVER_URL`, required): `POST /api/screens/register` -> Flask `POST /api/screens/register`, and `GET /api/screen/:id` -> Flask `GET /json_screen/:id` (8s timeout). A valid response is cached; on timeout/5xx/invalid JSON the cached one is returned with `stale: true` (503 if none). A Flask 404 is passed through without fallback. There is no background sync: Flask treats each `json_screen` call as a heartbeat, so the cadence is set by the client polling at `refresh_seconds`. Also serves `client/dist` with an SPA fallback.
- **`server/db.js`** uses `sql.js` (in-memory SQLite, WASM, persisted to `DB_PATH`, default `server/products.db`) with one table, `screen_cache(id, payload JSON)`. An old `products` table in an existing DB is ignored.
- **`client/src/App.jsx`** owns the screen id in `localStorage` (`screenId`; each browser has its own, several browsers can use one server). No id -> register once (retry every 10s on failure; `registerScreen` dedupes StrictMode's double effect), then poll `/api/screen/:id` every `refresh_seconds` from the last response. States: unconfigured (shows "ID n"), 404 (id form + "register new", no auto re-register), no server. Blocks use Bootstrap `col-lg-{width*2}` (grid of 6) and `width` product columns; `gama` is never used. The right-hand block gets the `gama-section--alt` accent.
- **`Dockerfile`**: multi-stage; the entrypoint chowns `/app/data` and drops to a non-root user via `su-exec`.

Env vars: `SCREEN_SERVER_URL` (e.g. `http://192.168.1.10:5000`), `PORT` (3001), `DB_PATH`.
