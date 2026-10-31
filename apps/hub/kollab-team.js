// v86: Kollab-Team – feste Mitglieder Seraphina (neutrale Beraterin) und Gemini (Coderin),
// Systemprompts (Admin), Seiten-Anpassungen mit Rückgängig, Aufgaben mit „An Claude senden“.
// Alles DOM per createElement/textContent – keine Server- oder Nutzertexte als Markup.
import { api, getSession } from './shared/api.js';

const MEMBERS = [
  { id: 'seraphina', name: 'Seraphina', avatar: '🌺', role: 'Neutrale Beraterin' },
  { id: 'gemini', name: 'Gemini', avatar: '💎', role: 'Coderin' },
];
const HIST_KEY = (id) => 'jeffa.kollabTeam.' + id;
let active = null;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'className') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}
function toast(msg, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) { c = h('div', { id: 'toast-container' }); document.body.appendChild(c); }
  const el = h('div', { className: `toast ${type}`, text: msg }); c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
const isAdmin = () => !!getSession();
const loadHist = (id) => { try { const a = JSON.parse(localStorage.getItem(HIST_KEY(id)) || '[]'); return Array.isArray(a) ? a.slice(-30) : []; } catch { return []; } };
const saveHist = (id, list) => { try { localStorage.setItem(HIST_KEY(id), JSON.stringify(list.slice(-30))); } catch {} };
const fmtTs = (ts) => { try { return new Date(String(ts).replace(' ', 'T') + (String(ts).includes('Z') ? '' : 'Z')).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); } catch { return String(ts || ''); } };

/** Dialog „Ausführen?“ – Inhalt nur als Text. extraLine z. B. Kostenschätzung. */
function confirmBox(title, name, args, extraLine) {
  return new Promise((resolve) => {
    const done = (v) => { m.remove(); resolve(v); };
    const m = h('div', { className: 'modal-backdrop' },
      h('div', { className: 'modal' },
        h('h3', { text: title }),
        h('p', {}, h('b', { text: name })),
        extraLine ? h('p', { className: 'hint', text: extraLine }) : null,
        h('pre', { className: 'tool-args', style: 'white-space:pre-wrap;max-height:40vh;overflow:auto', text: JSON.stringify(args ?? {}, null, 1).slice(0, 2000) }),
        h('div', { className: 'edit-actions' },
          h('button', { className: 'btn-sm secondary', text: 'Ablehnen', onclick: () => done(false) }),
          h('button', { className: 'btn-sm', text: 'Ausführen', onclick: () => done(true) }))));
    document.body.appendChild(m);
  });
}

async function claudeEstimate(taskId, extra) {
  try {
    const r = await api('/api/kollab/claude', { method: 'POST', body: { taskId, extra, dryRun: true } });
    const way = r.route === 'gateway' ? 'Claude Gateway' : r.route === 'lumia' ? 'LumiaRouter' : 'kein Claude-Zugang eingerichtet';
    return `Geschätzte Kosten max. ~$${Number(r.estimate?.usd || 0).toFixed(3)} (Weg: ${way}). Nichts wird automatisch live geschaltet.`;
  } catch (e) { return 'Kostenschätzung nicht möglich: ' + (e.message || 'Fehler'); }
}

async function refreshSite() { try { (await import('./site-apply.js')).loadAndApplySiteConfig(); } catch {} }

