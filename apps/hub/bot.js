// 🤖 Grok Bots – encrypted channels to personal assistant bots (multi-bot) + moderated Bot-Gespräch.
// AES-256-GCM, key = PBKDF2-SHA256(channel password, random salt, 600000). Server/webhook only see ciphertext / job ref.
// Channel passwords: in memory while unlocked; optionally remembered on this device, encrypted under a non-extractable IndexedDB key (shared/botvault.js), read only after PIN/Face ID admin unlock. Never sent.
import { api } from './shared/api.js';
import { getModuleBody } from './shared/module-models.js';
import { ensureAdmin } from './shared/auth.js';
import { setupTyping } from './shared/typing.js';
import { savePass, loadPass, forgetPass } from './shared/botvault.js';
const ITER = 600000, KDF = 'pbkdf2-sha256-' + ITER;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = u => { const a = new Uint8Array(u); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = new Map(), keyCache = new Map(), sendSalt = new Map();
let root = null, bots = [], cur = 'grok', view = 'chat', talk = null, pollGen = 0;
const local = new Map();   // bot -> [{q, a, ts}] Gemini-direct answers (only in this session, never on the server)
export const triageOn = () => localStorage.getItem('jeffa.botTriage') !== '0';
export const setTriage = on => localStorage.setItem('jeffa.botTriage', on ? '1' : '0');

async function key(bot, salt, iter) {
  const k = bot + '|' + iter + '|' + b64(salt); if (keyCache.has(k)) return keyCache.get(k);
  const base = await crypto.subtle.importKey('raw', te.encode(pass.get(bot)), 'PBKDF2', false, ['deriveKey']);
  const dk = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(k, dk); return dk;
}
async function seal(bot, obj, dir = 'task') {
  if (!sendSalt.has(bot)) sendSalt.set(bot, crypto.getRandomValues(new Uint8Array(16)));
  const salt = sendSalt.get(bot), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode('jeffa-bot|' + dir) }, await key(bot, salt, ITER), te.encode(JSON.stringify(obj)));
  return { v: 1, dir, kdf: KDF, alg: 'A256GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function open(bot, e) {
  const m = /^pbkdf2-sha256-(\d{5,7})$/.exec(e.kdf || ''); const it = m ? +m[1] : 0;
  if (it < 100000 || it > 2000000) throw new Error('kdf');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv), additionalData: te.encode('jeffa-bot|' + e.dir) }, await key(bot, unb64(e.salt), it), unb64(e.ct));
  return JSON.parse(td.decode(pt));
}
const botName = id => bots.find(b => b.id === id)?.name || id;
async function loadBots() { try { bots = (await api('/api/bot/bots')).bots; } catch { bots = [{ id: 'grok', name: 'Grok Bot', builtin: true }]; } }

// v54: same keyboard handling as the main chat – panel follows the visual viewport so the input sits right above the iOS keyboard
function fitBot() {
  const p = document.getElementById('tab-bot'); if (!p || !p.classList.contains('active')) return;
  const vv = window.visualViewport, vh = vv?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(vh) + 'px');
  if ((vv && vv.offsetTop > 0) || window.scrollY > 0) window.scrollTo(0, 0);
  const top = Math.max(0, p.getBoundingClientRect().top); p.style.height = Math.max(240, Math.round(vh - top)) + 'px'; p.style.display = 'flex'; p.style.flexDirection = 'column'; p.style.overflow = 'hidden';
  const l = p.querySelector('#bot-list'); if (l && document.activeElement?.id === 'bot-msg') l.scrollTop = l.scrollHeight;
}
let botRaf = 0; const scheduleBotFit = () => { cancelAnimationFrame(botRaf); botRaf = requestAnimationFrame(fitBot); };
export async function init(el) { root = el;
  addEventListener('resize', scheduleBotFit); window.visualViewport?.addEventListener('resize', scheduleBotFit); window.visualViewport?.addEventListener('scroll', scheduleBotFit);
  document.addEventListener('focusin', () => { scheduleBotFit(); setTimeout(scheduleBotFit, 350); }); document.addEventListener('focusout', () => setTimeout(scheduleBotFit, 100));
  new MutationObserver(() => { if (el.classList.contains('active')) scheduleBotFit(); else el.removeAttribute('style'); }).observe(el, { attributes: true, attributeFilter: ['class'] }); scheduleBotFit(); if (!(await ensureAdmin())) { root.innerHTML = '<div class="card bot-card">Nur mit Admin-Entsperrung.</div>'; return; } await loadBots(); await restorePasses(); render(); }
