// Shared same-origin API helpers.
export class APIError extends Error {
  constructor(message, code = 'unknown', status = 500) { super(message); this.code = code; this.status = status; this.name = 'APIError'; }
}
// v57: persistent session in localStorage (sessionStorage is wiped when an iOS standalone PWA is closed).
export function getSession() { try { let t = localStorage.getItem('jeffa.session') || ''; if (!t) { t = sessionStorage.getItem('jeffa.session') || ''; if (t) { localStorage.setItem('jeffa.session', t); sessionStorage.removeItem('jeffa.session'); } } return t; } catch { return ''; } }
export function setSession(t) { try { t ? localStorage.setItem('jeffa.session', t) : localStorage.removeItem('jeffa.session'); sessionStorage.removeItem('jeffa.session'); } catch {} }
export function faceIdEnabled() { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}').faceId === true; } catch { return false; } }
function isPrivate() { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}').encrypt === true; } catch { return false; } }
function headers(extra = {}, auth = true) {
  const h = { 'content-type': 'application/json', ...extra };
  const s = auth !== false && getSession();
  if (s) h.authorization = 'Bearer ' + s;
  if (isPrivate()) h['x-jeffa-private'] = '1';
  return h;
}
export async function api(path, { method = 'GET', body, auth, headers: extra } = {}) {
  const res = await fetch(path, { method, headers: headers(extra, auth), body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = data.error || {};
    const msg = typeof err === 'string' ? err : err.message;
    const code = typeof err === 'string' ? err : err.code;
    throw new APIError(msg || `HTTP ${res.status}`, code || 'http_error', res.status);
  }
  return data;
}
export const apiFetch = (path, opts = {}) => api(path, { ...opts, body: opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body });
export async function streamChat(body, { signal, onDelta, onDone, onModel, onError, onNotice, onUsage } = {}) {
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})); const e = d.error || {};
      throw new APIError((typeof e === 'string' ? e : e.message) || `HTTP ${res.status}`, e.code, res.status);
    }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue;
        let j; try { j = JSON.parse(raw); } catch { continue; }
        if (j.error) throw new APIError(j.error.message || String(j.error), j.error.code, j.error.status || 500);
        if (j.model && onModel) onModel(j.model, j.tried);
        if (j.notice && onNotice) onNotice(j.notice);
        if (j.usage && !j.done && onUsage) onUsage(j.usage);
        if (j.delta && onDelta) onDelta(j.delta);
        if (j.done && onDone) onDone(j.usage, j.model);
      }
    }
  } catch (e) {
    const err = e instanceof APIError ? e : e?.name === 'AbortError' ? new APIError('Abgebrochen', 'aborted', 0) : new APIError(e?.message || 'Netzwerkfehler', 'network_error', 0);
    if (onError) onError(err); else throw err;
  }
}
