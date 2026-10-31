import { api } from './shared/api.js';
import { ensureAdmin, registerWebAuthn, setupPin, authState, logout } from './shared/auth.js';

let keys = [];
let tokens = [];
let docs = [];
let state = null;

export async function init(root) {
  if (!root.children.length) root.innerHTML = '<div class="hint loading-ind" role="status">⏳ Tresor wird geladen…</div>';
  state = await authState();
  
  if (!state.session || state.session.role !== 'admin') {
    root.innerHTML = `
      <div class="hint">Der Tresor benötigt Admin-Zugriff.</div>
      <button class="btn-primary" id="unlock-btn">Entsperren</button>
    `;
    root.querySelector('#unlock-btn').addEventListener('click', async () => {
      const session = await ensureAdmin();
      if (session) {
        state.session = session;
        init(root);
      }
    });
    return;
  }
  
  await load();
  render(root);
}

async function load() {
  try {
    keys = await api('/api/vault/keys', { auth: true });
    tokens = await api('/api/auth/tokens', { auth: true });
    docs = await api('/api/docs', { auth: true }).catch(() => []);
  } catch (err) {
    toast(err.message || 'Fehler beim Laden', 'error');
  }
}

let _root = null; // v80: letzter Mount-Root (.view-inner gibt es nicht mehr → null-Fehler auf iPhone)
function render(root) {
  root = root || _root || document.querySelector('.view-inner'); if (!root) return; _root = root;
  const providers = ['gemini', 'openrouter', 'venice', 'hf', 'xai', 'vnaipro', 'groq', 'mistral', 'runware'];
  
  let html = '<div style="display:flex;flex-direction:column;gap:2rem;">';
  
  html += '<div><h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">API-Schlüssel</h2>';
  html += '<div style="display:flex;flex-direction:column;gap:0.75rem;">';
  
  for (const p of providers) {
    const key = keys.find(k => k.provider === p);
    const source = key ? key.source : 'none';
    const enabled = key ? key.enabled : false;
    const last4 = key?.last4 || '';
    
    html += `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
        <div style="flex:1;">
          <div style="font-weight:600;margin-bottom:0.25rem;">${getProviderName(p)}</div>
          <div style="font-size:0.85rem;color:var(--text-secondary);">
            ${source === 'vault' ? `Vault ${enabled ? '(aktiv)' : '(deaktiviert)'}` : source === 'env' ? 'Env Secret' : 'Nicht konfiguriert'}
            ${last4 ? ` · ···${last4}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          ${source !== 'none' ? `<button class="btn-secondary" data-reveal="${p}" style="padding:0.5rem 0.75rem;font-size:0.85rem;">Anzeigen</button>` : ''}
          <button class="btn-secondary" data-edit="${p}" style="padding:0.5rem 0.75rem;font-size:0.85rem;">${source === 'none' ? 'Hinzufügen' : 'Ändern'}</button>
          ${source === 'vault' ? `<button class="btn-icon" data-delete="${p}" style="width:2rem;height:2rem;font-size:0.9rem;">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }
  
  html += '</div></div>';
  
  html += '<div><h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">Authentifizierung</h2>';
  html += '<div style="display:flex;flex-direction:column;gap:0.75rem;">';
  
  html += `
    <div class="card">
      <div style="font-weight:600;margin-bottom:0.5rem;">Face ID / Touch ID</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">
        ${state.passkeys > 0 ? `${state.passkeys} Passkey${state.passkeys > 1 ? 's' : ''} registriert` : 'Kein Passkey registriert'}
      </div>
      <button class="btn-primary" id="register-passkey">Neuen Passkey registrieren</button>
    </div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:0.5rem;">PIN</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">
        ${state.pinSet ? 'PIN ist gesetzt' : 'Kein PIN gesetzt'}
      </div>
      <button class="btn-primary" id="setup-pin">${state.pinSet ? 'PIN ändern' : 'PIN einrichten'}</button>
    </div>
  `;
  
  html += '</div></div>';
  
  html += '<div><h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">App-Zugänge</h2>';
  html += '<div style="display:flex;flex-direction:column;gap:0.75rem;">';
  
  if (tokens.length > 0) {
    for (const tok of tokens) {
      html += `
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
          <div style="flex:1;">
            <div style="font-weight:600;margin-bottom:0.25rem;">${esc(tok.label)}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">
              ${tok.role === 'admin' ? 'Admin' : 'Nur lesen'} · ${formatDate(tok.createdAt)}
            </div>
          </div>
          <button class="btn-icon" data-revoke="${tok.id}" style="width:2rem;height:2rem;font-size:0.9rem;">🗑️</button>
        </div>
      `;
    }
  } else {
    html += '<div class="hint">Keine App-Zugänge erstellt.</div>';
  }
  
  html += `
    <div class="card">
      <h3 style="font-size:0.95rem;font-weight:600;margin-bottom:1rem;">Neuen Zugang erstellen</h3>
      <form id="token-form" style="display:flex;flex-direction:column;gap:0.75rem;">
        <input type="text" name="label" placeholder="Name (z.B. iPhone)" required>
        <select name="role">
          <option value="admin">Admin</option>
          <option value="read">Nur lesen</option>
        </select>
        <button type="submit" class="btn-primary">Erstellen</button>
      </form>
    </div>
  `;
  
  html += '</div></div>';
  
  html += '<div><h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;">📄 Konzepte</h2>';
  html += docs.length ? docs.map(d => `<details class="card" data-doc="${esc(d.slug)}"><summary style="cursor:pointer;font-weight:600;">${esc(d.title)} <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:400;">· ${new Date(d.updated_at).toLocaleString('de-DE')}</span></summary><div class="doc-body" style="margin-top:0.75rem;">⏳</div></details>`).join('') : '<div class="hint">Noch keine Konzepte.</div>';
  html += '</div>';

  html += '<button class="btn-danger" id="logout-btn">Abmelden</button>';
  
  html += '</div>';
  
  root.innerHTML = html;
  root.querySelectorAll('details[data-doc]').forEach(el => {
    el.addEventListener('toggle', async () => {
      if (!el.open || el.dataset.loaded) return;
      const body = el.querySelector('.doc-body');
      try {
        const d = await api('/api/docs/' + encodeURIComponent(el.dataset.doc), { auth: true });
        body.innerHTML = mdToHtml(d.body_md);
        el.dataset.loaded = '1';
      } catch (e) { body.textContent = e.message || 'Fehler'; }
    });
  });
  
  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await editKey(btn.dataset.edit);
    });
  });
  
  root.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await revealKey(btn.dataset.reveal);
    });
  });
  
  root.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Schlüssel wirklich löschen?')) {
        await deleteKey(btn.dataset.delete);
      }
    });
  });
  
  const passkeyBtn = root.querySelector('#register-passkey');
  if (passkeyBtn) {
    passkeyBtn.addEventListener('click', async () => {
      try {
        await registerWebAuthn();
        toast('Passkey registriert');
        state = await authState();
        render(root);
      } catch (err) {
        toast(err.message || 'Fehler', 'error');
      }
    });
  }
  
  const pinBtn = root.querySelector('#setup-pin');
  if (pinBtn) {
    pinBtn.addEventListener('click', async () => {
      const pin = prompt('PIN eingeben (4 Ziffern):');
      if (pin && /^\d{4}$/.test(pin)) {
        try {
          await setupPin(pin);
          toast('PIN gespeichert');
          state = await authState();
          render(root);
        } catch (err) {
          toast(err.message || 'Fehler', 'error');
        }
      }
    });
  }
  
  const tokenForm = root.querySelector('#token-form');
  if (tokenForm) {
    tokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await createToken(new FormData(tokenForm));
    });
  }
  
  root.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Zugang wirklich widerrufen?')) {
        await revokeToken(btn.dataset.revoke);
      }
    });
  });
  
  const logoutBtn = root.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      location.hash = '#home';
    });
  }
}

