window.__JEFFA_V = 'jeffa-v67';
window.__JEFFA_UNIFIED = true;
import { initChat, startNewChat, openLastChat } from './chat.js';
import { initProfiles, getProfiles, getProfile, onProfilesChanged } from './profiles.js';
import { isAdult, setAdult, onAdultChange } from './shared/fsk.js';
import { authState, lockScreen } from './shared/auth.js';
import { getSession } from './shared/api.js';
import { initLightbox } from './shared/lightbox.js';
import { applyTabOrder, moveId, TAB_ORDER_KEY } from './shared/taborder.js';
initLightbox();

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const chatPanel = document.getElementById('tab-chat');
const seraphinaPanel = document.getElementById('tab-seraphina');
const profilePanel = document.getElementById('tab-profile');
const mePanel = document.getElementById('tab-me');
const waechterPanel = document.getElementById('tab-waechter');
const kollabPanel = document.getElementById('tab-kollab');
const tresorPanel = document.getElementById('tab-tresor');
const settingsPanel = document.getElementById('tab-settings');
const themeBtn = document.getElementById('theme-btn');
const installBanner = document.getElementById('install-banner');
const appTitle = document.querySelector('.app-title');

let deferredPrompt = null;
let initFlags = {};
let waechterModule = null;
let kollabModule = null;
let tresorModule = null;
let settingsModule = null;

const SECTION_META = {
  chat: { icon: '💬', title: 'Chat', accent: '#8b5cf6' },
  seraphina: { icon: '🌺', title: 'Seraphina', accent: '#f472b6' },
  profile: { icon: '👤', title: 'Profile', accent: '#38bdf8' },
  me: { icon: '🧑', title: 'Ich', accent: '#38bdf8' },
  waechter: { icon: '👁', title: 'Wächter', accent: '#f59e0b' },
  kollab: { icon: '📋', title: 'Kollab', accent: '#10b981' },
  tresor: { icon: '🔐', title: 'Tresor', accent: '#22d3ee' },
  bot: { icon: '🤖', title: 'Grok Bot', accent: '#a78bfa' },
  comic: { icon: '📖', title: 'Comic', accent: '#f97316' },
  settings: { icon: '⚙️', title: 'Einstellungen', accent: '#94a3b8' }
};

