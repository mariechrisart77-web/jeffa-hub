// v82 C4: Chat-Speicherung – Lite-Kopie, Merge, Auswahl, IndexedDB-Helfer (rein, Node-testbar).

/**
 * Tiefe Kopie ohne große Binärdaten (data:-URLs, Base64-Anhänge).
 * @param {any[]} convs
 * @returns {any[]}
 */
export function liteCopy(convs) {
  const copy = typeof structuredClone === 'function' ? structuredClone(convs) : JSON.parse(JSON.stringify(convs ?? []));
  for (const c of Array.isArray(copy) ? copy : []) {
    for (const m of Array.isArray(c?.messages) ? c.messages : []) {
      let stripped = false;
      if (typeof m.imageUrl === 'string' && m.imageUrl.startsWith('data:')) { delete m.imageUrl; stripped = true; }
      if (typeof m.videoUrl === 'string' && m.videoUrl.startsWith('data:')) { delete m.videoUrl; stripped = true; }
      if (Array.isArray(m.images) && m.images.length) { delete m.images; stripped = true; }
      if (stripped) m.stripped = true;
    }
  }
  return Array.isArray(copy) ? copy : [];
}

function msgById(conv) {
  const map = new Map();
  for (const m of Array.isArray(conv?.messages) ? conv.messages : []) if (m && m.id) map.set(m.id, m);
  return map;
}

/**
 * Vereinigt zwei Stände nach Chat-id. Gleiche id: neuere updatedAt gewinnt (Gleichstand: primary).
 * Fehlende Binärdaten (stripped) werden aus der anderen Version ergänzt.
 * @param {any[]} primary
 * @param {any[]} secondary
 * @returns {any[]}
 */
export function mergeStores(primary, secondary) {
  const out = [];
  const index = new Map();
  const push = (conv) => { index.set(conv.id, out.length); out.push(conv); };
  for (const c of Array.isArray(primary) ? primary : []) if (c && c.id && !index.has(c.id)) push(c);
  for (const c of Array.isArray(secondary) ? secondary : []) {
    if (!c || !c.id) continue;
    const i = index.get(c.id);
    if (i == null) { push(c); continue; }
    const a = out[i];
    const newer = String(c.updatedAt || '') > String(a.updatedAt || '') ? c : a;
    const other = newer === c ? a : c;
    const merged = { ...newer, messages: Array.isArray(newer.messages) ? newer.messages.map((m) => ({ ...m })) : [] };
    const otherMsgs = msgById(other);
    for (const m of merged.messages) {
      const o = otherMsgs.get(m.id);
      if (!o) continue;
      if (!m.imageUrl && o.imageUrl) m.imageUrl = o.imageUrl;
      if (!m.videoUrl && o.videoUrl) m.videoUrl = o.videoUrl;
      if (!Array.isArray(m.images) && Array.isArray(o.images)) m.images = o.images;
      if ((m.imageUrl || m.videoUrl || m.images) && m.stripped) delete m.stripped;
    }
    out[i] = merged;
  }
  return out;
}

/**
 * Passender Chat für ein Profil: preferred, sonst neuester des Profils, sonst null.
 * @param {any[]} convs
 * @param {string} profileId
 * @param {string|null} preferredId
 * @returns {any|null}
 */
export function pickConvForProfile(convs, profileId, preferredId) {
  const mine = (Array.isArray(convs) ? convs : []).filter((c) => c && c.profileId === profileId);
  if (preferredId) { const p = mine.find((c) => c.id === preferredId); if (p) return p; }
  if (!mine.length) return null;
  return mine.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
}

const DB_NAME = 'jeffa-chats';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/**
 * Liest einen Wert aus IndexedDB; null, wenn nicht verfügbar.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/**
 * Schreibt einen Wert in IndexedDB; false, wenn nicht verfügbar/fehlgeschlagen.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<boolean>}
 */
export async function idbSet(key, value) {
  const db = await openDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}