// ---------- Chat mit einem Mitglied ----------
async function ask(member, text, view) {
  const hist = loadHist(member.id);
  hist.push({ role: 'user', content: text });
  saveHist(member.id, hist); view.redraw();
  let toolResults = [];
  try {
    for (let step = 0; step < 3; step++) {
      const r = await api('/api/agent', { method: 'POST', body: { member: member.id, messages: hist.map(({ role, content }) => ({ role, content })), toolResults } });
      if (!r.confirm) {
        hist.push({ role: 'assistant', content: r.reply || '…', tools: (r.tools || []).join(', ') });
        break;
      }
      const c = r.confirm;
      if (r.reply) hist.push({ role: 'assistant', content: r.reply });
      const extra = c.name === 'send_to_claude' ? await claudeEstimate(Number(c.args?.task_id), String(c.args?.extra_context || '')) : '';
      if (!(await confirmBox(`${member.name} möchte etwas ändern`, c.name, c.args, extra))) {
        toolResults = [...toolResults, { name: c.name, args: c.args, result: { abgelehnt: true } }];
        continue;
      }
      let result;
      try { result = (await api('/api/agent/exec', { method: 'POST', body: { name: c.name, args: c.args, actor: member.id } })).result; }
      catch (e) { result = { error: e.status === 401 || e.status === 403 ? 'Admin-Anmeldung nötig (Hub → Tresor)' : e.message }; }
      if (c.name === 'set_site_config' || c.name === 'undo_site_change') { refreshSite(); view.reloadLists(); }
      if (c.name === 'create_task' || c.name === 'upsert_task' || c.name === 'send_to_claude') view.reloadLists();
      toolResults = [...toolResults, { name: c.name, args: c.args, result }];
      if (step === 2) hist.push({ role: 'assistant', content: 'Erledigt: ' + c.name + (result && result.error ? ' – Fehler: ' + result.error : '') });
    }
  } catch (e) {
    hist.push({ role: 'assistant', content: '⚠️ ' + (e.message || 'Fehler') });
  }
  saveHist(member.id, hist); view.redraw();
}

function chatView(member, reloadLists) {
  const box = h('div', { className: 'card', style: 'display:flex;flex-direction:column;gap:.5rem' });
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:.4rem;max-height:50vh;overflow:auto' });
  const ta = h('textarea', { rows: '2', placeholder: `Nachricht an ${member.name}…`, style: 'flex:1', lang: 'de', spellcheck: 'true' });
  const send = h('button', { className: 'btn-primary', text: 'Senden' });
  const view = {
    redraw() {
      list.textContent = '';
      for (const m of loadHist(member.id)) {
        list.appendChild(h('div', { style: `align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:92%;background:var(--bg-input);border-radius:10px;padding:.45rem .6rem` },
          h('div', { style: 'font-size:.75rem;color:var(--accent);font-weight:600', text: m.role === 'user' ? 'Du' : `${member.avatar} ${member.name}${m.tools ? ' · 🛠 ' + m.tools : ''}` }),
          h('div', { style: 'white-space:pre-wrap;font-size:.9rem', text: m.content })));
      }
      list.scrollTop = list.scrollHeight;
    },
    reloadLists,
  };
  send.onclick = async () => {
    const t = ta.value.trim(); if (!t) return;
    ta.value = ''; send.disabled = true; send.textContent = '…';
    try { await ask(member, t, view); } finally { send.disabled = false; send.textContent = 'Senden'; }
  };
  box.append(
    h('div', { style: 'display:flex;align-items:center;gap:.5rem' },
      h('b', { style: 'flex:1', text: `${member.avatar} ${member.name} – ${member.role}` }),
      h('button', { className: 'btn-sm secondary', text: 'Verlauf leeren', onclick: () => { saveHist(member.id, []); view.redraw(); } })),
    list,
    h('div', { style: 'display:flex;gap:.5rem;align-items:flex-end' }, ta, send),
    member.id === 'gemini' ? h('div', { className: 'hint', text: 'Gemini darf Texte, Schriften, Farben, Menüpunkte und Knöpfe ändern (jede Änderung fragt nach und ist rückgängig machbar). Code-Fehler schreibt sie als Aufgabe – die kann an Claude gehen.' }) : h('div', { className: 'hint', text: 'Seraphina berät neutral und darf nur lesen.' }),
  );
  if (isAdmin()) box.appendChild(promptEditor(member));
  view.redraw();
  return box;
}

