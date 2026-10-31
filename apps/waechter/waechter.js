import { api, getSession } from './shared/api.js';
import { balanceLabel } from './shared/balance.js';

const withTimeout = (pr, ms = 8000) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Zeitüberschreitung'), { code: 'timeout' })), ms))]);
let loadedOnce = false;

let activeDetail = null;
let rootEl = null;
let timer = null;
const state = {
  status: null,
  usage: null,
  balances: null,
  subscriptions: null
};

export async function mount(el) {
  rootEl = el;
  await load();
  if (!timer) timer = setInterval(() => { if (rootEl?.offsetParent) load(); }, 60000);
}
export function refresh() { return load(); }

async function init() {
  if (window.self !== window.top) {
    document.body.classList.add('embedded');
  }

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      load();
      toast('Aktualisiert');
    });
  }

  await load();
  setInterval(load, 60000);
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

async function load() {
  const root = rootEl || document.getElementById('root');
  if (!root) return;

  if (!loadedOnce && !root.innerHTML.trim()) root.innerHTML = '<div class="hint" style="margin:12px">⏳ Wächter lädt Status, Verbrauch und Guthaben …</div>';
  const errs = [];
  const get = (path, key) => withTimeout(api(path)).then((v) => { state[key] = key === 'subscriptions' && v && !Array.isArray(v) ? (v.subscriptions || []) : v; }).catch((e) => { errs.push(e); state[key] = state[key] ?? null; });
  // status first (public, fast) so the page never stays blank while slower calls run
  await get('/api/status', 'status');
  safeRender(root);
  await Promise.all([get('/api/usage?days=30', 'usage'), get('/api/balances', 'balances'), get('/api/subscriptions', 'subscriptions')]);
  loadedOnce = true;
  safeRender(root);
  const authErr = errs.some((e) => e?.code === 'unauthorized' || e?.code === 'forbidden');
  if (authErr || (!state.balances && !getSession())) root.insertAdjacentHTML('afterbegin', '<div class="card hint" style="margin:12px">🔒 Guthaben, Verbrauch & Abos sind nur nach dem Entsperren (Face ID / PIN) sichtbar.</div>');
  else if (errs.length) root.insertAdjacentHTML('afterbegin', `<div class="card hint" style="margin:12px">⚠️ Einige Daten konnten nicht geladen werden (${errs.map((e) => esc(e?.message || 'Fehler')).join(', ')}). Seite neu laden oder später erneut versuchen.</div>`);
}

function safeRender(root) {
  try { render(); }
  catch (err) {
    console.error('Wächter render failed', err);
    root.innerHTML = `<div class="card hint" style="margin:12px">⚠️ Der Wächter konnte nicht angezeigt werden: ${esc(err?.message || String(err))}</div>`;
  }
}

