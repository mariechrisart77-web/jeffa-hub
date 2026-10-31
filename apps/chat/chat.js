import { convMeta, relTime } from './convmeta.js';
import { chatMode, effectiveAdult } from './shared/mode.js';
import { api, streamChat } from './shared/api.js';
import { encryptJSON, decryptJSON, isEncryptOn } from './shared/crypto.js';
import { getProfiles, getAllProfiles, getProfile, getActiveProfile, setActiveProfile, updateProfile, addProfile, onProfilesChanged, buildImagePrompt, addFeedbackNote, syncProfileNow, resolveForServer, EDGE_VOICES } from './profiles.js';
import { voiceShortName } from './voicepick.js';
let imageClientPromise = null;
const loadImageClient = async () => {
  if (!imageClientPromise) imageClientPromise = import('./image-client.js');
  const mod = await imageClientPromise;
  return (opts = {}) => mod.generateImageInChat({
    api, currentConv, getProfile, getActiveProfile, uid, renderMessages, saveConversation,
    getImageStyle, getImageOpt, isAdult, syncProfileNow, photoOnce, photoFragments, toast, buildImagePrompt,
  }, opts);
};
import { nextAngle } from './imginfo.js';
import { renderMarkdown } from './shared/markdown.js';
import { buildChatSystem, capSystem, otherProfileNames, autoImageDecision } from './shared/promptapp/chat.js';
import { liteCopy, mergeStores, pickConvForProfile, idbGet, idbSet } from './convstore.js';
const speak = (...a) => import('./shared/tts.js').then((m) => m.speak(...a)); // v63: TTS loads on demand
import { setupTyping } from './shared/typing.js';
import { isAdult } from './shared/fsk.js';
import { personaChatText } from './shared/persona-terms.js';
import { styleFor } from './styles.js';
import { getMe } from './me-data.js';
import { photoFragments, autoPhoto, QUALITY, optionsHtml, KNAPP_LABELS, SFW_DIRECTIONS } from './photoopts.js';
import { resolveChain, getPaidAllowed, needsApproval, pickModel, modelLabel, getImageStyle, getImageOpt } from './shared/models.js';
import { imgInfoHtml } from './imginfo.js';

let root;
let currentConvId = null;
let abortController = null;
let drawer = null;
let overlay = null;
let attachSheet = null;
let cast = [];
let speakingNow = null; // v82 C1: Nachrichten-ID, die gerade vorgelesen wird
let ttsOff = null;

async function initTts() {
  if (ttsOff) return;
  try {
    const m = await import('./shared/tts.js');
    speakingNow = m.isSpeaking() ? m.speakingId() : null;
    ttsOff = m.onTtsChange(({ speaking, id }) => { speakingNow = speaking ? id : null; paintTts(); });
  } catch {}
}

function paintTts() {
  if (!root) return;
  root.querySelectorAll('.chip[data-action="speak"]').forEach((chip) => {
    const on = !!speakingNow && chip.dataset.id === speakingNow;
    chip.classList.toggle('speaking', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    chip.textContent = on ? '⏹ Stopp' : '🔊 Vorlesen';
  });
  const btn = root.querySelector('#tts-stop');
  if (btn) btn.classList.toggle('hidden', !speakingNow);
}

function stopTts() {
  if (!speakingNow) return;
  import('./shared/tts.js').then((m) => m.stopSpeaking()).catch(() => {});
}

function toggleSpeak(msg, profile) {
  if (!msg) return;
  if (speakingNow && speakingNow === msg.id) { stopTts(); return; }
  import('./shared/tts.js').then((m) => {
    speakingNow = msg.id;
    paintTts();
    return m.speak(msg.content, profile?.voice, profile?.language, { id: msg.id });
  }).catch(() => toast('Vorlesen nicht möglich'));
}

export async function initChat(rootEl) {
  root = rootEl;
  await loadStore();
  render();
  initTts();
  onProfilesChanged(() => renderSidebar());
  window.addEventListener('jeffa:image', (e) => {
    if (e.detail?.prompt) loadImageClient().then((fn) => fn({ prompt: e.detail.prompt }));
  });
}

function render() {
  root.innerHTML = `
    <div class="chat-overlay"></div>
    <aside class="chat-drawer">
      <div class="drawer-header">
        <h3>Chats</h3>
        <button class="btn-icon" id="new-chat-btn">+</button>
      </div>
      <div class="drawer-list" id="conv-list"></div>
      <button class="btn-sm secondary" data-open-bild style="margin:8px">🖼 Bild-App öffnen</button>
    </aside>
    <div class="chat-main">
      <div class="chat-header" id="chat-header">
        <div class="profile-info" id="profile-info"></div>
        <div class="hdr-actions">
          <button class="btn-icon hidden" id="tts-stop" title="Vorlesen stoppen" aria-label="Vorlesen stoppen">⏹</button>
          <button class="btn-icon" id="photo-btn" title="Foto-Einstellungen" aria-label="Foto-Einstellungen">📸</button>
          <button class="btn-icon" id="more-btn" title="Mehr" aria-label="Mehr" aria-expanded="false">⋯</button>
          <div class="hdr-menu hidden" id="hdr-menu">
            <button class="sheet-item" id="cast-btn">🎭 Besetzung</button>
            <button class="sheet-item" id="menu-model">🤖 Modell wählen</button>
          </div>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <div class="composer">
        <div class="attach-icons" id="attach-icons"></div>
        <div class="input-row">
          <button class="btn-icon" id="attach-btn">📎</button>
          <textarea class="composer-input" id="message-input" placeholder="Nachricht..." rows="1" spellcheck="true" autocorrect="on" autocapitalize="sentences" lang="de"></textarea>
          <button class="btn-icon primary" id="send-btn">📤</button>
        </div>
      </div>
    </div>
    <div class="attach-sheet hidden" id="attach-sheet">
      <div class="sheet-header">
        <h4>Anhängen</h4>
        <button class="btn-icon" id="sheet-close">✕</button>
      </div>
      <button class="sheet-item" id="attach-photo">📷 Fotomediathek</button>
      <button class="sheet-item" id="attach-camera">📸 Foto aufnehmen</button>
      <button class="sheet-item" id="attach-file">📄 Dateien auswählen</button>
      <button class="sheet-item" id="attach-secure">🔒 Sichere Eingabe</button>
      <button class="sheet-item" id="attach-tools">🛠 Werkzeuge: <span id="tools-mode"></span></button>
    </div>
  `;
  initPinchZoom(root.querySelector('#messages'));
  const TM = { auto: 'Auto', on: 'An', off: 'Aus' };
  const showTM = () => { const el = root.querySelector('#tools-mode'); if (el) el.textContent = TM[settingsGet().tools || 'auto']; };
  showTM();
  root.querySelector('#attach-tools')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = settingsGet(); s.tools = { auto: 'on', on: 'off', off: 'auto' }[s.tools || 'auto'];
    localStorage.setItem('jeffa.settings', JSON.stringify(s)); showTM(); toast('Werkzeuge: ' + TM[s.tools]);
  });
  
  drawer = root.querySelector('.chat-drawer');
  overlay = root.querySelector('.chat-overlay');
  attachSheet = root.querySelector('#attach-sheet');
  
  document.querySelector('#menu-btn')?.addEventListener('click', () => {
    drawer.classList.add('open');
    overlay.classList.add('open');
  });
  
  overlay.addEventListener('click', () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });
  
  root.querySelector('#new-chat-btn').addEventListener('click', () => {
    createNewConv();
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });
  
  const input = root.querySelector('#message-input');
  setupTyping(input, () => sendMessage(), { maxPx: 200, minPx: 44 });
  
  root.querySelector('#send-btn').addEventListener('click', () => sendMessage());
  
  root.querySelector('#attach-btn').addEventListener('click', () => {
    attachSheet.classList.toggle('hidden');
  });
  
  root.querySelector('#sheet-close').addEventListener('click', () => {
    attachSheet.classList.add('hidden');
  });
  
  root.querySelector('#attach-photo').addEventListener('click', () => {
    pickFiles('image/*,video/*', true);
    attachSheet.classList.add('hidden');
  });
  
  root.querySelector('#attach-camera').addEventListener('click', () => {
    pickFiles('image/*', false, true);
    attachSheet.classList.add('hidden');
  });
  
  root.querySelector('#attach-file').addEventListener('click', () => {
    pickFiles('*');
    attachSheet.classList.add('hidden');
  });
  
  root.querySelector('#attach-secure').addEventListener('click', () => {
    openSecureInput();
    attachSheet.classList.add('hidden');
  });
  
  wireReadingArea();
  root.querySelector('#tts-stop')?.addEventListener('click', () => stopTts());
  root.querySelector('#cast-btn').addEventListener('click', () => {
    openCastPicker();
  });
  
  const convs = listConversations();
  let preferred = null;
  try { preferred = localStorage.getItem('jeffa.currentConv'); } catch {}
  const start = (preferred && convs.find((c) => c.id === preferred)) || convs[0];
  if (!start) {
    createNewConv();
  } else {
    loadConv(start.id);
  }
  
  renderSidebar();
  paintTts();
}


