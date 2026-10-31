import { syncProfileText } from './profilesync.js';
import { api } from './shared/api.js';
import { isAdult } from './shared/fsk.js';
import { speak } from './shared/tts.js';
import { EDGE_VOICES, defaultLooks } from './profiles.js';
import { ARCHETYPES, MAX_ARCHETYPES, VANILLA, conflictsWith, cleanArchetypes, archetypeText } from './archetypes.js';
import { pickModel, modelInfo } from './shared/models.js';
import { bmi, bmiClass, cupLetter } from './shared/figure.js';
import { sliderTerm, stylePrompt } from './shared/persona-terms.js';
import { genderOf } from './shared/promptapp/chat.js';
import { TYP, HAIR_COLOR, HAIR_LEN, STYLE, SPECIAL, GROESSE, STATUR, hairText, matchHair, matchOne, matchTyp, matchMulti, matchScale, chips, slider, scaleNames, bipolarName, voiceName, wirePickers, picked, pickedAll } from './pickers.js';

const BASE_DIRECTIONS = [
  { id: 'herzlich', label: 'Herzlich & fürsorglich', subtraits: ['Empathisch', 'Unterstützend', 'Geduldig'] },
  { id: 'verspielt', label: 'Verspielt & frech', subtraits: ['Neckisch', 'Spontan', 'Witzig'] },
  { id: 'selbstbewusst', label: 'Selbstbewusst & direkt', subtraits: ['Bestimmt', 'Ehrlich', 'Durchsetzungsfähig'] },
  { id: 'ruhig', label: 'Ruhig & tiefgründig', subtraits: ['Nachdenklich', 'Gelassen', 'Weise'] },
  { id: 'intellektuell', label: 'Intellektuell & neugierig', subtraits: ['Analytisch', 'Wissbegierig', 'Kreativ'] },
  { id: 'abenteuerlustig', label: 'Abenteuerlustig', subtraits: ['Mutig', 'Spontan', 'Entdeckerfreudig'] }
];

export const VORLIEBEN = ['Lange Gespräche', 'Komplimente', 'Necken', 'Rollenspiel-Geschichten', 'Reisen', 'Musik', 'Kuscheln'];
// FSK18 only (adults, consensual) – label is the fixed prompt piece
export const ADULT_VORLIEBEN = ['Flirten', 'Romantische Spannung', 'Sinnliche Andeutungen'];
export const vorliebenOptions = (adult, selected = []) => { const base = adult ? [...VORLIEBEN, ...ADULT_VORLIEBEN] : VORLIEBEN;
  return [...new Set([...base, ...selected.filter(v => adult || !ADULT_VORLIEBEN.includes(v))])]; };

const TEMPERAMENT_DEFAULT = [
  { id: 't1', left: 'Zärtlich', right: 'Wild', leftText: 'sanft, behutsam, liebevoll', rightText: 'leidenschaftlich, intensiv, ungezügelt', value: 0 },
  { id: 't2', left: 'Gefühlvoll', right: 'Lustbetont', leftText: 'emotionale Tiefe, Verbundenheit', rightText: 'körperliche Anziehung, Genuss', value: 0 },
  { id: 't3', left: 'Zurückhaltend', right: 'Dominant', leftText: 'abwartend, empfangend', rightText: 'führend, bestimmend', value: 0 },
  { id: 't4', left: 'Geduldig', right: 'Fordernd', leftText: 'Zeit lassen, langsam steigern', rightText: 'ungeduldig, verlangend', value: 0 },
  { id: 't5', left: 'Romantisch', right: 'Verführerisch', leftText: 'Herz, Gefühl, Stimmung', rightText: 'Verlockung, Reiz, Verführung', value: 0 },
  { id: 't6', left: 'Schüchtern', right: 'Selbstbewusst-offen', leftText: 'zögerlich, vorsichtig tastend', rightText: 'direkt, klar ausdrückend', value: 0 }
];

const GEGENSAETZE_DEFAULT = [
  { id: 'g1', left: 'Treu', right: 'Freizügig', leftText: 'einem Partner zugewandt', rightText: 'offen für Mehrere, Vielfalt', value: 0 },
  { id: 'g2', left: 'Bodenständig', right: 'Exzentrisch', leftText: 'klassisch, vertraut', rightText: 'ausgefallen, experimentierfreudig', value: 0 },
  { id: 'g3', left: 'Brav', right: 'Rebellisch', leftText: 'angepasst, zurückhaltend', rightText: 'regelbrüchig, provokativ', value: 0 },
  { id: 'g4', left: 'Harmoniebedürftig', right: 'Streitlustig', leftText: 'Konflikte meiden, Frieden', rightText: 'Spannung, Reibung suchen', value: 0 },
  { id: 'g5', left: 'Häuslich', right: 'Abenteuerlustig', leftText: 'Geborgenheit, Vertrautheit', rightText: 'Risiko, neue Orte', value: 0 }
];

