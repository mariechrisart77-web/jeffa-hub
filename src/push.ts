// Web Push (VAPID RFC 8292 + aes128gcm RFC 8291), ported from Falke. Subscriptions in D1 push_subs (max 10).
// Secret: VAPID_PRIVATE_JWK (P-256 JWK incl. "d"); public key derived from x/y. Payload is only a generic title.
import { Env } from "./env";
const te = new TextEncoder();
const SUBJECT = "mailto:jeffa@mail.grokbot.com";
const HOST_OK = (h: string) => /(^|\.)push\.apple\.com$/.test(h) || h === "fcm.googleapis.com" || /(^|\.)push\.services\.mozilla\.com$/.test(h) || /(^|\.)notify\.windows\.com$/.test(h);
export const b64u = (u8: ArrayBuffer | Uint8Array) => { const a = new Uint8Array(u8); let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64u = (s: string) => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const cat = (...a: Uint8Array[]) => { const r = new Uint8Array(a.reduce((x, y) => x + y.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
export function checkSubscription(s: any) {
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1024) return null;
  let u: URL; try { u = new URL(s.endpoint); } catch { return null; }
  if (u.protocol !== "https:" || !HOST_OK(u.hostname)) return null;
  const k = s.keys || {};
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return null;
  try { if (unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length !== 16) return null; } catch { return null; }
  return { endpoint: s.endpoint, p256dh: k.p256dh.replace(/=+$/, ""), auth: k.auth.replace(/=+$/, "") };
}
let kc: any = null;
async function vapidKey(env: Env) {
  const raw = (env.VAPID_PRIVATE_JWK || "").trim(); if (!raw) return null;
  if (kc && kc.raw === raw) return kc;
  const j = JSON.parse(raw);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  kc = { raw, key, pub: b64u(cat(new Uint8Array([4]), unb64u(j.x), unb64u(j.y))) }; return kc;
}
export async function vapidPublic(env: Env) { return (await vapidKey(env))?.pub || ""; }
async function vapidAuth(env: Env, endpoint: string) {
  const k = await vapidKey(env); if (!k) return null;
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.key, te.encode(h + "." + c));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${k.pub}`;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}
async function encryptPayload(sub: any, plaintext: string) {
  const ua = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, cat(te.encode(plaintext), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), asPub, ct);
}
export async function addSub(env: Env, s: any) {
  await env.DB!.prepare("INSERT INTO push_subs (endpoint,p256dh,auth,created) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth").bind(s.endpoint, s.p256dh, s.auth, Date.now()).run();
  await env.DB!.prepare("DELETE FROM push_subs WHERE endpoint NOT IN (SELECT endpoint FROM push_subs ORDER BY created DESC LIMIT 10)").run();
}
export const removeSub = (env: Env, endpoint: string) => env.DB!.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(endpoint).run();
// Returns number of delivered pushes. msg = {title, body, tag}
export async function pushAll(env: Env, msg: { title: string; body: string; tag?: string; url?: string }) {
  if (!env.DB || !(env.VAPID_PRIVATE_JWK || "").trim()) return 0;
  const subs = (await env.DB.prepare("SELECT endpoint,p256dh,auth FROM push_subs").all<any>()).results || [];
  let ok = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      const auth = await vapidAuth(env, s.endpoint); if (!auth) return;
      const body = await encryptPayload(s, JSON.stringify(msg));
      const r = await fetch(s.endpoint, { method: "POST", headers: { Authorization: auth, TTL: "86400", Urgency: "normal", Topic: (msg.tag || "jeffa").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "jeffa", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" }, body, signal: AbortSignal.timeout(10000) });
      if (r.status === 404 || r.status === 410) await removeSub(env, s.endpoint); else if (r.ok) ok++;
    } catch {}
  }));
  return ok;
}