// ---- storage: in-memory cache, persisted (optionally AES-GCM encrypted) with debounce
const STORE_KEY = 'jeffa.conversations';
let convCache = [];
let persistTimer = null;
const IDB_KEY = 'conversations';
async function loadStore() {
  let idbConvs = [];
  try {
    const idbRaw = await idbGet(IDB_KEY);
    if (Array.isArray(idbRaw)) idbConvs = idbRaw;
    else if (typeof idbRaw === 'string' && idbRaw) { const p = JSON.parse(idbRaw); idbConvs = Array.isArray(p) ? p : (p && p.ct ? await decryptJSON(p) : []); }
    else if (idbRaw && typeof idbRaw === 'object' && idbRaw.ct) idbConvs = await decryptJSON(idbRaw);
  } catch (e) { console.warn('Chats (IndexedDB) nicht lesbar', e); }
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) { convCache = Array.isArray(idbConvs) ? idbConvs : []; return; }
  try {
    const parsed = JSON.parse(raw);
    const lsConvs = Array.isArray(parsed) ? parsed : (parsed && parsed.ct ? await decryptJSON(parsed) : []);
    convCache = mergeStores(idbConvs, lsConvs); // v82: erst zusammenführen, dann (v68) neu speichern – nie einen leeren Stand schreiben
    if (parsed && parsed.ct && !isEncryptOn()) await persist(true); // v68: alte verschlüsselte Chats unverschlüsselt neu speichern
  } catch (e) { console.warn('Chats nicht lesbar', e); if (raw && !localStorage.getItem(STORE_KEY + '.unreadable')) localStorage.setItem(STORE_KEY + '.unreadable', raw); convCache = Array.isArray(idbConvs) ? idbConvs : []; }
}
let saveFailedOnce = false;
async function writeLs(convs) {
  const data = isEncryptOn() ? JSON.stringify(await encryptJSON(convs)) : JSON.stringify(convs);
  localStorage.setItem(STORE_KEY, data);
}
function persist(now = false) {
  clearTimeout(persistTimer);
  const run = async () => {
    let idbOk = false;
    try {
      const full = isEncryptOn() ? await encryptJSON(convCache) : convCache;
      idbOk = await idbSet(IDB_KEY, full);
    } catch (e) { console.warn('save failed (idb)', e); }
    let lsOk = false;
    const lite = liteCopy(convCache);
    try { await writeLs(lite); lsOk = true; }
    catch (e) {
      console.warn('save failed (ls)', e);
      try { await writeLs(lite.map((c) => ({ ...c, messages: (c.messages || []).slice(-80) }))); lsOk = true; } catch (e2) { console.warn('save failed (ls, kurz)', e2); }
    }
    if (!idbOk && !lsOk && !saveFailedOnce) { saveFailedOnce = true; toast('⚠️ Chat konnte nicht gespeichert werden – Speicher voll? Alte Chats mit Bildern löschen.'); }
  };
  if (now) return run();
  persistTimer = setTimeout(run, 400);
}
window.addEventListener('pagehide', () => persist(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(true); });
window.addEventListener('jeffa:encrypt-changed', () => persist(true)); // v68: Umschalten speichert sofort im neuen Format

export function listConversations(profileId) {
  const all = convCache.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return profileId ? all.filter(c => c.profileId === profileId) : all;
}
function getConversation(id) { return convCache.find(c => c.id === id); }
function saveConversation(conv) {
  conv.updatedAt = new Date().toISOString();
  if (!convCache.includes(conv)) {
    const i = convCache.findIndex(c => c.id === conv.id);
    if (i >= 0) convCache[i] = conv; else convCache.push(conv);
  }
  persist();
}
function deleteConversation(id) { convCache = convCache.filter(c => c.id !== id); persist(); }

function createNewConv() {
  const profile = getActiveProfile();
  const newest = listConversations(profile.id)[0];
  if (newest && !(newest.messages || []).length) { loadConv(newest.id); renderSidebar(); return; }
  const conv = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    profileId: profile.id,
    title: 'Neue Konversation',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveConversation(conv);
  loadConv(conv.id);
  renderSidebar();
}

function loadConv(id) {
  stopTts();
  currentConvId = id;
  const conv = getConversation(id);
  if (!conv) return;
  try {
    localStorage.setItem('jeffa.currentConv', id);
    const map = JSON.parse(localStorage.getItem('jeffa.lastConvByProfile') || '{}');
    map[conv.profileId] = id;
    localStorage.setItem('jeffa.lastConvByProfile', JSON.stringify(map));
  } catch {}
  
  const profile = getProfile(conv.profileId);
  if (profile) setActiveProfile(profile.id);
  
  renderHeader();
  renderMessages();
  paintTts();
}

function renderSidebar() {
  const list = root.querySelector('#conv-list');
  if (!list) return;
  
  const profiles = getProfiles();
  const convs = listConversations();
  
  const grouped = {};
  profiles.forEach(p => {
    grouped[p.id] = convs.filter(c => c.profileId === p.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  });
  
  list.innerHTML = Object.entries(grouped).map(([profileId, items]) => {
    const profile = getProfile(profileId);
    if (!profile || items.length === 0) return '';
    
    return `
      <div class="conv-group">
        <div class="conv-group-header">${profile.avatar || '💬'} ${escapeHtml(profile.name)} <span class="conv-count">· ${items.length} ${items.length === 1 ? 'Chat' : 'Chats'}</span></div>
        ${items.map(c => {
          const active = c.id === currentConvId;
          const encrypted = isEncryptOn() ? '🔒 ' : '';
          const m = convMeta(c);
          return `
            <div class="conv-item ${active ? 'active' : ''}" data-id="${c.id}">
              <div class="conv-main">
                <div class="conv-top"><span class="conv-title">${encrypted}${escapeHtml(c.title)}</span><span class="conv-time">${relTime(m.lastTs)}</span></div>
                <div class="conv-sub"><span class="conv-preview">${escapeHtml(m.preview) || '–'}</span><span class="conv-meta">${m.hasImages ? '🖼️ ' : ''}${m.count}</span></div>
              </div>
              <button class="btn-icon tiny conv-more" data-id="${c.id}" aria-label="Mehr">⋯</button>
              <div class="conv-actions" hidden>
                <button class="btn-sm rename-btn" data-id="${c.id}">✏️ Umbenennen</button>
                <button class="btn-sm delete-btn" data-id="${c.id}">🗑️ Löschen</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.conv-actions, .conv-more')) return;
      loadConv(el.dataset.id);
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    });
  });
  
  list.querySelectorAll('.conv-more').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); const a = btn.parentElement.querySelector('.conv-actions'); list.querySelectorAll('.conv-actions').forEach(x => { if (x !== a) x.hidden = true; }); a.hidden = !a.hidden; }));
  list.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const conv = getConversation(id);
      const title = prompt('Titel:', conv.title);
      if (title && title.trim()) {
        conv.title = title.trim();
        saveConversation(conv);
        renderSidebar();
        if (id === currentConvId) renderHeader();
      }
    });
  });
  
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Chat löschen?')) {
        deleteConversation(id);
        if (id === currentConvId) {
          const remaining = listConversations();
          if (remaining.length > 0) {
            loadConv(remaining[0].id);
          } else {
            createNewConv();
          }
        }
        renderSidebar();
      }
    });
  });
}

