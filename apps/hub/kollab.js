import { api, getSession } from './shared/api.js';
import { isAdult } from './shared/fsk.js';
import { MODELS, modelLabel, getDefaultModel } from './shared/models.js';
import { getProfiles } from './profiles.js';
import { setupTyping, isTouchDevice } from './shared/typing.js';
let rootEl = null;
const ROLES = ['Koordinator', 'Admin', 'Entwickler', 'Prüfer', 'Ideengeber', 'Nur lesen'];

let groups = [];
let activeGroup = null;
let eventSource = null;

export async function init(root) {
  rootEl = root;
  await load();
  render(root);
}

async function load() {
  try {
    groups = (await api('/api/kollab/groups')).groups || [];
  } catch (err) {
    toast(err.message || 'Fehler beim Laden', 'error');
  }
}

function render(root) {
  let html = '<div style="display:flex;flex-direction:column;gap:1.5rem;">';
  
  if (!activeGroup) {
    html += '<div><h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">Gruppen</h2>';
    
    if (groups.length > 0) {
      html += '<div style="display:flex;flex-direction:column;gap:0.75rem;">';
      for (const g of groups) {
        html += `
          <div class="card" style="cursor:pointer;" data-open-group="${g.id}">
            <div style="font-weight:600;margin-bottom:0.25rem;">${esc(g.name)}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.5rem;">${esc(g.goal)}</div>
            <div style="font-size:0.8rem;color:var(--text-tertiary);">
              ${g.members.length} Mitglieder · Koordinator: ${esc(modelLabel(g.coordinator_model))}
            </div>
          </div>
        `;
      }
      html += '</div>';
    } else {
      html += '<div class="hint">Keine Gruppen erstellt.</div>';
    }
    
    html += `
      <div class="card" style="margin-top:1rem;">
        <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:1rem;">Neue Gruppe</h3>
        <form id="group-form" class="kollab-form">
          <label class="field-label">Gruppenname</label>
          <input type="text" name="name" placeholder="z. B. App-Team" required>
          <label class="field-label">Ziel der Gruppe</label>
          <textarea name="goal" data-typing-goal placeholder="Was soll das Team erreichen? z. B. „Dienst verbessern“" rows="2" required></textarea>
          <label class="field-label">Koordinator (verteilt Aufgaben und fasst die Ergebnisse zusammen)</label>
          <div id="coord-chips"></div>
          <label class="field-label">Mitglieder – antippen zum Hinzufügen (max. 5)</label>
          <div class="hint" style="margin-bottom:4px">Profile</div><div id="pick-profiles"></div>
          <div class="hint" style="margin:6px 0 4px">KI-Modelle</div><div id="pick-models"></div>
          <div id="members-list"></div>
          <button type="submit" class="btn-primary">Gruppe erstellen</button>
        </form>
      </div>
    `;
    
    html += '</div>';
  } else {
    const g = activeGroup;
    html += `
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
        <button class="btn-icon" id="back-btn">←</button>
        <h2 style="font-size:1.1rem;font-weight:600;flex:1;">${esc(g.name)}</h2>
        <button class="btn-icon" id="delete-group" title="Gruppe löschen">🗑️</button>
      </div>
      <div class="hint" style="font-size:0.85rem;margin-bottom:1rem;">
        Protokoll: Max 3 Runden, je 1 Antwort pro Bot an den Koordinator. Token-Limit: 12.000 gesamt.<br>Die Grok-App selbst lässt sich nicht verbinden – nur die xAI-API (Schlüssel im Tresor).
        ${isEncryptionOn() ? '<br>🔒 Privat-Modus aktiv – Inhalt wird als verschlüsselt markiert.' : ''}
      </div>
    `;
    
    if (g.messages && g.messages.length > 0) {
      html += '<div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1rem;" id="messages">';
      
      const byRound = {};
      for (const msg of g.messages) {
        if (!byRound[msg.round]) byRound[msg.round] = [];
        byRound[msg.round].push(msg);
      }
      
      for (const round of Object.keys(byRound).sort((a, b) => a - b)) {
        html += `<div class="card"><div style="font-weight:600;margin-bottom:0.75rem;">Runde ${round}</div>`;
        for (const msg of byRound[round]) {
          const content = isEncryptionOn() && msg.content ? '🔒 verschlüsselt' : esc(msg.content);
          html += `
            <div style="margin-bottom:0.75rem;">
              <div style="font-size:0.85rem;color:var(--accent);font-weight:600;margin-bottom:0.25rem;">${esc(msg.sender)}</div>
              <div style="font-size:0.9rem;color:var(--text-secondary);white-space:pre-wrap;">${content}</div>
              ${msg.tokens ? `<div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.25rem;">${msg.tokens} Tokens</div>` : ''}
            </div>
          `;
        }
        html += '</div>';
      }
      
      html += '</div>';
    }
    
    html += `
      <form id="run-form" style="display:flex;gap:0.75rem;align-items:flex-end;">
        <textarea name="task" rows="2" placeholder="Aufgabe beschreiben..." style="flex:1;" required></textarea>
        <button type="submit" class="btn-primary">Starten</button>
      </form>
      <div id="run-status"></div>
    `;
    
    html += '</div>';
  }
  
  html += '</div>';
  
  root.innerHTML = html; root.querySelectorAll('[data-typing-goal]').forEach(t => setupTyping(t)); root.querySelectorAll('form input[type=text]').forEach(i => { i.setAttribute('autocorrect', 'on'); i.setAttribute('spellcheck', 'true'); i.setAttribute('lang', 'de'); i.addEventListener('keydown', e => { if (e.key === 'Enter' && isTouchDevice()) e.preventDefault(); }); });
  
  if (!activeGroup) {
    root.querySelectorAll('[data-open-group]').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.openGroup;
        activeGroup = await fetchGroup(id);
        render(root);
      });
    });
    
    const groupForm = root.querySelector('#group-form');
    if (groupForm) {
      const membersList = root.querySelector('#members-list');
      const draft = { coord: getDefaultModel(), members: [] };
      const coordModels = MODELS.filter(m => !m.id.startsWith('venice') || isAdult());
      const drawCoord = () => { root.querySelector('#coord-chips').innerHTML = coordModels.map(m => `<button type="button" class="chip-pick${draft.coord === m.id ? ' on' : ''}" data-coord="${esc(m.id)}">${esc(m.label)}</button>`).join(''); };
      const cands = () => [
        ...getProfiles().filter(p => p.enabled !== false && (!p.adult || isAdult())).map(p => ({ key: 'p:' + p.id, name: p.name, avatar: p.avatar || '👤', model: p.model || getDefaultModel(), box: '#pick-profiles' })),
        ...coordModels.map(m => ({ key: 'm:' + m.id, name: m.label, avatar: '🤖', model: m.id, box: '#pick-models' })),
      ];
      const drawPick = () => {
        for (const box of ['#pick-profiles', '#pick-models']) root.querySelector(box).innerHTML = cands().filter(c => c.box === box).map(c => `<button type="button" class="chip-pick${draft.members.some(m => m.key === c.key) ? ' on' : ''}" data-add="${esc(c.key)}">${c.avatar} ${esc(c.name)}</button>`).join('');
        membersList.innerHTML = draft.members.map((m, i) => `<div class="member-card"><div class="mc-head"><span>${m.avatar} ${esc(m.name)} <small style="opacity:.6;font-weight:400">${esc(modelLabel(m.model))}</small></span><button type="button" class="btn-icon" data-rm="${i}" aria-label="Entfernen">✕</button></div>
          <div class="hint" style="margin:4px 0">Rolle</div>${ROLES.map(r => `<button type="button" class="chip-pick${m.role === r ? ' on' : ''}" data-role="${i}" data-r="${r}">${r}</button>`).join('')}
          <input type="text" data-custom="${i}" placeholder="…oder eigene Rolle eingeben" value="${ROLES.includes(m.role) ? '' : esc(m.role)}" style="margin-top:6px"></div>`).join('');
      };
      drawCoord(); drawPick();
      groupForm.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.coord) { draft.coord = b.dataset.coord; drawCoord(); }
        else if (b.dataset.add) {
          const i = draft.members.findIndex(m => m.key === b.dataset.add);
          if (i >= 0) draft.members.splice(i, 1);
          else if (draft.members.length >= 5) return toast('Maximal 5 Mitglieder', 'warning');
          else draft.members.push({ ...cands().find(c => c.key === b.dataset.add), role: 'Entwickler' });
          drawPick();
        } else if (b.dataset.rm) { draft.members.splice(+b.dataset.rm, 1); drawPick(); }
        else if (b.dataset.role) { draft.members[+b.dataset.role].role = b.dataset.r; drawPick(); }
      });
      groupForm.addEventListener('input', (e) => { const i = e.target.dataset.custom; if (i != null && e.target.value.trim()) draft.members[+i].role = e.target.value.trim(); });
      groupForm._draft = draft;
      groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!groupForm._draft.members.length) return toast('Bitte mindestens ein Mitglied antippen', 'warning');
        await createGroup(new FormData(groupForm), groupForm._draft);
      });
    }
  } else {
    const backBtn = root.querySelector('#back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        activeGroup = null;
        render(root);
      });
    }
    
    const deleteBtn = root.querySelector('#delete-group');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Gruppe wirklich löschen?')) {
          try {
            await api(`/api/kollab/groups/${activeGroup.id}`, { method: 'DELETE' });
            activeGroup = null;
            await load();
            render(root);
            toast('Gruppe gelöscht');          } catch (err) {
            toast(err.message || 'Fehler', 'error');
          }
        }
      });
    }
    const runForm = root.querySelector('#run-form');
    if (runForm) setupTyping(runForm.querySelector('textarea[name=task]'), () => runForm.requestSubmit());
    if (runForm) runForm.addEventListener('submit', (e) => {
      e.preventDefault();
      runTask(root, new FormData(runForm).get('task'));
    });
  }
}

async function fetchGroup(id) {
  const r = await api(`/api/kollab/groups/${id}`);
  return { ...r.group, members: r.members || [], messages: r.messages || [] };
}

async function createGroup(fd, draft) {
  const members = draft.members.map(m => ({ name: m.name, role: m.role || 'Entwickler', model: m.model })).slice(0, 5);
  try {
    await api('/api/kollab/groups', { method: 'POST', body: { name: fd.get('name'), goal: fd.get('goal'), coordinator_model: draft.coord, members } });
    toast('Gruppe erstellt');
    await load();
    render(rootEl || document.querySelector('.view-inner') || document.body);
  } catch (err) { toast(err.message || 'Fehler', 'error'); }
}

function isEncryptionOn() {
  try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}').encrypt === true; } catch { return false; }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg; c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function runTask(root, task) {
  const status = root.querySelector('#run-status');
  const btn = root.querySelector('#run-form button');
  if (btn) btn.disabled = true;
  let tokens = 0;
  status.innerHTML = '<div class="hint">⏳ Läuft… <span id="tok">0</span> Tokens</div><div id="live" style="display:flex;flex-direction:column;gap:.5rem;margin-top:.5rem"></div>';
  const live = status.querySelector('#live');
  const add = (ev) => {
    const d = document.createElement('div'); d.className = 'card';
    const body = isEncryptionOn() ? '🔒 verschlüsselt' : esc(ev.type === 'plan' ? safePlan(ev.content) : ev.content);
    d.innerHTML = `<div style="font-size:.8rem;color:var(--accent);font-weight:600">${esc(ev.sender || ev.type)}${ev.round ? ` · Runde ${ev.round}` : ''}${ev.type === 'summary' ? ' · Zusammenfassung' : ''}</div><div style="white-space:pre-wrap;font-size:.9rem">${body}</div>`;
    live.appendChild(d);
  };
  try {
    const h = { 'content-type': 'application/json' };
    const s = getSession(); if (s) h.authorization = 'Bearer ' + s;
    if (isEncryptionOn()) h['x-jeffa-private'] = '1';
    const res = await fetch(`/api/kollab/groups/${activeGroup.id}/run`, { method: 'POST', headers: h, body: JSON.stringify({ task }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error?.message || `HTTP ${res.status}`); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.tokens) { tokens += ev.tokens; const t = status.querySelector('#tok'); if (t) t.textContent = tokens; }
        if (ev.type === 'error') toast(ev.content || 'Fehler', 'error');
        else if (ev.type !== 'done') add(ev);
      }
    }
    activeGroup = await fetchGroup(activeGroup.id);
    render(root);
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
    if (btn) btn.disabled = false;
  }
}
function safePlan(c) {
  try { return JSON.parse(c).map((t, i) => `${i + 1}. ${t.member || t.name || ''}: ${t.task || t.subtask || JSON.stringify(t)}`).join('\n'); } catch { return c; }
}
