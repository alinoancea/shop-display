const https = require('https');
const http = require('http');
const { upsertProductsForGama } = require('./db');

const PRODUCTS_API_HOST = process.env.PRODUCTS_API_HOST || 'central.local';
const PRODUCTS_API_PORT = process.env.PRODUCTS_API_PORT || '18766';
const PRODUCTS_API_BASE =
  process.env.PRODUCTS_API_BASE || `http://${PRODUCTS_API_HOST}:${PRODUCTS_API_PORT}/json_items`;

function fetchFromApi(gama, timeoutMs = 5000) {
  const url = `${PRODUCTS_API_BASE}?gama=${encodeURIComponent(gama || 'fruits')}`;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function isProductLike(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  return keys.some((k) =>
    ['name', 'title', 'nome', 'product_name', 'denumire', 'barcode', 'id'].includes(k) &&
    obj[k] != null &&
    String(obj[k]).trim() !== ''
  );
}

function flattenToProducts(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    if (isProductLike(item)) {
      out.push(item);
      continue;
    }
    const inner = item.items ?? item.products ?? item.data ?? item.children;
    if (Array.isArray(inner)) {
      out.push(...flattenToProducts(inner));
    }
  }
  return out;
}

/**
 * Parse API response: { "fish": [...], "extras": [...] } (gama name as key).
 * Handles nested structures (items inside objects), root array, alternate keys.
 */
function parseApiResponse(json, gama) {
  if (json == null) return [];
  if (Array.isArray(json)) return flattenToProducts(json);

  const main = Array.isArray(json[gama]) ? json[gama] : [];
  const extras = Array.isArray(json.extras) ? json.extras : [];
  let out = [...main, ...extras];

  if (out.length === 0) {
    const val = json[gama] ?? json.items ?? json.products ?? json.data;
    if (Array.isArray(val)) out = val;
    else if (val && typeof val === 'object') {
      const inner = val.items ?? val.products ?? val.data ?? val[Object.keys(val)[0]];
      if (Array.isArray(inner)) out = inner;
    }
    if (out.length === 0) {
      const key = Object.keys(json || {}).find((k) => k.toLowerCase() === gama.toLowerCase());
      if (key && Array.isArray(json[key])) out = json[key];
    }
  }
  return flattenToProducts(out);
}

function parseQuantity(p) {
  const val = p.quantity ?? p.qty ?? p.stock ?? p.quantidade ?? p.stock_quantity;
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

const NAME_KEYS = ['name', 'title', 'nome', 'product_name', 'denumire', 'nume', 'denumire_produs', 'designation', 'label', 'articol'];

function getProductName(p) {
  for (const k of NAME_KEYS) {
    const v = p?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return 'Unknown';
}

function normalizeProducts(raw, gama) {
  if (!Array.isArray(raw)) return [];
  const products = raw
    .filter((p) => p && getProductName(p) !== 'Unknown')
    .map((p, idx) => {
      const quantity = parseQuantity(p);
      let barcode = String(p.barcode != null ? p.barcode : p.id != null ? p.id : idx).trim();
      if (!barcode) barcode = `gen-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return {
        barcode,
        name: getProductName(p),
        description: String(p.um || p.description || '').trim(),
        price: typeof p.price === 'number' ? `${p.price.toFixed(2)}` : String(p.price || p.preco || ''),
        gama: String(gama || '').trim(),
        quantity,
      };
    })
    .filter((p) => p.name && (p.quantity == null || p.quantity !== 0));
  return products;
}

async function syncFromApi(gama) {
  const gamaKey = gama || 'fruits';
  try {
    const raw = await fetchFromApi(gamaKey);
    const combined = parseApiResponse(raw, gamaKey);
    const products = normalizeProducts(combined, gamaKey);
    if (products.length === 0) {
      console.log(`[Sync] No valid products for gama=${gamaKey}`);
      return [];
    }
    upsertProductsForGama(products, gamaKey);
    console.log(`[Sync] Loaded ${products.length} products for gama=${gamaKey}`);
    return products;
  } catch (err) {
    console.error(`[Sync] Failed to fetch gama=${gamaKey}:`, err.message);
    return [];
  }
}

/**
 * Sync all gamas: successful API fetches replace that gama's products;
 * failed fetches leave existing local products unchanged.
 */
async function runSyncAll(config) {
  let anySuccess = false;
  for (const { gama } of config) {
    const products = await syncFromApi(gama);
    if (products.length > 0) anySuccess = true;
  }
  return anySuccess;
}

module.exports = { syncFromApi, runSyncAll, fetchFromApi, parseApiResponse, normalizeProducts };