export function renderPersonaEditor(root, profile, onSave) {
  if (!profile.persona) {
    profile.persona = {
      base: 'herzlich',
      subtraits: [],
      look: { typ: '', age: 25, hair: '', style: '', special: [] },
      traits: { intensitaet: 5, waerme: 5, humor: 5, initiative: 5, fantasie: 5 },
      figur: { groesse: '', statur: '', kurven: 5, oberweite: 4 },
      temperament: structuredClone(TEMPERAMENT_DEFAULT),
      gegensaetze: structuredClone(GEGENSAETZE_DEFAULT),
      vorlieben: [],
      eigeneVorlieben: []
    };
  }
  
  if (!profile.looks) profile.looks = defaultLooks();
  
  const adult = isAdult() && profile.adult;
  
  root.innerHTML = `
    <div class="persona-tabs">
      <button class="tab-btn active" data-tab="profil">Basis</button>
      <button class="tab-btn" data-tab="aussehen">Aussehen</button>
      <button class="tab-btn" data-tab="persoenlichkeit">Persönlichkeit</button>
      <button class="tab-btn" data-tab="vorlieben">Vorlieben</button>
      <button class="tab-btn" data-tab="look">Look</button>
    </div>
    <div class="persona-content">
      <div class="tab-pane active" data-pane="profil"></div>
      <div class="tab-pane" data-pane="aussehen"></div>
      <div class="tab-pane" data-pane="persoenlichkeit"></div>
      <div class="tab-pane" data-pane="vorlieben"></div>
      <div class="tab-pane" data-pane="look"></div>
    </div>
    <div class="persona-actions">
      <button id="save-persona-btn" class="btn-primary">Speichern</button>
      <button id="toggle-prompt-btn" class="btn-secondary">Prompt anzeigen/bearbeiten</button>
      <button id="card-btn" class="btn-secondary">🃏 Charakter-Karte</button>
    </div>
    <div id="prompt-editor" class="prompt-editor" style="display:none;">
      <label>System-Prompt</label>
      <textarea id="manual-prompt" rows="8">${esc((isAdult() && profile.systemPromptAdult) || profile.systemPrompt || '')}</textarea>
    </div>
  `;
  
  renderProfilTab(root.querySelector('[data-pane="profil"]'), profile);
  root.querySelector('#p-model')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; const id = await pickModel({ title: 'Modell für ' + (profile.name || 'Profil'), current: b.dataset.id });
    if (id === null) return; b.dataset.id = id; const i = id ? modelInfo(id) : { label: 'Automatisch', desc: 'Standard aus ⚙️ Einstellungen' };
    b.querySelector('b').textContent = i.label; b.querySelector('small').textContent = i.desc;
  });
  wirePickers(root);
  renderAussehenTab(root.querySelector('[data-pane="aussehen"]'), profile);
  renderPersoenlichkeitTab(root.querySelector('[data-pane="persoenlichkeit"]'), profile, adult);
  renderVorliebenTab(root.querySelector('[data-pane="vorlieben"]'), profile, adult);
  
  import('./look.js').then(({ renderLookEditor }) => {
    renderLookEditor(root.querySelector('[data-pane="look"]'), profile, () => {});
  });
  
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector(`[data-pane="${btn.dataset.tab}"]`).classList.add('active');
    });
  });
  
  root.querySelector('#toggle-prompt-btn').addEventListener('click', () => {
    const ed = root.querySelector('#prompt-editor');
    ed.style.display = ed.style.display === 'none' ? 'block' : 'none';
  });

  root.querySelector('#card-btn').addEventListener('click', async () => {
    const { openCardDialog } = await import('./card.js');
    openCardDialog(profile, {
      onApply: (patch) => {
        // deep merge only persona.look / persona.figur; everything else stays untouched
        const persona = { ...(profile.persona || {}) };
        persona.look = { ...(persona.look || {}), ...(patch.persona?.look || {}) };
        persona.figur = { ...(persona.figur || {}), ...(patch.persona?.figur || {}) };
        profile.persona = persona;
        onSave?.(profile);
        renderPersonaEditor(root, profile, onSave);
      }
    });
  });
  
  root.querySelector('#save-persona-btn').addEventListener('click', async () => {
    const btn = root.querySelector('#save-persona-btn');
    const orig = btn.textContent;
    btn.textContent = 'Generiere Prompt...';
    btn.disabled = true;
    
    try {
      readProfilTab(root.querySelector('[data-pane="profil"]'), profile);
      readAussehenTab(root.querySelector('[data-pane="aussehen"]'), profile);
      readPersoenlichkeitTab(root.querySelector('[data-pane="persoenlichkeit"]'), profile);
      readVorliebenTab(root.querySelector('[data-pane="vorlieben"]'), profile);
      
      const manualPrompt = root.querySelector('#manual-prompt').value.trim();
      if (manualPrompt) {
        delete profile.systemPromptAdult; profile.systemPrompt = manualPrompt;
      } else {
        const adultGen = isAdult() && profile.adultMode !== false;
        const res = await api('/api/persona', {
          method: 'POST',
          body: { profile: { ...(profile.persona || {}), gender: genderOf(profile) }, adult: adultGen }
        });
        if (adultGen) profile.systemPromptAdult = res.systemPrompt;
        else { profile.systemPrompt = res.systemPrompt; delete profile.systemPromptAdult; }
        root.querySelector('#manual-prompt').value = res.systemPrompt;
      }
      
      onSave(profile);
    } catch (e) {
      alert('Fehler beim Generieren des Prompts: ' + e.message);
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  });
}