async function editKey(provider) {
  const value = prompt(`API-Schlüssel für ${getProviderName(provider)}:`);
  if (!value) return;
  
  try {
    await api(`/api/vault/keys/${provider}`, {
      method: 'PUT',
      body: { value, enabled: true },
      auth: true
    });
    await load();
    render(document.querySelector('.view-inner'));
    toast('Schlüssel gespeichert');
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
  }
}

async function revealKey(provider) {
  try {
    const session = await ensureAdmin();
    if (!session) return;
    
    const result = await api('/api/vault/reveal', {
      method: 'POST',
      body: { provider },
      auth: true
    });
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${getProviderName(provider)}</div>
        <div class="modal-body">
          <input type="text" value="${esc(result.value)}" readonly style="width:100%;font-family:monospace;font-size:0.85rem;">
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="copy-key">Kopieren</button>
          <button class="btn-primary" id="close-reveal">Schließen</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.querySelector('#copy-key').addEventListener('click', () => {
      navigator.clipboard.writeText(result.value);
      toast('Kopiert');
    });
    
    const close = () => overlay.remove();
    overlay.querySelector('#close-reveal').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    
    setTimeout(close, 30000);
  } catch (err) {
    if (err.code === 'reauth_required') {
      toast('Erneute Authentifizierung erforderlich', 'error');
    } else {
      toast(err.message || 'Fehler', 'error');
    }
  }
}