async function restorePasses() { for (const b of bots) { if (pass.has(b.id)) continue; const pw = await loadPass(b.id); if (pw) pass.set(b.id, pw); } }
const clearKeys = bot => { for (const k of [...keyCache.keys()]) if (k.startsWith(bot + '|')) keyCache.delete(k); sendSalt.delete(bot); };

// v33: Admin = this Grok Bot (builtin), Helfer = second Grok Bot (id 'helfer'), others by name.
const segLabel = b => b.builtin ? '🛡 Admin' : b.id === 'helfer' ? '🧰 Helfer' : '🤖 ' + b.name;
const partName = id => id === GEM ? '✨ Gemini' : (bots.find(b => b.id === id) ? segLabel(bots.find(b => b.id === id)) : id);
const GEM = '__gemini';
function render() {
  const seg = (on, attrs, label) => `<button class="seg-btn ${on ? 'on' : ''}" ${attrs}>${label}</button>`;
  const picker = `<div class="bot-bar"><div class="bot-seg" role="tablist">${bots.map(b => seg(view === 'chat' && b.id === cur, `data-bot="${esc(b.id)}"`, esc(segLabel(b)))).join('')}${seg(view === 'talk', 'id="bot-talk"', '👥 Gruppe')}</div>
    <button class="btn-sm ${view === 'admin' ? 'on' : ''}" id="bot-admin" title="Bot-Einstellungen" aria-label="Bot-Einstellungen">⚙️ Bots</button></div>`;
  if (view === 'admin') { root.innerHTML = picker + '<div id="bot-admin-box" class="bot-pad"></div>'; renderBotAdmin(root.querySelector('#bot-admin-box')); }
  else if (view === 'talk') { root.innerHTML = picker + '<div id="bot-talk-box" class="bot-pad"></div>'; renderTalk(root.querySelector('#bot-talk-box')); }
  else if (!pass.has(cur)) { root.innerHTML = picker + unlockHtml(cur); wireUnlock(root, cur, render); }
  else {
    const tip = (k, t) => localStorage.getItem('jeffa.tip.' + k) ? '' : `<div class="hint bot-tip" data-tip="${k}"><span>${t}</span><button class="btn-icon" aria-label="Ausblenden">✕</button></div>`;
    root.innerHTML = picker + `<div class="bot-wrap"><div class="bot-bar bot-status"><span>🔒 E2E · ${esc(botName(cur))}${triageOn() ? ' · ⚡ Vorprüfung' : ''}</span>
      <button class="btn-icon" id="bot-refresh" aria-label="Aktualisieren">🔄</button><button class="btn-icon" id="bot-lock" aria-label="Sperren" title="Sperren">🔒</button></div>
      <div class="row-btns bot-pwbar"><button class="btn-sm secondary" id="bot-repw">🔓 Passwort neu eingeben</button><button class="btn-sm secondary" id="bot-forget">Vergessen</button></div>
      <div id="bot-list" class="bot-list"><div class="hint">Lade…</div></div>
      ${triageOn() ? tip('triage', '⚡ Vorprüfung: Nur triviale Fragen beantwortet Gemini (sieht den Klartext) direkt, alles andere geht verschlüsselt an den Bot. Abschaltbar in ⚙️.') : ''}
      ${tip('bg', '📴 Du kannst die App nach dem Senden schließen.')}
      <div class="attach-icons" id="bot-att-icons"></div>
      <div class="attach-sheet hidden" id="bot-sheet">
        <button class="sheet-item" data-a="photo">📷 Fotomediathek</button><button class="sheet-item" data-a="camera">📸 Foto aufnehmen</button>
        <button class="sheet-item" data-a="file">📄 Dateien auswählen</button><button class="sheet-item" data-a="secure">🔒 Sichere Eingabe (Schlüssel/Secret)</button></div>
      <div class="composer bot-composer"><div class="input-row"><button class="btn-icon" id="bot-attach" aria-label="Anhang">📎</button><textarea class="composer-input" id="bot-msg" rows="1" spellcheck="true" autocorrect="on" autocapitalize="sentences" lang="de" placeholder="Nachricht an ${esc(botName(cur))}…"></textarea><button class="btn-icon primary" id="bot-send" aria-label="Senden">📤</button></div></div></div>`;
    root.querySelectorAll('.bot-tip button').forEach(b => b.onclick = () => { const t = b.closest('.bot-tip'); localStorage.setItem('jeffa.tip.' + t.dataset.tip, '1'); t.remove(); });
    root.querySelector('#bot-lock').onclick = () => { pass.delete(cur); clearKeys(cur); render(); };
    root.querySelector('#bot-repw').onclick = () => { pass.delete(cur); clearKeys(cur); render(); };
    root.querySelector('#bot-forget').onclick = async () => { if (!confirm('Gespeichertes Kanal-Passwort für ' + botName(cur) + ' auf diesem Gerät löschen?')) return; await forgetPass(cur); pass.delete(cur); clearKeys(cur); render(); };
    root.querySelector('#bot-refresh').onclick = load;
    root.querySelector('#bot-send').onclick = send;
    setupTyping(root.querySelector('#bot-msg'), send);
    const sheet = root.querySelector('#bot-sheet');
    root.querySelector('#bot-attach').onclick = () => sheet.classList.toggle('hidden');
    sheet.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { sheet.classList.add('hidden'); const a = b.dataset.a;
      if (a === 'secure') secureInput(); else pickFiles(a === 'file' ? '*' : 'image/*', a !== 'camera', a === 'camera'); });
    renderAtt();
    load();
  }
  root.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => { cur = b.dataset.bot; view = 'chat'; render(); });
  root.querySelector('#bot-talk').onclick = () => { view = 'talk'; render(); };
  root.querySelector('#bot-admin').onclick = () => { view = view === 'admin' ? 'chat' : 'admin'; render(); };
}
function unlockHtml(bot) {
  return `<div class="card bot-card"><h3>🔐 ${esc(botName(bot))} entsperren</h3>
    <p class="hint">Nachrichten werden im Gerät mit AES-256 verschlüsselt. Server und Webhook sehen nur Chiffrat bzw. eine Auftragsnummer. Gib das Kanal-Passwort dieses Bots ein (dasselbe wie auf seiner Box). Wenn „Merken“ an ist, speichert dieses Gerät es verschlüsselt (nicht auslesbarer Geräteschlüssel, nur nach PIN/Face ID nutzbar). Alte Nachrichten mit anderem Passwort können nicht geöffnet werden.</p>
    <label class="field-label" for="pw-${esc(bot)}">Kanal-Passwort</label>
    <input id="pw-${esc(bot)}" class="bot-pw" type="password" autocomplete="off" minlength="4">
    <label class="hint" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" class="bot-remember" checked style="width:auto"> Auf diesem Gerät merken (verschlüsselt, nur nach PIN/Face ID lesbar)</label>
    <div class="hint pw-warn" style="display:none;color:#f59e0b">⚠️ Kurz = leichter zu knacken. Ab 10 Zeichen ist es deutlich sicherer.</div>
    <button class="btn btn-primary bot-unlock" style="margin-top:10px;width:100%">🔓 Entsperren</button><div class="error bot-err"></div></div>`;
}
function wireUnlock(el, bot, after) {
  const inp = el.querySelector('.bot-pw'), warn = el.querySelector('.pw-warn');
  inp.oninput = () => { warn.style.display = inp.value.length >= 4 && inp.value.length < 10 ? 'block' : 'none'; };
  const go = () => { if (inp.value.length < 4) { el.querySelector('.bot-err').textContent = 'Mindestens 4 Zeichen.'; return; } const pw = inp.value; pass.set(bot, pw); clearKeys(bot); inp.value = ''; const rem = el.querySelector('.bot-remember'); (rem && rem.checked ? savePass(bot, pw) : forgetPass(bot)).catch(() => {}).finally(after); };
  el.querySelector('.bot-unlock').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
}
async function load() {
  const list = root.querySelector('#bot-list'); if (!list) return;
  try {
    const { items } = await api('/api/bot/inbox?bot=' + encodeURIComponent(cur));
    const out = []; let bad = 0;
    for (const it of items.sort((a, b) => a.ts - b.ts)) {
      let text; try { text = (await open(cur, it.env)).text; } catch { text = '🔒 (nicht entschlüsselbar – anderes Passwort?)'; bad++; it.bad = true; }
      out.push(`<div class="bot-msg ${it.dir}"><div class="bot-text">${text === '(Anhang)' && it.atts?.length ? '' : esc(text).replace(/\n/g, '<br>')}</div>${(it.atts || []).map(a => `<button class="btn-sm bot-att" data-id="${esc(a.id)}">📎 Anhang (${Math.max(1, Math.round(a.size * 0.75 / 1024))} KB)</button>`).join('')}<small>${it.dir === 'task' ? 'Du' : '🤖 ' + esc(botName(cur))}${it.conv ? ' · 🗣 Bot-Gespräch' : ''} · ${new Date(it.ts).toLocaleString('de-DE')}</small></div>`);
    }
    (local.get(cur) || []).forEach((l, i) => out.push(`<div class="bot-msg task"><div>${esc(l.q).replace(/\n/g, '<br>')}</div><small>Du · ${new Date(l.ts).toLocaleString('de-DE')}</small></div><div class="bot-msg reply gem"><div>${esc(l.a).replace(/\n/g, '<br>')}</div><small>⚡ Gemini (nicht an Grok Bot gesendet)</small>${l.sent ? '<div class="hint">→ an Bot gesendet</div>' : `<button class="btn-sm bot-force" data-i="${i}">Trotzdem an ${esc(botName(cur))} senden</button>`}</div>`));
    if (bad) out.unshift(`<div class="hint">Alte Nachrichten mit anderem Passwort können nicht geöffnet werden. <button class="btn-sm" id="bot-delbad">🗑 Nicht lesbare löschen (${bad})</button></div>`);
    list.innerHTML = out.join('') || '<div class="hint">Noch keine Nachrichten.</div>';
    list.scrollTop = list.scrollHeight;
    const db = list.querySelector('#bot-delbad'); if (db) db.onclick = async () => { if (!confirm('Nicht lesbare Nachrichten endgültig löschen?')) return; for (const it of items.filter(i => i.bad)) await api('/api/bot/msg/' + it.id, { method: 'DELETE' }).catch(() => {}); load(); };
    list.querySelectorAll('.bot-att').forEach(b => b.onclick = () => openAtt(b));
    inlineTextAtts(list);
    list.querySelectorAll('.bot-force').forEach(b => b.onclick = async () => { const l = local.get(cur)[+b.dataset.i]; b.disabled = true; l.sent = true; await deliver(l.q); });
  } catch (e) { list.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}
async function sendTo(bot, text, conv, atts) {
  const enc = atts?.length ? await Promise.all(atts.map(a => seal(bot, a, 'att'))) : undefined;
  return api('/api/bot/send', { method: 'POST', body: { bot, conv, envelope: await seal(bot, { text, ts: Date.now() }), atts: enc } });
}
// ---- attachments (encrypted on the device with the channel key; secrets never rendered)
let att = [];   // {name, mime, data_b64} | {secret:true, label, value}
const MAXRAW = 1_300_000;
function renderAtt() {
  const el = root?.querySelector('#bot-att-icons'); if (!el) return;
  el.innerHTML = att.map((a, i) => `<span class="att-pill">${a.secret ? '🔒 ' + esc(a.label || 'Secret') : (a.mime.startsWith('image/') ? '🖼 ' : '📄 ') + esc(a.name.slice(0, 18))}<button data-i="${i}" aria-label="Entfernen">✕</button></span>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { att.splice(+b.dataset.i, 1); renderAtt(); });
}
async function shrink(f) {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55]) { const d = c.toDataURL('image/jpeg', q).split(',')[1]; if (d.length * 0.75 <= MAXRAW) return d; }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
function pickFiles(accept, multiple, capture) {
  const inp = document.createElement('input'); inp.type = 'file'; if (accept !== '*') inp.accept = accept; inp.multiple = multiple; if (capture) inp.setAttribute('capture', 'environment');
  inp.onchange = async () => {
    for (const f of [...inp.files]) {
      if (att.length >= 5) { alert('Max. 5 Anhänge pro Nachricht.'); break; }
      try {
        if (/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(f.type) && f.type !== 'image/gif') { const d = await shrink(f); if (!d) { alert(f.name + ': zu groß'); continue; } att.push({ name: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data_b64: d }); }
        else { if (f.size > MAXRAW) { alert(f.name + ': zu groß (max. 1,3 MB)'); continue; } att.push({ name: f.name, mime: f.type || 'application/octet-stream', data_b64: b64(await f.arrayBuffer()) }); }
      } catch { alert(f.name + ': konnte nicht gelesen werden'); }
    }
    renderAtt();
  };
  inp.click();
}
function secureInput() {
  const m = document.createElement('div'); m.className = 'modal-backdrop';
  m.innerHTML = `<div class="modal"><h4>🔒 Sichere Eingabe</h4><p class="hint">Für Schlüssel/Passwörter. Wird auf dem Gerät verschlüsselt, nie angezeigt; der Bot legt den Wert nur in einer geschützten Datei ab.</p>
    <input id="sec-l" placeholder="Bezeichnung, z. B. OpenAI API-Key" maxlength="60" autocomplete="off">
    <textarea id="sec-v" rows="3" autocomplete="off" spellcheck="false" style="-webkit-text-security:disc;margin-top:6px"></textarea>
    <div class="modal-actions"><button class="btn btn-secondary" id="sec-x">Abbrechen</button><button class="btn btn-primary" id="sec-ok">Übernehmen</button></div></div>`;
  document.body.appendChild(m);
  const v = m.querySelector('#sec-v'); v.focus();
  m.querySelector('#sec-x').onclick = () => { v.value = ''; m.remove(); };
  m.querySelector('#sec-ok').onclick = () => { const val = v.value; v.value = ''; if (val.trim() && att.length < 5) att.push({ secret: true, label: m.querySelector('#sec-l').value.trim() || 'Secret', value: val }); m.remove(); renderAtt(); };
}
// v54: text replies (.md/.txt or text/*) are shown inline as normal chat text instead of an attachment card
async function inlineTextAtts(list) {
  for (const btn of list.querySelectorAll('.bot-msg.reply .bot-att')) {
    try {
      const { envelope } = await api('/api/bot/att/' + encodeURIComponent(btn.dataset.id));
      const a = await open(cur, envelope);
      if (a.secret || !(/^text\//.test(a.mime || '') || /\.(md|txt|markdown)$/i.test(a.name || ''))) continue;
      const t = td.decode(unb64(a.data_b64 || ''));
      const box = btn.closest('.bot-msg').querySelector('.bot-text'); if (!box) continue;
      box.innerHTML = (box.innerHTML ? box.innerHTML + '<br><br>' : '') + esc(t).replace(/\n/g, '<br>'); btn.remove();
    } catch { /* keep the button */ }
  }
}
async function openAtt(btn) {
  btn.disabled = true;
  try {
    const { envelope } = await api('/api/bot/att/' + encodeURIComponent(btn.dataset.id));
    const a = await open(cur, envelope);
    if (a.secret) { btn.outerHTML = `<span class="hint">🔒 ${esc(a.label || 'Secret')} (verborgen)</span>`; return; }
    const blob = new Blob([unb64(a.data_b64)], { type: a.mime || 'application/octet-stream' }), url = URL.createObjectURL(blob);
    if (/^image\//.test(a.mime)) { const im = document.createElement('img'); im.src = url; im.className = 'bot-att-img'; im.style.cssText = 'max-width:100%;border-radius:8px;margin-top:6px'; btn.replaceWith(im); }
    else { const l = document.createElement('a'); l.href = url; l.download = (a.name || 'datei').replace(/[\/\\]/g, '_'); l.textContent = '📄 ' + (a.name || 'Datei'); l.className = 'btn-sm'; btn.replaceWith(l); l.click(); }
  } catch (e) { btn.disabled = false; btn.textContent = '⚠️ Anhang nicht lesbar'; }
}
// Gemini pre-triage (only when enabled; plaintext goes to Gemini). Returns answer string or null (= send to bot).
// Forward without asking Gemini: anything addressed to/about the bot, the app, tasks, or follow-ups.
const FORWARD = /\b(du|dich|dir|dein\w*|ihr|euch|bot|grok|helfer|admin|agent\w*|assistent\w*|app|jeffa|auftrag|aufgabe\w*|mach\w*|kannst|könntest|erledig\w*|wer bist|weiter|nochmal|vorhin|oben|dies\w*|ok|okay|ja|nein|danke)\b/i;
async function triage(text) {
  if (FORWARD.test(text) || text.length > 160) return null;
  const r = await api('/api/chat', { method: 'POST', body: { model: 'gemini-3.5-flash-lite', ...getModuleBody('bot_triage'), stream: false, memory: false,
    system: 'Du bist ein Filter vor einem persönlichen Agenten (Grok Bot). Beantworte DIREKT nur völlig triviale, für sich stehende Fragen: Begrüßung ohne weitere Frage, Uhrzeit/Datum, einfache Fakten oder Definitionen, einfache Rechen- oder Übersetzungsfragen. Alles andere geht an den BOT: alles, was den Bot/Agenten anspricht oder nach ihm fragt (Grok Bot, Helfer, Admin, wer antwortet), alles zur App, Aufgaben, Aktionen, persönliche Daten, Rückfragen oder Bezug auf das bisherige Gespräch, und alles, wenn du unsicher bist. Gib dich NIE als Assistent, Bot oder Agent aus und sprich nie über dich selbst. Antworte NUR mit JSON {"route":"direct"|"bot","answer":"bei direct: kurze Antwort auf Deutsch, sonst leer"}.',
    messages: [{ role: 'user', content: text }] } });
  const m = String(r.reply || '').match(/\{[\s\S]*\}/); let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (o?.route !== 'direct' || !o.answer || /\b(ich bin|ich heiße|dein (ki-)?assistent|als (ki|bot|assistent))/i.test(o.answer)) return null;
  return String(o.answer);
}
async function deliver(text, atts) {
  const r = await sendTo(cur, text, undefined, atts);
  if (r.webhook !== 'sent') alert(r.webhook === 'not_configured' ? 'Gespeichert, aber für diesen Bot ist kein Webhook eingerichtet – er holt es beim nächsten Abruf.' : 'Gespeichert, Webhook-Fehler: ' + r.webhook);
  await load(); poll(cur, r.ref);
}
// Fast poll while a job is pending: 3 s for ~3 min, then back off to 15 s, give up after ~20 min.
async function poll(bot, ref) {
  const gen = ++pollGen; const t0 = Date.now();
  while (Date.now() - t0 < 20 * 60e3) {
    await sleep(Date.now() - t0 < 180e3 ? 3000 : 15000);
    if (gen !== pollGen || cur !== bot || !root?.querySelector('#bot-list') || document.hidden && Date.now() - t0 > 180e3) { if (gen !== pollGen || cur !== bot) return; continue; }
    const a = await api('/api/bot/answer/' + ref).catch(() => ({ pending: true }));
    if (a.item) { await load(); return; }
  }
}
async function send() {
  const ta = root.querySelector('#bot-msg'); let text = ta.value.trim(); if (!text && !att.length) return;
  if (!text) text = '(Anhang)';
  const btn = root.querySelector('#bot-send'); btn.disabled = true;
  try {
    let direct = null;
    const atts = att; // attachments bypass triage → always encrypted to the bot
    if (triageOn() && !atts.length) { btn.textContent = '⚡ prüft…'; direct = await triage(text).catch(() => null); }
    ta.value = ''; ta._grow?.();
    if (direct) { if (!local.has(cur)) local.set(cur, []); local.get(cur).push({ q: text, a: direct, ts: Date.now() }); await load(); }
    else { btn.textContent = '🔒 sendet…'; await deliver(text, atts); att = []; renderAtt(); }
  } catch (e) { alert('Senden fehlgeschlagen: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Senden';
}

// ---------------- Verbindungen verwalten (auch in Einstellungen eingebunden) ----------------
export async function renderBotAdmin(el) {
  if (!bots.length) await loadBots();
  el.innerHTML = `<div class="hint">Jeder Bot hat eine eigene Webhook-Adresse, ein eigenes Bot-Token (nur einmal sichtbar, der Server speichert nur einen Hash) und ein eigenes Kanal-Passwort (nur in der App und auf seiner Box). Webhook-Adresse und -Schlüssel liegen verschlüsselt auf dem Server.</div>
    <div class="bot-admin-list">${bots.map(b => `<div class="member-card" data-id="${esc(b.id)}"><b>🤖 ${esc(b.name)}</b> <small>${b.builtin ? '(dieser Grok Bot · Einstellungen über Cloudflare-Secrets)' : ''} · Webhook ${b.hasHook ? '✅' : '—'} · Token ${b.hasToken ? '✅' : '—'}</small>
      ${b.builtin ? '' : `<div class="row-btns"><button class="btn-sm" data-act="hook">Webhook ändern</button><button class="btn-sm" data-act="token">Neues Token</button><button class="btn-sm" data-act="del">Löschen</button></div>`}</div>`).join('')}</div>
    <h4>➕ Bot verbinden</h4>
    <label class="field-label">Name</label><input id="nb-name" placeholder="z. B. Grok Bot von Anna">
    <label class="field-label">Webhook-Adresse (Routine-Trigger des Bots)</label><input id="nb-url" placeholder="https://…" inputmode="url">
    <label class="field-label">Webhook-Schlüssel (optional, Bearer)</label><input id="nb-key" type="password" autocomplete="off">
    <button class="btn btn-primary" id="nb-add" style="margin-top:8px;width:100%">Bot anlegen</button><div id="nb-out"></div>`;
  const showToken = (t) => { el.querySelector('#nb-out').innerHTML = `<div class="card" style="margin-top:8px"><b>Bot-Token – nur jetzt sichtbar!</b><p class="hint">In die Schlüsseldatei des Bots eintragen (siehe Anleitung). Danach nicht mehr abrufbar.</p><input readonly value="${esc(t)}" id="nb-tok"><button class="btn-sm" id="nb-copy">📋 Kopieren</button></div>`; el.querySelector('#nb-copy').onclick = () => navigator.clipboard?.writeText(t); };
  el.querySelector('#nb-add').onclick = async () => {
    try {
      const r = await api('/api/bot/bots', { method: 'POST', body: { name: el.querySelector('#nb-name').value, webhook_url: el.querySelector('#nb-url').value.trim(), webhook_key: el.querySelector('#nb-key').value } });
      await loadBots(); const tok = r.token; await renderBotAdmin(el); showToken(tok);
    } catch (e) { alert('Fehler: ' + e.message); }
  };
  el.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    const id = btn.closest('[data-id]').dataset.id, act = btn.dataset.act;
    try {
      if (act === 'del') { if (!confirm('Verbindung löschen?')) return; await api('/api/bot/bots/' + id, { method: 'DELETE' }); await loadBots(); return renderBotAdmin(el); }
      if (act === 'token') { if (!confirm('Neues Token erzeugen? Das alte wird sofort ungültig.')) return; const r = await api(`/api/bot/bots/${id}/token`, { method: 'POST', body: {} }); return showToken(r.token); }
      if (act === 'hook') { const u = prompt('Neue Webhook-Adresse (leer = entfernen)'); if (u === null) return; const k = prompt('Webhook-Schlüssel (leer lassen = keiner)') ?? ''; await api('/api/bot/bots/' + id, { method: 'PUT', body: { webhook_url: u.trim(), webhook_key: k } }); await loadBots(); return renderBotAdmin(el); }
    } catch (e) { alert('Fehler: ' + e.message); }
  });
}

// ---------------- Gruppe: Admin, Helfer und Gemini, moderiert von Gemini Flash-Lite ----------------
function talkParts() { const adm = bots.find(b => b.builtin), hel = bots.find(b => b.id === 'helfer'); return [adm?.id, hel?.id, GEM].filter(Boolean); }
function renderTalk(el) {
  const parts = talkParts();
  el.innerHTML = `<div class="hint">Gruppengespräch: ${parts.map(partName).join(', ')}. Gemini Flash-Lite moderiert (und nimmt als ✨ Gemini teil). Nachrichten an die Bots gehen verschlüsselt über ihren Kanal; Google sieht den Verlauf im Klartext.</div>
    <label class="field-label">Wer antwortet?</label><select id="t-who"><option value="all">alle (reihum)</option>${parts.map(p => `<option value="${esc(p)}">${esc(partName(p))}</option>`).join('')}</select>
    <label class="field-label">Thema / Ziel</label><textarea id="t-topic" rows="2" data-tt placeholder="z. B. Plant gemeinsam eine 3-tägige Valencia-Reise"></textarea>
    <label class="field-label">Max. Runden</label><select id="t-max">${[3, 4, 6, 8, 10].map(n => `<option ${n === 6 ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <div id="t-unlock"></div>
    <div class="row-btns" style="margin-top:8px"><button class="btn btn-primary" id="t-start">▶️ Starten</button><button class="btn btn-secondary" id="t-stop" disabled>⏹ Stopp</button></div>
    <div id="t-log" class="bot-list" style="max-height:none"></div>`;
  setupTyping(el.querySelector('#t-topic'));
  const speakers = () => { const w = el.querySelector('#t-who').value; return w === 'all' ? parts : [w]; };
  const need = () => { const u = el.querySelector('#t-unlock'); u.innerHTML = ''; for (const id of speakers()) if (id !== GEM && !pass.has(id)) { const d = document.createElement('div'); d.innerHTML = unlockHtml(id); u.appendChild(d); wireUnlock(d, id, need); } };
  el.querySelector('#t-who').onchange = need; need();
  el.querySelector('#t-stop').onclick = () => { if (talk) talk.stop = true; };
  el.querySelector('#t-start').onclick = () => runTalk(el, speakers(), parts);
}
async function geminiTurn(task) {
  const r = await api('/api/chat', { method: 'POST', body: { model: 'gemini-3.5-flash-lite', ...getModuleBody('bot_turn'), stream: false, memory: false,
    system: 'Du bist ✨ Gemini, Teilnehmer in einem moderierten Gruppengespräch mit zwei Grok-Bot-Assistenten (Admin und Helfer). Antworte auf Deutsch, konkret, max. 150 Wörter, ohne Höflichkeitsfloskeln.',
    messages: [{ role: 'user', content: task }] } });
  return String(r.reply || '').trim();
}
const words = s => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
const similar = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size); };
async function moderate(topic, log, next, other, turn, max) {
  const hist = log.map(m => `${m.who}: ${m.text}`).join('\n').slice(-6000);
  const r = await api('/api/chat', { method: 'POST', body: { model: 'gemini-3.5-flash-lite', ...getModuleBody('bot_moderate'), stream: false, memory: false,
    system: 'Du moderierst ein Gruppengespräch zwischen KI-Assistenten (Admin, Helfer, Gemini). Ziel: Das Thema des Nutzers voranbringen. Regeln: Keine Höflichkeits-Pingpongs (Danken, Bestätigen, Wiederholen ohne neue Information). Wenn das Ziel erreicht ist, sich etwas wiederholt oder nichts Neues mehr kommt: beenden. Antworte NUR mit JSON {"action":"continue"|"stop","instruction":"kurze konkrete Anweisung für den nächsten Sprecher","reason":"kurz"}.',
    messages: [{ role: 'user', content: `Thema/Ziel: ${topic}\nRunde ${turn + 1} von ${max}. Nächster Sprecher: ${next}, Gesprächspartner: ${other}.\nBisheriger Verlauf:\n${hist || '(noch leer)'}` }] } });
  const m = String(r.reply || '').match(/\{[\s\S]*\}/); try { return JSON.parse(m[0]); } catch { return { action: 'continue', instruction: 'Bring einen neuen, konkreten Beitrag zum Thema.' }; }
}
async function runTalk(el, speakers, parts) {
  const topic = el.querySelector('#t-topic').value.trim(), max = +el.querySelector('#t-max').value;
  const logEl = el.querySelector('#t-log'), start = el.querySelector('#t-start'), stop = el.querySelector('#t-stop');
  if (!topic) return alert('Bitte ein Thema eingeben.');
  if (speakers.some(id => id !== GEM && !pass.has(id))) return alert('Bitte die Bots entsperren.');
  const conv = 'talk-' + Date.now().toString(36), log = [];
  talk = { stop: false }; start.disabled = true; stop.disabled = false;
  const add = (cls, who, text) => { logEl.insertAdjacentHTML('beforeend', `<div class="bot-msg ${cls}"><div>${esc(text).replace(/\n/g, '<br>')}</div><small>${esc(who)}</small></div>`); logEl.lastElementChild.scrollIntoView({ block: 'end' }); };
  add('mod', '🎙 Moderator', `Thema: ${topic} · antwortet: ${speakers.length > 1 ? 'alle' : partName(speakers[0])} · max. ${max} Runden`);
  try {
    for (let t = 0; t < max && !talk.stop; t++) {
      const sp = speakers[t % speakers.length], others = parts.filter(p => p !== sp).map(partName).join(' und ');
      const mod = await moderate(topic, log, partName(sp), others, t, max);
      if (mod.action === 'stop' && t > 0) { add('mod', '🎙 Moderator', 'Beendet: ' + (mod.reason || 'Ziel erreicht')); break; }
      add('mod', '🎙 Moderator → ' + partName(sp), mod.instruction || '');
      const last = log.at(-1);
      const task = `[Gruppengespräch, moderiert von Gemini – Runde ${t + 1}/${max}]\nThema/Ziel: ${topic}\nDu bist: ${partName(sp)}. Weitere Teilnehmer: ${others} (KI-Assistenten).\nAnweisung des Moderators: ${mod.instruction || ''}\n${last ? `Letzte Nachricht von ${last.who}:\n${last.text}\n` : ''}Antworte direkt mit deinem Beitrag (max. 150 Wörter). Kein Danken/Bestätigen ohne neuen Inhalt.`;
      let reply = null;
      if (sp === GEM) reply = await geminiTurn(task + (log.length ? '\n\nVerlauf:\n' + log.map(m => `${m.who}: ${m.text}`).join('\n').slice(-5000) : ''));
      else {
        const r = await sendTo(sp, task, conv);
        add('wait task', '⏳ wartet auf ' + partName(sp), r.webhook === 'sent' ? 'Auftrag verschlüsselt gesendet…' : 'Gespeichert (Webhook: ' + r.webhook + ')');
        for (let i = 0; i < 100 && !talk.stop; i++) {          // 3 s for ~3 min, then 10 s (up to ~12 min)
          await sleep(i < 60 ? 3000 : 10000);
          const a = await api('/api/bot/answer/' + r.ref).catch(() => ({ pending: true }));
          if (a.item) { reply = (await open(sp, a.item.env)).text; break; }
        }
      }
      logEl.querySelector('.wait')?.remove();
      if (!reply) { add('mod', '🎙 Moderator', talk.stop ? 'Gestoppt.' : `${partName(sp)} hat nicht geantwortet – Gespräch beendet.`); break; }
      add(t % 2 ? 'reply' : 'task', partName(sp), reply);
      const prevSame = log.filter(m => m.who === partName(sp)).at(-1);
      log.push({ who: partName(sp), text: reply });
      if ((prevSame && similar(prevSame.text, reply) > 0.8) || (last && similar(last.text, reply) > 0.85)) { add('mod', '🎙 Moderator', 'Beendet: Wiederholung erkannt (Anti-Pingpong).'); break; }
    }
    if (talk.stop) add('mod', '🎙 Moderator', 'Gestoppt.');
  } catch (e) { add('mod', '⚠️', 'Fehler: ' + e.message); }
  start.disabled = false; stop.disabled = true; talk = null;
}
