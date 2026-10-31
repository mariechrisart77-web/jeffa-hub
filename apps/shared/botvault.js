// v32: remembered bot channel passwords (option B). Each password is encrypted with AES-256-GCM under a
// NON-EXTRACTABLE CryptoKey that lives only in this browser's IndexedDB (the raw key can never be read out by JS).
// Only called by bot.js after the app's PIN / Face ID admin unlock.
const DB = 'jeffa-botvault', ST = 'kv', te = new TextEncoder(), td = new TextDecoder();
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function op(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(ST, mode), st = tx.objectStore(ST); const r = fn(st); tx.oncomplete = () => { db.close(); res(r?.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); }
const get = k => op('readonly', s => s.get(k)), put = (k, v) => op('readwrite', s => s.put(v, k)), del = k => op('readwrite', s => s.delete(k));
async function wrapKey() {
  let k = await get('wrap'); if (k) return k;
  k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await put('wrap', k); return k;
}
const aad = bot => te.encode('jeffa-botvault|' + bot);
export async function savePass(bot, pw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(bot) }, await wrapKey(), te.encode(pw));
  await put('pw:' + bot, { iv, ct, ts: Date.now() });
}
export async function loadPass(bot) {
  try { const rec = await get('pw:' + bot); if (!rec) return null; const k = await get('wrap'); if (!k) return null;
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv, additionalData: aad(bot) }, k, rec.ct)); } catch { return null; }
}
export async function hasPass(bot) { try { return !!(await get('pw:' + bot)); } catch { return false; } }
export async function forgetPass(bot) { try { await del('pw:' + bot); } catch {} }
