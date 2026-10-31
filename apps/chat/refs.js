import { api } from './shared/api.js';

const CATS = [['gesicht', '🙂 Gesicht'], ['koerper', '🧍 Körper'], ['details', '🔍 Details'], ['kleidung', '👗 Kleidung']];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function compress(file, max = 1024, q = 0.82) {
  const img = await createImageBitmap(file).catch(async () => { const i = new Image(); i.src = URL.createObjectURL(file); await i.decode(); return i; });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let d = c.toDataURL('image/jpeg', q); if (d.length > 900000) d = c.toDataURL('image/jpeg', 0.6);
  return d.split(',')[1];
}

async function compressThumb(file) {
  return compress(file, 256, 0.8);
}

const pick = (multiple = true) => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple; i.onchange = () => res([...i.files]); i.click(); });

const TAGS = [['gesicht', '🙂 Ref: Gesicht'], ['koerper', '🧍 Ref: Körper'], ['details', '🔍 Ref: Details'], ['kleidung', '👗 Ref: Kleidung'], ['beispiel', '🎨 Beispielbild'], ['generiert', '🖼 Generiert']];
const REF = ['gesicht', 'koerper', 'details', 'kleidung'];
const FILTERS = [['alle', 'Alle'], ['ref', 'Referenz'], ['beispiel', 'Beispielbild'], ['generiert', 'Generiert'], ['fav', '❤ Favorit']];
let filter = 'alle';
const match = (i, f) => f === 'alle' || (f === 'ref' ? REF.includes(i.cat) : f === 'fav' ? !!i.fav : i.cat === f);

export async function saveToGallery(profileId, src, cat = 'generiert') {
  const blob = await (await fetch(src)).blob();
  const data = await compress(blob);
  const thumb = await compressThumb(blob);
  return api('/api/refs', { method: 'POST', body: { profile: profileId, cat, mime: 'image/jpeg', data, thumb } });
}

