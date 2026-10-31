window.__JEFFA_V = 'jeffa-v67';
window.__JEFFA_UNIFIED = true;
import { initChat, startNewChat, openLastChat } from './chat.js';
import { initProfiles, getProfiles, getProfile, onProfilesChanged } from './profiles.js';
import { isAdult, setAdult, onAdultChange } from './shared/fsk.js';
import { authState, lockScreen } from './shared/auth.js';
import { getSession } from './shared/api.js';
import { initLightbox } from './shared/lightbox.js';
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