function render() {
  const root = rootEl || document.getElementById('root');
  if (!root) return;

  const providers = ['gemini', 'openrouter', 'venice', 'hf', 'xai', 'vnaipro', 'groq', 'mistral', 'runware'];
  const OPTIONAL = ['groq', 'mistral', 'runware']; // Ersatzanbieter: ohne Key nur grau "nicht eingerichtet"
  const media = ['edge-tts'];
  const infra = ['gateway', 'd1'];

  let html = '<div class="section"><h2 class="section-title">Provider</h2><div class="tiles" id="provider-tiles">';
  
  for (const p of providers) {
    const sk = p === 'gemini' ? 'google-ai-studio' : p;
    const statusOk = state.status?.providers?.[sk] || (p === 'xai' && state.status?.providers?.grok);
    const usageToday = state.usage?.providers?.[sk]?.today || state.usage?.providers?.[p]?.today || {};
    const balance = state.balances?.[p];
    
    let tileClass = 'tile';
    const notSetUp = !statusOk && OPTIONAL.includes(p);
    if (statusOk) tileClass += ' ok';
    else if (!notSetUp) tileClass += ' error';
    if (activeDetail === p) tileClass += ' active';
    
    const tokens = usageToday.promptTokens + usageToday.outputTokens || 0;
    // v84b: Guthaben-Zeile je Anbieter (nur wenn /api/balances geladen ist).
    const balText = state.balances ? '💰 ' + balanceLabel(balance) : '';
    
    html += `
      <div class="${tileClass}" data-provider="${p}">
        <div class="tile-status"></div>
        <div class="tile-name">${getProviderName(p)}</div>
        ${notSetUp ? '<div class="tile-info">nicht eingerichtet</div>' : ''}
        ${tokens > 0 ? `<div class="tile-info">${formatNumber(tokens)} heute</div>` : ''}
        ${balText ? `<div class="tile-info">${balText}</div>` : ''}
      </div>
    `;
  }
  
  html += '</div>';
  
  if (activeDetail && providers.includes(activeDetail)) {
    html += renderProviderDetail(activeDetail);
  }
  
  html += '</div>';
  
  html += '<div class="section"><h2 class="section-title">Medien & Infrastruktur</h2><div class="tiles" id="infra-tiles">';
  
  for (const i of [...media, ...infra]) {
    let statusOk = false;
    if (i === 'edge-tts') statusOk = true;
    if (i === 'gateway') statusOk = state.status?.gateway?.configured;
    if (i === 'd1') statusOk = state.status?.d1;
    
    let tileClass = 'tile';
    if (statusOk) tileClass += ' ok';
    else tileClass += ' warning';
    if (activeDetail === i) tileClass += ' active';
    
    html += `
      <div class="${tileClass}" data-provider="${i}">
        <div class="tile-status"></div>
        <div class="tile-name">${getProviderName(i)}</div>
      </div>
    `;
  }
  
  html += '</div>';
  
  if (activeDetail && [...media, ...infra].includes(activeDetail)) {
    html += renderInfraDetail(activeDetail);
  }
  
  html += '</div>';
  
  if (state.status?.backup) {
    const b = state.status.backup;
    const lastDate = b.lastRun ? new Date(b.lastRun).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Noch nie';
    const ageHours = b.lastRun ? (Date.now() - new Date(b.lastRun).getTime()) / 3600000 : 999;
    const backupIcon = b.ok && ageHours < 36 ? '✅' : '⚠️';
    const sizeKB = b.bytes ? Math.round(b.bytes / 1024) : 0;
    const restoreIcon = b.restore?.ok ? '✅' : (b.restore ? '⚠️' : '—');
    const restoreDate = b.restore?.at ? new Date(b.restore.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—';
    
    html += `
      <div class="section">
        <h2 class="section-title">💾 Backup</h2>
        <div class="card">
          <div style="margin-bottom:8px">Letztes Backup: ${lastDate} ${backupIcon} ${b.target ? `(${b.target.toUpperCase()}, ${sizeKB} KB)` : ''}</div>
          ${b.error ? `<div style="margin-bottom:8px;color:#ff6b6b">Fehler: ${esc(b.error)}</div>` : ''}
          <div>Restore-Test: ${restoreDate} ${restoreIcon}</div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="section">
        <h2 class="section-title">💾 Backup</h2>
        <div class="card hint">Noch kein Backup gelaufen</div>
      </div>
    `;
  }
  
  html += '<div class="section"><h2 class="section-title">🎁 Gratis-Angebote</h2>';
  html += renderGratis();
  html += '</div>';

  html += '<div class="section"><h2 class="section-title">Trials & Abos</h2>';
  html += renderTrials();
  html += '</div>';
  
  root.innerHTML = html;
  
  root.querySelectorAll('[data-provider]').forEach(tile => {
    tile.addEventListener('click', () => {
      const provider = tile.dataset.provider;
      activeDetail = activeDetail === provider ? null : provider;
      render();
    });
  });
  
  const trialsForm = root.querySelector('#trials-form');
  if (trialsForm) {
    trialsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await addTrial(new FormData(trialsForm));
    });
  }
  
  root.querySelectorAll('[data-delete-trial]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteTrial;
      if (confirm('Trial wirklich löschen?')) {
        await deleteTrial(id);
      }
    });
  });
}