export async function renderRefs(el, profile, save) {
  el.innerHTML = '<div class="hint">Lade Galerie…</div>';
  let items = [];
  try { items = (await api('/api/refs?profile=' + encodeURIComponent(profile.id))).items; } catch (e) { el.innerHTML = `<div class="error">${esc(e.message)}</div>`; return; }
  
  const starItem = items.find(i => i.star && REF.includes(i.cat));
  // mode: server setting if one was saved, else the legacy profile flags (refFace + refMode)
  const srv = (await api(`/api/refs/settings?profile=${encodeURIComponent(profile.id)}`).catch(() => ({ mode: null }))).mode;
  const mode = srv || (profile.refFace ? (profile.refMode === 'full' || profile.refMode === 'figur' ? 'figur' : 'face') : 'off');
  if (srv && !(srv === 'figur' && profile.refMode === 'full')) { profile.refFace = srv !== 'off'; if (srv !== 'off') profile.refMode = srv; }

  const nB = items.filter(i => i.cat === 'beispiel').length;
  const shown = items.filter(i => match(i, filter)).reverse();
  el.innerHTML = `<div class="hint">Eine Galerie pro Figur. Tags jederzeit änderbar. Das aktive Gesichtsbild (⭐) dient als Referenz bei der Bildgenerierung; bis zu 3 Beispielbilder dienen beim „Look ableiten" als Stilvorlage.</div>
    <div class="gal-filters">${FILTERS.map(([f, l]) => `<button class="btn-sm ${f === filter ? 'on' : ''}" data-f="${f}">${l} (${items.filter(i => match(i, f)).length})</button>`).join('')}</div>
    <div class="ref-head" style="margin-top:6px"><select id="gal-tag">${TAGS.map(([c, l]) => `<option value="${c}" ${c === (filter === 'beispiel' ? 'beispiel' : filter === 'generiert' ? 'generiert' : 'gesicht') ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn-sm" id="gal-add">＋ Hochladen</button></div>
    <div class="ref-mode" style="margin-top:8px"><label>Referenz-Modus</label>
      <div class="mode-seg" style="display:flex;gap:4px">
        <button class="btn-sm ${mode === 'off' ? 'on' : ''}" data-mode="off">Aus</button>
        <button class="btn-sm ${mode === 'face' ? 'on' : ''}" data-mode="face">Gesicht</button>
        <button class="btn-sm ${mode === 'figur' ? 'on' : ''}" data-mode="figur">Gesicht + Figur</button>
      </div>
    </div>
    ${nB > 3 ? '<div class="hint" style="color:#f59e0b;margin-top:8px">Mehr als 3 Beispielbilder – für die Analyse werden die 3 neuesten genutzt.</div>' : ''}
    <div class="ref-grid" style="margin-top:12px">${shown.map(i => `<div class="ref-th ${i.star ? 'on' : ''}" data-id="${i.id}"><img src="data:${esc(i.mime || 'image/jpeg')};base64,${i.thumb || i.data || ''}" alt="" loading="lazy">
      <select class="gal-cat" aria-label="Tag">${TAGS.map(([c, l]) => `<option value="${c}" ${c === i.cat ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="ref-act">${i.cat === 'gesicht' ? `<button data-a="star" title="Als Haupt-Referenz">${i.star ? '⭐' : '☆'}</button>` : ''}<button data-a="fav" title="Favorit">${i.fav ? '❤' : '♡'}</button><button data-a="replace" title="Ersetzen">🔄</button><button data-a="del" title="Löschen">🗑</button></div></div>`).join('') || '<span class="hint">Keine Bilder in diesem Filter.</span>'}</div>
    <button class="btn btn-secondary" id="ref-derive" style="width:100%;margin-top:8px" ${items.some(i => i.cat !== 'generiert' || i.fav) ? '' : 'disabled'}>✨ Look aus Bildern ableiten</button><div id="ref-out"></div>`;
  
  const reload = () => { save(); renderRefs(el, profile, save); };
  
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; reload(); });
  
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => {
    const m = b.dataset.mode;
    try { await api(`/api/refs/settings?profile=${encodeURIComponent(profile.id)}`, { method: 'PUT', body: { mode: m } }); } catch (e) { alert('Fehler: ' + e.message); return; }
    profile.refFace = m !== 'off'; if (m !== 'off') profile.refMode = m;
    reload();
  });
  
  el.querySelector('#gal-add').onclick = async (ev) => {
    const b = ev.target, cat = el.querySelector('#gal-tag').value;
    const files = await pick(); if (!files.length) return; b.disabled = true; b.textContent = '⏳';
    try {
      for (const f of files) {
        const data = await compress(f);
        const thumb = await compressThumb(f);
        await api('/api/refs', { method: 'POST', body: { profile: profile.id, cat, mime: 'image/jpeg', data, thumb } });
      }
    } catch (e) { alert('Upload fehlgeschlagen: ' + e.message); }
    reload();
  };
  
  el.querySelectorAll('.gal-cat').forEach(sel => sel.onchange = async () => {
    try { await api('/api/refs/' + sel.closest('[data-id]').dataset.id, { method: 'PATCH', body: { cat: sel.value } }); } catch (e) { alert('Fehler: ' + e.message); }
    reload();
  });
  
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const id = b.closest('[data-id]').dataset.id, a = b.dataset.a, it = items.find(x => x.id === id);
    try {
      if (a === 'del') { if (!confirm('Bild löschen?')) return; await api('/api/refs/' + id, { method: 'DELETE' }); }
      if (a === 'star') await api(`/api/refs/${id}/star`, { method: 'POST', body: {} });
      if (a === 'fav') await api('/api/refs/' + id, { method: 'PATCH', body: { fav: !it.fav } });
      if (a === 'replace') { const [f] = await pick(false); if (!f) return; const data = await compress(f); const thumb = await compressThumb(f); await api('/api/refs/' + id, { method: 'PUT', body: { mime: 'image/jpeg', data, thumb } }); }
    } catch (e) { alert('Fehler: ' + e.message); }
    reload();
  });
  
  el.querySelector('#ref-derive').onclick = async (ev) => {
    const btn = ev.target; btn.disabled = true; btn.textContent = '⏳ Gemini analysiert…';
    const order = ['gesicht', 'koerper', 'kleidung', 'details'];
    const refs = items.filter(i => REF.includes(i.cat)).sort((a, b) => (b.star - a.star) || order.indexOf(a.cat) - order.indexOf(b.cat)).slice(0, 5);
    const ex = items.filter(i => i.cat === 'beispiel').slice(-3);
    const chosen = (refs.length ? [...refs.slice(0, Math.max(2, 5 - ex.length)), ...ex] : [...ex, ...items.filter(i => i.cat === 'generiert' && i.fav).slice(-3)]).slice(0, 5);
    const images = [];
    for (const it of chosen) {
      let data = it.data;
      if (!data) { try { data = (await api(`/api/refs/${it.id}/full`)).dataUrl.split(',')[1]; } catch { data = it.thumb; } }
      if (!data) continue;
      images.push({ mimeType: it.mime || 'image/jpeg', data });
    }
    const cur = profile.looks?.refLook || '';
    try {
      const r = await api('/api/chat', { method: 'POST', body: { model: 'gemini-3.5-flash-lite', stream: false, memory: false,
        system: 'Du beschreibst Referenzfotos einer erwachsenen Person neutral und sachlich für einen Bildgenerierungs-Prompt. Nur sichtbare, nicht-explizite Merkmale: Haare (Farbe, Länge, Frisur), Gesicht (Form, Augenfarbe, markante Merkmale), Statur/Figur allgemein, Kleidungsstil, Farben. Keine sexuellen oder anzüglichen Beschreibungen, keine Namen, keine Altersschätzung unter 25. Die mit „Referenz" markierten Bilder zeigen die Person; mit „Beispielbild" markierte Bilder sind nur Stilvorlagen (Bildstil, Licht, Bildaufbau, Kleidungsstil) – übernimm von ihnen den Stil, nicht die Identität. Antworte NUR mit einem kommagetrennten englischen Prompt (max. 70 Wörter).',
        messages: [{ role: 'user', content: `Bilder in Reihenfolge: ${chosen.map((i, n) => (n + 1) + '=' + (REF.includes(i.cat) ? 'Referenz/' + i.cat : 'Beispielbild')).join(', ')}. ${cur ? 'Bisheriger Look-Prompt: ' + cur : ''} Erstelle einen aktualisierten Look-Prompt.`, images }] } });
      const prop = String(r.reply || '').trim().replace(/^["']|["']$/g, '');
      el.querySelector('#ref-out').innerHTML = `<div class="card" style="margin-top:8px"><b>Vorschlag – bitte prüfen</b><p class="hint">Hinweis: Die Bilder wurden zur Analyse an Gemini (Google) gesendet. Nichts wird automatisch überschrieben.</p>
        ${cur ? `<small>Aktuell:</small><div class="hint">${esc(cur)}</div>` : ''}<textarea id="ref-prop" rows="4" style="width:100%">${esc(prop)}</textarea>
        <div class="row-btns"><button class="btn btn-primary" id="ref-save">Übernehmen</button><button class="btn btn-secondary" id="ref-cancel">Verwerfen</button></div></div>`;
      el.querySelector('#ref-save').onclick = () => { profile.looks = profile.looks || {}; profile.looks.refLook = el.querySelector('#ref-prop').value.trim(); save(); el.querySelector('#ref-out').innerHTML = '<div class="hint">✅ Look gespeichert (wird im Bild-Prompt genutzt).</div>'; };
      el.querySelector('#ref-cancel').onclick = () => { el.querySelector('#ref-out').innerHTML = ''; };
    } catch (e) { alert('Analyse fehlgeschlagen: ' + e.message); }
    btn.disabled = false; btn.textContent = '✨ Look aus Bildern ableiten';
  };
}