/** v84 P4: gespeichertes Geschlecht als Chip-Wert ('w'|'m'|'d'|'' = automatisch); alte Werte 'male'/'female' werden erkannt. */
function explicitGender(profile) {
  const raw = String(profile.persona?.gender || profile.gender || '').toLowerCase();
  return /^(m|male|mann)$/.test(raw) ? 'm' : /^(w|f|female|frau)$/.test(raw) ? 'w' : /^(d|divers)$/.test(raw) ? 'd' : '';
}

function renderProfilTab(root, profile) {
  const langs = ['de', 'en'];
  queueMicrotask(() => import('./shared/quickfill.js').then((q) => q.quickfill(root)).catch(() => {})); // v64 presets
  root.innerHTML = `
    <div class="pe-sec">
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="p-name" value="${esc(profile.name)}" maxlength="50">
    </div>
    <div class="form-group">
      <label>Geschlecht</label>
      ${chips('p-gender', ['w', 'm', 'd', ''], explicitGender(profile), false, ['Weiblich', 'Männlich', 'Divers', 'Automatisch'])}
      <small id="p-gender-hint" class="hint">${explicitGender(profile) ? '' : 'erkannt: ' + ({ m: 'männlich', w: 'weiblich', d: 'divers' }[genderOf({ ...profile, persona: profile.persona && { ...profile.persona, gender: '' }, gender: '' })] || 'keine Angabe')}</small>
    </div>
    <div class="form-group">
      <label>Avatar (Emoji)</label>
      <input type="text" id="p-avatar" value="${esc(profile.avatar)}" maxlength="10">
    </div>
    <div class="form-group">
      <label>Sprache</label>
      ${chips('p-lang', langs, langs.includes(profile.language) ? profile.language : 'de', false, ['Deutsch', 'English'])}
    </div>
    <div class="form-group pe-voice">
      <label>🔊 Stimme</label>
      <div style="display:flex;gap:6px;align-items:center"><select id="p-voice" style="flex:1;min-width:0"></select><button id="test-voice-btn" class="btn-secondary">Stimme anhören</button></div>
    </div>
    <div class="form-group">
      <label class="toggle-label">
        <input type="checkbox" id="p-autoread" ${profile.voice.autoRead && profile.voice.autoReadSet ? 'checked' : ''}>
        <span>Antworten automatisch vorlesen</span>
      </label>
    </div>
    </div>
    <details class="pe-adv"><summary>⚙️ Erweitert</summary>
    <div class="form-group">
      <label>Beschreibung</label>
      <input type="text" id="p-desc" value="${esc(profile.description)}" maxlength="100">
    </div>
    <div class="form-group">
      <label>Modell für dieses Profil</label>
      <button type="button" class="model-current" id="p-model" data-id="${profile.model || ''}"><b>${profile.model ? modelInfo(profile.model).label : 'Automatisch'}</b><small>${profile.model ? modelInfo(profile.model).desc : 'Standard aus ⚙️ Einstellungen (bei FSK18 die 18+-Liste)'}</small><span>▾</span></button>
      <small>Fällt das Modell aus, übernimmt die Reihenfolge aus den Einstellungen.</small>
    </div>
    <div class="form-group">
      <label>Tempo: <span id="p-rate-val">${voiceName(profile.voice.rate, 'rate')}</span></label>
      <input type="range" id="p-rate" min="0.5" max="2" step="0.1" value="${profile.voice.rate}">
    </div>
    <div class="form-group">
      <label>Tonhöhe: <span id="p-pitch-val">${voiceName(profile.voice.pitch, 'pitch')}</span></label>
      <input type="range" id="p-pitch" min="0.5" max="2" step="0.1" value="${profile.voice.pitch}">
    </div>
    <div class="form-section">
      <h4>Lernnotizen</h4>
      <div id="notes-list"></div>
      <button id="add-note-btn" class="btn-secondary">+ Notiz hinzufügen</button>
    </div>
    </details>
  `;
  
  const voiceSel = root.querySelector('#p-voice');
  EDGE_VOICES.forEach(({ group, voices }) => {
    const og = document.createElement('optgroup');
    og.label = group;
    voices.forEach(([name, label]) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = label;
      if (name === profile.voice.voiceName) opt.selected = true;
      og.appendChild(opt);
    });
    voiceSel.appendChild(og);
  });
  
  root.querySelector('#p-rate').addEventListener('input', e => {
    root.querySelector('#p-rate-val').textContent = voiceName(e.target.value, 'rate');
  });
  
  root.querySelector('#p-pitch').addEventListener('input', e => {
    root.querySelector('#p-pitch-val').textContent = voiceName(e.target.value, 'pitch');
  });
  
  root.querySelector('#test-voice-btn').addEventListener('click', async () => {
    const cfg = {
      provider: 'edge',
      voiceName: root.querySelector('#p-voice').value,
      rate: parseFloat(root.querySelector('#p-rate').value),
      pitch: parseFloat(root.querySelector('#p-pitch').value)
    };
    const text = profile.language === 'de' ? 'Hallo, ich bin ' + root.querySelector('#p-name').value : 'Hello, I am ' + root.querySelector('#p-name').value;
    try {
      await speak(text, cfg, profile.language);
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  });
  
  renderNotesList(root.querySelector('#notes-list'), profile);
  
  root.querySelector('#add-note-btn').addEventListener('click', () => {
    const text = prompt('Neue Lernnotiz:');
    if (text?.trim()) {
      profile.notes.push(text.trim());
      renderNotesList(root.querySelector('#notes-list'), profile);
    }
  });
}

