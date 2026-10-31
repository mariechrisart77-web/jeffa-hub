import { parseSessionHash, costOf, buildBody, buildPreviewBody } from './core.js';

const SCENES = ['Café', 'Strand bei Sonnenuntergang', 'Bibliothek', 'Stadtpark', 'Küche', 'Bahnhof', 'Bergsee', 'Neon-Straße bei Nacht'];

let session = localStorage.getItem('jeffa.bild.session') || '';
let lastSeed = null;
let totalCost = 0;
let results = [];

async function apiCall(path, options = {}) {
  const auth = session ? 'Bearer ' + session : null;
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { 'authorization': auth } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  
  if (res.status === 401) {
    showLoginRequired();
    throw new Error('Unauthorized');
  }
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.error?.message || data.error || `HTTP ${res.status}`;
    const code = data.error?.code || 'http_error';
    throw new Error(msg, { cause: code });
  }
  
  return res.json();
}

function showLoginRequired() {
  const card = document.createElement('div');
  card.className = 'error-card';
  card.innerHTML = `
    <strong>Authentifizierung erforderlich</strong>
    <p>Bitte öffne die Bild-App über <a href="https://jeffa-hub.pages.dev/" target="_blank" rel="noopener">Jeffa Hub</a> → 🖼 Bild-App</p>
  `;
  document.getElementById('results').insertBefore(card, document.getElementById('results').firstChild);
}

async function loadProfiles() {
  try {
    const data = await apiCall('/api/profiles');
    const profiles = Array.isArray(data) ? data : [];
    const select = document.getElementById('profile-select');
    const currentValue = select.value;
    select.innerHTML = '<option value="none">Ohne Profil (freie Szene)</option>';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    select.value = currentValue || 'none';
  } catch (e) {
    console.warn('Failed to load profiles:', e);
  }
}

function updateCostPreview() {
  const mode = document.getElementById('mode-select').value;
  const quality = document.getElementById('quality-select').value;
  const panels = parseInt(document.getElementById('panels-select').value) || 2;
  const adult = document.getElementById('fsk18-checkbox').checked;
  const cost = costOf(mode, quality, panels, adult);
  const label = mode === 'comic' ? `Comic ${panels}× · ≈ ${cost.toFixed(2)} $` : mode === 'stil-test' ? `3 Stile · ≈ ${cost.toFixed(2)} $` : `1 Bild · ≈ ${cost.toFixed(2)} $`;
  document.getElementById('cost-preview').textContent = label;
  document.getElementById('total-cost').textContent = `Gesamt: ≈ ${totalCost.toFixed(2)} $`;
}

function updateUI() {
  updateCostPreview();
  const profile = document.getElementById('profile-select').value;
  const panelsDiv = document.getElementById('panels-div');
  panelsDiv.style.display = profile !== 'none' ? 'block' : 'none';
}