function renderProviderDetail(provider) {
  const usage = state.usage?.providers?.[provider] || {};
  const usageToday = usage.today || {};
  const balance = state.balances?.[provider] || {};
  const statusData = state.status?.providers || {};
  const skName = provider === 'gemini' ? 'google-ai-studio' : provider;
  
  const keySource = statusData[skName] || statusData[provider] || (provider === 'xai' && statusData.grok) ? 'vault/env' : 'none';
  
  let html = `
    <div class="detail-panel">
      <div class="detail-header">
        <div class="detail-title">${getProviderName(provider)}</div>
        <button class="detail-close">✕</button>
      </div>
  `;
  
  html += '<div class="detail-section"><div class="detail-label">Nutzung heute</div><div class="detail-grid">';
  html += `<div class="detail-item"><div class="detail-item-label">Anfragen</div><div class="detail-item-value">${usageToday.requests || 0}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Prompt</div><div class="detail-item-value">${formatNumber(usageToday.promptTokens || 0)}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Output</div><div class="detail-item-value">${formatNumber(usageToday.outputTokens || 0)}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Kosten</div><div class="detail-item-value">$${(usageToday.costUsd || 0).toFixed(4)}</div></div>`;
  html += '</div></div>';
  
  html += '<div class="detail-section"><div class="detail-label">Nutzung 30 Tage</div><div class="detail-grid">';
  html += `<div class="detail-item"><div class="detail-item-label">Anfragen</div><div class="detail-item-value">${usage.requests || 0}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Prompt</div><div class="detail-item-value">${formatNumber(usage.promptTokens || 0)}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Output</div><div class="detail-item-value">${formatNumber(usage.outputTokens || 0)}</div></div>`;
  html += `<div class="detail-item"><div class="detail-item-label">Kosten</div><div class="detail-item-value">$${(usage.costUsd || 0).toFixed(4)}</div></div>`;
  html += '</div></div>';
  
  // v84b: Guthaben-Abschnitt immer zeigen (auch bei available:false mit Hinweistext), DIEM korrekt.
  html += '<div class="detail-section"><div class="detail-label">Guthaben</div>';
  html += `<div class="detail-value">${esc(balanceLabel(balance))}</div>`;
  if (balance.usedUsd != null) {
    html += `<div class="detail-value" style="margin-top:0.25rem;font-size:0.85rem;color:var(--text-secondary)">Genutzt: $${Number(balance.usedUsd).toFixed(2)}</div>`;
  }
  if (balance.limitUsd != null) {
    html += `<div class="detail-value" style="margin-top:0.25rem;font-size:0.85rem;color:var(--text-secondary)">Limit: $${Number(balance.limitUsd).toFixed(2)}</div>`;
  }
  if (balance.note && (balance.balanceUsd != null || balance.usedUsd != null)) {
    html += `<div class="detail-value" style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-tertiary)">${esc(balance.note)}</div>`;
  }
  html += '</div>';
  
  html += `<div class="detail-section">
    <div class="detail-label">Schlüssel</div>
    <div class="detail-value">${keySource === 'none' ? 'Nicht konfiguriert' : 'Konfiguriert'}</div>
    <a href="https://jeffa-hub.pages.dev/#tresor" class="detail-link">Schlüssel verwalten →</a>
  </div>`;
  
  if (provider === 'xai' && keySource === 'none') {
    html += '<div class="detail-section"><div class="hint">Hinweis: Die Grok-App selbst lässt sich nicht verbinden – nur die xAI-API (Schlüssel im Tresor).</div></div>';
  }
  
  html += '</div>';
  return html;
}

function renderInfraDetail(item) {
  let html = `
    <div class="detail-panel">
      <div class="detail-header">
        <div class="detail-title">${getProviderName(item)}</div>
        <button class="detail-close">✕</button>
      </div>
  `;
  
  if (item === 'gateway' && state.status?.gateway) {
    const gw = state.status.gateway;
    html += `<div class="detail-section">
      <div class="detail-label">Status</div>
      <div class="detail-value">${gw.configured ? 'Eingerichtet' : 'Nicht eingerichtet'}</div>
      ${gw.reachable ? `<div class="detail-value" style="margin-top:0.25rem;font-size:0.85rem;color:var(--text-secondary)">Erreichbar ${gw.latencyMs != null ? `(${gw.latencyMs} ms)` : ''}</div>` : ''}
    </div>`;
  }
  
  if (item === 'd1') {
    html += `<div class="detail-section">
      <div class="detail-label">Status</div>
      <div class="detail-value">${state.status?.d1 ? 'Verfügbar' : 'Nicht konfiguriert'}</div>
    </div>`;
  }
  
  if (item === 'edge-tts') {
    html += `<div class="detail-section">
      <div class="detail-label">Status</div>
      <div class="detail-value">Browser TTS & Edge TTS verfügbar</div>
    </div>`;
  }
  
  html += '</div>';
  return html;
}