function renderNotesList(root, profile) {
  if (!profile.notes.length) {
    root.innerHTML = '<p class="empty-state">Keine Notizen</p>';
    return;
  }
  root.innerHTML = profile.notes.map((note, i) => `
    <div class="note-item">
      <span>${esc(note)}</span>
      <button class="btn-icon" data-idx="${i}">✕</button>
    </div>
  `).join('');
  
  root.querySelectorAll('.btn-icon').forEach(btn => {
    btn.addEventListener('click', () => {
      profile.notes.splice(parseInt(btn.dataset.idx), 1);
      renderNotesList(root, profile);
    });
  });
}

function readProfilTab(root, profile) {
  profile.name = root.querySelector('#p-name').value.trim() || 'Profil';
  // v84 P4: Geschlecht ('' = automatisch); 'm' bedeutet männlich, 'male' wird beim Lesen weiter akzeptiert.
  { const g = picked(root, 'p-gender') || ''; if (g) { if (profile.persona) profile.persona.gender = g; profile.gender = g; } else { if (profile.persona) delete profile.persona.gender; delete profile.gender; } }
  profile.avatar = root.querySelector('#p-avatar').value.trim() || '👤';
  profile.description = root.querySelector('#p-desc').value.trim();
  profile.language = picked(root, 'p-lang') || profile.language || 'de';
  const pm = root.querySelector('#p-model')?.dataset.id || '';
  if (pm) profile.model = pm; else delete profile.model;
  profile.voice = {
    provider: 'edge',
    voiceName: root.querySelector('#p-voice').value,
    rate: parseFloat(root.querySelector('#p-rate').value),
    pitch: parseFloat(root.querySelector('#p-pitch').value),
    autoRead: root.querySelector('#p-autoread').checked,
    autoReadSet: true // explicit choice since v19 (older stored 'on' values count as off)
  };
}

function renderPersoenlichkeitTab(root, profile, adult) {
  const p = profile.persona;
  
  root.innerHTML = `
    <div class="pe-sec">
      <h4>Grundcharakter</h4>
      <div class="chipset" id="base-direction"></div>
      <div class="pe-sub">Zusätzliche Züge</div>
      <div class="chipset" id="subtraits"></div>
    </div>
    
    <div class="pe-sec">
      <h4>Eigenschaften (1–10)</h4>
      ${renderSlider('intensitaet', 'Intensität', 'Zurückhaltend', 'Intensiv', p.traits.intensitaet)}
      ${renderSlider('waerme', 'Wärme', 'Kühl', 'Warm', p.traits.waerme)}
      ${renderSlider('humor', 'Humor', 'Ernst', 'Humorvoll', p.traits.humor)}
      ${renderSlider('initiative', 'Initiative', 'Abwartend', 'Aktiv', p.traits.initiative)}
      ${renderSlider('fantasie', 'Fantasie', 'Sachlich', 'Fantasievoll', p.traits.fantasie)}
    </div>
    
    ${adult ? `
      <div class="form-section adult-section">
        <h4>Temperament (18+)</h4>
        <div id="temperament-sliders"></div>
      </div>
      
      <div class="form-section adult-section">
        <h4>Gegensätze (18+)</h4>
        <div id="gegensaetze-sliders"></div>
      </div>
    ` : ''}
  `;
  
  renderBaseDirection(root.querySelector('#base-direction'), p);
  renderSubtraits(root.querySelector('#subtraits'), p);
  root.querySelector('#base-direction').addEventListener('change', (e) => {
    if (e.target.name !== 'base') return;
    const keep = Array.from(root.querySelectorAll('.subtrait-check:checked')).map(c => c.value);
    renderSubtraits(root.querySelector('#subtraits'), { base: e.target.value, subtraits: keep });
  });
  
  if (adult) {
    renderBipolarSliders(root.querySelector('#temperament-sliders'), p.temperament);
    renderBipolarSliders(root.querySelector('#gegensaetze-sliders'), p.gegensaetze);
  }
}