function renderHeader() {
  const conv = getConversation(currentConvId);
  if (!conv) return;
  
  const profile = getProfile(conv.profileId);
  const info = root.querySelector('#profile-info');
  if (!info) return;
  
  info.innerHTML = `
    <div class="profile-avatar">${profile.avatar || '💬'}</div>
    <div class="profile-meta">
      <div class="profile-name">${profile.name}</div>
      <div class="conv-title-inline">${conv.title}</div>
      <button class="hdr-model msg-model" id="hdr-model">🤖 ${escapeHtml(conv.model ? modelLabel(conv.model) : profile.model ? modelLabel(profile.model) + ' (Profil)' : 'Automatisch' + (isAdult() ? ' · 🔞' : ''))}</button>
      <button class="hdr-voice" id="hdr-voice" title="Stimme wählen">🔊 ${escapeHtml(voiceShortName(profile?.voice?.voiceName, EDGE_VOICES) || 'Stimme')}</button>
      <span class="hdr-mode">${isAdult()
        ? `<select id="hdr-mode" aria-label="Modus"><option value="jugendfrei" ${chatMode(conv, profile) === 'jugendfrei' ? 'selected' : ''}>🔒 Modus: jugendfrei</option><option value="hemmungslos" ${chatMode(conv, profile) === 'hemmungslos' ? 'selected' : ''}>🔥 Modus: hemmungslos</option></select>`
        : `<span class="hdr-mode-fixed" title="Global jugendfrei – Modus nicht umschaltbar">🔒 Modus: jugendfrei</span>`}</span>
    </div>
  `;
  info.querySelector('#hdr-model').onclick = () => chooseChatModel(conv);
  info.querySelector('#hdr-voice').onclick = () => pickVoice(conv, profile);
  const modeSel = info.querySelector('#hdr-mode');
  if (modeSel) modeSel.onchange = () => {
    const next = modeSel.value;
    conv.mode = next;
    conv.messages.push({ id: uid(), role: 'system', content: next === 'hemmungslos' ? '🔥 Modus: hemmungslos' : '🔒 Modus: jugendfrei', ts: Date.now(), local: true });
    saveConversation(conv); renderMessages(); renderHeader();
  };
}

let saveTimer = null;
let renderPending = false;
let renderFrame = false;