async function deleteKey(provider) {
  try {
    await api(`/api/vault/keys/${provider}`, { method: 'DELETE', auth: true });
    await load();
    render(document.querySelector('.view-inner'));
    toast('Schlüssel gelöscht');
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
  }
}

async function createToken(formData) {
  const data = Object.fromEntries(formData.entries());
  
  try {
    const result = await api('/api/auth/tokens', {
      method: 'POST',
      body: data,
      auth: true
    });
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Neuer Zugang erstellt</div>
        <div class="modal-body">
          <p style="margin-bottom:0.75rem;color:var(--text-secondary);">Speichere diesen Token sicher. Er wird nur einmal angezeigt.</p>
          <input type="text" value="${esc(result.token)}" readonly style="width:100%;font-family:monospace;font-size:0.85rem;">
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="copy-token">Kopieren</button>
          <button class="btn-primary" id="close-token">Fertig</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.querySelector('#copy-token').addEventListener('click', () => {
      navigator.clipboard.writeText(result.token);
      toast('Kopiert');
    });
    
    const close = () => {
      overlay.remove();
      load().then(() => render(document.querySelector('.view-inner')));
    };
    overlay.querySelector('#close-token').addEventListener('click', close);
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
  }
}

async function revokeToken(id) {
  try {
    await api(`/api/auth/tokens/${id}`, { method: 'DELETE', auth: true });
    await load();
    render(document.querySelector('.view-inner'));
    toast('Zugang widerrufen');
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
  }
}

function getProviderName(key) {
  const map = {
    gemini: 'Gemini',
    openrouter: 'OpenRouter',
    venice: 'Venice',
    hf: 'Hugging Face',
    xai: 'xAI',
    vnaipro: 'Claude Gateway (VNAIPro)',
    groq: 'Groq',
    mistral: 'Mistral',
    runware: 'Runware'
  };
  return map[key] || key;
}

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

// Minimal, escaped Markdown -> HTML (read-only Konzepte).
export function mdToHtml(md) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(https:\/\/[^\s<"']+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null; let table = null;
  const flush = () => { if (list) { out.push(`<${list.t}>${list.items.join('')}</${list.t}>`); list = null; } if (table) { out.push('<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size:0.85rem;">' + table.map((r, i) => '<tr>' + r.map(c => `<${i ? 'td' : 'th'} style="border:1px solid var(--border,#444);padding:0.25rem 0.4rem;text-align:left;">${inline(c)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table></div>'); table = null; } };
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd(); let m;
    if (/^\|.*\|$/.test(line.trim())) { if (list) flush(); if (/^\|[\s|:-]+\|$/.test(line.trim())) continue; (table ||= []).push(line.trim().slice(1, -1).split('|').map(c => c.trim())); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flush(); const n = m[1].length + 2; out.push(`<h${n} style="margin:0.75rem 0 0.4rem;">${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)/))) { if (table) flush(); const t = m[1] ? 'ol' : 'ul'; if (list && list.t !== t) flush(); (list ||= { t, items: [] }).items.push(`<li>${inline(m[2])}</li>`); continue; }
    flush(); if (line.trim()) out.push(`<p style="margin:0.4rem 0;">${inline(line)}</p>`);
  }
  flush(); return out.join('');
}
