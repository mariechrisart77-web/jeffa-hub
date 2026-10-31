// AES-GCM with a non-extractable device key kept in IndexedDB 'jeffa-keys'.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// v68: Verschlüsselung standardmäßig AUS (App ist schon passwortgeschützt). Einmalig für alle Bestandsnutzer ausschalten;
// verschlüsselte Chats werden beim nächsten Laden entschlüsselt und unverschlüsselt neu gespeichert (nichts geht verloren).
try { const s0 = JSON.parse(localStorage.getItem('jeffa.settings') || '{}'); if (!s0.encDefaultOff68) localStorage.setItem('jeffa.settings', JSON.stringify({ ...s0, encrypt: false, encDefaultOff68: true })); } catch {}
export const ENCRYPT_WARN = 'Standard: aus. Die App ist bereits per Passwort geschützt. Mit Verschlüsselung bekommt die Bild-App keinen Story-Kontext aus dem Chat, und das Gedächtnis ist aus.';
export function isEncryptOn() { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}').encrypt === true; } catch { return false; } }
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('jeffa-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
let keyP = null;
export function deviceKey() {
  if (keyP) return keyP;
  keyP = (async () => {
    const db = await idb();
    const get = () => new Promise((res, rej) => { const t = db.transaction('k').objectStore('k').get('dev'); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
    let k = await get();
    if (!k) {
      k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise((res, rej) => { const t = db.transaction('k', 'readwrite').objectStore('k').put(k, 'dev'); t.onsuccess = res; t.onerror = () => rej(t.error); });
    }
    return k;
  })();
  return keyP;
}
export async function encryptJSON(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, await deviceKey(), unb64(blob.ct));
  return JSON.parse(dec.decode(pt));
}
