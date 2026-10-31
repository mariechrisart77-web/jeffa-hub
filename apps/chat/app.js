import { initChat, startNewChat, openLastChat } from './chat.js';
import { initProfiles, getProfiles, setActiveProfile, onProfilesChanged } from './profiles.js';
import { isAdult, setAdult, onAdultChange } from './shared/fsk.js';
import { lockScreen } from './shared/auth.js';
import { ENCRYPT_WARN } from './shared/crypto.js';

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const chatPanel = document.getElementById('tab-chat');
const profilePanel = document.getElementById('tab-profile');
const mePanel = document.getElementById('tab-me');
const settingsPanel = document.getElementById('tab-settings');
const installBanner = document.getElementById('install-banner');
const appHeader = document.getElementById('app-header');

let deferredPrompt = null;
let personaModule = null;
let meModule = null;

// Detect embedded mode
if (window.self !== window.top) {
  document.body.classList.add('embedded');
}

// Tab switching
function switchTab(name) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  
  if (name === 'profile' && !personaModule) {
    import('./persona.js').then(m => { personaModule = m; });
  }
  if (name === 'me' && !meModule) {
    import('./me.js').then(m => {
      meModule = m;
      m.renderMeEditor(mePanel);
    });
  }
}

tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// Settings panel
function renderSettings() {
  const settings = JSON.parse(localStorage.getItem('jeffa.settings') || '{}');
  
  settingsPanel.innerHTML = `
    <div class="settings-container">
      <h2>Einstellungen</h2>
      
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">Ich bin 18+</div>
          <div class="setting-desc">Schaltet Inhalte für Erwachsene frei</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="adult-toggle" ${isAdult() ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">Verschlüsselung</div>
          <div class="setting-desc">Chats lokal verschlüsselt speichern. Provider sehen weiterhin Inhalte.<br>⚠️ ${ENCRYPT_WARN}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="encrypt-toggle" ${settings.encrypt ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">App sperren</div>
          <div class="setting-desc">Entsperrung beim Start erforderlich</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="lock-toggle" ${settings.lockEnabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="setting-links">
        <a href="https://jeffa-hub.pages.dev" class="btn">🏠 Zum Hub</a>
        <a href="https://jeffa-waechter.pages.dev" class="btn secondary">👁 Wächter öffnen</a>
      </div>
    </div>
  `;
  
  const adultToggle = settingsPanel.querySelector('#adult-toggle');
  const encryptToggle = settingsPanel.querySelector('#encrypt-toggle');
  const lockToggle = settingsPanel.querySelector('#lock-toggle');
  
  adultToggle.addEventListener('change', async () => {
    if (adultToggle.checked) {
      const confirmed = confirm('Bestätige, dass du mindestens 18 Jahre alt bist.');
      if (!confirmed) {
        adultToggle.checked = false;
        return;
      }
      setAdult(true);
      toast('18+ Inhalte freigeschaltet');
    } else {
      setAdult(false);
      toast('18+ Inhalte ausgeblendet');
    }
  });
  
  encryptToggle.addEventListener('change', () => {
    settings.encrypt = encryptToggle.checked;
    localStorage.setItem('jeffa.settings', JSON.stringify(settings));
    toast(settings.encrypt ? 'Verschlüsselung aktiviert' : 'Verschlüsselung deaktiviert');
    window.dispatchEvent(new Event('jeffa:encrypt-changed'));
  });
  
  lockToggle.addEventListener('change', () => {
    settings.lockEnabled = lockToggle.checked;
    localStorage.setItem('jeffa.settings', JSON.stringify(settings));
    toast(settings.lockEnabled ? 'App-Sperre aktiviert' : 'App-Sperre deaktiviert');
  });
}

// Install banner
function setupInstallBanner() {
  if (localStorage.getItem('jeffa.installDismissed')) return;
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  
  if (isStandalone) return;
  
  if (isIOS) {
    const hint = installBanner.querySelector('.install-banner-hint');
    hint.textContent = 'Öffne in Safari: Teilen → Zum Homescreen';
    installBanner.querySelector('#install-btn').style.display = 'none';
    installBanner.classList.remove('hidden');
  }
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const hint = installBanner.querySelector('.install-banner-hint');
    hint.textContent = 'Schnellzugriff vom Homescreen';
    installBanner.classList.remove('hidden');
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

// Toast
export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Haptic
export function haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// Init
async function init() {
  const settings = JSON.parse(localStorage.getItem('jeffa.settings') || '{}');
  
  if (settings.lockEnabled) {
    const unlocked = await lockScreen();
    if (!unlocked) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;">Entsperrung erforderlich</div>';
      return;
    }
  }
  
  await initChat(chatPanel);
  initProfiles(profilePanel, {
    onStartChat: (id) => { startNewChat(id); switchTab('chat'); },
    onOpenLastChat: (id) => { openLastChat(id); switchTab('chat'); },
  });
  onAdultChange(() => initProfiles(profilePanel, { onStartChat: (id) => { startNewChat(id); switchTab('chat'); }, onOpenLastChat: (id) => { openLastChat(id); switchTab('chat'); } }));
  renderSettings();
  setupInstallBanner();
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();