async function switchTab(name) {
  if (name === 'seraphina') name = 'chat';
  tabBtns.forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); if (on) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  document.body.dataset.section = name;
  const meta = SECTION_META[name] || SECTION_META.chat;
  appTitle.innerHTML = `Jeffa <span style="color:var(--accent)">${meta.icon} ${meta.title}</span>`;
  location.hash = `#${name}`;
  clearNews(name);

  if (name === 'chat' && !initFlags.chat) {
    initFlags.chat = true;
    await initChat(chatPanel);
  }
  
  if (name === 'seraphina') {
    if (!initFlags.chat) {
      initFlags.chat = true;
      await initChat(chatPanel);
    }
    const profiles = getProfiles();
    const seraphina = profiles.find(p => /seraphina/i.test(p.name));
    if (seraphina) {
      try {
        await openLastChat(seraphina.id);
      } catch {
        startNewChat(seraphina.id);
      }
    }
    chatPanel.classList.add('active');
    seraphinaPanel?.classList.remove('active');
  }
  
  if (name === 'profile') {
    if (!initFlags.profile) {
      initFlags.profile = true;
      initProfiles(profilePanel, {
        onStartChat: (id) => { startNewChat(id); switchTab('chat'); },
        onOpenLastChat: (id) => { openLastChat(id); switchTab('chat'); }
      });
    }
    if (!initFlags.persona) {
      initFlags.persona = true;
      import('./persona.js').catch(() => {});
    }
  }
  
  if (name === 'me' && !initFlags.me) {
    initFlags.me = true;
    import('./me.js').then(m => m.renderMeEditor(mePanel));
  }
  
  if (name === 'waechter') {
    if (!waechterModule) {
      if (!document.querySelector('link[href="./waechter.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './waechter.css'; document.head.appendChild(l); } // v63: CSS on demand
      waechterModule = await import('./waechter.js');
      waechterModule.mount(waechterPanel);
    } else if (waechterModule.refresh) {
      waechterModule.refresh();
    }
  }
  
  if (name === 'kollab' && !kollabModule) {
    kollabModule = await import('./kollab.js');
    kollabModule.init(kollabPanel);
  }
  
  if (name === 'comic' && !initFlags.comic) { initFlags.comic = true; (await import('./comic.js')).mount(document.getElementById('tab-comic')); }
  if (name === 'bot' && !initFlags.bot) { initFlags.bot = true; (await import('./bot.js')).init(document.getElementById('tab-bot')); }
  if (name === 'tresor' && !tresorModule) {
    tresorModule = await import('./tresor.js');
    tresorModule.init(tresorPanel);
  }
  
  if (name === 'settings' && !settingsModule) {
    settingsModule = await import('./settings.js');
    await settingsModule.init(settingsPanel);
  }
  // every non-chat page opens at the top
  if (name !== 'chat') { const pn = document.getElementById(`tab-${name}`); if (pn) requestAnimationFrame(() => { pn.scrollTop = 0; }); }
}

tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// v84b: Kacheln (Tabs) per Drag & Drop umsortieren – ein Pointer-Code für Touch, Stift und Maus.
const tabsNav = document.querySelector('nav.tabs-nav');
const LONG_PRESS_MS = 450;
const TOUCH_MOVE_TOL = 8;
const MOUSE_MOVE_TOL = 6;
let suppressTabClick = false;

function readTabOrder() {
  try { const a = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch { return []; }
}

function getTabButtons() {
  return tabsNav ? Array.from(tabsNav.querySelectorAll('.tab-btn')) : [];
}

function getTabIds() { return getTabButtons().map(b => b.dataset.tab); }

function saveTabOrder(ids) {
  try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(ids)); } catch {}
}

export function resetTabOrder() {
  try { localStorage.removeItem(TAB_ORDER_KEY); } catch {}
  location.reload();
}

function applySavedTabOrder() {
  if (!tabsNav) return;
  const btns = getTabButtons();
  const byId = new Map(btns.map(b => [b.dataset.tab, b]));
  const ordered = applyTabOrder(btns.map(b => b.dataset.tab), readTabOrder());
  for (const id of ordered) { const b = byId.get(id); if (b) tabsNav.appendChild(b); }
}

