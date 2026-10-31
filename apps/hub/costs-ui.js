import { api } from './shared/api.js';
import { authState, ensureAdmin } from './shared/auth.js';
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function renderCosts(el) {
  el.innerHTML = '<div class="hint">Lade Kosten…</div>';
  let data;
  try {
    data = await api('/api/costs', { auth: true });
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      el.innerHTML = '<div class="hint">🔒 Erst entsperren</div>';
      return;
    }
    el.innerHTML = `<div class="hint" style="color:var(--error)">Fehler: ${esc(e.message)}</div>`;
    return;
  }

  const ampelIcon = { green: '🟢', yellow: '🟡', red: '🔴', stop: '⛔' }[data.ampel] || '⚪';
  const fmt = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

  let html = `
    <div style="margin-top:1rem;padding:1rem;background:var(--card-bg);border-radius:8px">
      <div style="font-size:1.1rem;margin-bottom:0.75rem">
        ${ampelIcon} Heute ${fmt(data.today)} $ · Monat ${fmt(data.month)} $ · Prognose ${fmt(data.forecast)} $ von ${data.budget} $
      </div>
  `;

  if (Object.keys(data.byProvider).length > 0) {
    html += '<table style="width:100%;font-size:0.9rem;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:4px 0">Anbieter</th><th style="text-align:right;padding:4px 8px">Heute</th><th style="text-align:right;padding:4px 0">Monat</th></tr></thead><tbody>';
    for (const [name, val] of Object.entries(data.byProvider)) {
      html += `<tr><td style="padding:4px 0">${esc(name)}</td><td style="text-align:right;padding:4px 8px">${fmt(val.today)} $</td><td style="text-align:right;padding:4px 0">${fmt(val.month)} $</td></tr>`;
    }
    html += '</tbody></table>';
  }

  html += `
      <div style="margin-top:1rem">
        <label class="field-label">Monats-Budget</label>
        <select id="costs-budget">
          ${data.options.map(v => `<option value="${v}" ${v === data.budget ? 'selected' : ''}>${v} $</option>`).join('')}
        </select>
        <div class="hint">🟢 unter 50 % · 🟡 ab 50 % · 🔴 ab 80 % · ⛔ ab 100 % (GPU-Server gesperrt)</div><div class="hint" id="costs-msg"></div>
      </div>
    </div>
  `;

  let auth = null;
  try { auth = await authState(); } catch {}
  if (auth?.session) {
    html += `
      <div style="margin-top:1rem;padding:1rem;background:var(--card-bg);border-radius:8px">
        <h4 style="margin:0 0 0.75rem 0">🚀 Eigener GPU-Server</h4>
        <div style="margin-bottom:0.5rem">
          <label class="field-label">Anbieter</label>
          <select id="gpu-provider">
            ${data.gpu.providers.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:0.75rem;color:var(--text-secondary);font-size:0.9rem">
          Status: ${data.gpu.configured ? (data.gpu.state.on ? 'läuft' : 'aus') : 'nicht eingerichtet'}
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn-sm" id="gpu-start" ${data.ampel === 'stop' ? 'disabled' : ''}>Start</button>
          <button class="btn-sm secondary" id="gpu-stop">Stopp</button>
        </div>
        ${data.ampel === 'stop' ? '<div class="hint" style="margin-top:0.5rem;color:var(--error)">Monats-Budget erreicht</div>' : ''}
        <div class="hint" style="margin-top:0.75rem">Schaltet sich nach 30 Min ohne Nutzung automatisch aus.</div>
        <div id="gpu-msg" style="margin-top:0.5rem;font-size:0.9rem"></div>
      </div>
    `;
  } else {
    html += '<div class="hint" style="margin-top:1rem">🚀 GPU-Server nur nach Entsperren verfügbar</div>';
  }

  el.innerHTML = html;

  const budgetSel = el.querySelector('#costs-budget');
  if (budgetSel) {
    budgetSel.onchange = async () => {
      try {
        if (!(await ensureAdmin())) { budgetSel.value = String(data.budget); return; }
        await api('/api/costs', { method: 'POST', body: { budget: parseInt(budgetSel.value, 10) } });
        data.budget = parseInt(budgetSel.value, 10);
        el.querySelector('#costs-msg').textContent = '✅ Budget gespeichert';
        renderCosts(el);
      } catch (e) {
        el.querySelector('#costs-msg').textContent = '❌ Fehler: ' + e.message;
      }
    };
  }

  const gpuMsg = el.querySelector('#gpu-msg');
  const startBtn = el.querySelector('#gpu-start');
  const stopBtn = el.querySelector('#gpu-stop');
  const providerSel = el.querySelector('#gpu-provider');

  if (startBtn) {
    startBtn.onclick = async () => {
      try {
        if (!(await ensureAdmin())) return;
        gpuMsg.textContent = 'Prüfe Budget…';
        await api('/api/gpu', { method: 'POST', body: { action: 'start', provider: providerSel.value } });
        gpuMsg.textContent = '✅ Server gestartet';
      } catch (e) {
        if (e.status === 402) {
          gpuMsg.textContent = '⛔ Monats-Budget erreicht – GPU-Server gesperrt';
        } else if (e.status === 503) {
          gpuMsg.textContent = '⚠️ Noch nicht eingerichtet';
        } else {
          gpuMsg.textContent = '❌ Fehler: ' + e.message;
        }
      }
    };
  }

  if (stopBtn) {
    stopBtn.onclick = async () => {
      try {
        if (!(await ensureAdmin())) return;
        await api('/api/gpu', { method: 'POST', body: { action: 'stop', provider: providerSel.value } });
        gpuMsg.textContent = '✅ Server gestoppt';
      } catch (e) {
        gpuMsg.textContent = '❌ Fehler: ' + e.message;
      }
    };
  }
}
