// v85 (20): aus chat.js ausgelagert – Verhalten unverändert.
// 📸 Foto-Menü im Chat (Kleidung, Pose, Umgebung, Tageszeit …).
import { api } from './shared/api.js';
import { isAdult } from './shared/fsk.js';
import { effectiveAdult } from './shared/mode.js';
import { getProfile, getActiveProfile, updateProfile } from './profiles.js';
import { photoFragments, optionsHtml, KNAPP_LABELS, SFW_DIRECTIONS } from './photoopts.js';
import { getImageStyle, getImageOpt } from './shared/models.js';
import { escapeHtml, uid } from './chat-util.js';

const PHOTO_KEYS = [['outfit', 'Kleidung'], ['koerper', 'Körperdetails (18+)'], ['pose', 'Pose'], ['intensity', 'Pose-Intensität (18+)'], ['scene', 'Umgebung'], ['time', 'Tageszeit'], ['light', 'Licht'], ['frame', 'Bildausschnitt'], ['mood', 'Stimmung'], ['render', 'Bildstil']];
// v51: "🔗 Mit Profil verbunden" (default on). Off = changes only for the next photo (photoOnce), the profile stays unchanged.
export const photoOnce = new Map();
export const photoLinked = () => { try { return localStorage.getItem('jeffa.photoLinked') !== '0'; } catch { return true; } };
const setPhotoLinked = (on) => { try { localStorage.setItem('jeffa.photoLinked', on ? '1' : '0'); } catch {} };
const HINT_LINKED = 'Verbunden: Änderungen werden sofort im Profil gespeichert (wie unter 👤 Profile → Look).';
const HINT_ONCE = 'Getrennt: gilt nur für das nächste Foto, das Profil bleibt unverändert.';
export function openPhotoSheet(currentConv) {
  const conv = currentConv(); if (!conv) return;
  const profile = getProfile(conv.profileId); if (!profile) return;
  document.querySelector('.photo-sheet-wrap')?.remove();
  let linked = photoLinked();
  const cur = () => linked ? (getProfile(profile.id)?.photo || {}) : (photoOnce.get(profile.id) || { ...(getProfile(profile.id)?.photo || {}) });
  const w = document.createElement('div'); w.className = 'photo-sheet-wrap';
  const render = () => {
    const ph = cur();
    w.innerHTML = `<div class="photo-sheet ${linked ? 'is-linked' : 'is-once'}" role="dialog" aria-label="Foto-Einstellungen"><div class="sheet-header"><h4>📸 Fotos von ${escapeHtml(profile.name || 'der Figur')}</h4><button class="btn-icon" data-x aria-label="Schließen">✕</button></div>
    <label class="photo-link-toggle"><input type="checkbox" data-link ${linked ? 'checked' : ''}> <b>🔗 Mit Profil verbunden</b> <span class="photo-link-state">${linked ? 'AN' : 'AUS – nur nächstes Foto'}</span></label>
    <div class="photo-sheet-grid">${PHOTO_KEYS.filter(([k]) => k === 'scene' || k === 'time' || effectiveAdult(conv, profile)).map(([k, t]) => `<label>${t}<select data-k="${k}">${optionsHtml(k, ph[k], effectiveAdult(conv, profile), escapeHtml, profile)}</select></label>`).join('')}</div>
    ${!effectiveAdult(conv, profile) ? `<label>Richtung<select data-k="direction"><option value="">Automatisch</option>${Object.entries(SFW_DIRECTIONS).map(([id, d]) => `<option value="${id}" ${ph.direction === id ? 'selected' : ''}>${escapeHtml(d.label)}</option>`).join('')}</select></label>` : ''}
    ${effectiveAdult(conv, profile) ? `<label class="photo-knapp">Knappheit (Sideboob/Underboob): <b data-kv>${KNAPP_LABELS[(ph.knapp || 1) - 1]}</b><input type="range" min="1" max="10" step="1" value="${ph.knapp || 1}" data-knapp style="width:100%"></label>` : ''}
    <p class="hint" style="margin:6px 0 0">${linked ? HINT_LINKED : HINT_ONCE}</p>
    <button class="chip" data-preview style="margin-top:8px">🔎 Prompt-Vorschau</button>
    <div data-preview-out style="display:none;margin-top:8px"></div></div>`;
    const save = (P) => { if (linked) { updateProfile(profile.id, { photo: P }); toastSaved(w, '✓ Im Profil gespeichert'); } else { photoOnce.set(profile.id, P); toastSaved(w, '✓ Gilt fürs nächste Foto'); } };
    w.querySelector('[data-link]').onchange = (e) => { linked = e.target.checked; setPhotoLinked(linked); if (linked) photoOnce.delete(profile.id); render(); };
    w.querySelectorAll('select').forEach(sel => sel.onchange = () => {
      const P = { ...cur() };
      if (sel.value) P[sel.dataset.k] = sel.value; else delete P[sel.dataset.k];
      save(P);
    });
    const kr = w.querySelector('[data-knapp]');
    if (kr) { kr.oninput = () => { w.querySelector('[data-kv]').textContent = KNAPP_LABELS[kr.value - 1]; }; kr.onchange = () => {
      const P = { ...cur() }; if (+kr.value > 1) P.knapp = +kr.value; else delete P.knapp; save(P); }; }
    const pv = w.querySelector('[data-preview]');
    if (pv) pv.onclick = async () => {
      const out = w.querySelector('[data-preview-out]');
      out.style.display = 'block';
      out.innerHTML = '<p class="hint">⏳ Erzeuge Vorschau …</p>';
      try {
        const mod = await import('./image-client.js');
        const body = mod.buildPreviewBody({ api, currentConv, getProfile, getActiveProfile, uid, getImageStyle, getImageOpt, isAdult, photoOnce, photoFragments });
        if (!body) { out.innerHTML = '<p class="hint">Keine aktive Unterhaltung.</p>'; return; }
        const r = await api('/api/image', { method: 'POST', body });
        const notes = Array.isArray(r?.notes) ? r.notes : (Array.isArray(r?.abgleich) ? r.abgleich : []);
        const check = r?.checkSpec ? JSON.stringify(r.checkSpec, null, 2) : '';
        out.innerHTML = `<details class="img-info" open><summary>Vorschau – ${escapeHtml(r?.model || '?')} · Seed ${escapeHtml(String(r?.seed ?? '?'))}</summary>`
          + `<div><strong>Prompt:</strong><pre style="white-space:pre-wrap">${escapeHtml(r?.prompt || '')}</pre></div>`
          + `<div><strong>Negative:</strong><pre style="white-space:pre-wrap">${escapeHtml(r?.negative || '')}</pre></div>`
          + (notes.length ? `<div><strong>Abgleich:</strong><ul>${notes.map((n) => `<li>${escapeHtml(String(n))}</li>`).join('')}</ul></div>` : '')
          + (check ? `<div><strong>Check:</strong><pre style="white-space:pre-wrap">${escapeHtml(check)}</pre></div>` : '')
          + `</details>`;
      } catch (e) { out.innerHTML = `<p class="hint">Fehler: ${escapeHtml(e?.message || String(e))}</p>`; }
    };
  };
  render();
  document.body.appendChild(w);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-x]')) w.remove(); });
  // two-way live: profile edits elsewhere (Look tab) refresh the open sheet while linked
  const onUpd = () => { if (!document.body.contains(w)) { window.removeEventListener('jeffa:profile-updated', onUpd); return; } if (linked && !w.contains(document.activeElement)) render(); };
  window.addEventListener('jeffa:profile-updated', onUpd);
}
function toastSaved(w, msg = '✓ Gespeichert') { const h = w.querySelector('.hint'); if (!h) return; const back = w.querySelector('.is-once') ? HINT_ONCE : HINT_LINKED; h.textContent = msg; clearTimeout(h._t); h._t = setTimeout(() => { h.textContent = back; }, 1500); }
