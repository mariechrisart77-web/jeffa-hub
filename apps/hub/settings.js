import { isAdult, setAdult } from './shared/fsk.js';
import { authState, ensureAdmin, registerWebAuthn, setupPin, logout } from './shared/auth.js';
import { lockScreen } from './shared/auth.js';
import { api, APIError } from './shared/api.js';
import { getProfile } from './profiles.js';
import { getPaidAllowed, setPaidAllowed, getDefaultModel, setDefaultModel, modelInfo, pickModel, renderRouteEditor, getImageStyle, setImageStyle, getImageOpt, setImageOpt, getModelMode, setModelMode } from './shared/models.js';
import { ENCRYPT_WARN } from './shared/crypto.js';

const get = () => { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}'); } catch { return {}; } };
const set = (p) => localStorage.setItem('jeffa.settings', JSON.stringify({ ...get(), ...p }));

export async function init(root) {
  const s = get();
  let st = { pinSet: false, passkeys: false, authenticated: false };
  try {
    st = await authState();
  } catch {}

  root.innerHTML = `
    <div class="settings-scroll">
      <div class="card">
        <label class="toggle-label">
          <input type="checkbox" id="s-adult" ${isAdult() ? 'checked' : ''}>
          <span>Ich bin 18+</span>
        </label>
        <div class="hint">Schaltet 18+-Profile und -Bereiche frei.</div>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;margin-bottom:0.5rem">🤖 Chat-Modell (Standard für neue Chats)</h3>
        <label class="field-label">Modellwahl</label>
        <select id="s-model-mode">
          <option value="auto">✨ Automatisch (empfohlen)</option>
          <option value="manual">✋ Manuell (Standard-Modell)</option>
        </select>
        <div class="hint" id="s-model-mode-hint">Automatisch wählt passend zum Modus: hemmungslos → unzensiert (Venice), Spanisch-Lehrer → Qwen/DeepSeek, Bilder im Verlauf → Vision-Modell, sonst die Reihenfolge aus „KI-Weg“.</div>
        <button class="model-current" id="s-model"></button>
        <div class="hint">Jeder Chat und jedes Profil kann ein eigenes Modell haben (Modellname unter einer Antwort oder im Chat-Kopf antippen).</div>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;margin-bottom:0.5rem">🔀 KI-Weg: wer antwortet zuerst?</h3>
        <div class="hint">Reihenfolge mit ↑/↓, Schalter = an/aus. Antwortet einer nicht (Fehler, Limit, kein Guthaben), übernimmt automatisch der nächste.</div>
        <h4 class="route-h">🔞 FSK18 an</h4><div id="route-adult"></div>
        <label class="form-group" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="s-paid"> <span>💲 Bezahlte Modelle ohne eigenen Key erlaubt <small>(Standard aus – Venice/Gemini/Groq laufen über eigene Keys normal mit, Preis steht am Modell; nur 💲-Modelle brauchen diese Freigabe)</small></span></label>
        <h4 class="route-h">Normaler Chat</h4><div id="route-normal"></div>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;margin-bottom:0.5rem">🖼 Bildstil</h3>
        <select id="s-imgstyle">
          <option value="real">Realistisch (Foto)</option>
          <option value="comic">Comic-Stil (ohne Text)</option>
          <option value="manhwa">Manhwa (ohne Text)</option>
          <option value="comicpage">Comic-Seite mit spanischen Sprechblasen 🇪🇸</option>
        </select>
        <div class="hint">Realistisch, Comic-Stil und Manhwa enthalten keinen Text. Nur die Comic-Seite (wenn ausgewählt): 3 Panels, die App legt kurze spanische Sprechblasen darüber (antippen = Deutsch).</div>
        <label class="field-label">Bildmodell</label>
        <select id="s-imgmodel-mode">
          <option value="auto">✨ Automatisch (empfohlen)</option>
          <option value="manual">✋ Manuell</option>
        </select>
        <label class="field-label" id="s-imgq-label">Bildqualität</label>
        <select id="s-imgq">
          <option value="single">Einzelbild nach Profil-Einstellung – Standard z-image · FSK18 chroma (≈ 0,01 $)</option>
          <option value="mix">Spar-Mix: Hintergrund + Person getrennt (≈ 0,03 $) · Standard – in FSK18 automatisch chroma-Einzelbild (≈ 0,01 $)</option>
          <option value="lustify">🔞 Lustify v8 – explizit, 30 Schritte (≈ 0,01 $) · nur FSK18 (Standard → Einzelbild)</option>
          <option value="hq">Hohe Qualität – Standard: qwen-image-3 (≈ 0,04 $) · FSK18: lustify v8 mit 50 Schritten (≈ 0,01 $)</option>
          <option value="refine">Premium + Nachschliff – Bild + Feinschliff (Standard qwen-2.1-pro-edit ≈ 0,06 $ · FSK18 chroma + qwen-edit-uncensored ≈ 0,05 $)</option>
          <option value="refine-firered">Premium FireRed – Bild + FireRed-Nachschliff (≈ 0,05 $) · Standard & FSK18</option>
          <option value="krea">Premium Standard – krea-v2-large (≈ 0,07 $) · nur Standard (FSK18 → chroma)</option>
        </select>
        <label class="field-label">Wie oft Bilder?</label>
        <select id="s-imgfreq">
          <option value="off">Aus</option>
          <option value="request">Nur auf Anfrage</option>
          <option value="every">Jede Antwort</option>
          <option value="3">Etwa jede 3. Antwort</option>
          <option value="5">Etwa jede 5. Antwort</option>
        </select>
        <label class="field-label">Bilder im Modus jugendfrei</label>
        <select id="s-imgevery">
          <option value="5-10">Etwa jede 5.–10. Antwort (Standard)</option>
          <option value="3">Etwa jede 3. Antwort</option>
          <option value="5">Etwa jede 5. Antwort</option>
          <option value="10">Etwa jede 10. Antwort</option>
          <option value="request">Nur auf Anfrage</option>
        </select>
        <div class="hint">Gilt nur für jugendfrei; hemmungslos folgt „Wie oft Bilder?“. Fragst du ausdrücklich nach einem Bild, kommt es immer.</div>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;margin-bottom:0.5rem">🚦 Kosten & Budget</h3>
        <button class="btn-sm" id="s-costs">Kosten anzeigen</button>
        <div id="costs-container"></div>
      </div>

      <div class="card">
        <h3>🤖 Grok Bot / Bots</h3>
        <label class="toggle-label"><input type="checkbox" id="s-triage" ${localStorage.getItem('jeffa.botTriage') !== '0' ? 'checked' : ''}><span>⚡ Gemini-Vorprüfung im Grok-Bot-Tab</span></label>
        <div class="hint">Einfache Fragen beantwortet Gemini 3.5 Flash-Lite direkt; Aufgaben gehen verschlüsselt an den Bot. Bei aktiver Vorprüfung sieht Gemini (Google) jede Nachricht im Klartext. Aus = nichts geht an Gemini.</div>
        <div class="hint" style="margin-top:8px">🔔 Mitteilungen bei Bot-Antworten (nur Hinweis „Neue Antwort von …“, kein Inhalt). iPhone: App zuerst zum Home-Bildschirm hinzufügen und von dort öffnen (iOS 16.4+).</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><button class="btn-sm" id="s-push-on">🔔 Mitteilungen aktivieren</button><button class="btn-sm" id="s-push-test">Test-Mitteilung</button></div><div class="hint" id="s-push-st"></div>
        <div id="s-bots"><button class="btn-sm" id="s-bots-open">Verbindungen anzeigen (Admin)</button></div>
      </div>

      <div class="card">
        <label class="toggle-label">
          <input type="checkbox" id="s-enc" ${s.encrypt ? 'checked' : ''}>
          <span>Verschlüsselung / Privat-Modus</span>
        </label>
        <div class="hint">Chats lokal verschlüsselt; KI-Anbieter sieht Text beim Antworten trotzdem.<br>⚠️ ${ENCRYPT_WARN}</div>
      </div>

      <div class="card">
        <label class="toggle-label">
          <input type="checkbox" id="s-light" ${s.theme === 'light' ? 'checked' : ''}>
          <span>Helles Design</span>
        </label>
      </div>

      <div class="card">
        <label class="toggle-label">
          <input type="checkbox" id="s-tools" ${s.tools !== 'off' ? 'checked' : ''}>
          <span>KI-Werkzeuge aktivieren</span>
        </label>
        <div class="hint">Ermöglicht KI-Zugriff auf Web-Suche, Bilderstellung, Code-Ausführung.</div>
        <select id="s-tools-mode" style="margin-top:0.5rem">
          <option value="auto" ${s.tools === 'auto' || !s.tools ? 'selected' : ''}>Automatisch</option>
          <option value="on" ${s.tools === 'on' ? 'selected' : ''}>Immer an</option>
          <option value="off" ${s.tools === 'off' ? 'selected' : ''}>Aus</option>
        </select>
      </div>

      <div class="card">
        <label class="toggle-label">
          <input type="checkbox" id="s-memory" ${s.memory !== false ? 'checked' : ''}>
          <span>🧠 Gedächtnis nutzen</span>
        </label>
        <div class="hint">Speichert kurze Fakten statt langer Chat-Historie (spart Tokens).</div>
      </div>

      <div class="card" id="memory-card">
        <h3 style="font-size:1rem;margin-bottom:0.75rem">🧠 Gedächtnis</h3>
        <div class="hint">Gespeicherte Fakten für kontextualisierte Antworten.</div>
        <div id="memory-list" style="margin-top:1rem"></div>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
          <input type="text" id="mem-fact" placeholder="Neuer Fakt..." style="margin-bottom:0.5rem">
          <select id="mem-scope" style="margin-bottom:0.5rem">
            <option value="user">Über dich – gilt für alle Profile</option>
          </select>
          <button class="btn-sm" id="mem-add">Hinzufügen</button>
          <button class="btn-sm btn-secondary" id="mem-clear" style="margin-left:0.5rem">Alle löschen</button>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:1rem;margin-bottom:0.75rem">🔐 Sicherheit</h3>
        <div class="hint">Face ID: ${st.passkeys ? 'eingerichtet' : 'nicht eingerichtet'} · PIN: ${st.pinSet ? 'festgelegt' : 'nicht festgelegt'}</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap">
          <button class="btn-sm" id="s-faceid">Face ID einrichten</button>
          <button class="btn-sm" id="s-pin">PIN festlegen</button>
        </div>
        <label class="toggle-label" style="margin-top:0.75rem"><input type="checkbox" id="s-faceid-on" ${get().faceId === true ? 'checked' : ''}><span>Face ID beim Entsperren anbieten (Standard: aus)</span></label>
        <div class="hint">Angemeldet bleibt dieses Gerät 90 Tage ab letzter Nutzung – bis „Abmelden“.</div>
      </div>

      <div class="card">
        <button class="btn btn-secondary" id="s-logout" style="width:100%">Abmelden</button>
      </div>
    </div>
  `;
  { const v = document.createElement('div'); v.className = 'hint'; v.style.cssText = 'text-align:center;opacity:.6;font-size:11px;margin:14px 0'; v.textContent = 'Version: …'; root.appendChild(v);
    fetch('/sw.js', { cache: 'no-store' }).then(r => r.text()).then(t => { const sv = (t.match(/jeffa-v\d+/) || ['?'])[0]; const run = window.__JEFFA_V || sv; v.textContent = `Version ${run.replace('jeffa-', '')}` + (run !== sv ? ` · Server hat ${sv.replace('jeffa-', '')} – bitte neu laden` : ''); }).catch(() => {}); }

  const mBtn = root.querySelector('#s-model');
  const drawM = () => {
    const i = modelInfo(getDefaultModel()); mBtn.innerHTML = `<b>${i.label}</b><small>${i.desc}</small><span>▾</span>`;
    const auto = getModelMode() === 'auto';
    mBtn.disabled = auto; mBtn.title = auto ? 'nur bei Manuell' : '';
    const mm = root.querySelector('#s-model-mode'); if (mm) mm.value = getModelMode();
    const h = root.querySelector('#s-model-mode-hint'); if (h) h.style.display = auto ? '' : 'none';
  };
  drawM();
  root.querySelector('#s-model-mode').onchange = (e) => { setModelMode(e.target.value); drawM(); };
  mBtn.onclick = async () => { if (getModelMode() === 'auto') return; const id = await pickModel({ title: 'Standard-Modell', current: getDefaultModel(), allowDefault: false }); if (id) { setDefaultModel(id); drawM(); } };
  { const c = root.querySelector('#s-paid'); if (c) { c.checked = getPaidAllowed(); c.onchange = () => setPaidAllowed(c.checked); } }
  renderRouteEditor(root.querySelector('#route-adult'), 'adult');
  renderRouteEditor(root.querySelector('#route-normal'), 'normal');
  const pst = root.querySelector('#s-push-st'), say = t => { pst.textContent = t; };
  root.querySelector('#s-push-on').onclick = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return say('Hier nicht verfügbar. Auf dem iPhone: Teilen → „Zum Home-Bildschirm“, dann die App von dort öffnen.');
      if (!(await ensureAdmin())) return;
      if (await Notification.requestPermission() !== 'granted') return say('Mitteilungen wurden nicht erlaubt (iOS-Einstellungen → Mitteilungen → Jeffa).');
      const reg = await navigator.serviceWorker.ready, { key } = await api('/api/push/key');
      const k = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), c => c.charCodeAt(0));
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...k))) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
      await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      say('✅ Mitteilungen aktiv auf diesem Gerät.');
    } catch (e) { say('Fehler: ' + e.message); }
  };
  root.querySelector('#s-push-test').onclick = async () => {
    try { if (!(await ensureAdmin())) return; const r = await api('/api/push/test', { method: 'POST', body: {} }); say(r.sent ? `Test gesendet (${r.sent} Gerät/e).` : 'Kein Gerät registriert – zuerst „Mitteilungen aktivieren“.'); }
    catch (e) { say(e.status === 429 || /rate/.test(e.message) ? 'Bitte 1 Minute warten.' : 'Fehler: ' + e.message); }
  };
  root.querySelector('#s-triage').onchange = e => localStorage.setItem('jeffa.botTriage', e.target.checked ? '1' : '0');
  root.querySelector('#s-costs').onclick = async () => {
    const container = root.querySelector('#costs-container');
    if (container.innerHTML) { container.innerHTML = ''; return; }
    const { renderCosts } = await import('./costs-ui.js');
    await renderCosts(container);
  };
  root.querySelector('#s-bots-open').onclick = async () => { const { ensureAdmin } = await import('./shared/auth.js'); if (!(await ensureAdmin())) return; (await import('./bot.js')).renderBotAdmin(root.querySelector('#s-bots')); };
  const is = root.querySelector('#s-imgstyle'); is.value = getImageStyle(); is.onchange = () => setImageStyle(is.value);
  for (const [id, k, d] of [['#s-imgq', 'imageQuality', 'single'], ['#s-imgfreq', 'imageFreq', 'request'], ['#s-imgevery', 'imageEverySfw', '5-10']]) { const el = root.querySelector(id); if (!el) continue; el.value = getImageOpt(k, d); el.onchange = () => setImageOpt(k, el.value); }
  { // v84 P2: Bildmodell automatisch/manuell. Automatisch = 'single' (bestehender Auto-Pfad des Servers).
    const sel = root.querySelector('#s-imgmodel-mode'), q = root.querySelector('#s-imgq'), ql = root.querySelector('#s-imgq-label');
    const drawQ = () => { const mode = getImageOpt('imageModelMode', '') || (getImageOpt('imageQuality', 'single') === 'single' ? 'auto' : 'manual'); sel.value = mode; q.style.display = mode === 'auto' ? 'none' : ''; if (ql) ql.style.display = mode === 'auto' ? 'none' : ''; };
    drawQ();
    sel.onchange = () => { setImageOpt('imageModelMode', sel.value); if (sel.value === 'auto') { setImageOpt('imageQuality', 'single'); q.value = 'single'; } drawQ(); };
  }

  root.querySelector('#s-adult').onchange = (e) => {
    if (e.target.checked) {
      const ok = confirm('Bestätige, dass du mindestens 18 Jahre alt bist.');
      if (!ok) {
        e.target.checked = false;
        return;
      }
    }
    setAdult(e.target.checked);
  };

  root.querySelector('#s-enc').onchange = (e) => {
    set({ encrypt: e.target.checked });
    window.dispatchEvent(new Event('jeffa:encrypt-changed'));
  };

  root.querySelector('#s-light').onchange = (e) => {
    set({ theme: e.target.checked ? 'light' : 'dark' });
    document.body.classList.toggle('light-theme', e.target.checked);
    document.getElementById('theme-btn').textContent = e.target.checked ? '☀️' : '🌙';
  };

  root.querySelector('#s-tools').onchange = (e) => {
    const mode = root.querySelector('#s-tools-mode').value;
    set({ tools: e.target.checked ? mode : 'off' });
  };

  root.querySelector('#s-tools-mode').onchange = (e) => {
    set({ tools: e.target.value });
    root.querySelector('#s-tools').checked = e.target.value !== 'off';
  };

  root.querySelector('#s-memory').onchange = (e) => {
    set({ memory: e.target.checked });
  };

  root.querySelector('#s-faceid-on').onchange = (e) => set({ faceId: e.target.checked });

  root.querySelector('#s-faceid').onclick = async () => {
    try {
      if (st.session?.role !== 'admin' && (st.pinSet || st.passkeys)) {
        await ensureAdmin();
      }
      await registerWebAuthn();
      alert('Face ID erfolgreich eingerichtet');
      init(root);
    } catch (err) {
      alert(errText(err));
    }
  };

  root.querySelector('#s-pin').onclick = async () => {
    try {
      if (st.session?.role !== 'admin' && (st.pinSet || st.passkeys)) {
        await ensureAdmin();
      }
      const pin = prompt('4-stellige PIN eingeben:');
      if (!pin || !/^\d{4}$/.test(pin)) {
        alert('Ungültige PIN');
        return;
      }
      const pin2 = prompt('PIN bestätigen:');
      if (pin !== pin2) {
        alert('PINs stimmen nicht überein');
        return;
      }
      await setupPin(pin);
      alert('PIN erfolgreich festgelegt');
      init(root);
    } catch (err) {
      alert(errText(err));
    }
  };

  root.querySelector('#s-logout').onclick = async () => {
    if (!confirm('Wirklich abmelden?')) return;
    try {
      await logout();
    } catch {}
    location.reload();
  };

  await loadMemories(root);

  root.querySelector('#mem-add').onclick = async () => {
    const fact = root.querySelector('#mem-fact').value.trim();
    const scope = root.querySelector('#mem-scope').value;
    if (!fact) return;
    try {
      const body = { fact };
      if (scope === 'user') body.scope = 'user';
      else if (scope && scope !== '') body.profileId = scope;
      await api('/api/memory', { method: 'POST', body });
      root.querySelector('#mem-fact').value = '';
      await loadMemories(root);
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        alert('Entsperrung nötig');
        await lockScreen();
        await loadMemories(root);
      } else {
        alert(errText(err));
      }
    }
  };

  root.querySelector('#mem-clear').onclick = async () => {
    if (!confirm('Alle Gedächtnis-Einträge löschen?')) return;
    try {
      const data = await api('/api/memory?all=1');
      for (const m of data.memories || []) {
        await api(`/api/memory/${m.id}`, { method: 'DELETE' });
      }
      await loadMemories(root);
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        alert('Entsperrung nötig');
        await lockScreen();
        await loadMemories(root);
      } else {
        alert(errText(err));
      }
    }
  };

  const profiles = await loadProfilesForMemory();
  const scopeSelect = root.querySelector('#mem-scope');
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    scopeSelect.appendChild(opt);
  }
}