async function generate() {
  const mode = document.getElementById('mode-select').value;
  const profile = document.getElementById('profile-select').value;
  const style = document.getElementById('style-select').value;
  const quality = document.getElementById('quality-select').value;
  const scene = document.getElementById('scene-select').value;
  const ownScene = document.getElementById('own-scene-input').value.trim();
  const adult = document.getElementById('fsk18-checkbox').checked;
  const seed = document.getElementById('seed-select').value;
  const panels = parseInt(document.getElementById('panels-select').value) || 2;
  
  const generateBtn = document.getElementById('generate-btn');
  const spinner = document.getElementById('spinner');
  generateBtn.disabled = true;
  spinner.style.display = 'block';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);
  
  try {
    const format = document.getElementById('format-select')?.value || 'hoch';
    // Story continuity: reuse the newest chat conversation of the selected profile (same origin as the chat).
    let messages, conversationId;
    if (profile && profile !== 'none') {
      try {
        const raw = localStorage.getItem('jeffa.conversations');
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.conversations) ? parsed.conversations : []);
          const mine = list.filter(c => c && c.profileId === profile)
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
          const newest = mine[0];
          if (newest) {
            conversationId = newest.id;
            messages = (newest.messages || []).filter(m => !m.generated && m.content).slice(-6)
              .map(m => ({ role: m.role, content: String(m.content || ''), generated: !!m.generated }));
          }
        }
      } catch (e) { console.warn('Konversationen nicht lesbar:', e); }
    }
    const state = { mode, profile, style, quality, seed, scene, ownScene, adult, panels, format, messages, conversationId, lastSeed };
    const body = buildBody(state);
    
    if (mode === 'comic') {
      // Comic: N Requests nacheinander
      const cameras = ['medium shot', 'close-up', 'wide shot', 'over-the-shoulder'];
      for (let i = 0; i < panels; i++) {
        const ctx = { ...body.context, camera: cameras[i % cameras.length] };
        const reqBody = { ...body, context: ctx };
        const result = await apiCall('/api/image', { method: 'POST', body: reqBody, signal: controller.signal });
        addResult(result, body);
      }
    } else if (mode === 'stil-test') {
      // 3 Stile: real, anime, comic
      const styles = ['real', 'anime', 'comic'];
      for (const s of styles) {
        const reqBody = { ...body, style: s };
        const result = await apiCall('/api/image', { method: 'POST', body: reqBody, signal: controller.signal });
        addResult(result, body);
      }
    } else {
      // Einzelbild
      const result = await apiCall('/api/image', { method: 'POST', body, signal: controller.signal });
      addResult(result, body);
    }
    
    if (seed === 'zufall') {
      lastSeed = results[results.length - 1]?.seed || null;
    }
  } catch (e) {
    if (e.message === 'Unauthorized') return;
    const isTimeout = controller.signal.aborted && !e.message.includes('Unauthorized');
    const card = document.createElement('div');
    card.className = 'error-card';
    card.innerHTML = `<strong>${isTimeout ? 'Zeitüberschreitung (90 s)' : 'Fehler'}</strong><p>${e.message}</p>`;
    document.getElementById('results').insertBefore(card, document.getElementById('results').firstChild);
  } finally {
    clearTimeout(timeoutId);
    generateBtn.disabled = false;
    spinner.style.display = 'none';
  }
}

function addResult(result, body) {
  const item = {
    image: result.url || result.image,
    model: result.model || 'unknown',
    cost: result.cost || costOf('single', document.getElementById('quality-select').value),
    seed: result.seed,
    prompt: result.prompt || body.prompt || body.context?.scene
  };
  results.unshift(item);
  totalCost += item.cost;
  renderResults();
}