function setupTabDrag() {
  if (!tabsNav) return;
  const scrollEl = () => tabsNav;

  let drag = null; // { btn, pointerId, startX, startY, mode:'pending'|'drag', timer, originOrder, isMouse, scrollTimer, scrollDir }

  const clearDragVisual = () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.scrollTimer) { clearInterval(drag.scrollTimer); drag.scrollTimer = null; }
    drag.btn.classList.remove('dragging');
    tabsNav.classList.remove('reordering');
    drag = null;
  };

  const startDragMode = (st) => {
    st.mode = 'drag';
    st.originOrder = getTabIds();
    st.btn.classList.add('dragging');
    tabsNav.classList.add('reordering');
    try { navigator.vibrate?.(15); } catch {}
  };

  const autoScroll = (clientX) => {
    const el = scrollEl();
    const r = el.getBoundingClientRect();
    if (clientX < r.left + 40) { el.scrollLeft -= 10; }
    else if (clientX > r.right - 40) { el.scrollLeft += 10; }
  };

  const moveToPointer = (clientX) => {
    if (!drag) return;
    const others = getTabButtons().filter(b => b !== drag.btn);
    let target = null;
    for (const b of others) {
      const r = b.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (clientX < mid) { target = b; break; }
    }
    if (target) { if (drag.btn.nextElementSibling !== target) tabsNav.insertBefore(drag.btn, target); }
    else { const last = others[others.length - 1]; if (last && drag.btn.previousElementSibling !== last) last.after(drag.btn); else if (!last) tabsNav.appendChild(drag.btn); }
  };

  const onPointerDown = (e) => {
    if (drag) return;
    const btn = e.target?.closest?.('.tab-btn');
    if (!btn || !tabsNav.contains(btn)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const isMouse = e.pointerType === 'mouse';
    drag = { btn, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, mode: 'pending', originOrder: null, timer: null, isMouse, scrollTimer: null };
    if (!isMouse) {
      drag.timer = setTimeout(() => { if (drag && drag.mode === 'pending') startDragMode(drag); }, LONG_PRESS_MS);
    }
    btn.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);
    if (drag.mode === 'pending') {
      const tol = drag.isMouse ? MOUSE_MOVE_TOL : TOUCH_MOVE_TOL;
      if (dist > tol) {
        if (drag.isMouse) startDragMode(drag);
        else { clearDragVisual(); return; } // Finger bewegt → normales Scrollen
      } else return;
    }
    if (drag.mode === 'drag') {
      e.preventDefault();
      drag.lastX = e.clientX;
      moveToPointer(e.clientX);
      const el = scrollEl();
      const r = el.getBoundingClientRect();
      const nearEdge = e.clientX < r.left + 40 ? -1 : e.clientX > r.right - 40 ? 1 : 0;
      if (nearEdge && !drag.scrollTimer) {
        drag.scrollTimer = setInterval(() => { if (!drag) return; autoScroll(drag.lastX); moveToPointer(drag.lastX); }, 16);
      } else if (!nearEdge && drag.scrollTimer) { clearInterval(drag.scrollTimer); drag.scrollTimer = null; }
    }
  };

  const endDrag = (e, commit) => {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const st = drag;
    if (st.mode === 'drag') {
      if (commit) {
        saveTabOrder(getTabIds());
        toast('Reihenfolge gespeichert');
        suppressTabClick = true;
        setTimeout(() => { suppressTabClick = false; }, 400);
      } else if (st.originOrder) {
        const byId = new Map(getTabButtons().map(b => [b.dataset.tab, b]));
        for (const id of st.originOrder) { const b = byId.get(id); if (b) tabsNav.appendChild(b); }
      }
    }
    clearDragVisual();
  };

  const onPointerUp = (e) => endDrag(e, true);
  const onPointerCancel = (e) => endDrag(e, false);

  tabsNav.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) endDrag(null, false); }, true);
  // v84b QA: iOS/Android würden nach dem Langdruck sonst scrollen und pointercancel feuern –
  // im Zieh-Modus das native Scrollen per touchmove (passive:false) unterbinden; Kontextmenü unterdrücken.
  tabsNav.addEventListener('touchmove', (e) => { if (drag && drag.mode === 'drag') e.preventDefault(); }, { passive: false });
  tabsNav.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });

  // Klick direkt nach dem Ziehen darf den Tab nicht wechseln.
  tabsNav.addEventListener('click', (e) => {
    if (suppressTabClick) { e.stopPropagation(); e.preventDefault(); suppressTabClick = false; }
  }, true);
}

applySavedTabOrder();
setupTabDrag();

window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  if (hash && SECTION_META[hash]) switchTab(hash);
});

export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function setupInstallBanner() {
  if (localStorage.getItem('jeffa.installDismissed')) return;
  const show = () => { installBanner.classList.remove('hidden'); localStorage.setItem('jeffa.installDismissed', '1'); setTimeout(() => installBanner.classList.add('hidden'), 12000); };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) return;
  
  if (isIOS) {
    installBanner.querySelector('.install-banner-hint').textContent = 'Öffne in Safari: Teilen → Zum Homescreen';
    installBanner.querySelector('#install-btn').style.display = 'none';
    show();
  }
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.querySelector('.install-banner-hint').textContent = 'Schnellzugriff vom Homescreen';
    show();
  });
  
  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBanner.classList.add('hidden');
      localStorage.setItem('jeffa.installDismissed', '1');
    }
    deferredPrompt = null;
  });
  
  document.getElementById('install-close').addEventListener('click', () => {
    installBanner.classList.add('hidden');
    localStorage.setItem('jeffa.installDismissed', '1');
  });
}

