// 🃏 Charakter-Karte (chara_card_v2): view, generate from the profile, import JSON/PNG/text. Nothing is written to the profile before "Übernehmen".
import { matchHair, hairText, matchOne, STYLE, GROESSE, STATUR } from './pickers.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clampInt = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : null; };

/** pure: card → {patch (nested, for deep merge), changes:[{field,label,old,new}], extra (unmapped text, appended to look.details)} */
export function mapCardToProfile(card, profile = {}) {
  const d = card?.data || {}, j = d.extensions?.jeffa || {}, l = j.look || {}, f = j.figur || {};
  const look = profile.persona?.look || {}, fig = profile.persona?.figur || {};
  const patch = { persona: { look: {}, figur: {} } }, changes = [], extra = [];
  const set = (grp, key, label, val, old) => {
    if (val == null || val === '' || String(val) === String(old ?? '')) return;
    patch.persona[grp][key] = val; changes.push({ field: `persona.${grp}.${key}`, label, old: old ?? '', new: val });
  };
  if (l.hair) { const m = matchHair(l.hair); set('look', 'hair', 'Haare', m.exact ? hairText(m.len, m.col) : String(l.hair), look.hair); }
  if (l.age) { const a = clampInt(l.age, 18, 99); if (a) set('look', 'age', 'Alter', a, look.age); }
  if (l.typ) set('look', 'typ', 'Typ', String(l.typ), look.typ);
  if (l.style) { const s = matchOne(STYLE, l.style).val; if (s) set('look', 'style', 'Stil', s, look.style); else extra.push('Stil: ' + l.style); }
  for (const [k, lab] of [['eyes', 'Augen'], ['skin', 'Haut']]) if (l[k]) extra.push(`${lab}: ${l[k]}`);
  if (f.groesse) { const g = /^\d{3}\s*(cm)?$/i.test(String(f.groesse).trim()) ? String(f.groesse).trim() : matchOne(GROESSE, f.groesse).val; if (g) set('figur', 'groesse', 'Größe', g, fig.groesse); else extra.push('Größe: ' + f.groesse); }
  if (f.statur) { const s = matchOne(STATUR, f.statur).val; set('figur', 'statur', 'Statur', s || String(f.statur), fig.statur); }
  if (f.kurven) { const k = clampInt(f.kurven, 1, 10); if (k) set('figur', 'kurven', 'Kurven', k, fig.kurven); }
  if (f.oberweite) { const o = clampInt(f.oberweite, 1, 7); if (o) set('figur', 'oberweite', 'Oberweite', o, fig.oberweite); }
  if (Array.isArray(j.traits) && j.traits.length) extra.push('Eigenschaften: ' + j.traits.slice(0, 12).join(', '));
  for (const [k, lab] of [['outfit', 'Outfit'], ['place', 'Ort'], ['expression', 'Ausdruck']]) if (j[k]) extra.push(`${lab}: ${j[k]}`);
  if (l.details) extra.push(String(l.details));
  const extraText = extra.filter(Boolean).join('; ').slice(0, 800);
  if (extraText && !String(look.details || '').includes(extraText)) {
    const nd = [look.details, extraText].filter(Boolean).join('; ');
    patch.persona.look.details = nd; changes.push({ field: 'persona.look.details', label: 'Details (ergänzt)', old: look.details || '', new: nd });
  }
  return { patch, changes, extra: extraText };
}

/** PNG tEXt/iTXt chunk "chara" (base64 JSON) → card | null */
export function readPngCard(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 8 || u[0] !== 0x89 || u[1] !== 0x50 || u[2] !== 0x4e || u[3] !== 0x47) return null;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let p = 8;
  while (p + 12 <= u.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...u.subarray(p + 4, p + 8)), body = u.subarray(p + 8, p + 8 + len);
    if (type === 'tEXt' || type === 'iTXt') {
      const z = body.indexOf(0), key = new TextDecoder('latin1').decode(body.subarray(0, z));
      if (key === 'chara') {
        let rest = body.subarray(z + 1);
        if (type === 'iTXt') { if (rest[0] !== 0) return null; rest = rest.subarray(2); for (let i = 0; i < 2; i++) rest = rest.subarray(rest.indexOf(0) + 1); }
        try { const b = atob(new TextDecoder().decode(rest).trim()); return normalizeCard(JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))))); } catch { return null; }
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

export function normalizeCard(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.spec === 'chara_card_v2' && o.data) return o;
  if (o.data && typeof o.data === 'object') return { spec: 'chara_card_v2', data: o.data };
  if (o.name || o.description) return { spec: 'chara_card_v2', data: { name: o.name || '', description: o.description || '', personality: o.personality || '', scenario: o.scenario || '', first_mes: o.first_mes || '', tags: o.tags || [], extensions: o.extensions || {} } };
  return null;
}