function promptEditor(member) {
  const det = h('details', {}, h('summary', { text: '⚙️ Systemprompt' }));
  const info = h('div', { className: 'hint', text: 'Lädt…' });
  const ta = h('textarea', { rows: '8', style: 'width:100%;font-size:.85rem' });
  const save = h('button', { className: 'btn-sm', text: 'Speichern' });
  const reset = h('button', { className: 'btn-sm secondary', text: 'Zurück auf Standard' });
  det.append(info, ta, h('div', { style: 'display:flex;gap:.5rem;margin-top:.4rem' }, save, reset));
  const show = (m) => { ta.value = m.prompt || ''; info.textContent = `Stand #${m.version || 0} · ${m.isDefault ? 'Standard' : 'angepasst'}`; };
  let loaded = false;
  det.addEventListener('toggle', async () => {
    if (!det.open || loaded) return;
    try { const r = await api('/api/kollab/team'); const m = (r.members || []).find((x) => x.id === member.id); if (m) show(m); loaded = true; }
    catch (e) { info.textContent = 'Konnte nicht laden: ' + (e.message || ''); }
  });
  save.onclick = async () => {
    try { const r = await api('/api/kollab/team', { method: 'POST', body: { member: member.id, prompt: ta.value } }); show(r.member); toast('Systemprompt gespeichert', 'success'); }
    catch (e) { toast(e.message || 'Fehler', 'error'); }
  };
  reset.onclick = async () => {
    if (!confirm(`Systemprompt von ${member.name} auf Standard zurücksetzen?`)) return;
    try { const r = await api('/api/kollab/team', { method: 'POST', body: { member: member.id, reset: true } }); show(r.member); toast('Standard wiederhergestellt', 'success'); }
    catch (e) { toast(e.message || 'Fehler', 'error'); }
  };
  return det;
}

// ---------- Seiten-Anpassungen ----------
async function drawChanges(el) {
  el.textContent = '';
  el.appendChild(h('h3', { style: 'font-size:.95rem;font-weight:600', text: '🛠 Seiten-Anpassungen' }));
  let changes = [];
  try { changes = (await api('/api/site-config/changes')).changes || []; }
  catch (e) { el.appendChild(h('div', { className: 'hint', text: e.status === 401 ? 'Bitte anmelden, um den Verlauf zu sehen.' : 'Verlauf nicht ladbar.' })); return; }
  if (!changes.length) { el.appendChild(h('div', { className: 'hint', text: 'Noch keine Änderungen.' })); return; }
  for (const c of changes.slice(0, 30)) {
    const row = h('div', { style: 'display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;border-top:1px solid var(--border);padding:.35rem 0' },
      h('span', { style: 'flex:1 1 60%;font-size:.85rem', text: `#${c.id} · ${fmtTs(c.ts)} · ${c.actor}: ${c.summary || c.key}${Number(c.undone) ? ' (rückgängig gemacht)' : ''}${c.undo_of ? ' (Rückgängig von #' + c.undo_of + ')' : ''}` }));
    if (isAdmin() && !Number(c.undone) && !c.undo_of) {
      row.appendChild(h('button', { className: 'btn-sm secondary', text: '↩︎ Rückgängig', onclick: async () => {
        try { await api('/api/site-config/undo', { method: 'POST', body: { id: c.id } }); toast('Rückgängig gemacht', 'success'); await refreshSite(); drawChanges(el); }
        catch (e) { toast(e.message || 'Fehler', 'error'); }
      } }));
    }
    el.appendChild(row);
  }
}