function renderGratis() {
  const items = (state.subscriptions || []).filter(s => s.provider === 'gratis');
  if (!items.length) return '<div class="hint">Keine Gratis-Angebote erfasst.</div>';
  let html = '<div class="trials-list">';
  for (const g of items) {
    html += `
      <div class="trial-item">
        <div class="trial-info">
          <div class="trial-name">${esc(g.name)}</div>
          ${g.note ? `<div class="trial-meta">${esc(g.note)}</div>` : ''}
          <div class="trial-meta">geprüft ${formatDate(g.start_date)}</div>
        </div>
        <div class="trial-actions">
          ${g.cancel_url ? `<a href="${esc(g.cancel_url)}" target="_blank" rel="noopener" class="btn-secondary" style="padding:0.5rem 0.75rem;font-size:0.85rem;">Öffnen ↗</a>` : ''}
        </div>
      </div>`;
  }
  return html + '</div>';
}

function renderTrials() {
  const subs = (state.subscriptions || []).filter(s => s.provider !== 'gratis');
  const session = getSession();
  const canWrite = session && (session.role === 'admin');
  
  let html = '';
  
  if (subs.length > 0) {
    html += '<div class="trials-list">';
    for (const sub of subs) {
      const remaining = getRemainingDays(sub.end_date);
      const expiring = remaining != null && remaining <= 3;
      
      html += `
        <div class="trial-item ${expiring ? 'expiring' : ''}">
          <div class="trial-info">
            <div class="trial-name">${esc(sub.name)}</div>
            <div class="trial-meta">${esc(sub.provider)} · ${formatDate(sub.start_date)} – ${formatDate(sub.end_date)}</div>
            ${sub.note ? `<div class="trial-meta">${esc(sub.note)}</div>` : ''}
          </div>
          ${remaining != null ? `<div class="trial-remaining ${expiring ? 'expiring' : ''}">noch ${remaining} Tag${remaining === 1 ? '' : 'e'}</div>` : ''}
          <div class="trial-actions">
            ${sub.cancel_url ? `<a href="${esc(sub.cancel_url)}" target="_blank" class="btn-secondary" style="padding:0.5rem 0.75rem;font-size:0.85rem;">Kündigen ↗</a>` : ''}
            ${canWrite ? `<button class="btn-icon" data-delete-trial="${sub.id}" style="width:2rem;height:2rem;font-size:0.9rem;">🗑️</button>` : ''}
          </div>
        </div>
      `;
    }
    html += '</div>';
  } else {
    html += '<div class="hint">Keine Trials oder Abos erfasst.</div>';
  }
  
  if (canWrite) {
    html += `
      <form class="trial-form" id="trials-form">
        <input type="text" name="name" placeholder="Name (z.B. OpenRouter Plus)" required>
        <input type="text" name="provider" placeholder="Provider" required>
        <div class="trial-form-row">
          <input type="date" name="start_date" required>
          <input type="date" name="end_date" required>
        </div>
        <input type="url" name="cancel_url" placeholder="Kündigungs-URL (optional)">
        <textarea name="note" placeholder="Notiz (optional)" rows="2"></textarea>
        <button type="submit" class="btn-primary">Trial hinzufügen</button>
      </form>
    `;
  }
  
  return html;
}

async function addTrial(formData) {
  const data = Object.fromEntries(formData.entries());
  if (!data.cancel_url) delete data.cancel_url;
  if (!data.note) delete data.note;
  
  try {
    await api('/api/subscriptions', { method: 'POST', body: data, auth: true });
    { const v = await api('/api/subscriptions'); state.subscriptions = Array.isArray(v) ? v : (v?.subscriptions || []); }
    render();
    toast('Trial hinzugefügt');
  } catch (err) {
    toast(err.message || 'Fehler', 'error');
  }
}

async function deleteTrial(id) {
  try {
    await api(`/api/subscriptions/${id}`, { method: 'DELETE', auth: true });
    { const v = await api('/api/subscriptions'); state.subscriptions = Array.isArray(v) ? v : (v?.subscriptions || []); }
    render();
    toast('Trial gelöscht');
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
    runware: 'Runware',
    'edge-tts': 'Edge TTS',
    gateway: 'Gateway',
    d1: 'D1'
  };
  return map[key] || key;
}

function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getRemainingDays(endDateStr) {
  if (!endDateStr) return null;
  const end = new Date(endDateStr);
  const now = new Date();
  const diff = end - now;
  return Math.ceil(diff / 86400000);
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

if (!window.__JEFFA_UNIFIED && document.getElementById('refresh-btn')) init();