export async function openCardDialog(profile, { onApply } = {}) {
  const { api } = await import('./shared/api.js');
  const dlg = document.createElement('dialog'); dlg.className = 'card-dlg';
  // explicit modal styling (global resets remove the native dialog centering)
  dlg.style.cssText = 'position:fixed;inset:0;margin:auto;max-width:min(560px,94vw);width:94vw;max-height:88vh;max-height:88dvh;overflow:auto;-webkit-overflow-scrolling:touch;border:none;border-radius:14px;padding:0;background:var(--bg2,#1e293b);color:inherit;box-shadow:0 20px 60px rgba(0,0,0,.6)';
  if (!document.getElementById('card-dlg-css')) { const st = document.createElement('style'); st.id = 'card-dlg-css'; st.textContent = '.card-dlg::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(2px)}.card-dlg .cd-in{padding:16px}.card-dlg .cd-x{position:sticky;top:0;float:right;background:none;border:0;color:inherit;font-size:20px;cursor:pointer;padding:4px 8px}'; document.head.appendChild(st); }
  document.body.appendChild(dlg);
  // backdrop click (target is the dialog element itself, outside the inner wrapper) closes
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  let card = null, summary = '';
  const view = (msg = '') => {
    dlg.innerHTML = `<div class="cd-in"><button class="cd-x" data-a="close" aria-label="Schließen">✕</button><h3 style="margin-top:0">🃏 Charakter-Karte – ${esc(profile.name || '')}</h3>
      ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
      ${card ? `<p>${esc(summary || card.data?.description || '').slice(0, 600)}</p><details><summary>JSON</summary><pre style="white-space:pre-wrap;max-height:40vh;overflow:auto;font-size:12px">${esc(JSON.stringify(card, null, 2))}</pre></details>` : '<p class="muted">Noch keine Karte.</p>'}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">
        ${card ? '<button class="btn-primary" data-a="show">Ansehen</button><button class="btn-secondary" data-a="gen">✨ Neu aus Profil erstellen</button>' : '<button class="btn-primary" data-a="gen">✨ Aus Profil erstellen</button>'}
        <button class="btn-secondary" data-a="file">📂 Datei (.json/.png)</button>
        ${card ? '<button class="btn-secondary" data-a="apply">Ins Profil übernehmen…</button>' : ''}
      </div>
      <textarea id="card-text" rows="4" style="width:100%" placeholder="…oder Karten-Text / JSON hier einfügen"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-secondary" data-a="paste">Text importieren</button><span style="flex:1"></span><button class="btn-secondary" data-a="close">Schließen</button></div>
      <input type="file" accept=".json,.png,application/json,image/png" hidden></div>`;
  };
  const preview = (c) => {
    const { patch, changes } = mapCardToProfile(c, profile);
    dlg.innerHTML = `<div class="cd-in"><button class="cd-x" data-a="close" aria-label="Schließen">✕</button><h3 style="margin-top:0">Änderungen übernehmen?</h3>
      ${changes.length ? `<table style="width:100%;font-size:13px">${changes.map((x) => `<tr><td><b>${esc(x.label)}</b></td><td class="muted">${esc(x.old)}</td><td>→ ${esc(x.new)}</td></tr>`).join('')}</table>` : '<p class="muted">Keine Änderungen – das Profil passt schon zur Karte.</p>'}
      <div style="display:flex;gap:8px;margin-top:12px">${changes.length ? '<button class="btn-primary" data-a="ok">Übernehmen</button>' : ''}<button class="btn-secondary" data-a="back">Zurück</button></div></div>`;
    dlg.onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'close') dlg.close(); if (a === 'ok') { onApply?.(patch, changes); dlg.close(); } if (a === 'back') { view(); bind(); } };
  };
  const importCard = async (c, src) => { if (!c) { view('Keine gültige Karte gefunden.'); bind(); return; } card = c; summary = c.data?.description || ''; preview(c); };
  const bind = () => {
    const inp = dlg.querySelector('input[type=file]') || {};
    inp.onchange = async () => {
      const fl = inp.files[0]; if (!fl) return;
      if (fl.size > 8e6) { view('Datei zu groß.'); bind(); return; }
      if (/png$/i.test(fl.type) || /\.png$/i.test(fl.name)) return importCard(readPngCard(await fl.arrayBuffer()));
      try { return importCard(normalizeCard(JSON.parse(await fl.text()))); } catch { return importCard(null); }
    };
    dlg.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'close') dlg.close();
      if (a === 'file') inp.click?.();
      if (a === 'show') { const d = dlg.querySelector('details'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } }
      if (a === 'apply') preview(card);
      if (a === 'gen') {
        view('Wird erstellt…'); bind();
        try { const { syncProfileNow } = await import('./profiles.js'); await syncProfileNow?.(profile.id); } catch {}
        try { const r = await api('/api/card/generate', { method: 'POST', body: { profile: profile.id } }); card = r.card; summary = r.summary; view('Neu erstellt (noch nicht ins Profil übernommen).'); }
        catch (err) { view('Fehler: ' + (err.message || err)); }
        bind();
      }
      if (a === 'paste') {
        const t = dlg.querySelector('#card-text').value.trim(); if (!t) return;
        let c = null; try { c = normalizeCard(JSON.parse(t)); } catch {}
        if (!c) { try { c = (await api('/api/card/parse', { method: 'POST', body: { text: t.slice(0, 60000) } })).card; } catch {} }
        importCard(normalizeCard(c));
      }
    };
  };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.innerHTML = '<div class="cd-in"><button class="cd-x" data-a="close" aria-label="Schließen">✕</button><p>⏳ Lade Karte…</p></div>'; bind(); dlg.showModal(); // Esc closes natively
  try { const r = await api(`/api/card?profile=${encodeURIComponent(profile.id)}`); card = r.card; summary = r.summary; } catch {}
  if (dlg.open) { view(); bind(); }
}