const BUST = ['A-Körbchen', 'B-Körbchen', 'C-Körbchen', 'D-Körbchen', 'DD/E-Körbchen', 'F-Körbchen', 'G-Körbchen'];

/** Aussehen: chips + sliders. Old free text that no chip reproduces 1:1 stays untouched in an
 *  "Eigener Text" field under Erweitert (it wins over the chips), so nothing gets lost. */
// Old Größe labels → slider position in cm (only for the slider; the stored text is kept unless the slider is moved).
const GR_CM = { 'klein': 155, 'eher klein': 160, 'mittelgroß': 168, 'groß': 176, 'sehr groß': 184 };
const CM_MIN = 139, CM_MAX = 200; // 139 = keine Angabe
function cmOf(v) {
  const t = String(v || '').trim(); if (!t) return { cm: CM_MIN, exact: true };
  const m = /^(\d{3})\s*(cm)?$/i.exec(t); if (m && +m[1] > CM_MIN && +m[1] <= CM_MAX) return { cm: +m[1], exact: true };
  const k = Object.keys(GR_CM).find(x => x === t.toLowerCase()); if (k) return { cm: GR_CM[k], exact: true };
  return { cm: CM_MIN, exact: false };
}

/** Aussehen: chips + sliders + style dropdown. Old free text that no chip reproduces 1:1 is kept unchanged
 *  and only shown in the collapsed "Erweitert" section (it wins over the chips), so nothing gets lost. */