// ---------- Aufgaben ----------
async function drawTasks(el, reloadAll) {
  el.textContent = '';
  el.appendChild(h('h3', { style: 'font-size:.95rem;font-weight:600', text: '📝 Aufgaben' }));
  let tasks = [], meta = [];
  try { tasks = (await api('/api/kollab/tasks')).tasks || []; } catch { el.appendChild(h('div', { className: 'hint', text: 'Aufgaben nicht ladbar.' })); return; }
  try { meta = (await api('/api/kollab/meta')).meta || []; } catch { meta = []; }
  const byId = new Map(meta.map((m) => [Number(m.task_id), m]));
  const open = tasks.filter((t) => t.status !== 'erledigt').slice(0, 30);
  if (!open.length) el.appendChild(h('div', { className: 'hint', text: 'Keine offenen Aufgaben.' }));
  for (const t of open) {
    const m = byId.get(Number(t.id)) || {};
    const card = h('div', { style: 'border-top:1px solid var(--border);padding:.45rem 0;display:flex;flex-direction:column;gap:.3rem' },
      h('div', { style: 'font-weight:600;font-size:.9rem', text: `#${t.id} ${t.title}` }),
      h('div', { className: 'hint', text: `Status: ${t.status}${m.severity ? ' · Größe: ' + m.severity : ''}${m.state === 'vorschlag' ? ' · 💡 Vorschlag von Claude' : ''}${t.assignee ? ' · ' + t.assignee : ''}` }),
      t.body ? h('div', { style: 'white-space:pre-wrap;font-size:.85rem;color:var(--text-secondary)', text: String(t.body).slice(0, 1500) }) : null);
    if (m.proposal) {
      card.appendChild(h('details', {}, h('summary', { text: `💡 Vorschlag ansehen (${m.proposal_model || 'Claude'}${m.cost_usd != null ? ', ~$' + Number(m.cost_usd).toFixed(3) : ''})` }),
        h('pre', { style: 'white-space:pre-wrap;font-size:.8rem;max-height:60vh;overflow:auto', text: m.proposal })));
    }
    if (isAdmin()) {
      const extra = h('textarea', { rows: '3', placeholder: 'Zusatzkontext für Claude (Dateipfade, Code-Ausschnitte, Fehlermeldungen) – optional', style: 'width:100%;font-size:.85rem;display:none' });
      const sendBtn = h('button', { className: 'btn-sm', text: 'An Claude senden' });
      sendBtn.onclick = async () => {
        if (extra.style.display === 'none') { extra.style.display = 'block'; sendBtn.textContent = 'Kosten prüfen & senden'; extra.focus(); return; }
        const line = await claudeEstimate(Number(t.id), extra.value);
        if (!(await confirmBox('Aufgabe an Claude senden?', `#${t.id} ${t.title}`, { zusatzkontext: extra.value.slice(0, 500) }, line))) return;
        sendBtn.disabled = true; sendBtn.textContent = '⏳ Claude arbeitet…';
        try { await api('/api/kollab/claude', { method: 'POST', body: { taskId: Number(t.id), extra: extra.value } }); toast('Vorschlag von Claude ist da', 'success'); reloadAll(); }
        catch (e) { toast(e.message || 'Fehler', 'error'); sendBtn.disabled = false; sendBtn.textContent = 'An Claude senden'; }
      };
      const doneBtn = h('button', { className: 'btn-sm secondary', text: '✓ erledigt', onclick: async () => {
        try { await api(`/api/kollab/tasks/${Number(t.id)}`, { method: 'PATCH', body: { status: 'erledigt' } }); reloadAll(); }
        catch (e) { toast(e.message || 'Fehler', 'error'); }
      } });
      card.append(extra, h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' }, sendBtn, doneBtn));
    }
    el.appendChild(card);
  }
}

export function renderTeam(el) {
  if (!el) return;
  el.textContent = '';
  const card = h('div', { className: 'card', style: 'display:flex;flex-direction:column;gap:.75rem' });
  const tiles = h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' });
  const chatHost = h('div');
  const changesEl = h('div');
  const tasksEl = h('div');
  const reloadLists = () => { drawChanges(changesEl); drawTasks(tasksEl, reloadLists); };
  const drawTiles = () => {
    tiles.textContent = '';
    for (const m of MEMBERS) {
      tiles.appendChild(h('button', { type: 'button', className: `chip-pick${active === m.id ? ' on' : ''}`, style: 'display:flex;flex-direction:column;align-items:flex-start;padding:.5rem .75rem;min-width:9rem', 'data-member': m.id,
        onclick: () => { active = active === m.id ? null : m.id; drawTiles(); chatHost.textContent = ''; if (active) chatHost.appendChild(chatView(m, reloadLists)); } },
        h('span', { style: 'font-weight:600', text: `${m.avatar} ${m.name}` }), h('small', { text: m.role })));
    }
  };
  card.append(
    h('h2', { style: 'font-size:1.1rem;font-weight:600', text: '👥 Kollab-Team' }),
    h('div', { className: 'hint', text: 'Feste Mitglieder – laufen über euren eigenen Gemini-Schlüssel (nicht OpenRouter).' }),
    tiles, chatHost, changesEl, tasksEl);
  el.appendChild(card);
  drawTiles();
  if (active) { const m = MEMBERS.find((x) => x.id === active); if (m) chatHost.appendChild(chatView(m, reloadLists)); }
  reloadLists();
}
