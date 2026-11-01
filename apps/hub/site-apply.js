// v86: Seiten-Anpassungen im Browser anwenden. Kein Markup aus der Config – nur createElement/textContent.
import { sanitizeConfig, cssVarsFrom, widgetsForArea } from './shared/site-config.js';

const CACHE_KEY = 'jeffa.siteConfig';
const SET_VARS = new Set();
let current = {};
let deps = null;

export function currentSiteConfig() { return current; }

export function applySiteConfig(config, d = deps) {
  const c = sanitizeConfig(config || {});
  current = c;
  if (d) deps = d;
  // QA v86: Variablen auf <body> setzen – body[data-section] und body.light-theme definieren --accent usw. selbst
  // und würden Werte auf <html> überdecken; Inline-Style auf body gewinnt.
  const root = document.body;
  for (const v of SET_VARS) root.style.removeProperty(v);
  SET_VARS.clear();
  const { vars, fontFamily, fontSize } = cssVarsFrom(c);
  for (const [k, v] of vars) { root.style.setProperty(k, v); SET_VARS.add(k); }
  if (fontFamily) document.body.style.setProperty('font-family', fontFamily); else document.body.style.removeProperty('font-family');
  // QA v86: Grundschrift auf <html>, damit rem-Größen mitwachsen.
  if (fontSize) document.documentElement.style.setProperty('font-size', fontSize); else document.documentElement.style.removeProperty('font-size');
  if (typeof c['text.app_title'] === 'string') document.title = c['text.app_title'];
  for (const id of ['chat', 'bot', 'comic', 'profile', 'me', 'waechter', 'kollab', 'tresor', 'settings']) {
    const key = 'text.tab.' + id;
    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (btn && typeof c[key] === 'string') { const tl = btn.querySelector('.tl'); if (tl) tl.textContent = c[key]; btn.title = c[key]; }
  }
  if (Array.isArray(c['menu.tabs'])) {
    const own = localStorage.getItem('jeffa.tabOrder');
    const nav = document.querySelector('.tabs-nav');
    const map = new Map();
    document.querySelectorAll('.tab-btn').forEach((b) => map.set(b.dataset.tab, b));
    for (const t of c['menu.tabs']) { const b = map.get(t.id); if (b) b.hidden = !!t.hidden; }
    if (!own && nav) for (const t of c['menu.tabs']) { const b = map.get(t.id); if (b) nav.appendChild(b); }
  }
  // QA v86: Bausteine aller Tabs neu zeichnen (auch entfernte), aktiven Tab sicher einhängen.
  document.querySelectorAll('.site-widgets[data-area^="tab:"]').forEach((h) => renderWidgets(h.dataset.area));
  ensureWidgets(activeTab());
}

function activeTab() {
  const b = document.querySelector('.tab-btn.active');
  return b ? b.dataset.tab : 'chat';
}

function buildWidget(w) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-sm secondary site-widget';
  btn.dataset.widgetId = w.id;
  btn.textContent = (w.icon ? w.icon + ' ' : '') + w.label;
  btn.title = w.label;
  btn.addEventListener('click', () => { runWidget(w).catch(() => {}); });
  return btn;
}

async function runWidget(w) {
  if (w.type === 'link_button' && w.route) { if (deps && deps.switchTab) deps.switchTab(w.route.slice(1)); else location.hash = w.route; return; }
  if (w.type === 'action_button') {
    if (w.action === 'new_chat') { if (deps && deps.startNewChat) deps.startNewChat(); if (deps && deps.switchTab) deps.switchTab('chat'); }
    else if (w.action === 'toggle_theme') { const t = document.getElementById('theme-btn'); if (t) t.click(); }
    else if (w.action === 'open_settings') { if (deps && deps.switchTab) deps.switchTab('settings'); }
    else if (w.action === 'reload_config') { await loadAndApplySiteConfig(deps || {}); }
    return;
  }
  if (w.type === 'model_picker') {
    const mod = await import('./shared/module-models.js');
    const models = await import('./shared/models.js');
    let chosen;
    if (w.kind === 'image') chosen = await pickImage(w.label);
    else chosen = await models.pickModel({ title: w.label, current: mod.moduleChoice(mod.readSettings(), w.module, false)[0] || '', allowDefault: true });
    if (chosen === null || chosen === undefined) return;
    mod.saveModuleChoice(w.module, false, chosen ? [chosen] : []);
    let name = 'Automatisch';
    if (chosen) { try { name = models.modelLabel(chosen) || chosen; } catch { name = chosen; } }
    showToast(`Modell für ${w.label}: ${name}`);
  }
}

function pickImage(label) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'picker-backdrop';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    const box = document.createElement('div');
    box.className = 'card';
    box.style.cssText = 'max-width:420px;width:92%;max-height:80vh;overflow:auto;padding:1rem';
    const h = document.createElement('h3');
    h.textContent = label;
    box.appendChild(h);
    const finish = (v) => { back.remove(); resolve(v); };
    for (const val of ['', 'z-image-turbo', 'qwen-image-2-1-turbo', 'flux-2-pro']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-sm secondary';
      b.style.cssText = 'display:block;width:100%;margin:4px 0';
      b.textContent = val || 'Automatisch';
      b.addEventListener('click', () => finish(val));
      box.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-sm';
    cancel.style.cssText = 'display:block;width:100%;margin-top:8px';
    cancel.textContent = 'Abbrechen';
    cancel.addEventListener('click', () => finish(null));
    box.appendChild(cancel);
    back.appendChild(box);
    document.body.appendChild(back);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:var(--bg-card);color:var(--text-primary);padding:8px 14px;border-radius:8px;z-index:9999';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function renderWidgets(area) {
  const list = widgetsForArea(current, area);
  let host = document.querySelector(`.site-widgets[data-area="${area}"]`);
  if (!list.length) { if (host) host.remove(); return; } // QA v86: nach Undo/Löschen Bausteine wieder entfernen
  if (!host) {
    host = document.createElement('div');
    host.className = 'site-widgets';
    host.dataset.area = area;
    if (area === 'header') {
      const right = document.querySelector('.header-right');
      const theme = document.getElementById('theme-btn');
      if (right) right.insertBefore(host, theme || null); else document.body.prepend(host);
    } else {
      const panel = document.getElementById('tab-' + area.slice(4));
      if (panel) panel.prepend(host); else return;
    }
  }
  host.textContent = '';
  for (const w of list) host.appendChild(buildWidget(w));
}

export function ensureWidgets(tabId) {
  renderWidgets('header');
  if (tabId) renderWidgets('tab:' + tabId);
}

export async function loadAndApplySiteConfig(d) {
  if (d) deps = d;
  try { const cached = localStorage.getItem(CACHE_KEY); if (cached) applySiteConfig(JSON.parse(cached)); } catch { /* Cache kaputt */ }
  try {
    const r = await fetch('/api/site-config', { headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const data = await r.json();
    const cfg = sanitizeConfig(data && data.config ? data.config : {});
    applySiteConfig(cfg);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch { /* voll */ }
  } catch { /* offline */ }
}
