// Model catalogue + routing (Round 5). Free OpenRouter IDs verified live 2026-10-29.
export const MODELS = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', desc: 'gratis · bestes Deutsch, erzählt frei, etwas langsamer' },
  { id: 'dots-studio/dots-3-note-preview:free', label: 'Dots 3 Note', desc: 'gratis · schneller, gutes Deutsch' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', desc: 'gratis · natürlich, versteht Bilder, eher zurückhaltend' },
  { id: 'thinkingmachines/inkling:free', label: 'Inkling', desc: 'gratis · neu, solide, manchmal überlastet' },
  { id: 'recursive/flint-v1.0:free', label: 'Recursive Flint', desc: 'gratis · sehr schnell, Deutsch holpriger' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', desc: 'gratis · oft überlastet, strenger' },
  { id: 'xingchen-agi/xing4.0-29b-a4b:free', label: 'XingChen Xing4.0 29B', desc: 'gratis · oft überlastet' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', desc: 'gratis · blitzschnell, kurz angebunden' },
  { id: 'groq:openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B', desc: 'Groq (eigener Key) · gratis im Free-Tier (Limits/Min) · sehr schnell, zensiert' },
  { id: 'groq:qwen/qwen3.8-27b', label: 'Groq Qwen 3.8 27B', desc: 'Groq (eigener Key) · gratis im Free-Tier · schnell, gutes Spanisch, eher zensiert' },
  { id: 'groq:openai/gpt-oss-20b', label: 'Groq GPT-OSS 20B', desc: 'Groq (eigener Key) · gratis im Free-Tier · blitzschnell, einfacher' },
  { id: 'mistral:mistral-small-latest', label: 'Mistral Small', desc: 'Mistral (eigener Key aus dem Tresor) · gratis im Free-Kontingent · Ersatz, wenn Groq/OpenRouter am Limit sind' },
  { id: 'venice-uncensored-1-2', label: 'Venice Uncensored', desc: 'Venice · unzensiert, für 18+ · ~0,001 $/Nachricht (0,2/0,9 $ pro Mio Tokens)' },
  { id: 'venice-uncensored-role-play', label: 'Venice Role Play', desc: 'Venice · unzensiert, auf Rollenspiel trainiert · ~0,002 $/Nachricht (0,5/2 $ pro Mio)' },
  { id: 'venice:gemma-4-uncensored', label: 'Gemma 4 Uncensored (Venice)', desc: 'Venice · unzensiert, günstigste · ~0,0007 $/Nachricht (0,16/0,5 $ pro Mio)' },
  { id: 'venice:deepseek-v4-1-flash-uncensored', label: 'DeepSeek V4.1 Flash Uncensored (Venice)', desc: 'Venice · unzensiert, klug, bestes Spanisch · ~0,0015 $/Nachricht (0,33/1,32 $ pro Mio)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', desc: 'Google · schnell, zuverlässig, zensiert · ~0,0003 $/Nachricht' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', desc: 'Google · klüger, zensiert · ~0,0006 $/Nachricht' },
];
/** v78: kostenlos = OpenRouter :free, auto:, Groq/Mistral-Gratis-Kontingent. */
export const isFree = (id) => /:free$/.test(id || '') || /^auto:/.test(id || '') || /^(groq|mistral):/.test(id || '');
/** v79: Anbieter mit eigenem Key/Volumen (Secrets VENICE_API_KEY, GEMINI_API_KEY, LUMIAROUTER_API_KEY, GROQ_API_KEY) – kostet wenig, darf ohne Freigabe normal in der Kette stehen (Preis steht dabei). */
export const hasOwnKey = (id) => /^(venice|gemini|lumia|groq:)/.test(id || '');
/** v79: Freigabe nötig nur für bezahlte Modelle von Anbietern OHNE eigenen Key/Volumen (z. B. bezahlte OpenRouter-Modelle). */
export const needsApproval = (id) => !isFree(id) && !hasOwnKey(id);
const _info = (id) => MODELS.find(m => m.id === id) || { id, label: id, desc: 'eigene ID' };
export const modelInfo = (id) => { const i = _info(id); return needsApproval(id) ? { ...i, label: '💲 ' + i.label, desc: 'bezahlt, Freigabe nötig · ' + i.desc } : i; };
export const modelLabel = (id) => modelInfo(id).label;

export const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
/** v84: Ersatzmodell am Kettenende (Mistral-Key im Tresor, Free-Kontingent). */
export const MISTRAL_FALLBACK = 'mistral:mistral-small-latest';
export const PRESETS = {
  normal: {
    Standard: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'gemini-3.5-flash-lite', 'groq:openai/gpt-oss-120b', 'dots-studio/dots-3-note-preview:free', 'gemini-3.5-flash', 'groq:qwen/qwen3.8-27b'],
    Schnell: ['groq:openai/gpt-oss-20b', 'gemini-3.5-flash-lite', 'dots-studio/dots-3-note-preview:free', 'nvidia/nemotron-3.5-lightning:free'],
  },
  adult: {
    Standard: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'venice-uncensored-1-2', 'venice:deepseek-v4-1-flash-uncensored', 'dots-studio/dots-3-note-preview:free', 'venice:gemma-4-uncensored', 'groq:openai/gpt-oss-120b'],
    Schnell: ['venice:gemma-4-uncensored', 'dots-studio/dots-3-note-preview:free', 'nvidia/nemotron-3.5-lightning:free', 'gemini-3.5-flash-lite'],
  },
};
const KEY = 'jeffa.settings';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export function getRoute(kind) {
  const s = read(); const r = s['route_' + kind];
  if (Array.isArray(r) && r.length) return r;
  return PRESETS[kind].Standard.map(id => ({ id, on: true }));
}
export function setRoute(kind, list) { const s = read(); s['route_' + kind] = list; write(s); }
export function getDefaultModel() { return read().defaultModel || DEFAULT_MODEL; }
export function setDefaultModel(id) { const s = read(); s.defaultModel = id; write(s); }
/** v84 P2: 'auto' (Standard) | 'manual' */
export function getModelMode() { return read().modelMode === 'manual' ? 'manual' : 'auto'; }
export function setModelMode(v) { const s = read(); s.modelMode = v === 'manual' ? 'manual' : 'auto'; write(s); }
/** v84 P2: Bildmodell-Modus, rein aus den Settings abgeleitet. Gespeicherte Qualität ≠ 'single' → manuell. */
export function imageModelMode(settings) { if (settings && settings.imageModelMode === 'manual') return 'manual'; if (settings && settings.imageModelMode === 'auto') return 'auto'; return 'auto'; }
export function imageModelModeFromSettings() { const s = read(); if (s.imageModelMode === 'manual' || s.imageModelMode === 'auto') return s.imageModelMode; return (s.imageQuality || 'single') === 'single' ? 'auto' : 'manual'; }
export function getImageStyle() { const v = read().imageStyle; return ['real', 'comic', 'manhwa', 'comicpage'].includes(v) ? v : 'real'; }
export function setImageStyle(v) { const s = read(); s.imageStyle = v; write(s); }

export function getPaidAllowed() { return read().paidAllowed === true; }
export function setPaidAllowed(v) { const s = read(); s.paidAllowed = !!v; write(s); }

// v84 P2: Automatik-Modellwahl liegt in apps/shared/promptapp/chat.js (rein; importiert models.js nicht → kein Zyklus).
import { pickChatModels } from './promptapp/chat.js';

/** Final chain: explicit choice (chat > profile > settings default) first, then the enabled route list.
 *  v79: kostenlose + eigene-Key-Modelle (Venice/Gemini/Lumia) in Ketten-Reihenfolge; Modelle ohne eigenen Key nur mit „Bezahlte Modelle erlaubt“ (Standard aus), hinten, nie stiller Fallback. */
export function resolveChain({ chatModel, profileModel, adult, paidAllowed = getPaidAllowed(), mode, profile, hasImages }) {
  const route = getRoute(adult ? 'adult' : 'normal').filter(r => r.on).map(r => r.id);
  const explicit = chatModel || profileModel || '';
  const mMode = mode || getModelMode();
  // v84 P2: ohne ausdrückliche Wahl im Automatik-Modus die Wunschliste aus promptapp/chat.js nehmen.
  let wish = [];
  if (!explicit && mMode === 'auto') {
    try { wish = pickChatModels({ adult, profile: profile || {}, hasImages: !!hasImages, route, defaultModel: getDefaultModel() }); } catch { wish = []; }
  }
  const first = explicit || wish[0] || getDefaultModel();
  const all = [];
  for (const m of [first, ...wish.slice(1), ...route, DEFAULT_MODEL]) if (m && !all.includes(m)) all.push(m);
  const free = all.filter(m => !needsApproval(m)), paid = paidAllowed ? all.filter(needsApproval) : [];
  const pk = paid.slice(0, 2), out = free.slice(0, 6 - pk.length);
  // v84: Mistral (eigener Key im Tresor, gratis) immer als letzter Gratis-Ersatz dabei (vor 💲) – außer in der Route ausdrücklich ausgeschaltet.
  const allRoute = getRoute(adult ? 'adult' : 'normal');
  if (!out.includes(MISTRAL_FALLBACK) && !allRoute.some(r => r.id === MISTRAL_FALLBACK && !r.on)) out.push(MISTRAL_FALLBACK);
  out.push(...pk);
  return out.length ? out : [DEFAULT_MODEL];
}

/** Bottom-sheet picker. Resolves with id, '' (= reset to default) or null (cancel). */
export function pickModel({ title = 'Modell wählen', current = '', allowDefault = true } = {}) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    const row = (id, label, desc) => `<button class="model-opt${id === current ? ' sel' : ''}" data-id="${id}"><b>${id === current ? '✓ ' : ''}${label}</b><small>${desc}</small></button>`;
    m.innerHTML = `<div class="modal model-sheet"><h3>${title}</h3>
      ${allowDefault ? row('', 'Automatisch', 'nach Reihenfolge in ⚙️ Einstellungen (FSK18 eigene Liste)') : ''}
      ${MODELS.map(x => { const i = modelInfo(x.id); return row(x.id, i.label, i.desc); }).join('')}
      <button class="btn-sm secondary" data-x style="margin-top:8px;width:100%">Abbrechen</button></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-x]')) { m.remove(); resolve(null); return; }
      const b = e.target.closest('.model-opt'); if (b) { m.remove(); resolve(b.dataset.id); }
    });
  });
}

/** Renders an ordered on/off list with ↑/↓ into el. */
export function renderRouteEditor(el, kind) {
  const draw = () => {
    const list = getRoute(kind);
    el.innerHTML = `<div class="route-list">${list.map((r, i) => `<div class="route-row"><span class="route-n">${i + 1}.</span><span class="route-name"><b>${modelLabel(r.id)}</b><small>${modelInfo(r.id).desc}</small></span>
      <button class="btn-sm secondary" data-up="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn-sm secondary" data-down="${i}" ${i < list.length - 1 ? '' : 'disabled'}>↓</button>
      <label class="switch"><input type="checkbox" data-on="${i}" ${r.on ? 'checked' : ''}><span></span></label><button class="btn-sm secondary" data-del="${i}" aria-label="Entfernen">✕</button></div>`).join('')}</div>
      <div class="route-actions">${Object.keys(PRESETS[kind]).map(p => `<button class="btn-sm secondary" data-preset="${p}">${p}</button>`).join('')}<button class="btn-sm secondary" data-add>+ Modell</button></div>`;
  };
  draw();
  el.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const list = getRoute(kind);
    if (t.dataset.up) { const i = +t.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
    else if (t.dataset.down) { const i = +t.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; }
    else if (t.dataset.del) list.splice(+t.dataset.del, 1);
    else if (t.dataset.preset) list.splice(0, list.length, ...PRESETS[kind][t.dataset.preset].map(id => ({ id, on: true })));
    else if ('add' in t.dataset) { const id = await pickModel({ title: 'Modell hinzufügen', allowDefault: false }); if (!id || list.some(r => r.id === id)) return; list.push({ id, on: true }); }
    else return;
    setRoute(kind, list); draw();
  };
  el.onchange = (e) => { const i = e.target.dataset.on; if (i == null) return; const list = getRoute(kind); list[+i].on = e.target.checked; setRoute(kind, list); };
}

export function getImageOpt(k, d) { return read()[k] || d; }
export function setImageOpt(k, v) { const s = read(); s[k] = v; write(s); }
