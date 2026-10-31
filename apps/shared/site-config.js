// v86: Seiten-Anpassungen (Site-Config). Rein und Node-testbar – kein DOM, kein fetch.
import { MODULES, IMAGE_MODULE_MODELS } from './module-models.js';

export const ALLOWED_COLOR_VARS = ['accent', 'bg-main', 'bg-card', 'bg-input', 'text-primary', 'text-secondary', 'text-tertiary', 'border', 'success', 'error', 'warning'];
export const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};
export const TAB_IDS = ['chat', 'bot', 'comic', 'profile', 'me', 'waechter', 'kollab', 'tresor', 'settings'];
export const LOCKED_TABS = ['kollab', 'tresor', 'settings'];
export const ACTIONS = ['new_chat', 'toggle_theme', 'open_settings', 'reload_config'];
export const WIDGET_TYPES = ['model_picker', 'link_button', 'action_button'];
export const MODULE_IDS = MODULES.map((m) => m.id);
const SLUG = /^[a-z0-9_-]{1,32}$/;

function plain(s) {
  return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
}
function hex(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return { ok: true, value: s.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') };
  if (/^#[0-9a-f]{6}$/.test(s)) return { ok: true, value: s };
  return { ok: false, error: 'Farbe muss #rgb oder #rrggbb sein' };
}

function sanitizeTabs(v) {
  if (!Array.isArray(v)) return { ok: false, error: 'menu.tabs muss eine Liste sein' };
  const seen = new Set();
  const out = [];
  for (const raw of v.slice(0, 20)) {
    const id = raw && typeof raw === 'object' ? String(raw.id || '') : '';
    if (!TAB_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, hidden: raw.hidden === true && !LOCKED_TABS.includes(id) });
  }
  for (const id of TAB_IDS) if (!seen.has(id)) out.push({ id, hidden: false });
  return { ok: true, value: out };
}

function sanitizeWidget(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Baustein muss ein Objekt sein' };
  const id = String(raw.id || '');
  if (!SLUG.test(id)) return { ok: false, error: 'Baustein id ungültig (a-z0-9_- , 1-32)' };
  const type = String(raw.type || '');
  if (!WIDGET_TYPES.includes(type)) return { ok: false, error: 'Unbekannter Baustein-Typ: ' + type };
  const area = String(raw.area || '');
  const areaOk = area === 'header' || (area.startsWith('tab:') && TAB_IDS.includes(area.slice(4)));
  if (!areaOk) return { ok: false, error: 'Baustein area ungültig' };
  const label = plain(raw.label).slice(0, 30);
  if (!label) return { ok: false, error: 'Baustein label fehlt' };
  const order = Number.isFinite(Number(raw.order)) ? Math.min(99, Math.max(0, Math.trunc(Number(raw.order)))) : 50;
  const w = { id, type, area, order, label };
  const iconRaw = raw.icon == null ? '' : String(raw.icon).replace(/[<>]/g, '').replace(/[A-Za-z0-9]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 4);
  if (iconRaw) w.icon = iconRaw;
  if (type === 'model_picker') {
    if (!MODULE_IDS.includes(String(raw.module || ''))) return { ok: false, error: 'module ungültig' };
    w.module = String(raw.module);
    const mod = MODULES.find((m) => m.id === w.module);
    w.kind = mod ? mod.kind : 'llm';
  } else if (type === 'link_button') {
    const route = String(raw.route || '');
    if (!TAB_IDS.includes(route.replace(/^#/, '')) || !route.startsWith('#')) return { ok: false, error: 'link_button route muss #<tabId> sein' };
    w.route = '#' + route.slice(1);
  } else if (type === 'action_button') {
    if (!ACTIONS.includes(String(raw.action || ''))) return { ok: false, error: 'action ungültig' };
    w.action = String(raw.action);
  }
  return { ok: true, value: w };
}

function sanitizeWidgets(v) {
  if (!Array.isArray(v)) return { ok: false, error: 'widgets muss eine Liste sein' };
  const out = [];
  const seen = new Set();
  for (const raw of v.slice(0, 20)) {
    const r = sanitizeWidget(raw);
    if (!r.ok || seen.has(r.value.id)) continue;
    seen.add(r.value.id);
    out.push(r.value);
  }
  return { ok: true, value: out };
}

export function sanitizeValue(key, value) {
  const k = String(key || '');
  if (k === 'text.app_title') {
    const s = plain(value).slice(0, 30);
    return s ? { ok: true, value: s } : { ok: false, error: 'Titel darf nicht leer sein' };
  }
  if (k.startsWith('text.tab.')) {
    const id = k.slice(9);
    if (!TAB_IDS.includes(id)) return { ok: false, error: 'Unbekannter Tab: ' + id };
    const s = plain(value).slice(0, 40);
    return s ? { ok: true, value: s } : { ok: false, error: 'Tab-Beschriftung darf nicht leer sein' };
  }
  if (k === 'font.family') {
    const s = String(value || '');
    return Object.prototype.hasOwnProperty.call(FONT_STACKS, s) ? { ok: true, value: s } : { ok: false, error: 'Schriftart muss system|serif|rounded|mono sein' };
  }
  if (k === 'font.size') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 13 || n > 20) return { ok: false, error: 'Schriftgröße muss 13-20 sein' };
    return { ok: true, value: Math.round(n) };
  }
  if (k.startsWith('color.')) {
    const v = k.slice(6);
    if (!ALLOWED_COLOR_VARS.includes(v)) return { ok: false, error: 'Farbe nicht erlaubt: ' + v };
    return hex(value);
  }
  if (k === 'menu.tabs') return sanitizeTabs(value);
  if (k === 'widgets') return sanitizeWidgets(value);
  return { ok: false, error: 'Schlüssel nicht erlaubt: ' + k };
}

/** QA v86: erlaubter Schlüssel (unabhängig vom Wert) – für „auf Standard zurücksetzen“. */
export function isAllowedKey(key) {
  const k = String(key || '');
  if (k === 'text.app_title' || k === 'font.family' || k === 'font.size' || k === 'menu.tabs' || k === 'widgets') return true;
  if (k.startsWith('text.tab.')) return TAB_IDS.includes(k.slice(9));
  if (k.startsWith('color.')) return ALLOWED_COLOR_VARS.includes(k.slice(6));
  return false;
}

export function sanitizeConfig(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const r = sanitizeValue(k, v);
    if (r.ok) out[k] = r.value;
  }
  return out;
}

export function applyChange(config, key, value) {
  const base = config && typeof config === 'object' ? config : {};
  const next = { ...base };
  if (value === null || value === undefined) { delete next[key]; return next; }
  const r = sanitizeValue(key, value);
  if (r.ok) next[key] = r.value;
  return next;
}

function short(v) {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 60 ? s.slice(0, 57) + '…' : String(s);
  } catch { return ''; }
}

