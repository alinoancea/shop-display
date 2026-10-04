const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { initDb, getCachedScreen, saveCachedScreen } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const SCREEN_SERVER_URL = (process.env.SCREEN_SERVER_URL || '').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 8000;
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(clientBuildPath, 'index.html'));

app.use(cors());
app.use(express.json());

function isValidScreen(p) {
  return (
    p &&
    typeof p === 'object' &&
    typeof p.configured === 'boolean' &&
    Array.isArray(p.blocks) &&
    p.blocks.every((b) => b && Array.isArray(b.items) && Number.isInteger(b.width)) &&
    (p.refresh_seconds == null || Number.isFinite(p.refresh_seconds))
  );
}

function requireServerUrl(req, res, next) {
  if (!SCREEN_SERVER_URL) {
    return res.status(500).json({ error: 'SCREEN_SERVER_URL nu este setat pe dispozitiv' });
  }
  next();
}

// Register a new screen on the remote server (called once per device)
app.post('/api/screens/register', requireServerUrl, async (req, res) => {
  try {
    const r = await fetch(`${SCREEN_SERVER_URL}/api/screens/register`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await r.json();
    if (r.status !== 201 || !Number.isInteger(body.id)) throw new Error(`register returned ${r.status}`);
    res.status(201).json({ id: body.id });
  } catch (err) {
    console.error('[Register] Failed:', err.message);
    res.status(502).json({ error: 'Serverul nu răspunde' });
  }
});

// Screen config + products. Falls back to the last valid response when the server is unreachable.
app.get('/api/screen/:id', requireServerUrl, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Id invalid' });

  try {
    const r = await fetch(`${SCREEN_SERVER_URL}/json_screen/${id}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (r.status === 404) return res.status(404).json({ error: 'Ecran negăsit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const payload = await r.json();
    if (!isValidScreen(payload)) throw new Error('invalid payload');
    saveCachedScreen(id, payload);
    res.json(payload);
  } catch (err) {
    console.error(`[Screen ${id}] Fetch failed:`, err.message);
    const cached = getCachedScreen(id);
    if (cached) return res.json({ ...cached, stale: true });
    res.status(503).json({ error: 'Serverul nu răspunde și nu există date salvate' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

if (isProd) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
