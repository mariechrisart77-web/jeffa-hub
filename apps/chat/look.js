import { buildImagePrompt } from './profiles.js';
import { isAdult } from './shared/fsk.js';
import { optionsHtml, MY } from './photoopts.js';
import { availableStyles, getCustomStyles, saveCustomStyles } from './styles.js';

export function renderLookEditor(root, profile, onChange) {
  const l = profile.looks;
  const adult = isAdult(); profile.photo = profile.photo || {}; if (!profile.photo.render && (l.style === 'comic' || l.style === 'anime')) profile.photo.render = l.style; const ph = profile.photo; const refMode = (profile.refMode === 'full' ? 'figur' : profile.refMode) || (profile.refFace ? 'face' : ''); // v35: legacy full shown as figur
  
  root.innerHTML = `
    <div class="form-section">
      <div class="form-group">
        <label>Ausdruck</label>
        <select id="look-ausdruck">
          <option value="frei" ${l.ausdruck==='frei'?'selected':''}>Frei (aus der Geschichte)</option>
          ${l.presets.ausdruck.map(p=>`<option value="${p.id}" ${l.ausdruck===p.id?'selected':''}>${esc(p.label)}</option>`).join('')}
        </select>
        <button class="btn-icon preset-edit" data-type="ausdruck">✏️</button>
      </div>
      
      <div class="form-group">
        <label>Stil-Preset</label>
        <select id="look-stylepreset"></select>
        <div class="hint" id="look-styledesc"></div>
      </div>
      <div class="form-group" id="look-stylepose-wrap" style="display:none">
        <label>Pose (zum Stil)</label>
        <select id="look-stylepose"></select>
      </div>
      <div class="form-group">
        <label class="toggle-label"><input type="checkbox" id="look-autoprompt" ${l.autoPrompt?'checked':''}> <span>Prompt automatisch erstellen</span></label>
        <div class="hint">Wenn kein eigener Stil-Text gewählt ist, setzt eine KI den Bild-Prompt aus Profil, Stil, Pose, Chat-Kontext und Bild-Feedback zusammen.</div>
      </div>

      <details class="card" id="photo-box" open><summary>📸 Fotos von ${esc(profile.name || 'der Figur')}</summary>
        <div class="hint">„Frei“ = das Foto zeigt die aktuelle Szene der Geschichte. Eine feste Auswahl hat Vorrang vor der Szene.</div>
        <label>Foto zu Antworten (automatisch)<select id="ph-auto">${[['', 'Wie in den Einstellungen'], ['aus', 'Aus'], ['zufall', 'Zufällig manchmal'], ['immer', 'Zu jeder Antwort']].map(([v, t]) => `<option value="${v}" ${(ph.auto || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label id="ph-rate-w" style="${ph.auto === 'zufall' ? '' : 'display:none'}">Wie oft bei „Zufällig“<select id="ph-rate">${[['selten', 'Selten (etwa jede 7. Antwort)'], ['mittel', 'Mittel (etwa jede 3. Antwort)'], ['oft', 'Oft (etwa 3 von 5 Antworten)']].map(([v, t]) => `<option value="${v}" ${(ph.rate || 'mittel') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Bildqualität<select id="ph-quality">${[['spar', `Spar-Mix – 0,01 $ pro Bild (Standard${adult ? ', chroma' : ', z-image-turbo'})`], ['mittel', 'Mittel – qwen-image-2-1-turbo, ca. 0,02 $'], ['qualitaet', 'Qualität – qwen-image-3, ca. 0,04 $']].map(([v, t]) => `<option value="${v}" ${(ph.quality || 'spar') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>${adult ? '<small class="hint">🔞 FSK18: Bilder werden immer mit chroma gemalt (0,01 $), die Qualitätswahl gilt nur ohne FSK18.</small>' : ''}</label>
        ${[['outfit', 'Kleidung'], ['koerper', 'Körperdetails (18+)'], ['pose', 'Pose'], ['intensity', 'Pose-Intensität'], ['scene', 'Umgebung (legt ggf. Kleidung fest; Pose „Frei“ = passende Standard-Pose)'], ['light', 'Licht'], ['frame', 'Bildausschnitt'], ['mood', 'Stimmung'], ['render', 'Bildstil (ersetzt „Bildart“)']].map(([k, t]) => `<label>${t}<span class="ph-row"><select id="ph-${k}" data-k="${k}">${optionsHtml(k, ph[k], adult, esc, profile)}</select>${MY[k] ? `<button type="button" class="btn-icon preset-edit" data-type="${MY[k]}" title="Meine Presets bearbeiten">✏️</button>` : ''}</span></label>`).join('')}
        <label class="toggle-label"><input type="checkbox" id="look-fixseed" ${profile.seedVary ? '' : 'checked'}> <span>Gleiches Gesicht fixieren (fester Seed) – aus = jedes Foto neu, passend zur aktuellen Szene</span></label>
        <div id="ph-seed-w" style="display:${profile.seedVary ? 'none' : 'flex'};gap:8px;align-items:center"><span class="hint" id="ph-seed">Seed: ${Number.isInteger(profile.seed) ? profile.seed : 'wird beim ersten Foto festgelegt'}</span><button class="btn-sm" id="ph-dice" type="button">🎲 neuer Seed</button></div>
        <label>Referenzbild (Gesicht)<select id="ph-ref">
          <option value="" ${!refMode ? 'selected' : ''}>Aus (nur festes Aussehen + Seed)</option>
          <option value="face" ${refMode === 'face' ? 'selected' : ''}>Gesicht vom Referenzbild (qwen-edit, ca. 0,02 $)</option>
          <option value="figur" ${refMode === 'figur' ? 'selected' : ''}>Gesicht + Figur (Haare, Körperbau; Outfit/Pose/Ort aus Szene, ca. 0,02 $)</option>
          <option value="pulid" disabled>PuLID / FLUX Kontext – bei Jeffa nicht verfügbar (kein fal-Zugang)</option>
        </select></label>
        <div class="hint">Referenzbild = aktives „Ref: Gesicht“ unter 🖼 Galerie (nur mit Admin-Entsperrung).</div>
      </details>
      <details class="pe-adv"><summary>⚙️ Erweitert</summary>
      <div class="form-group">
        <label>Trigger-Wort</label>
        <input type="text" id="look-trigger" value="${esc(l.trigger)}" placeholder="z.B. Charakter-Name">
      </div>
      
      <div class="form-group">
        <label>Qualität</label>
        <input type="text" id="look-quality" value="${esc(l.quality)}">
      </div>
      
      <div class="form-group">
        <label>Eigener Stil</label>
        <div id="own-styles"></div>
        <button class="btn-secondary" id="own-style-add" type="button">+ Eigenen Stil anlegen</button>
      </div>
      </details>

      <div class="form-group">
        <label>Bild-Prompt (Vorschau)</label>
        <textarea id="look-preview" rows="4" readonly></textarea>
      </div>
      
      <button id="to-image-btn" class="btn-primary">Zum Bild-Bereich</button>
    </div>
    
    <div id="preset-editor-modal" class="modal" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <h4 id="preset-modal-title">Presets bearbeiten</h4>
          <button class="btn-icon modal-close">✕</button>
        </div>
        <div class="modal-body" id="preset-list"></div>
        <div class="modal-footer">
          <button id="add-preset-btn" class="btn-secondary">+ Preset hinzufügen</button>
        </div>
      </div>
    </div>
  `;
  
  function updatePreview() {
    readLookValues();
    const prompt = buildImagePrompt(profile, null);
    root.querySelector('#look-preview').value = prompt;
    onChange();
  }
  
  function readLookValues() {
    l.trigger = root.querySelector('#look-trigger').value.trim();
    // Kleidung/Pose/Umgebung now live only in the 📸 photo group; the old looks.kleidung/pose/umgebung stay untouched ("Wie bisher").
    const aSel = root.querySelector('#look-ausdruck').value;
    l.ausdruck = aSel || 'frei';
    l.quality = root.querySelector('#look-quality').value.trim();
    profile.seedVary = !root.querySelector('#look-fixseed').checked;
    const rm = root.querySelector('#ph-ref').value;
    if (rm) { if (!(rm === 'figur' && profile.refMode === 'full')) profile.refMode = rm; profile.refFace = true; } else { delete profile.refMode; delete profile.refFace; }
    const P = profile.photo = { ...(profile.photo || {}) };
    for (const k of ['auto', 'rate', 'quality', 'outfit', 'koerper', 'pose', 'intensity', 'scene', 'light', 'frame', 'mood', 'render']) { const v = root.querySelector('#ph-' + k).value; if (v) P[k] = v; else delete P[k]; }
    l.style = /comic|manhwa/.test(P.render || '') ? 'comic' : P.render === 'anime' ? 'anime' : 'realistisch'; // v47: one control (Bildstil); legacy l.style derived
    root.querySelector('#ph-rate-w').style.display = P.auto === 'zufall' ? '' : 'none';
    root.querySelector('#ph-seed-w').style.display = profile.seedVary ? 'none' : 'flex';
    l.stylePreset = root.querySelector('#look-stylepreset').value || '';
    l.stylePose = root.querySelector('#look-stylepose').value || '';
    l.autoPrompt = root.querySelector('#look-autoprompt').checked;
  }
  
  // v51: two-way live with the 📸 chat sheet – keep these selects in sync when the photo group changes elsewhere
  const onPhUpd = (e) => {
    if (!document.body.contains(root.querySelector('#ph-outfit'))) { window.removeEventListener('jeffa:profile-updated', onPhUpd); return; }
    if (e.detail?.id !== profile.id || !(e.detail.keys || []).includes('photo')) return;
    const P = profile.photo || {};
    for (const k of ['outfit', 'koerper', 'pose', 'intensity', 'scene', 'light', 'frame', 'mood', 'render']) { const sel = root.querySelector('#ph-' + k); if (sel && sel !== document.activeElement && [...sel.options].some(o => o.value === (P[k] || ''))) sel.value = P[k] || ''; }
  };
  window.addEventListener('jeffa:profile-updated', onPhUpd);
  root.querySelector('#ph-dice').addEventListener('click', () => { profile.seed = Math.floor(Math.random() * 9e8); root.querySelector('#ph-seed').textContent = 'Seed: ' + profile.seed; onChange(); });
  root.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', updatePreview);
  });
  
  root.querySelectorAll('.preset-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      showPresetEditor(btn.dataset.type);
    });
  });
  
  root.querySelector('#to-image-btn').addEventListener('click', () => {
    const prompt = root.querySelector('#look-preview').value;
    window.dispatchEvent(new CustomEvent('jeffa:image', { detail: { prompt } }));
  });
  
  function showPresetEditor(type) {
    const modal = root.querySelector('#preset-editor-modal');
    const list = modal.querySelector('#preset-list');
    const presets = l.presets[type];
    
    modal.querySelector('#preset-modal-title').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}-Presets`;
    
    list.innerHTML = presets.map((p, i) => `
      <div class="preset-item">
        <input type="text" class="preset-label" data-idx="${i}" value="${esc(p.label)}" placeholder="Label">
        <input type="text" class="preset-prompt" data-idx="${i}" value="${esc(p.prompt)}" placeholder="Prompt">
        <button class="btn-icon preset-delete" data-idx="${i}">✕</button>
      </div>
    `).join('');
    
    list.querySelectorAll('.preset-label, .preset-prompt').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        if (input.classList.contains('preset-label')) {
          presets[idx].label = input.value.trim();
        } else {
          presets[idx].prompt = input.value.trim();
        }
        refreshLookSelect(type);
      });
    });
    
    list.querySelectorAll('.preset-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        presets.splice(parseInt(btn.dataset.idx), 1);
        showPresetEditor(type);
        refreshLookSelect(type);
      });
    });
    
    modal.querySelector('#add-preset-btn').onclick = () => {
      presets.push({ id: `${type}_${Date.now()}`, label: 'Eigener Eintrag', prompt: '', custom: true });
      showPresetEditor(type);
      refreshLookSelect(type);
    };
    
    modal.querySelector('.modal-close').onclick = () => {
      modal.style.display = 'none';
    };
    
    modal.style.display = 'flex';
  }
  
  function refreshLookSelect(type) {
    const k = Object.keys(MY).find(x => MY[x] === type); if (!k) return;
    const sel = root.querySelector(`#ph-${k}`), cur = sel.value;
    sel.innerHTML = optionsHtml(k, cur, isAdult(), esc, profile);
    if (![...sel.options].some(o => o.value === cur)) sel.value = '';
    readLookValues(); updatePreview();
    onChange?.(profile);
  }
  
  function renderStyles() {
    const sel = root.querySelector('#look-stylepreset'), styles = availableStyles(profile);
    // a stored preset that is hidden here (FSK18-only while FSK18 is off, or an own style saved on another device) stays selected and unchanged
    const missing = l.stylePreset && !styles.some(s => s.id === l.stylePreset)
      ? `<option value="${esc(l.stylePreset)}">${l.stylePreset.startsWith('s_') ? '🔞 Gespeichertes Preset (nur im FSK18-Modus sichtbar)' : '✎ Eigener Stil (auf diesem Gerät nicht gespeichert)'}</option>` : '';
    sel.innerHTML = '<option value="">Kein Stil-Preset</option>' + styles.map(s => `<option value="${esc(s.id)}">${s.custom ? '✎ ' : ''}${esc(s.label)}</option>`).join('') + missing;
    sel.value = l.stylePreset || '';
    const cur = styles.find(s => s.id === sel.value);
    root.querySelector('#look-styledesc').textContent = cur?.desc || '';
    const pw = root.querySelector('#look-stylepose-wrap'), ps = root.querySelector('#look-stylepose');
    pw.style.display = cur?.poses?.length && !(profile.photo || {}).pose ? '' : 'none'; // v47: one Pose control at a time
    ps.innerHTML = '<option value="">Frei</option>' + (cur?.poses || []).map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    ps.value = (cur?.poses || []).some(p => p.id === l.stylePose) ? l.stylePose : '';
    const own = getCustomStyles();
    root.querySelector('#own-styles').innerHTML = own.map((s, i) => `<div class="preset-item" data-i="${i}">
      <input type="text" class="own-label" value="${esc(s.label)}" placeholder="Name">
      <textarea class="own-prompt" rows="3" placeholder="Eigener Prompt-Text">${esc(s.prompt)}</textarea>
      <button type="button" class="btn-icon own-del" title="Löschen">🗑</button></div>`).join('') || '<div class="hint">Noch keine eigenen Stile.</div>';
    root.querySelectorAll('#own-styles .preset-item').forEach(row => {
      const i = +row.dataset.i;
      row.querySelector('.own-label').onchange = (e) => { const a = getCustomStyles(); a[i].label = e.target.value.trim() || 'Eigener Stil'; saveCustomStyles(a); renderStyles(); };
      row.querySelector('.own-prompt').onchange = (e) => { const a = getCustomStyles(); a[i].prompt = e.target.value; saveCustomStyles(a); updatePreview(); };
      row.querySelector('.own-del').onclick = () => { if (!confirm('Stil löschen?')) return; const a = getCustomStyles(); a.splice(i, 1); saveCustomStyles(a); renderStyles(); updatePreview(); };
    });
  }
  root.querySelector('#own-style-add').onclick = () => {
    const name = prompt('Name für den eigenen Stil:', 'Mein Stil'); if (!name) return;
    const a = getCustomStyles(), id = 'own_' + Date.now(); a.push({ id, label: name.trim(), prompt: '' }); saveCustomStyles(a);
    l.stylePreset = id; renderStyles(); updatePreview();
  };
  root.querySelector('#look-stylepreset').addEventListener('change', () => { l.stylePreset = root.querySelector('#look-stylepreset').value; l.stylePose = ''; renderStyles(); });
  renderStyles();

  updatePreview();
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
