const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'products.db');
let db = null;

async function initDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS screen_cache (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  saveDb();
  return db;
}

function saveDb() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function getCachedScreen(id) {
  const stmt = db.prepare('SELECT payload FROM screen_cache WHERE id = ?');
  stmt.bind([id]);
  const payload = stmt.step() ? JSON.parse(stmt.getAsObject().payload) : null;
  stmt.free();
  return payload;
}

function saveCachedScreen(id, payload) {
  db.run('INSERT OR REPLACE INTO screen_cache (id, payload) VALUES (?, ?)', [id, JSON.stringify(payload)]);
  saveDb();
}

module.exports = { initDb, getCachedScreen, saveCachedScreen };