function renderMessages() {
  const container = root.querySelector('#messages');
  if (!container) return;
  
  const conv = getConversation(currentConvId);
  if (!conv) return;
  
  const messages = conv.messages.slice(-200);
  
  container.innerHTML = messages.map(msg => {
    if (msg.role === 'system' && msg.local) return `<div class="msg-system" style="text-align:center;opacity:.75;font-size:.85em;margin:6px 0">${escapeHtml(msg.content || '')}</div>`;
    const isUser = msg.role === 'user';
    const time = new Date(msg.ts || Date.now()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    
    let content = '';
    if (msg.secure) {
      content = '<div class="secure-text">•••• (sichere Eingabe)</div>';
    } else if (isUser) {
      content = `<div>${escapeHtml(msg.content)}</div>`;
    } else {
      content = msg.content || msg.status === 'streaming' ? `<div class="markdown">${(msg.generated && msg.status === 'streaming' ? `<span class="img-spin"></span> ${escapeHtml(msg.content || '🎨 Bild wird gemalt…')}` : msg.content ? renderMarkdown(msg.content) : '<span class="thinking">💭 denkt nach…</span>')}</div>` : '';
    }
    
    const strippedHint = msg.stripped && !msg.imageUrl && !(msg.images || []).length ? '<div class="hint">🖼 Bild nur auf dem Ursprungsgerät gespeichert</div>' : '';
    const attachments = strippedHint + (msg.images || []).map(img => {
      if (img.mime?.startsWith('video/')) {
        return `<video src="data:${img.mime};base64,${img.data}" controls></video>`;
      }
      return `<img src="data:${img.mime};base64,${img.data}" alt="Anhang">`;
    }).join('') + (msg.imageUrl ? `<div class="img-wrap"><img src="${escapeHtml(msg.imageUrl)}" alt="Bild" loading="lazy">${(msg.comic || []).map((c, i, arr) => `<button class="bubble" style="top:${(i / arr.length) * 100 + 2}%" data-de="${escapeHtml(c.de)}" data-es="${escapeHtml(c.es)}">${escapeHtml(c.es)}</button>`).join('')}</div>` : '') + (msg.videoUrl ? `<video src="${escapeHtml(msg.videoUrl)}" controls playsinline></video>` : '') + (msg.video && !msg.videoUrl ? `<div class="hint">🎬 ${escapeHtml(msg.video.name || 'Video')}</div>` : '');
    
    const galChip = msg.generated && msg.imageUrl && msg.status === 'done' ? `<div class="action-chips"><button class="chip" data-action="gal" data-id="${msg.id}">💾 In Galerie</button>${msg.gen ? `<button class="chip" data-action="reseed" data-id="${msg.id}">🔁 Neuer Seed</button><button class="chip" data-action="keepseed" data-id="${msg.id}">📌 Seed behalten</button><button class="chip" data-action="vary" data-id="${msg.id}">🎲 Variation</button>` : ''}<button class="chip ${msg.imgRating === 1 ? 'active' : ''}" data-action="imgup" data-id="${msg.id}" title="Bild gefällt mir">👍</button><button class="chip ${msg.imgRating === -1 ? 'active' : ''}" data-action="imgdown" data-id="${msg.id}" title="Bild passt nicht – beschreiben">👎</button></div>${imgInfoHtml(msg.gen, escapeHtml, msg.id)}` : '';
    const chips = galChip || (!isUser && !msg.generated && msg.status !== 'streaming' ? `
      <div class="action-chips">
        <button class="chip" data-action="image" data-id="${msg.id}">🖼 Foto</button>
        <button class="chip" data-action="video" data-id="${msg.id}">🎬 Video</button>
        <button class="chip${speakingNow && speakingNow === msg.id ? ' speaking' : ''}" aria-pressed="${speakingNow && speakingNow === msg.id ? 'true' : 'false'}" data-action="speak" data-id="${msg.id}">${speakingNow && speakingNow === msg.id ? '⏹ Stopp' : '🔊 Vorlesen'}</button>
        <button class="chip" data-action="copy" data-id="${msg.id}">📋 Kopieren</button>
        <button class="chip" data-action="up" data-id="${msg.id}">👍</button>
        <button class="chip" data-action="down" data-id="${msg.id}">👎</button>
        <button class="chip" data-action="copyall" data-id="${msg.id}" title="Ganzen Text kopieren" aria-label="Ganzen Text kopieren">📄 Alles</button>
      </div>
    ` : '');
    
    return `
      <div class="msg ${msg.role}" data-msg-id="${msg.id}">
        <div class="msg-bubble">
          ${attachments}
          ${content}
          ${chips}
        </div>
        <div class="msg-meta">
          <span>${time}</span>
          ${msg.model ? `<span class="msg-model" data-pick-model>${escapeHtml(msg.model)}</span>` : ''}${msg.usage ? `<span class="msg-usage">${msg.usage.img ? '' : `${msg.usage.in + msg.usage.out} Tok (${msg.usage.in}+${msg.usage.out}) · `}${msg.usage.cost ? (msg.usage.img ? msg.usage.cost.toFixed(2).replace('.', ',') + ' $' : '$' + msg.usage.cost.toFixed(4)) : 'gratis'}</span>` : ''}
        </div>${msg.notes?.length ? `<div class="msg-notes">${msg.notes.map(n => `<div>↪ ${escapeHtml(n)}</div>`).join('')}</div>` : ''}${msg.status === 'error' && msg.role === 'assistant' ? `<button class="btn-sm retry-btn" data-retry="${msg.id}">🔄 Nochmal versuchen</button>` : ''}${msg.imageUrl ? `<a class="img-save" href="${escapeHtml(msg.imageUrl)}" download="jeffa-${msg.id}.webp" title="Bild aufs Gerät herunterladen">⬇️ Herunterladen</a>` : ''}<div style="display:none">
        </div>
      </div>
    `;
  }).join('');
  
  container.scrollTop = container.scrollHeight;
  
  attachMessageActions();
  paintTts();
}

function attachMessageActions() {
  const container = root.querySelector('#messages');
  if (!container) return;
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => onChip(chip.dataset.action, chip.dataset.id, chip));
  });
  container.querySelectorAll('.bubble').forEach(b => b.addEventListener('click', () => { b.textContent = b.textContent === b.dataset.es ? b.dataset.de : b.dataset.es; b.classList.toggle('de'); }));
  container.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', () => {
    const c = getConversation(currentConvId); if (!c) return;
    const i = c.messages.findIndex(m => m.id === b.dataset.retry); if (i < 0) return;
    c.messages.splice(i, 1); saveConversation(c); renderMessages(); generateReply(c);
  }));
  container.querySelectorAll('[data-pick-model]').forEach(el => el.addEventListener('click', () => { const c = getConversation(currentConvId); if (c) chooseChatModel(c); }));
  container.querySelectorAll('.msg.user .msg-bubble').forEach(b => {
    const id = b.parentElement.dataset.msgId;
    let t = null;
    b.addEventListener('dblclick', () => editMessage(id));
    b.addEventListener('touchstart', () => { t = setTimeout(() => editMessage(id), 550); }, { passive: true });
    b.addEventListener('touchend', () => clearTimeout(t));
    b.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  const c = document.getElementById('toast-container');
  if (!c) return alert(msg);
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function currentConv() { return getConversation(currentConvId); }

// ---- public helpers used by profiles/app
export function startNewChat(profileId) { if (profileId) setActiveProfile(profileId); stopTts(); createNewConv(); }
export function openLastChat(profileId) {
  let preferred = null;
  try { preferred = (JSON.parse(localStorage.getItem('jeffa.lastConvByProfile') || '{}') || {})[profileId] || null; } catch {}
  const c = pickConvForProfile(listConversations(), profileId, preferred);
  if (c) { loadConv(c.id); renderSidebar(); } else startNewChat(profileId);
}
export function lastConvIdFor(profileId) {
  const all = listConversations(profileId);
  if (all.length) {
    try { const m = JSON.parse(localStorage.getItem('jeffa.lastConvByProfile') || '{}'); if (m && m[profileId] && all.some((c) => c.id === m[profileId])) return m[profileId]; } catch {}
    return all[0].id;
  }
  return null;
}
export function getCast() { return cast.slice(); }
export function setCast(ids) { cast = Array.isArray(ids) ? ids.slice(0, 3) : []; try { localStorage.setItem('jeffa.cast', JSON.stringify(cast)); } catch {} }
try { cast = JSON.parse(localStorage.getItem('jeffa.cast') || '[]'); } catch { cast = []; }

// ---- attachments
let pending = []; // {type,mime,data,name,text?}
let secureText = null;
function renderAttachIcons() {
  const el = root.querySelector('#attach-icons'); if (!el) return;
  el.innerHTML = pending.map((a, i) => `<span class="att-pill">${a.type === 'image' ? '🖼' : a.type === 'video' ? '🎬' : '📄'} ${escapeHtml((a.name || '').slice(0, 18))}<button data-i="${i}" aria-label="Entfernen">✕</button></span>`).join('')
    + (secureText ? '<span class="att-pill">🔒 sichere Eingabe<button data-s="1">✕</button></span>' : '');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.s) secureText = null; else pending.splice(+b.dataset.i, 1); renderAttachIcons(); });
}
function fileToB64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}
async function resizeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
function pickFiles(accept, multiple = false, capture = false) {
  const inp = document.createElement('input'); inp.type = 'file';
  if (accept && accept !== '*') inp.accept = accept;
  inp.multiple = multiple; if (capture) inp.setAttribute('capture', 'environment');
  inp.onchange = async () => {
    for (const f of [...inp.files].slice(0, 5)) {
      try {
        if (f.type.startsWith('image/')) pending.push({ type: 'image', mime: 'image/jpeg', data: await resizeImage(f), name: f.name });
        else if (f.type.startsWith('video/')) {
          if (f.size > 8 * 1024 * 1024) { toast('Video zu groß (max. 8 MB)'); continue; }
          pending.push({ type: 'video', mime: f.type, data: await fileToB64(f), name: f.name });
        } else if (f.size <= 200 * 1024 && (/^text\//.test(f.type) || /\.(txt|md|csv|json|js|ts|py|html|css|xml|log)$/i.test(f.name))) {
          pending.push({ type: 'text', name: f.name, text: await f.text() });
        } else toast(`${f.name}: Format nicht unterstützt`);
      } catch { toast('Datei konnte nicht gelesen werden'); }
    }
    renderAttachIcons();
  };
  inp.click();
}
function openSecureInput() {
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h4>🔒 Sichere Eingabe</h4><p class="hint">Wird gesendet, aber nie gespeichert oder angezeigt.</p>
    <textarea id="sec-in" class="secure-input" rows="3" autocomplete="off" spellcheck="false" style="-webkit-text-security:disc"></textarea>
    <div class="modal-actions"><button class="btn btn-secondary" id="sec-x">Abbrechen</button><button class="btn btn-primary" id="sec-ok">Übernehmen</button></div></div>`;
  document.body.appendChild(m);
  const ta = m.querySelector('#sec-in'); ta.focus();
  m.querySelector('#sec-x').onclick = () => m.remove();
  m.querySelector('#sec-ok').onclick = () => { secureText = ta.value.trim() || null; ta.value = ''; m.remove(); renderAttachIcons(); };
}
function openCastPicker() {
  const list = getProfiles().filter(p => p.enabled !== false && (!p.adult || isAdult()));
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h4>Besetzung</h4><p class="hint">Wer kommt in Geschichten &amp; Bildern vor? (max. 3)</p>
    ${list.map(p => `<label class="toggle-label"><input type="checkbox" value="${p.id}" ${cast.includes(p.id) ? 'checked' : ''}> ${p.avatar || ''} ${escapeHtml(p.name)}</label>`).join('')}
    <div class="modal-actions"><button class="btn btn-primary" id="cast-ok">OK</button></div></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  m.querySelector('#cast-ok').onclick = () => { setCast([...m.querySelectorAll('input:checked')].map(i => i.value)); m.remove(); };
}

// ---- sending / streaming
function apiMessages(conv, uptoIdx) {
  return conv.messages.slice(0, uptoIdx).filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && m.status !== 'error'))
    .slice(-40).map(m => ({ role: m.role, content: m.content || '', ...(m.images?.length && !m.generated ? { images: m.images.map(i => ({ mimeType: i.mime, data: i.data })) } : {}) }));
}
async function sendMessage() {
  if (abortController) { abortController.abort(); return; }
  const input = root.querySelector('#message-input');
  let text = input.value.trim();
  if (!text && !pending.length && !secureText) return;
  const conv = currentConv(); if (!conv) return;
  const files = pending.filter(a => a.type === 'text');
  const fileText = files.map(f => `\n\n[Datei: ${f.name}]\n${f.text}`).join('');
  const images = pending.filter(a => a.type === 'image').map(a => ({ mime: a.mime, data: a.data }));
  const videos = pending.filter(a => a.type === 'video');
  stopTts();
  const userMsg = { id: uid(), role: 'user', content: text + fileText, images, ts: Date.now() };
  if (videos.length) userMsg.video = { mime: videos[0].mime, name: videos[0].name };
  const secret = secureText;
  if (secret && !text) userMsg.secure = true;
  conv.messages.push(userMsg);
  input.value = ''; input._grow ? input._grow() : (input.style.height = 'auto');
  pending = []; secureText = null; renderAttachIcons();
  await generateReply(conv, { secret, videos });
}
async function generateReply(conv, { secret = null, videos = [] } = {}) {
  const profile = getProfile(conv.profileId) || getActiveProfile();
  const msgs = apiMessages(conv, conv.messages.length);
  if (secret && msgs.length) msgs[msgs.length - 1].content = (msgs[msgs.length - 1].content ? msgs[msgs.length - 1].content + '\n\n' : '') + secret;
  const me = getMe?.();
  const adultChat = effectiveAdult(conv, profile);
  const { system, otherNames } = buildChatSystem({ profile, adult: adultChat, me, cast, getProfile, allProfiles: getAllProfiles() });
  const adult = adultChat;
  const fullMsgs = msgs.slice();
  const summary = await compactHistory(conv, msgs);
  if (summary) msgs.splice(0, msgs.length - 8);
  const a = { id: uid(), role: 'assistant', content: '', ts: Date.now(), status: 'streaming', model: '' };
  conv.messages.push(a);
  saveConversation(conv);
  renderMessages();
  const send = root.querySelector('#send-btn'); if (send) send.textContent = '⏹';
  abortController = new AbortController();
  let frame = false;
  const paint = () => {
    frame = false;
    const el = root.querySelector(`.msg[data-msg-id="${a.id}"] .markdown`);
    if (el) { el.innerHTML = renderMarkdown(a.content); const c = root.querySelector('#messages'); if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 160) c.scrollTop = c.scrollHeight; }
  };
  if (toolsWanted(msgs)) {
    try { await runAgent(conv, a, profile, system, msgs); }
    finally {
      abortController = null; if (send) send.textContent = '📤';
      if (a.status === 'streaming') a.status = 'done'; if (document.body.dataset.section && document.body.dataset.section !== 'chat') window.dispatchEvent(new CustomEvent('jeffa:news', { detail: { tab: 'chat' } }));
      saveConversation(conv); renderMessages(); persist(true);
    }
    if (a.status === 'done' && conv.title === 'Neue Konversation') autoTitle(conv);
    return;
  }
  try {
    await streamChat({
      modelChain: resolveChain({ chatModel: conv.model, profileModel: profile.model, adult, profile, hasImages: msgs.some((m) => Array.isArray(m.images) && m.images.length) }), paidAllowed: getPaidAllowed(), adult, mode: chatMode(conv, profile), system: capSystem(system), messages: msgs, stream: true,
      notes: (profile.notes || []).slice(0, 5), profileId: profile.id, summary: summary || undefined,
      profileName: profile.name, otherNames,
      memory: settingsGet().memory !== false && !isEncryptOn(),
      attachments: videos.map(v => ({ type: 'video', mime: v.mime, data: v.data })),
    }, {
      signal: abortController.signal,
      onDelta: (d) => { a.content += d; if (!frame) { frame = true; requestAnimationFrame(paint); } },
      onModel: (m) => { a.model = m; },
      onNotice: (n) => { const t = typeof n === 'string' ? n : n.message || 'Hinweis'; a.notes = [...(a.notes || []), t]; toast(t); },
      onUsage: (u) => { a.usage = u; },
      onDone: (_u, m) => { if (m) a.model = m; },
      onError: (e) => { if (e.code !== 'aborted') { a.status = 'error'; a.content = a.content || `⚠️ ${e.message}`; } },
    });
  } finally {
    abortController = null;
    if (send) send.textContent = '📤';
    if (a.status === 'streaming') a.status = 'done'; if (document.body.dataset.section && document.body.dataset.section !== 'chat') window.dispatchEvent(new CustomEvent('jeffa:news', { detail: { tab: 'chat' } }));
    saveConversation(conv);
    renderMessages();
    persist(true);
  }
  const fotoM = a.content.match(/\[(?:FOTO|BILD|PHOTO)\s*:?\s*([^\]]*)\]?\s*$/i);
  const userAsked = PHOTO_ASK.test(fullMsgs.at(-1)?.content || '');
  if (fotoM) { a.content = a.content.slice(0, fotoM.index).trim(); saveConversation(conv); renderMessages(); }
  const freq = getImageOpt('imageFreq', 'request');
  const apP = autoPhoto(profile);
  const nReplies = conv.messages.filter(m => m.role === 'assistant' && !m.generated).length;
  // v84 B1: Bildhäufigkeit – in jugendfrei gedrosselt (etwa jede 5.–10. Antwort), hemmungslos wie bisher.
  const sfwEvery = getImageOpt('imageEverySfw', '5-10');
  let imgDecision;
  if (a.status === 'done') {
    imgDecision = autoImageDecision({ mode: chatMode(conv, profile), userAsked, fotoTag: !!fotoM, freq, profileAuto: apP, conv, sfwEvery, nReplies });
    if (imgDecision.nextAt != null) conv.nextImgAt = imgDecision.nextAt;
    if (imgDecision.fire) conv.repliesSinceImg = 0; else conv.repliesSinceImg = (Number.isFinite(conv.repliesSinceImg) ? conv.repliesSinceImg : 0) + 1;
    saveConversation(conv);
  } else imgDecision = { fire: false };
  if (imgDecision.fire) {
    const scene = (fotoM?.[1] || '').trim() || a.content.replace(/[#*_`>]/g, '').trim().slice(0, 300) || String(fullMsgs.at(-1)?.content || '').slice(0, 300);
    loadImageClient().then((fn) => fn({ scene }));
  }
  if (a.status === 'done' && !secret) learnMemory(conv, profile, fullMsgs.concat({ role: 'assistant', content: a.content }));
  if (a.status === 'done' && profile.voice?.autoRead && profile.voice.autoReadSet && a.content) {
    import('./shared/tts.js').then((m) => { speakingNow = a.id; paintTts(); return m.speak(a.content, profile.voice, profile.language, { id: a.id }); }).catch(() => toast('Vorlesen nicht möglich'));
  }
  if (a.status === 'done' && conv.title === 'Neue Konversation') autoTitle(conv);
}
// Token saving: summarize older turns once (Flash-Lite) and send summary + last 8 messages instead of full history.
async function compactHistory(conv, msgs) {
  if (msgs.length <= 12) return null;
  const older = msgs.slice(0, -8);
  const done = conv.sumN || 0;
  if (conv.summary && older.length - done < 6) return conv.summary;
  try {
    const r = await api('/api/summarize', { method: 'POST', body: { previousSummary: conv.summary || undefined, messages: older.slice(done).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) })) } });
    if (r.summary) { conv.summary = r.summary.slice(0, 1500); conv.sumN = older.length; saveConversation(conv); }
  } catch {}
  return conv.summary || null;
}
// Memory: every 3rd user turn extract durable facts (server-side, Flash-Lite) into D1.
function learnMemory(conv, profile, msgs) {
  if (settingsGet().memory === false || isEncryptOn() || conv.messages.some(m => m.secure)) return;
  const users = conv.messages.filter(m => m.role === 'user').length;
  if (users < 2 || users % 3 !== 0 && users !== 2) return;
  api('/api/memory/extract', { method: 'POST', body: { profileId: profile.id, profileName: profile.name, otherNames: otherProfileNames(profile, getAllProfiles()), messages: msgs.slice(-6).map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) })) } })
    .then(r => { if (r.saved?.length) toast(`🧠 Gemerkt: ${r.saved[0]}${r.saved.length > 1 ? ` (+${r.saved.length - 1})` : ''}`); }).catch(() => {});
}
async function autoTitle(conv) {
  const first = conv.messages.find(m => m.role === 'user' && !m.secure);
  const reply = conv.messages.find(m => m.role === 'assistant');
  try {
    const { title } = await api('/api/title', { method: 'POST', body: { text: `${first?.content || ''}\n${reply?.content || ''}`.slice(0, 1500) } });
    if (title) { conv.title = title.slice(0, 60); saveConversation(conv); renderSidebar(); renderHeader(); }
  } catch {}
}
function editMessage(id) {
  const conv = currentConv(); if (!conv || abortController) return;
  const idx = conv.messages.findIndex(m => m.id === id);
  const msg = conv.messages[idx]; if (!msg || msg.secure) return;
  const bubble = root.querySelector(`.msg[data-msg-id="${id}"] .msg-bubble`); if (!bubble) return;
  bubble.innerHTML = `<textarea class="edit-input" rows="3"></textarea><div class="edit-actions"><button class="btn-sm secondary" data-x>Abbrechen</button><button class="btn-sm" data-ok>Senden</button></div>`;
  const ta = bubble.querySelector('textarea'); ta.value = msg.content; ta.focus();
  bubble.querySelector('[data-x]').onclick = () => renderMessages();
  bubble.querySelector('[data-ok]').onclick = () => {
    const v = ta.value.trim(); if (!v) return;
    msg.content = v; conv.messages = conv.messages.slice(0, idx + 1);
    generateReply(conv);
  };
}