function renderResults() {
  const container = document.getElementById('results');
  container.innerHTML = `<div class="cost-summary">Gesamt: ≈ ${totalCost.toFixed(2)} $</div>`;
  results.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <img src="${item.image}" alt="Bild ${idx + 1}">
      <div class="result-meta">${item.model} · ${item.cost.toFixed(2)} $ · Seed ${item.seed || '?'}</div>
      <details>
        <summary>Prompt</summary>
        <pre>${item.prompt || 'N/A'}</pre>
      </details>
      <div class="result-actions">
        <button class="btn-sm" data-download="${idx}" title="Speichern">⬇</button>
        <button class="btn-sm" data-reseed="${idx}" title="Gleicher Seed">🔁</button>
      </div>
    `;
    container.appendChild(card);
  });
  
  container.querySelectorAll('[data-download]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.download);
      const dataUrl = results[idx].image;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `bild-${idx}.png`;
      a.click();
    });
  });
  
  container.querySelectorAll('[data-reseed]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.reseed);
      document.getElementById('seed-select').value = results[idx].seed || 'zufall';
      updateUI();
    });
  });
}

function setupEventListeners() {
  document.getElementById('mode-select').addEventListener('change', updateUI);
  document.getElementById('profile-select').addEventListener('change', updateUI);
  document.getElementById('quality-select').addEventListener('change', updateUI);
  document.getElementById('style-select').addEventListener('change', updateUI);
  document.getElementById('panels-select').addEventListener('change', updateUI);
  document.getElementById('fsk18-checkbox').addEventListener('change', () => {
    localStorage.setItem('jeffa.bild.fsk18', document.getElementById('fsk18-checkbox').checked);
    updateUI();
  });
  document.getElementById('generate-btn').addEventListener('click', generate);
}

async function previewRequest() {
  const profile = document.getElementById('profile-select').value;
  const style = document.getElementById('style-select').value;
  const quality = document.getElementById('quality-select').value;
  const scene = document.getElementById('scene-select').value;
  const ownScene = document.getElementById('own-scene-input').value.trim();
  const adult = document.getElementById('fsk18-checkbox').checked;
  const seed = document.getElementById('seed-select').value;
  const format = document.getElementById('format-select')?.value || 'hoch';
  if (!profile || profile === 'none') {
    alert('Prompt-Vorschau ist nur für Profile verfügbar (Server-Pipeline).');
    return;
  }
  let messages, conversationId;
  try {
    const raw = localStorage.getItem('jeffa.conversations');
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.conversations) ? parsed.conversations : []);
      const newest = list.filter(c => c && c.profileId === profile).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      if (newest) {
        conversationId = newest.id;
        messages = (newest.messages || []).filter(m => !m.generated && m.content).slice(-6).map(m => ({ role: m.role, content: String(m.content || ''), generated: false }));
      }
    }
  } catch (e) { console.warn('Konversationen nicht lesbar:', e); }
  const state = { mode: 'single', profile, style, quality, seed, scene, ownScene, adult, panels: 2, format, messages, conversationId, lastSeed };
  const body = buildPreviewBody(state);
  const out = document.getElementById('preview-output');
  if (out) { out.style.display = 'block'; out.innerHTML = '<p class="hint">⏳ Vorschau …</p>'; }
  try {
    const r = await apiCall('/api/image', { method: 'POST', body });
    if (!out) return;
    const notes = Array.isArray(r?.notes) ? r.notes : (Array.isArray(r?.abgleich) ? r.abgleich : []);
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    out.innerHTML = `<details open><summary>Vorschau – ${esc(r?.model || '?')} · Seed ${esc(String(r?.seed ?? '?'))}</summary>`
      + `<div><strong>Prompt:</strong><pre style="white-space:pre-wrap">${esc(r?.prompt || '')}</pre></div>`
      + `<div><strong>Negative:</strong><pre style="white-space:pre-wrap">${esc(r?.negative || '')}</pre></div>`
      + (notes.length ? `<div><strong>Abgleich:</strong><ul>${notes.map((n) => `<li>${esc(String(n))}</li>`).join('')}</ul></div>` : '')
      + `</details>`;
  } catch (e) { if (out) out.innerHTML = `<p class="hint">Fehler: ${String(e.message || e)}</p>`; }
}

export async function init() {
  const hashToken = parseSessionHash(location.hash);
  if (hashToken) {
    session = hashToken;
    localStorage.setItem('jeffa.bild.session', session);
    history.replaceState(null, '', location.pathname);
  }
  
  const fsk18 = localStorage.getItem('jeffa.bild.fsk18') === 'true';
  document.getElementById('fsk18-checkbox').checked = fsk18;
  
  // Populate scene dropdown
  const sceneSelect = document.getElementById('scene-select');
  SCENES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sceneSelect.appendChild(opt);
  });
  
  await loadProfiles();
  setupEventListeners();
  updateUI();
  // v74: Prompt-Vorschau-Button und -Ausgabe einhängen (ohne HTML-Datei zu ändern)
  const genBtn = document.getElementById('generate-btn');
  if (genBtn && !document.getElementById('preview-btn')) {
    const pv = document.createElement('button');
    pv.id = 'preview-btn';
    pv.className = 'btn-sm';
    pv.textContent = '🔎 Prompt-Vorschau';
    pv.style.marginLeft = '8px';
    pv.addEventListener('click', previewRequest);
    genBtn.parentNode.insertBefore(pv, genBtn.nextSibling);
    const out = document.createElement('div');
    out.id = 'preview-output';
    out.style.display = 'none';
    out.style.marginTop = '12px';
    genBtn.parentNode.insertBefore(out, pv.nextSibling);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// v64: scene presets instead of typing
import('./shared/quickfill.js').then((q) => q.quickfill(document, ['own-scene-input'])).catch(() => {});