function errText(err) {
  const msg = (err && err.message) || 'Unbekannter Fehler';
  const hint = err && err.status === 429 ? '\n\nBitte kurz warten und erneut versuchen.'
    : err && err.status >= 500 ? '\n\nBitte Screenshot an Grok Bot schicken.' : '';
  return 'Fehler: ' + msg + (err && err.code && err.code !== 'http_error' ? ' [' + err.code + ']' : '') + hint;
}

async function loadMemories(root) {
  const listEl = root.querySelector('#memory-list');
  try {
    const data = await api('/api/memory?all=1');
    const memories = data.memories || [];
    if (memories.length === 0) {
      listEl.innerHTML = '<div class="hint">Keine Einträge vorhanden.</div>';
      return;
    }

    const grouped = {};
    for (const m of memories) {
      let key = 'Alle';
      if (m.scope === 'user') key = 'Über dich';
      else if (m.scope && m.scope.startsWith('p:')) {
        const pid = m.scope.slice(2);
        try {
          const profile = getProfile(pid);
          key = profile ? profile.name : pid;
        } catch {
          key = pid;
        }
      }
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    listEl.innerHTML = '';
    for (const [scope, items] of Object.entries(grouped)) {
      const groupEl = document.createElement('div');
      groupEl.style.marginBottom = '1rem';
      const titleEl = document.createElement('div');
      titleEl.style.fontSize = '0.85rem';
      titleEl.style.fontWeight = '600';
      titleEl.style.marginBottom = '0.5rem';
      titleEl.style.color = 'var(--text-secondary)';
      titleEl.textContent = scope;
      groupEl.appendChild(titleEl);

      for (const m of items) {
        const itemEl = document.createElement('div');
        itemEl.style.background = 'var(--bg-input)';
        itemEl.style.padding = '0.5rem';
        itemEl.style.borderRadius = '0.5rem';
        itemEl.style.marginBottom = '0.5rem';
        itemEl.style.display = 'flex';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.alignItems = 'center';
        itemEl.style.gap = '0.5rem';
        itemEl.innerHTML = `
          <span style="flex:1;font-size:0.9rem">${escapeHtml(m.fact)}</span>
          <div style="display:flex;gap:0.25rem">
            <button class="btn-sm" data-edit="${m.id}">✏️</button>
            <button class="btn-sm btn-secondary" data-delete="${m.id}">🗑</button>
          </div>
        `;
        groupEl.appendChild(itemEl);

        itemEl.querySelector('[data-edit]').onclick = async () => {
          const newFact = prompt('Fakt bearbeiten:', m.fact);
          if (!newFact || newFact === m.fact) return;
          try {
            await api(`/api/memory/${m.id}`, { method: 'PUT', body: { fact: newFact } });
            await loadMemories(root);
          } catch (err) {
            if (err instanceof APIError && err.status === 401) {
              alert('Entsperrung nötig');
              await lockScreen();
              await loadMemories(root);
            } else {
              alert(errText(err));
            }
          }
        };

        itemEl.querySelector('[data-delete]').onclick = async () => {
          if (!confirm('Eintrag löschen?')) return;
          try {
            await api(`/api/memory/${m.id}`, { method: 'DELETE' });
            await loadMemories(root);
          } catch (err) {
            if (err instanceof APIError && err.status === 401) {
              alert('Entsperrung nötig');
              await lockScreen();
              await loadMemories(root);
            } else {
              alert(errText(err));
            }
          }
        };
      }

      listEl.appendChild(groupEl);
    }
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      listEl.innerHTML = '<div class="hint">Entsperrung nötig <button class="btn-sm" id="unlock-mem">Entsperren</button></div>';
      listEl.querySelector('#unlock-mem').onclick = async () => {
        await lockScreen();
        await loadMemories(root);
      };
    } else {
      listEl.innerHTML = '';
      const d = document.createElement('div'); d.className = 'hint';
      d.textContent = 'Fehler beim Laden: ' + ((err && err.message) || 'unbekannt');
      listEl.appendChild(d);
    }
  }
}

async function loadProfilesForMemory() {
  try {
    const { getProfiles } = await import('./profiles.js');
    return getProfiles();
  } catch {
    return [];
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
