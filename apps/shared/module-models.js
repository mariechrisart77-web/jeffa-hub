// v85a: feine Modellsteuerung pro Modul. Standard (keine Wahl) = exakt heutiges Verhalten (leerer Body-Zusatz).
// Rein und Node-testbar; die Browser-Wrapper unten kapseln localStorage (try/catch, in Node ohne localStorage → {}).

export const MODULES = [
  { id: 'comic_text', label: '📖 Comic – Text/Drehbuch', kind: 'llm', where: 'apps/hub/comic.js', def: { normal: 'gemini-3.5-flash-lite', adult: 'venice-uncensored-1-2' } },
  { id: 'comic_image', label: '📖 Comic – Bilder', kind: 'image', where: 'apps/hub/comic.js', def: { normal: '', adult: '' } },
  { id: 'bot_triage', label: '🤖 Bot – Vorprüfung', kind: 'llm', where: 'apps/hub/bot.js', def: { normal: 'gemini-3.5-flash-lite', adult: 'gemini-3.5-flash-lite' } },
  { id: 'bot_turn', label: '🤖 Bot – Gemini-Teilnehmer', kind: 'llm', where: 'apps/hub/bot.js', def: { normal: 'gemini-3.5-flash-lite', adult: 'gemini-3.5-flash-lite' } },
  { id: 'bot_moderate', label: '🤖 Bot – Moderator', kind: 'llm', where: 'apps/hub/bot.js', def: { normal: 'gemini-3.5-flash-lite', adult: 'gemini-3.5-flash-lite' } },
  { id: 'refs', label: '🖼 Referenzfotos beschreiben', kind: 'llm', where: 'apps/chat/refs.js', def: { normal: 'gemini-3.5-flash-lite', adult: 'gemini-3.5-flash-lite' } },
  { id: 'image_composer', label: '🎬 Bild – Szenen-Schreiber (Server)', kind: 'llm', where: 'src/imgsvc-image.ts', def: { normal: '', adult: '' } },
];

export const IMAGE_MODULE_MODELS = {
  normal: ['z-image-turbo', 'qwen-image-2-1-turbo', 'flux-2-pro'],
  adult: ['chroma', 'lustify-v8', 'z-image-turbo'],
};

const MOD = (id) => MODULES.find((m) => m.id === id) || null;
const RX = /^[a-z0-9\-_.\/:@]+$/i;
const clean = (list) => Array.isArray(list)
  ? list.filter((x) => typeof x === 'string' && x.length <= 80 && RX.test(x)).slice(0, 3)
  : [];

/** gespeicherte Wahl (Array ≤3 Strings), sonst [] */
export function moduleChoice(settings, id, adult) {
  const m = MOD(id); if (!m) return [];
  const raw = settings && settings.moduleModels && settings.moduleModels[id];
  if (!raw || typeof raw !== 'object') return [];
  const list = clean(raw[adult ? 'adult' : 'normal']);
  if (m.kind === 'image') {
    const allowed = IMAGE_MODULE_MODELS[adult ? 'adult' : 'normal'];
    return list.filter((x) => allowed.includes(x));
  }
  return list;
}

/** Kette: Wahl + Standard-Ersatz (dedupliziert); ohne Wahl nur der Standard. */
export function moduleChain(settings, id, { adult = false } = {}) {
  const m = MOD(id); if (!m) return [];
  const choice = moduleChoice(settings, id, adult);
  const def = m.def[adult ? 'adult' : 'normal'] || '';
  if (choice.length) return def && !choice.includes(def) ? [...choice, def] : [...choice];
  return def ? [def] : [];
}

/** Body-Zusatz: {} ohne Wahl (= byte-gleich), sonst { model, modelChain }. */
export function moduleBody(settings, id, opts = {}) {
  const chain = moduleChain(settings, id, opts);
  if (!chain.length || !moduleChoice(settings, id, opts && opts.adult === true).length) return {};
  return { model: chain[0], modelChain: chain };
}

/** NEUES settings-Objekt (rein); leere Liste löscht den Eintrag. */
export function setModuleChoice(settings, id, adult, list) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const mm = { ...(s.moduleModels || {}) };
  const mode = adult ? 'adult' : 'normal';
  const key = mm[id] && typeof mm[id] === 'object' ? { ...mm[id] } : {};
  const v = clean(list);
  if (v.length) key[mode] = v; else delete key[mode];
  if (Object.keys(key).length) mm[id] = key; else delete mm[id];
  const out = { ...s };
  if (Object.keys(mm).length) out.moduleModels = mm; else delete out.moduleModels;
  return out;
}

/* ---------------- dünne Browser-Wrapper ---------------- */
const KEY = 'jeffa.settings';
export function readSettings() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function getModuleBody(id, opts = {}) { return moduleBody(readSettings(), id, opts); }
export function getModuleChain(id, opts = {}) { return moduleChain(readSettings(), id, opts); }
export function saveModuleChoice(id, adult, list) {
  const s = setModuleChoice(readSettings(), id, adult, list);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  return s;
}

/** DOM-Renderer (DOM erst beim Aufruf; pickModel nur dynamisch → kein Zyklus). */
export function renderModuleModels(el, { isAdult } = {}) {
  if (!el) return;
  const adultAllowed = typeof isAdult === 'function' ? !!isAdult() : false;
  const draw = () => {
    const s = readSettings();
    el.innerHTML = MODULES.map((m) => {
      const adult = m.kind === 'image' ? adultAllowed : false;
      const ch = moduleChain(s, m.id, { adult });
      const def = m.def[adult ? 'adult' : 'normal'] || '';
      const txt = ch.length ? ch.join(' → ') : `Automatisch (Standard: ${def || 'wie bisher'})`;
      return `<div class="module-row" data-mod="${m.id}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0">`
        + `<span style="flex:1 1 100%;font-size:.9rem"><b>${m.label}</b><small class="hint" style="display:block">${txt}</small></span>`
        + `<button class="btn-sm secondary" data-pick="normal">Normal ▾</button>`
        + (adultAllowed ? `<button class="btn-sm secondary" data-pick="adult">🔞 ▾</button>` : '')
        + `</div>`;
    }).join('');
  };
  draw();
  el.onclick = async (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const row = b.closest('[data-mod]'); if (!row) return;
    const m = MODULES.find((x) => x.id === row.dataset.mod); if (!m) return;
    const adult = b.dataset.pick === 'adult';
    if (m.kind === 'image') {
      const allowed = IMAGE_MODULE_MODELS[adult ? 'adult' : 'normal'];
      const cur = moduleChain(readSettings(), m.id, { adult })[0] || '';
      const val = prompt(`Modell für „${m.label}“ (${adult ? '🔞' : 'Normal'}):\nLeer = Automatisch\n${allowed.join('\n')}`, cur);
      if (val == null) return;
      saveModuleChoice(m.id, adult, val.trim() ? [val.trim()] : []); draw(); return;
    }
    const { pickModel } = await import('./models.js');
    const cur = moduleChain(readSettings(), m.id, { adult })[0] || '';
    const id = await pickModel({ title: m.label, current: cur, allowDefault: true });
    if (id == null) return;
    saveModuleChoice(m.id, adult, id ? [id] : []); draw();
  };
}