function renderAussehenTab(root, profile) {
  const p = profile.persona;
  p.look ||= { typ: '', age: 25, hair: '', style: '', special: [] };
  p.figur ||= { groesse: '', statur: '', kurven: 5, oberweite: 4 };
  const L = p.look, F = p.figur;
  const typ = matchTyp(L.typ), hair = matchHair(L.hair);
  const st = matchScale(STATUR, F.statur), gr = cmOf(F.groesse);
  const styleTxt = String(L.style || '').trim();
  const preset = STYLE.find(x => x.toLowerCase() === styleTxt.toLowerCase());
  const ownStyle = !!styleTxt && !preset;
  const own = (id, label, v, exact) => exact ? '' : `<div class="form-group"><label>${label}</label><input type="text" id="${id}" value="${esc(v)}" placeholder="leer = Auswahl oben"></div>`;
  const cap = x => x[0].toUpperCase() + x.slice(1);
  queueMicrotask(() => import('./shared/quickfill.js').then((q) => q.quickfill(root)).catch(() => {})); // v64 presets
  root.innerHTML = `
    <div class="pe-sec">
      <h4>Aussehen</h4>
      <div class="form-group"><label>Typ</label>${chips('lk-typ', TYP, typ.val)}</div>
      ${slider('look-age', 'Wirkt wie (Alter, ab 18)', 18, 60, Math.min(60, Math.max(18, +L.age || 25)), '18', '60')}
      <div class="form-group"><label>Haarfarbe</label>${chips('lk-hcol', HAIR_COLOR, hair.col, false, ['Blond', 'Brünett', 'Schwarz', 'Rot', 'Grau'])}</div>
      <div class="form-group"><label>Haarlänge</label>${chips('lk-hlen', HAIR_LEN, hair.len, false, ['Kurz', 'Schulterlang', 'Lang'])}</div>
      <div class="form-group"><label>Kleidungsstil</label><select id="lk-style-sel">
        <option value="">keine Angabe</option>
        ${STYLE.map(x => `<option value="${esc(x)}" ${preset === x ? 'selected' : ''}>${esc(cap(x))}</option>`).join('')}
        <option value="__own" ${ownStyle ? 'selected' : ''}>✏️ Eigener Stil</option>
      </select><div class="pe-sub" id="lk-style-hint">${esc(preset ? stylePrompt(preset) : '')}</div></div>
      <div class="form-group"><label>Besonderes</label>${chips('lk-special', [...new Set([...SPECIAL, ...(L.special || [])])], L.special || [], true)}</div>
    </div>
    <div class="pe-sec">
      <h4>Figur</h4>
      <div class="form-group pslider"><label>Körpergröße: <b id="figur-cm-val">${gr.cm <= CM_MIN ? 'keine Angabe' : gr.cm + ' cm'}</b></label>
        <input type="range" id="figur-cm" min="${CM_MIN}" max="${CM_MAX}" value="${gr.cm}" data-unit="cm" data-start="${gr.cm}">
        <div class="slider-labels"><span>keine Angabe</span><span>200 cm</span></div></div>
      ${slider('figur-statur', 'Statur', 0, 5, st.idx, 'keine Angabe', 'kräftig', STATUR)}
      ${renderSlider('kurven', 'Kurven', 'Schlank', 'Kurvig', F.kurven || 5)}
      ${slider('oberweite', 'Oberweite (Körbchengröße)', 1, 7, F.oberweite || 4, 'A', 'G', BUST)}
      <div class="form-group pslider"><label>Gewicht: <b id="figur-kg-val">${F.gewichtKg ? F.gewichtKg + ' kg' : 'keine Angabe'}</b></label>
        <input type="range" id="figur-kg" min="40" max="120" step="1" value="${F.gewichtKg || 40}" data-start="${F.gewichtKg || 40}">
        <div class="slider-labels"><span>keine Angabe</span><span>120 kg</span></div></div>
      <div class="form-group pslider"><label>Unterbrust: <b id="figur-ub-val">${F.unterbrustCm ? F.unterbrustCm + ' cm' : 'keine Angabe'}</b></label>
        <input type="range" id="figur-ub" min="60" max="100" step="1" value="${F.unterbrustCm || 60}" data-start="${F.unterbrustCm || 60}">
        <div class="slider-labels"><span>keine Angabe</span><span>100 cm</span></div></div>
      <div class="figur-live" id="figur-live"></div>
    </div>
    <details class="pe-adv"><summary>⚙️ Erweitert</summary>
      <div class="pe-sub">Eigener Text hat Vorrang vor der Auswahl. Ältere Freitext-Angaben stehen hier unverändert.</div>
      <div class="form-group"><label>Weitere Details (optional)</label><textarea id="look-details" rows="3" maxlength="400" placeholder="z.B. Muttermal an der Wange">${esc(L.details || '')}</textarea></div>
      ${own('own-typ', 'Typ (eigener Text)', L.typ, typ.exact)}
      ${own('own-hair', 'Haare (eigener Text)', L.hair, hair.exact)}
      ${own('own-groesse', 'Größe (eigener Text)', F.groesse, gr.exact)}
      ${own('own-statur', 'Statur (eigener Text)', F.statur, st.exact)}
      <div class="form-group"><label>Eigener Stil <button type="button" class="btn-sm" id="own-style-edit">bearbeiten</button></label>
        <textarea id="own-style" rows="3" hidden>${esc(ownStyle ? L.style : '')}</textarea></div>
    </details>`;
  const sel = root.querySelector('#lk-style-sel'), ta = root.querySelector('#own-style');
  root.querySelector('#own-style-edit').onclick = () => { ta.hidden = false; ta.focus(); };
  sel.onchange = () => { root.querySelector('#lk-style-hint').textContent = sel.value && sel.value !== '__own' ? stylePrompt(sel.value) : ''; if (sel.value === '__own') { ta.hidden = false; ta.closest('details').open = true; ta.focus(); } };
  ta.oninput = () => { const o = sel.querySelector('option[value="__own"]'); if (ta.value.trim()) { o.hidden = false; sel.value = '__own'; } };
  const live = () => {
    const kgEl = root.querySelector('#figur-kg'), ubEl = root.querySelector('#figur-ub'), cmEl = root.querySelector('#figur-cm');
    const kg = +kgEl.value !== +kgEl.dataset.start || +kgEl.value > 40 ? +kgEl.value : 0;
    const ub = +ubEl.value !== +ubEl.dataset.start || +ubEl.value > 60 ? +ubEl.value : 0;
    const cm = +cmEl.value > CM_MIN ? +cmEl.value : 0;
    const ow = parseInt(root.querySelector('#oberweite')?.value || 4);
    const out = [];
    const b = bmi(cm, kg); if (b != null) out.push(`BMI ${b.toFixed(1)} (${bmiClass(b).de})`);
    if (ub && ow) out.push(`Größe ${ub}${cupLetter(ow)}`);
    root.querySelector('#figur-live').textContent = out.join(' · ');
    root.querySelector('#figur-kg-val').textContent = kg ? kg + ' kg' : 'keine Angabe';
    root.querySelector('#figur-ub-val').textContent = ub ? ub + ' cm' : 'keine Angabe';
  };
  for (const id of ['#figur-kg', '#figur-ub', '#figur-cm', '#oberweite']) {
    const el = root.querySelector(id); if (el) el.addEventListener('input', live);
  }
  live();
}

