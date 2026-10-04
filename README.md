# Product Display Kiosk

React + Node.js kiosk display. What each screen shows is configured on a remote Flask server; the device only reads and renders it.

## Setup and run

```bash
npm run install:all
```

Development (two terminals):

```bash
SCREEN_SERVER_URL=http://192.168.1.10:5000 npm run server
npm run client   # http://localhost:5173
```

Production (one process, http://localhost:3001):

```bash
npm start
```

Docker (`SCREEN_SERVER_URL` is required, e.g. in a `.env` file):

```bash
docker compose up --build
```

## How it works

- On first start the browser registers a new screen (`POST /api/screens/register`) and saves its id in `localStorage`. Each browser has its own id.
- It then polls `GET /json_screen/{id}` through the Node server every `refresh_seconds` (value comes from each response).
- Unconfigured screens show their ID; a 404 lets you enter another id or register a new screen.
- If the Flask server is unreachable, the last valid response (cached in SQLite) keeps being shown.

## Configuration

| Env Variable        | Description                                  | Default                     |
|---------------------|----------------------------------------------|-----------------------------|
| `SCREEN_SERVER_URL` | Flask server, e.g. `http://192.168.1.10:5000` | (required)                  |
| `PORT`              | Backend port                                 | 3001                        |
| `DB_PATH`           | SQLite cache file                            | `server/products.db`        |

## Raspberry Pi Kiosk

```ini
Exec=/usr/bin/chromium-browser --kiosk --noerrdialogs http://localhost:3001
```