// ---- chips
async function onChip(action, id, chip) {
  const conv = currentConv(); if (!conv) return;
  const msg = conv.messages.find(m => m.id === id); if (!msg) return;
  const profile = getProfile(conv.profileId) || getActiveProfile();
  if (action === 'copy' || action === 'copyall') {
    // 📋 copies the current selection inside the bubble if any; 📄 always copies the full reply
    const sel = action === 'copy' ? String(window.getSelection?.() || '').trim() : '';
    try { await navigator.clipboard.writeText(sel || msg.content); toast(sel ? 'Auswahl kopiert' : 'Ganzer Text kopiert'); } catch { toast('Kopieren nicht möglich'); }
  }
  else if (action === 'speak') toggleSpeak(msg, profile);
  else if (action === 'up') { msg.feedback = 'up'; saveConversation(conv); chip.classList.add('active'); }
  else if (action === 'down') askFeedback(conv, msg, profile, chip);
  else if (action === 'imgup' || action === 'imgdown') rateImage(conv, msg, profile, action === 'imgup' ? 1 : -1);
  else if (action === 'copyprompt') {
    const g = msg.gen; if (!g?.prompt) return;
    try { await navigator.clipboard.writeText(g.prompt); toast('Prompt kopiert'); } catch { toast('Kopieren nicht möglich'); }
  }
  else if (action === 'reseed') {
    const g = msg.gen; if (!g) return;
    loadImageClient().then((fn) => fn({ scene: g.scene, seedMode: 'random' }));
  }
  else if (action === 'keepseed') {
    const g = msg.gen; if (!g) return;
    const prof = getProfile(currentConv()?.profileId) || getActiveProfile();
    if (prof) updateProfile(prof.id, { seed: g.seed, seedVary: false });
    toast('Seed gemerkt');
  }
  else if (action === 'vary') {
    const g = msg.gen; if (!g) return;
    const angles = ['close-up shot', 'full body shot', 'low angle shot', 'high angle shot', 'side view'];
    const nextA = nextAngle(g.angle || '', angles);
    loadImageClient().then((fn) => fn({ scene: g.scene, seed: g.seed, seedMode: 'same', camera: nextA }));
  }
  else if (action === 'gal') {
    const m = currentConv()?.messages.find(x => x.id === id); const prof = getProfile(currentConv()?.profileId) || getActiveProfile();
    if (!m?.imageUrl || !prof) return;
    const { ensureAdmin } = await import('./shared/auth.js'); if (!(await ensureAdmin())) return;
    const tag = prompt('Speichern in der Galerie von ' + prof.name + ' als:\n1 = Generiert\n2 = Favorit\n3 = Beispielbild\n4 = Referenz: Gesicht\n5 = Referenz: Körper', '1'); if (!tag) return;
    const cat = { 1: 'generiert', 2: 'generiert', 3: 'beispiel', 4: 'gesicht', 5: 'koerper' }[tag.trim()] || 'generiert';
    try { const { saveToGallery } = await import('./refs.js'); const r = await saveToGallery(prof.id, m.imageUrl, cat);
      if (tag.trim() === '2' && r?.id) await api('/api/refs/' + r.id, { method: 'PATCH', body: { fav: true } });
      toast('In Galerie gespeichert'); } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  }
  else if (action === 'image') {
    loadImageClient().then((fn) => fn({ scene: msg.content.replace(/[#*_`>]/g, '').slice(0, 300) }));
  } else if (action === 'video') {
    chip.disabled = true;
    try {
      const r = await api('/api/video', { method: 'POST', body: { prompt: `${buildImagePrompt(profile, getMe?.(), cast)}. ${msg.content.slice(0, 300)}` } });
      const url = r.url || r.dataUrl; if (!url) throw new Error('Kein Video');
      conv.messages.push({ id: uid(), role: 'assistant', content: '', generated: true, videoUrl: url, ts: Date.now() });
      saveConversation(conv); renderMessages();
    } catch (e) { toast(e.status === 402 ? 'Video nicht verfügbar (kein Guthaben)' : e.status === 503 ? 'Video nicht verfügbar' : `Video fehlgeschlagen: ${e.message}`); }
    finally { chip.disabled = false; }
  }
}
function askFeedback(conv, msg, profile, chip) {
  const bubble = chip.closest('.msg-bubble'); if (!bubble || bubble.querySelector('.fb-box')) return;
  const box = document.createElement('div'); box.className = 'fb-box';
  box.innerHTML = `<input type="text" maxlength="200" placeholder="Was hat dir nicht gefallen?"><button class="btn-sm">OK</button>`;
  bubble.appendChild(box);
  const inp = box.querySelector('input'); inp.focus();
  const done = async () => {
    const t = inp.value.trim(); box.remove();
    msg.feedback = 'down'; saveConversation(conv);
    if (t) { try { await addFeedbackNote(profile.id, t); toast('Danke – gemerkt'); } catch { toast('Feedback gespeichert'); } }
  };
  box.querySelector('button').onclick = done;
  inp.onkeydown = (e) => { if (e.key === 'Enter') done(); };
}
const PHOTO_ASK = /\b(foto|bild|selfie|pic|photo)\w*\b[^?.!]{0,40}\b(schick|send|zeig|mach|krieg|bekomm)|\b(schick|send|zeig|mach)\w*\b[^?.!]{0,40}\b(foto|bild|selfie|photo)/i;
const STYLE = {
  real: 'photorealistic photo, natural light, 35mm, detailed skin',
  comic: 'comic book illustration, clean line art, vibrant colors',
  manhwa: 'Korean manhwa webtoon style, clean digital line art, soft cel shading, vibrant colors',
  story: 'photorealistic photo, cinematic',
};
function pickVoice(conv, profile) {
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  const cur = profile?.voice?.voiceName || '';
  const groups = EDGE_VOICES.map(({ group, voices }) => `<h4>${escapeHtml(group)}</h4>${voices.map(([name, label]) => `<div class="voice-row${name === cur ? ' sel' : ''}" data-v="${name}"><button class="model-opt" data-pick="${name}">${name === cur ? '✓ ' : ''}${escapeHtml(label)}</button><button class="btn-sm secondary" data-probe="${name}" aria-label="Probe hören">▶︎</button></div>`).join('')}`).join('');
  m.innerHTML = `<div class="modal model-sheet"><h3>Stimme wählen</h3>${groups}
    <label class="toggle-label" style="margin-top:8px"><input type="checkbox" id="vs-autoread" ${profile?.voice?.autoRead && profile.voice.autoReadSet ? 'checked' : ''}> <span>Automatisch vorlesen</span></label>
    <button class="btn-sm secondary" data-x style="margin-top:8px;width:100%">Schließen</button></div>`;
  document.body.appendChild(m);
  const lang = profile?.language || 'de';
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-x]')) { m.remove(); return; }
    const probe = e.target.closest('[data-probe]');
    if (probe) { e.stopPropagation(); try { await speak(lang === 'de' ? 'Hallo, so klinge ich.' : 'Hello, this is how I sound.', { provider: 'edge', voiceName: probe.dataset.probe, rate: 1, pitch: 1 }, lang); } catch { toast('Probe nicht möglich'); } return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      m.remove();
      updateProfile(profile.id, { voice: { ...(profile.voice || { provider: 'edge', rate: 1, pitch: 1 }), voiceName: pick.dataset.pick } });
      toast('Stimme gespeichert'); renderHeader();
    }
  });
  m.querySelector('#vs-autoread').onchange = (e) => { updateProfile(profile.id, { voice: { ...(profile.voice || {}), autoRead: e.target.checked, autoReadSet: true } }); toast(e.target.checked ? 'Vorlesen an' : 'Vorlesen aus'); };
}
async function chooseChatModel(conv) {
  const id = await pickModel({ title: 'Modell für diesen Chat', current: conv.model || '' });
  if (id === null) return;
  conv.model = id || undefined; saveConversation(conv); renderHeader(); renderMessages();
  toast(id ? `Modell: ${modelLabel(id)}` : 'Automatisch (Einstellungen)');
}
// Images are produced by the server-side prompt path; see ./image-client.js (loaded on demand).
// ---- image feedback (👍/👎) -> D1; server condenses recent ratings into prompt corrections per character
function askImageComment() {
  return new Promise((done) => {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h4>👎 Was stimmt an dem Bild nicht?</h4><textarea id="imgfb-t" rows="4" style="width:100%" placeholder="z.B. Gesicht passt nicht, Haare zu kurz, falsche Umgebung …"></textarea>
      <div class="modal-actions"><button class="btn btn-secondary" id="imgfb-x">Abbrechen</button><button class="btn btn-primary" id="imgfb-ok">Senden</button></div></div>`;
    document.body.appendChild(m); import('./shared/quickfill.js').then((q) => q.quickfill(m, ['imgfb-t'])).catch(() => {}); const t = m.querySelector('#imgfb-t'); t.focus();
    const end = (v) => { m.remove(); done(v); };
    m.querySelector('#imgfb-x').onclick = () => end(null);
    m.querySelector('#imgfb-ok').onclick = () => end(t.value.trim());
    m.addEventListener('click', (e) => { if (e.target === m) end(null); });
  });
}
async function rateImage(conv, msg, profile, rating) {
  let comment = '';
  if (rating < 0) { comment = await askImageComment(); if (comment === null) return; }
  msg.imgRating = rating; saveConversation(conv); renderMessages();
  try {
    await api('/api/imagefb', { method: 'POST', body: { profile: conv.profileId || profile?.id, imageId: msg.id, rating, comment, prompt: msg.gen?.prompt || '', seed: msg.gen?.seed } });
    toast(rating > 0 ? 'Danke! Merke ich mir.' : 'Feedback gespeichert – nächste Bilder werden angepasst.');
  } catch (e) { toast('Feedback nicht gespeichert: ' + e.message); }
}
async function imageCorrections(pid) {
  if (!pid) return null;
  try { return await api('/api/imagefb?profile=' + encodeURIComponent(pid)); } catch { return null; }
}

async function comicLines(scene) {
  const r = await api('/api/chat', { method: 'POST', body: { model: 'gemini-3.5-flash-lite', stream: false, memory: false,
    system: 'Du schreibst Sprechblasen für eine 3-Panel-Comicseite für einen Spanisch-Lernenden (Niveau A2-B1). Antworte NUR mit JSON: [{"es":"...","de":"..."},{...},{...}]. Jede Zeile max. 12 Wörter, natürliches Spanisch, de = deutsche Übersetzung.',
    messages: [{ role: 'user', content: 'Szene: ' + scene }] } });
  const m = String(r.reply || '').match(/\[[\s\S]*\]/); if (!m) return null;
  return JSON.parse(m[0]).slice(0, 4).map(x => ({ es: String(x.es || '').slice(0, 120), de: String(x.de || '').slice(0, 160) }));
}


// ---- In-app AI tools (function calling via /api/agent)
const TOOL_HINT = /\b(profil|persona|einstell|status|verbrauch|usage|token|kosten|aufgabe|task|kollab|schlüssel|key|tresor|regler|slider|werkzeug)/i;
function settingsGet() { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}'); } catch { return {}; } }
function toolsWanted(msgs) {
  const mode = settingsGet().tools || 'auto'; // 'auto' | 'on' | 'off'
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return TOOL_HINT.test(msgs.at(-1)?.content || '');
}
function agentCtx() {
  const s = settingsGet();
  return {
    profiles: getProfiles().map(p => ({ id: p.id, name: p.name, description: (p.description || '').slice(0, 80) })),
    settings: { encrypt: !!s.encrypt, theme: s.theme || 'dark', tools: s.tools || 'auto', textScale: s.textScale || 1, fsk18: isAdult() },
  };
}
function applyClientTool(name, args) {
  if (name === 'change_setting') {
    const allowed = { encrypt: v => v === true || v === 'true' || v === 'an', theme: v => (v === 'light' || v === 'hell') ? 'light' : 'dark' };
    if (!allowed[args.key]) throw new Error('Diese Einstellung ist nicht per KI änderbar');
    const s = settingsGet(); s[args.key] = allowed[args.key](args.value);
    localStorage.setItem('jeffa.settings', JSON.stringify(s));
    if (args.key === 'theme') document.body.classList.toggle('light-theme', s.theme === 'light');
    return { [args.key]: s[args.key] };
  }
  if (name === 'update_profile') {
    const id = String(args.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!id) throw new Error('id fehlt');
    const patch = {};
    for (const k of ['name', 'description', 'traits']) if (typeof args[k] === 'string') patch[k] = args[k].slice(0, 500);
    let p = getProfile(id);
    if (!p) {
      const base = structuredClone(getProfile('seraphina') || getActiveProfile());
      Object.assign(base, { id, name: patch.name || id, avatar: '✨', systemPrompt: '', systemPromptAdult: '', notes: [], adult: false, enabled: true });
      delete base.persona; // fresh persona, editor fills defaults
      if (patch.description) base.description = patch.description;
      if (patch.traits) base.traits = patch.traits;
      addProfile(base);
      p = getProfile(id);
    }
    if (args.look && typeof args.look === 'object') {
      const looks = structuredClone(p.looks || {});
      for (const k of ['kleidung', 'pose', 'umgebung', 'ausdruck', 'stil']) if (typeof args.look[k] === 'string') looks[k] = args.look[k].slice(0, 300);
      patch.looks = looks;
    }
    if (args.sliders && typeof args.sliders === 'object' && p.persona) {
      const persona = structuredClone(p.persona);
      for (const [key, val] of Object.entries(args.sliders)) {
        for (const arr of [persona.temperament || [], persona.gegensaetze || []]) {
          const sl = arr.find(x => x.id === key || x.left === key || x.right === key);
          if (sl) sl.value = Math.max(-5, Math.min(5, Number(val) || 0));
        }
      }
      patch.persona = persona;
    }
    updateProfile(id, patch);
    return { updated: id, fields: Object.keys(patch) };
  }
  throw new Error('Unbekanntes Werkzeug');
}
function confirmTool(c) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>KI möchte etwas ändern</h3><p><b>${escapeHtml(c.name)}</b></p><pre class="tool-args">${escapeHtml(JSON.stringify(c.args, null, 1)).slice(0, 1200)}</pre><div class="edit-actions"><button class="btn-sm secondary" data-x>Ablehnen</button><button class="btn-sm" data-ok>Ausführen</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-x]').onclick = () => { m.remove(); resolve(false); };
    m.querySelector('[data-ok]').onclick = () => { m.remove(); resolve(true); };
  });
}
async function runAgent(conv, a, profile, system, msgs) {
  const model = (profile.modelChain || []).find(m => /^(gemini|grok|[\w-]+\/)/.test(m) && !m.startsWith('auto:') && (!needsApproval(m) || getPaidAllowed())); // v79: bezahlt nur mit Freigabe
  let toolResults = [];
  for (let step = 0; step < 3; step++) {
    let r;
    try { r = await api('/api/agent', { method: 'POST', body: { model, paidAllowed: getPaidAllowed(), system: capSystem(system, 3000), messages: msgs, ctx: agentCtx(), toolResults } }); }
    catch (e) { a.status = 'error'; a.content = `⚠️ ${e.message}`; return; }
    a.model = (r.model || '') + (r.tools?.length ? ` · 🛠 ${r.tools.join(', ')}` : '');
    if (!r.confirm) { a.content = r.reply || '…'; return; }
    const c = r.confirm;
    if (!(await confirmTool(c))) { toolResults = [...toolResults, { name: c.name, args: c.args, result: { abgelehnt: true } }]; continue; }
    let result;
    try {
      if (c.client) { result = applyClientTool(c.name, c.args); await api('/api/agent/exec', { method: 'POST', body: { name: c.name, args: c.args, clientResult: JSON.stringify(result).slice(0, 300) } }); }
      else result = (await api('/api/agent/exec', { method: 'POST', body: { name: c.name, args: c.args } })).result;
    } catch (e) { result = { error: e.status === 401 || e.status === 403 ? 'Admin-Anmeldung nötig (Hub → Tresor)' : e.message }; }
    toolResults = [...toolResults, { name: c.name, args: c.args, result }];
  }
  a.content = a.content || 'Fertig.';
}

// ---- Pinch-to-zoom for chat text (persisted)
function applyTextScale(v) { document.documentElement.style.setProperty('--chat-scale', String(v)); }
export function initPinchZoom(el) {
  let start = 0, base = 1;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  base = Number(settingsGet().textScale) || 1; applyTextScale(base);
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { start = dist(e.touches); base = Number(settingsGet().textScale) || 1; } }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !start) return;
    e.preventDefault();
    const v = Math.max(0.8, Math.min(1.8, Math.round(base * dist(e.touches) / start * 20) / 20));
    applyTextScale(v); el.dataset.scale = v;
  }, { passive: false });
  el.addEventListener('touchend', (e) => {
    if (start && e.touches.length < 2) { start = 0; const v = Number(el.dataset.scale) || base; const s = settingsGet(); s.textScale = v; localStorage.setItem('jeffa.settings', JSON.stringify(s)); }
  });
  // Desktop: ctrl+wheel (trackpad pinch)
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; e.preventDefault();
    const s = settingsGet(); const v = Math.max(0.8, Math.min(1.8, Math.round(((Number(s.textScale) || 1) - e.deltaY * 0.01) * 20) / 20));
    s.textScale = v; localStorage.setItem('jeffa.settings', JSON.stringify(s)); applyTextScale(v);
  }, { passive: false });
}


// ---- v30: reading area (hide bars on scroll, ⋯ menu, fit 100dvh, 📸 sheet) ----
function fitChat() {
  const p = document.getElementById('tab-chat'); if (!p || !p.classList.contains('active')) return;
  // v54 iOS keyboard: the layout viewport keeps its height while the keyboard is open and Safari scrolls the page,
  // so the input floated to the top with empty space below. Shrink the app to the visual viewport and undo the page scroll.
  const vv = window.visualViewport, vh = vv?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(vh) + 'px');
  if ((vv && vv.offsetTop > 0) || window.scrollY > 0) window.scrollTo(0, 0);
  const top = Math.max(0, p.getBoundingClientRect().top);
  p.style.height = Math.max(240, Math.round(vh - top)) + 'px';
}
let fitRaf = 0;
const scheduleFit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitChat); };
function setImmersive(on) {
  if (document.body.classList.contains('chat-immersive') === on) return;
  document.body.classList.toggle('chat-immersive', on); scheduleFit();
}
function wireReadingArea() {
  const msgs = root.querySelector('#messages'), menu = root.querySelector('#hdr-menu'), more = root.querySelector('#more-btn');
  let lastY = 0;
  msgs.addEventListener('scroll', () => {
    const y = msgs.scrollTop, d = y - lastY; lastY = y;
    if (Math.abs(d) < 8) return;
    if (d > 0 && y > 60 && msgs.scrollHeight - msgs.clientHeight - y > 4) setImmersive(true);
    else if (d < 0) setImmersive(false);
  }, { passive: true });
  msgs.addEventListener('click', (e) => { if (!e.target.closest('button,a,img,video,input,select,textarea,summary')) setImmersive(false); });
  more.onclick = (e) => { e.stopPropagation(); const open = menu.classList.toggle('hidden') === false; more.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', (e) => { if (!menu.classList.contains('hidden') && !e.target.closest('#hdr-menu')) { menu.classList.add('hidden'); more.setAttribute('aria-expanded', 'false'); } });
  root.querySelector('#cast-btn').addEventListener('click', () => menu.classList.add('hidden'));
  root.querySelector('#menu-model').onclick = () => { menu.classList.add('hidden'); const c = currentConv(); if (c) chooseChatModel(c); };
  root.querySelector('#photo-btn').onclick = () => openPhotoSheet();
  if (!window.__jeffaFit) {
    window.__jeffaFit = true;
    addEventListener('resize', scheduleFit); window.visualViewport?.addEventListener('resize', scheduleFit); window.visualViewport?.addEventListener('scroll', scheduleFit);
    document.addEventListener('focusin', (e) => { if (e.target.matches?.('textarea,input')) { scheduleFit(); setTimeout(scheduleFit, 350); } });
    document.addEventListener('focusout', () => setTimeout(scheduleFit, 100));
    const p = document.getElementById('tab-chat');
    if (p) new MutationObserver(() => { if (!p.classList.contains('active')) document.body.classList.remove('chat-immersive'); scheduleFit(); }).observe(p, { attributes: true, attributeFilter: ['class'] });
    const ro = window.ResizeObserver ? new ResizeObserver(scheduleFit) : null;
    document.querySelectorAll('.app-header, nav.tabs-nav, #install-banner').forEach(el => ro?.observe(el));
  }
  scheduleFit(); setTimeout(fitChat, 300);
}

const PHOTO_KEYS = [['outfit', 'Kleidung'], ['koerper', 'Körperdetails (18+)'], ['pose', 'Pose'], ['intensity', 'Pose-Intensität (18+)'], ['scene', 'Umgebung'], ['light', 'Licht'], ['frame', 'Bildausschnitt'], ['mood', 'Stimmung'], ['render', 'Bildstil']];
// v51: "🔗 Mit Profil verbunden" (default on). Off = changes only for the next photo (photoOnce), the profile stays unchanged.
export const photoOnce = new Map();
export const photoLinked = () => { try { return localStorage.getItem('jeffa.photoLinked') !== '0'; } catch { return true; } };
const setPhotoLinked = (on) => { try { localStorage.setItem('jeffa.photoLinked', on ? '1' : '0'); } catch {} };
const HINT_LINKED = 'Verbunden: Änderungen werden sofort im Profil gespeichert (wie unter 👤 Profile → Look).';
const HINT_ONCE = 'Getrennt: gilt nur für das nächste Foto, das Profil bleibt unverändert.';
function openPhotoSheet() {
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
    <div class="photo-sheet-grid">${PHOTO_KEYS.filter(([k]) => k === 'scene' || effectiveAdult(conv, profile)).map(([k, t]) => `<label>${t}<select data-k="${k}">${optionsHtml(k, ph[k], effectiveAdult(conv, profile), escapeHtml, profile)}</select></label>`).join('')}</div>
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