function readAussehenTab(root, profile) {
  const L = profile.persona.look, F = profile.persona.figur;
  const ov = (id) => root.querySelector('#' + id)?.value.trim() || '';
  L.typ = ov('own-typ') || picked(root, 'lk-typ');
  L.age = parseInt(root.querySelector('#look-age')?.value || 25);
  L.hair = ov('own-hair') || hairText(picked(root, 'lk-hlen'), picked(root, 'lk-hcol'));
  const sv = root.querySelector('#lk-style-sel')?.value || '';
  // Eigener Stil: keep the stored text byte-for-byte unless it was edited in Erweitert.
  L.style = sv === '__own' ? (root.querySelector('#own-style').value.trim() ? root.querySelector('#own-style').value : L.style) : sv;
  L.special = pickedAll(root, 'lk-special');
  const det = ov('look-details'); if (det) L.details = det; else delete L.details;
  const cmEl = root.querySelector('#figur-cm'), cm = +cmEl.value, s = +root.querySelector('#figur-statur').value;
  const moved = cmEl.value !== cmEl.dataset.start;
  F.groesse = ov('own-groesse') || (!moved ? F.groesse && cmOf(F.groesse).exact ? F.groesse : '' : cm > CM_MIN ? cm + ' cm' : '');
  F.statur = ov('own-statur') || (s ? STATUR[s] : '');
  F.kurven = parseInt(root.querySelector('#kurven')?.value || 5);
  F.oberweite = parseInt(root.querySelector('#oberweite')?.value || 4);
  const kgEl2 = root.querySelector('#figur-kg'), ubEl2 = root.querySelector('#figur-ub');
  const kgV = kgEl2 && (+kgEl2.value !== +kgEl2.dataset.start || +kgEl2.value > 40) ? +kgEl2.value : 0;
  const ubV = ubEl2 && (+ubEl2.value !== +ubEl2.dataset.start || +ubEl2.value > 60) ? +ubEl2.value : 0;
  if (kgV) F.gewichtKg = kgV; else delete F.gewichtKg;
  if (ubV) F.unterbrustCm = ubV; else delete F.unterbrustCm;
  syncProfileText(profile); // v47: move clothing/light/place into photo controls, sliders own bust/build
}

function renderBaseDirection(root, persona) {
  root.innerHTML = BASE_DIRECTIONS.map(d => `
    <label class="pchip"><input type="radio" name="base" value="${d.id}" ${persona.base===d.id?'checked':''}><span>${d.label}</span></label>
  `).join('');
}

function renderSubtraits(root, persona) {
  const base = BASE_DIRECTIONS.find(d => d.id === persona.base);
  if (!base) return;
  root.innerHTML = base.subtraits.map(s => `
    <label class="pchip"><input type="checkbox" class="subtrait-check" value="${s}" ${persona.subtraits.includes(s)?'checked':''}><span>${s}</span></label>
  `).join('');
}

function renderSlider(id, label, left, right, value) {
  return slider(id, label, 1, 10, Math.min(10, Math.max(1, +value || 5)), left, right, scaleNames(left, right));
}

function renderBipolarSliders(root, items) {
  root.innerHTML = items.map((item, idx) => `
    <div class="bipolar-slider" data-idx="${idx}">
      <div class="bipolar-header">
        <input type="text" class="pole-text left" value="${esc(item.leftText)}" placeholder="Beschreibung links">
        <input type="text" class="pole-text right" value="${esc(item.rightText)}" placeholder="Beschreibung rechts">
      </div>
      <div class="bipolar-labels">
        <span class="pole-label">${esc(item.left)}</span>
        <span class="pole-label">${esc(item.right)}</span>
      </div>
      <input type="range" class="bipolar-range" min="-5" max="5" value="${item.value}">
      <div class="bipolar-value">${esc(bipolarName(item.value, item.left, item.right))}${item.value && sliderTerm(item.id, item.value) ? ' – ' + esc(sliderTerm(item.id, item.value)) : ''}</div>
    </div>
  `).join('');
  
  root.querySelectorAll('.bipolar-range').forEach((slider, idx) => {
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      const item = items[idx];
      item.value = val;
      const valDiv = slider.parentElement.querySelector('.bipolar-value');
      valDiv.textContent = bipolarName(val, item.left, item.right) + (sliderTerm(item.id, val) ? ' – ' + sliderTerm(item.id, val) : '');
    });
  });
  
  root.querySelectorAll('.pole-text').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.closest('.bipolar-slider').dataset.idx);
      if (input.classList.contains('left')) {
        items[idx].leftText = input.value.trim();
      } else {
        items[idx].rightText = input.value.trim();
      }
    });
  });
}