themeBtn.addEventListener('click', () => {
  const settings = JSON.parse(localStorage.getItem('jeffa.settings') || '{}');
  const isLight = settings.theme === 'light';
  settings.theme = isLight ? 'dark' : 'light';
  localStorage.setItem('jeffa.settings', JSON.stringify(settings));
  document.body.classList.toggle('light-theme', !isLight);
  themeBtn.textContent = isLight ? '🌙' : '☀️';
});

// v53: Bild-App opener (no header button): any [data-open-bild] element (Comic tab, ☰ menu) opens jeffa-bild with the session.
function setupBildAppLink() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('[data-open-bild]')) return;
    e.preventDefault();
    const token = getSession();
    window.open('https://jeffa-bild.pages.dev/#s=' + encodeURIComponent(token), '_blank', 'noopener');
  });
}

async function init() {
  setupBildAppLink();
  
  const settings = JSON.parse(localStorage.getItem('jeffa.settings') || '{}');
  if (settings.theme === 'light') {
    document.body.classList.add('light-theme');
    themeBtn.textContent = '☀️';
  }

  let state = null;
  try {
    state = await authState();
  } catch (e) {
    console.warn('authState failed (offline?)', e);
  }
  
  if (state && !state.session) {
    document.body.classList.add('locked');
    const unlocked = await lockScreen();
    if (!unlocked) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;color:var(--text-primary)">Entsperrung erforderlich</div>';
      return;
    }
    document.body.classList.remove('locked');
  }

  initFlags.chat = true;
  await initChat(chatPanel);
  
  initFlags.profile = true;
  initProfiles(profilePanel, {
    onStartChat: (id) => { startNewChat(id); switchTab('chat'); },
    onOpenLastChat: (id) => { openLastChat(id); switchTab('chat'); }
  });
  onAdultChange(() => {
    initProfiles(profilePanel, {
      onStartChat: (id) => { startNewChat(id); switchTab('chat'); },
      onOpenLastChat: (id) => { openLastChat(id); switchTab('chat'); }
    });
  });

  setupInstallBanner();
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const hash = location.hash.slice(1);
  if (hash && SECTION_META[hash]) {
    switchTab(hash);
  } else {
    switchTab('chat');
  }
}

init();

// v66: rote Neuigkeiten-Punkte an den oberen Tabs (keine neue Abfrage — nur vorhandene Ereignisse)
const NEWS_KEY = 'jeffa.news.v1';
function newsState() { try { return JSON.parse(localStorage.getItem(NEWS_KEY) || '{}'); } catch { return {}; } }
function paintNews() { const st = newsState(); tabBtns.forEach((b) => b.classList.toggle('has-news', !!st[b.dataset.tab])); }
export function markNews(tab) {
  if (!tab || document.body.dataset.section === tab) return;
  const st = newsState(); st[tab] = Date.now(); localStorage.setItem(NEWS_KEY, JSON.stringify(st)); paintNews();
}
function clearNews(tab) {
  const st = newsState(); if (st[tab]) { delete st[tab]; localStorage.setItem(NEWS_KEY, JSON.stringify(st)); }
  paintNews(); try { caches.delete && caches.open('jeffa-news').then((c) => c.delete('/__news/' + tab)); } catch {}
}
window.addEventListener('jeffa:news', (e) => markNews(e.detail && e.detail.tab));
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'news') markNews(e.data.tab);
  if (e.data && e.data.type === 'open-bot') switchTab('bot');
});
try { caches.open('jeffa-news').then((c) => c.keys()).then((ks) => ks.forEach((r) => markNews(new URL(r.url).pathname.split('/').pop()))); } catch {}
paintNews();