export function diffSummary(key, before, after) {
  if (after == null) return `${key}: auf Standard zurückgesetzt`;
  if (before == null) return `${key}: gesetzt auf ${short(after)}`;
  return `${key}: ${short(before)} → ${short(after)}`;
}

export function planUndo(changes, changeId) {
  const list = Array.isArray(changes) ? changes : [];
  const target = list.find((c) => Number(c.id) === Number(changeId));
  if (!target) return { ok: false, error: 'Änderung nicht gefunden' };
  if (target.undo_of) return { ok: false, key: target.key, value: null, error: 'Ein Rückgängig-Eintrag kann nicht rückgängig gemacht werden' };
  if (Number(target.undone)) return { ok: false, key: target.key, value: null, error: 'Schon rückgängig gemacht' };
  const newer = list.filter((c) => c.key === target.key && !Number(c.undone) && !c.undo_of && Number(c.id) > Number(target.id));
  if (newer.length) return { ok: false, key: target.key, value: null, error: `Neuere Änderung an ${target.key} vorhanden – zuerst die rückgängig machen` };
  let value = null;
  try { value = target.before_json ? JSON.parse(target.before_json) : null; } catch { value = null; }
  return { ok: true, key: target.key, value };
}

export function widgetsForArea(config, area) {
  const list = config && Array.isArray(config.widgets) ? config.widgets : [];
  return list.filter((w) => w.area === area).slice().sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function cssVarsFrom(config) {
  const c = config || {};
  const vars = [];
  for (const v of ALLOWED_COLOR_VARS) {
    if (typeof c['color.' + v] === 'string') vars.push(['--' + v, c['color.' + v]]);
  }
  return {
    vars,
    fontFamily: c['font.family'] ? FONT_STACKS[c['font.family']] : null,
    fontSize: Number.isFinite(Number(c['font.size'])) ? Number(c['font.size']) + 'px' : null,
  };
}

export function moduleOptions(moduleId) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return { kind: 'llm', list: [] };
  if (mod.kind === 'image') return { kind: 'image', list: IMAGE_MODULE_MODELS.normal.slice() };
  return { kind: 'llm', list: [] };
}