function readPersoenlichkeitTab(root, profile) {
  const p = profile.persona;
  
  const baseRadio = root.querySelector('input[name="base"]:checked');
  if (baseRadio) {
    p.base = baseRadio.value;
    const base = BASE_DIRECTIONS.find(d => d.id === p.base);
    p.subtraits = Array.from(root.querySelectorAll('.subtrait-check:checked')).map(c => c.value);
  }
  
  p.traits.intensitaet = parseInt(root.querySelector('#intensitaet')?.value || 5);
  p.traits.waerme = parseInt(root.querySelector('#waerme')?.value || 5);
  p.traits.humor = parseInt(root.querySelector('#humor')?.value || 5);
  p.traits.initiative = parseInt(root.querySelector('#initiative')?.value || 5);
  p.traits.fantasie = parseInt(root.querySelector('#fantasie')?.value || 5);
  
}

function renderVorliebenTab(root, profile, adult) {
  const p = profile.persona;
  const all = vorliebenOptions(adult, p.vorlieben || []);
  
  root.innerHTML = `
    <div class="pe-sec">
      <h4>Vorlieben</h4>
      <div class="chipset">
        ${all.map(v => `<label class="pchip"><input type="checkbox" class="vorliebe-check" value="${esc(v)}" ${p.vorlieben.includes(v)?'checked':''}><span>${esc(v)}</span></label>`).join('')}
      </div>
    </div>
    
    ${adult ? `<div class="pe-sec"><h4>Typ-Paket (FSK18, 1 oder 2 wählen)</h4><div class="chipset">
      <label class="pchip" title="${esc(VANILLA.tag)}"><input type="checkbox" class="arch-vanilla" ${(p.archetypen || []).length ? '' : 'checked'}><span>${esc(VANILLA.name)}<br><small>${esc(VANILLA.tag)}</small></span></label>
      ${ARCHETYPES.map(a => `<label class="pchip" title="${esc(a.tag)}"><input type="checkbox" class="arch-check" value="${a.id}" ${(p.archetypen || []).includes(a.id) ? 'checked' : ''}><span>${esc(a.name)}<br><small>${esc(a.tag)}</small></span></label>`).join('')}
    </div></div>` : ''}
    <div class="form-section">
      <h4>Eigene Vorlieben</h4>
      <div id="eigene-list"></div>
      <button id="add-eigene-btn" class="btn-secondary">+ Eigene hinzufügen</button>
    </div>
  `;
  
  renderEigeneList(root.querySelector('#eigene-list'), p);
  const archSync = () => {
    const on = [...root.querySelectorAll('.arch-check:checked')].map(x => x.value), blocked = on.flatMap(conflictsWith);
    root.querySelectorAll('.arch-check').forEach(x => { const dis = !x.checked && (blocked.includes(x.value) || on.length >= MAX_ARCHETYPES); x.disabled = dis; x.closest('.pchip').style.opacity = dis ? '.4' : ''; });
    const v = root.querySelector('.arch-vanilla'); if (v) v.checked = !on.length;
  };
  root.querySelectorAll('.arch-check').forEach(c => c.addEventListener('change', archSync));
  root.querySelector('.arch-vanilla')?.addEventListener('change', () => { root.querySelectorAll('.arch-check').forEach(x => { x.checked = false; }); archSync(); });
  archSync();
  
  root.querySelector('#add-eigene-btn').addEventListener('click', () => {
    const text = prompt('Eigene Vorliebe:');
    if (text?.trim()) {
      p.eigeneVorlieben.push(text.trim());
      renderEigeneList(root.querySelector('#eigene-list'), p);
    }
  });
}

function renderEigeneList(root, persona) {
  if (!persona.eigeneVorlieben.length) {
    root.innerHTML = '<p class="empty-state">Keine eigenen Vorlieben</p>';
    return;
  }
  root.innerHTML = persona.eigeneVorlieben.map((v, i) => `
    <div class="note-item">
      <span>${esc(v)}</span>
      <button class="btn-icon" data-idx="${i}">✕</button>
    </div>
  `).join('');
  
  root.querySelectorAll('.btn-icon').forEach(btn => {
    btn.addEventListener('click', () => {
      persona.eigeneVorlieben.splice(parseInt(btn.dataset.idx), 1);
      renderEigeneList(root, persona);
    });
  });
}

function readVorliebenTab(root, profile) {
  const p = profile.persona;
  p.vorlieben = Array.from(root.querySelectorAll('.vorliebe-check:checked')).map(c => c.value);
  if (root.querySelector('.arch-check')) { p.archetypen = cleanArchetypes(Array.from(root.querySelectorAll('.arch-check:checked')).map(c => c.value)); p.archetypText = archetypeText(p.archetypen, true, genderOf(profile)) || undefined; }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
