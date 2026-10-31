import { TYP, HAIR_COLOR, HAIR_LEN, STYLE, hairText, matchHair, matchOne, matchMulti, chips, slider, wirePickers, picked, pickedAll } from './pickers.js';
const STORAGE_KEY = 'jeffa.me';

import { getMe } from './me-data.js';
export { getMe };

function saveMe(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Fehler beim Speichern:', e);
  }
}

export function renderMeEditor(root) {
  const me = getMe();
  const L = me.look || (me.look = {});
  const typ = matchOne(TYP, L.typ), hair = matchHair(L.hair), sty = matchMulti(STYLE, L.style);
  
  queueMicrotask(() => import('./shared/quickfill.js').then((q) => q.quickfill(root)).catch(() => {})); // v64 presets
  root.innerHTML = `
    <div class="me-editor">
      <h3>Über mich</h3>
      
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="me-name" value="${esc(me.name)}" placeholder="Dein Name">
      </div>
      
      <div class="pe-sec">
        <h4>Aussehen</h4>
        <div class="form-group"><label>Typ</label>${chips('me-typ', TYP, typ.val)}</div>
        ${slider('me-age', 'Wirkt wie (Alter, ab 18)', 18, 60, Math.min(60, Math.max(18, +L.age || 25)), '18', '60')}
        <div class="form-group"><label>Haarfarbe</label>${chips('me-hcol', HAIR_COLOR, hair.col, false, ['Blond', 'Brünett', 'Schwarz', 'Rot', 'Grau'])}</div>
        <div class="form-group"><label>Haarlänge</label>${chips('me-hlen', HAIR_LEN, hair.len, false, ['Kurz', 'Schulterlang', 'Lang'])}</div>
        <div class="form-group"><label>Kleidungsstil</label>${chips('me-st', STYLE, sty.vals, true, STYLE.map(x => x[0].toUpperCase() + x.slice(1)))}</div>
      </div>
      <details class="pe-adv" ${typ.exact && hair.exact && sty.exact ? '' : 'open'}><summary>⚙️ Erweitert – eigener Text</summary>
        <div class="form-group"><label>Kleidung</label><input type="text" id="me-kleidung" value="${esc(L.kleidung)}" placeholder="z.B. Jeans und T-Shirt"></div>
        <div class="form-group"><label>Besonderes / weitere Details</label><input type="text" id="me-besonderes" value="${esc(L.besonderes)}" placeholder="z.B. Bart, Tattoo"></div>
        <div class="form-group"><label>Typ (eigener Text)</label><input type="text" id="me-typ-own" value="${typ.exact ? '' : esc(L.typ)}" placeholder="leer = Auswahl oben"></div>
        <div class="form-group"><label>Haare (eigener Text)</label><input type="text" id="me-hair-own" value="${hair.exact ? '' : esc(L.hair)}" placeholder="leer = Auswahl oben"></div>
        <div class="form-group"><label>Stil (eigener Text)</label><input type="text" id="me-style-own" value="${sty.exact ? '' : esc(L.style)}" placeholder="leer = Auswahl oben"></div>
        <div class="form-group"><label>Notizen</label><textarea id="me-notes" rows="4" placeholder="Weitere Details über dich...">${esc(me.notes)}</textarea></div>
      </details>
      
      <button id="save-me-btn" class="btn-primary">Speichern</button>
    </div>
  `;
  
  wirePickers(root);
  const ov = (id) => root.querySelector('#' + id)?.value.trim() || '';
  root.querySelector('#save-me-btn').addEventListener('click', () => {
    const data = {
      name: root.querySelector('#me-name').value.trim(),
      look: {
        typ: ov('me-typ-own') || picked(root, 'me-typ'),
        age: parseInt(root.querySelector('#me-age').value),
        hair: ov('me-hair-own') || hairText(picked(root, 'me-hlen'), picked(root, 'me-hcol')),
        style: ov('me-style-own') || pickedAll(root, 'me-st').join(', '),
        kleidung: root.querySelector('#me-kleidung').value.trim(),
        besonderes: root.querySelector('#me-besonderes').value.trim()
      },
      notes: root.querySelector('#me-notes').value.trim()
    };
    saveMe(data);
    alert('Gespeichert!');
  });
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
