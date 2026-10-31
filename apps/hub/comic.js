// v35: 📖 Comic tab – portrait page like a printed comic: thick black gutters, 4 panels from a random layout template,
// cream caption box (UPPERCASE Spanish narration) top-left, white oval bubbles with tails, page number strip.
// Images are drawn WITHOUT text (FSK18: chroma, Standard: qwen-image-2-1-turbo); all text is HTML on top.
// Every panel is its own image (Spar mode removed in v40); speech bubbles are HTML overlays.
import { api } from './shared/api.js';
import { getModuleBody, getModuleChain } from './shared/module-models.js';
import { isAdult, onAdultChange } from './shared/fsk.js';
import { getProfiles } from './profiles.js';

const LOOK = 'painted comic book illustration, ink and watercolor, bold black ink outlines, warm lamp light, rich warm colors, expressive faces, detailed interior background, cinematic';
const NEG = 'text, letters, words, speech bubbles, captions, panels, panel borders, frames, comic layout, watermark, signature, logo, blurry, deformed hands, extra fingers';
const CAMS = ['medium shot', 'close-up on the faces', 'wide establishing shot', 'over-the-shoulder shot', 'low angle shot', 'three-quarter view medium-wide shot', 'high angle shot'];
const KEY = 'jeffa.comics';
export const PAGE = { W: 1000, H: 1800, G: 16, FOOT: 56 };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let root, busy = false;
let dragState = null;

// Layout templates: rows of panels (cols per row, relative row height). Always 4 panels.
export const TEMPLATES = [
  { id: 'A', rows: [[2, 0.31], [1, 0.345], [1, 0.345]] },   // like the example: 2 top, wide, wide
  { id: 'B', rows: [[1, 0.30], [2, 0.33], [1, 0.37]] },     // wide, 2, wide
  { id: 'C', rows: [[2, 0.36], [1, 0.30], [1, 0.34]] },     // 2 (taller), wide, wide
  { id: 'D', rows: [[1, 0.34], [1, 0.29], [2, 0.37]] },     // wide, wide, 2 at the bottom
];
/** panel rects in page units {x,y,w,h} for a template; jitter = small random height variation */
export function layout(tpl, jit = [0, 0, 0]) {
  const { W, H, G, FOOT } = PAGE, avail = H - FOOT - G * (tpl.rows.length + 1);
  const hs = tpl.rows.map(([, h], i) => h + (jit[i] || 0)), sum = hs.reduce((a, b) => a + b, 0);
  const out = []; let y = G;
  tpl.rows.forEach(([cols], i) => { const rh = avail * hs[i] / sum, cw = (W - G * (cols + 1)) / cols;
    for (let c = 0; c < cols; c++) out.push({ x: G + c * (cw + G), y, w: cw, h: rh }); y += rh + G; });
  return out;
}
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
/** random page design: template, height jitter, camera per panel – no Spar or pre-placed bubbles */
export function design(nBubbles = [2, 2, 2, 2]) {
  const tpl = pick(TEMPLATES), jit = tpl.rows.map(() => rnd(-0.03, 0.03)), rects = layout(tpl, jit);
  const panels = rects.map((r, i) => ({ ...r, nBubbles: nBubbles[i] || 0, cam: pick(CAMS) }));
  return { tpl: tpl.id, panels };
}

const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = c => { const a = [c, ...saved().filter(x => x.id !== c.id)].slice(0, 8); try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} };
// v38: z-image-turbo ($0.01) default, qwen-image-2-1-turbo ($0.02) optional for key panel; FSK18 always chroma
export const MODEL_CHEAP = 'z-image-turbo', MODEL_KEY = 'qwen-image-2-1-turbo';
export function costOf(panels, keyHQ, adult) {
  if (adult) return panels * 0.01; // FSK18: all chroma 0.01
  return keyHQ ? (panels - 1) * 0.01 + 0.02 : panels * 0.01;
}
export const keyPanel = d => d.panels.reduce((b, p, i, a) => p.w * p.h > a[b].w * a[b].h ? i : b, 0);

/** LLM script (FSK18: venice-uncensored-1-2, else default): {title, cast:[{name,look}], panels:[{scene_en,caption_es,bubbles:[{speaker,text_es,pos,head}],shot}]} */
export async function comicScript(story, { panels = 4, level = 'A2-B1', chars = '', adult = false } = {}) {
  const model = adult ? 'venice-uncensored-1-2' : 'gemini-3.5-flash-lite';
  const mb = getModuleBody('comic_text', { adult });
  const r = await api('/api/chat', { method: 'POST', body: { model, ...mb, stream: false, memory: false,
    system: `Du schreibst eine Comicseite für einen Spanisch-Lernenden (Niveau ${level}). Antworte NUR mit JSON:
{"title":"kurzer spanischer Titel","cast":[{"name":"Name","look":"englische Bildbeschreibung der Figur: Alter, Haare, Kleidung (gleich in allen Panels)"}],"panels":[{"scene_en":"englische Bildbeschreibung: Ort, wer ist wo (links/rechts), Handlung – ohne Text","caption_es":"kurze spanische Erzählzeile, max. 6 Wörter","bubbles":[{"speaker":"Name","text_es":"natürliches Spanisch, max. 8 Wörter","pos":"left|right|center","head":"top|middle"}],"shot":"medium shot|close-up|wide shot|…"}]}
Genau ${panels} Panels, je 0–2 kurze Sprechblasen, zusammenhängende Mini-Geschichte mit Pointe. "pos" = Seite der sprechenden Person im Panel (left/right/center), "head" = Kopfhöhe (top/middle).`,
    messages: [{ role: 'user', content: `Geschichte/Szene: ${story}${chars ? `\nFiguren: ${chars}` : ''}` }] } });
  const m = String(r.reply || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('Kein Skript erhalten');
  const sc = parseScript(m[0]); if (!sc) throw new Error('Comic-Skript unlesbar – bitte nochmal versuchen'); return sc;
}

/** parse script JSON, return {title, cast, panels} or null */
export function parseScript(text) {
  let j; try { const m = String(text || '').match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  if (!j || typeof j !== 'object') return null;
  const cast = (Array.isArray(j.cast) ? j.cast : []).slice(0, 4).map(c => ({ name: String(c.name || '').slice(0, 30), look: String(c.look || '').slice(0, 200) }));
  const ps = (Array.isArray(j.panels) ? j.panels : []).map(p => {
    const bubbles = (Array.isArray(p.bubbles) ? p.bubbles : []).slice(0, 2).map(b => ({
      speaker: String(b.speaker || '').slice(0, 30),
      text_es: String(b.text_es || b.es || '').slice(0, 90),
      pos: ['left', 'right', 'center'].includes(b.pos) ? b.pos : 'left',
      head: ['top', 'middle'].includes(b.head) ? b.head : 'top'
    }));
    return {
      scene_en: String(p.scene_en || p.scene || '').slice(0, 400),
      caption_es: String(p.caption_es || p.caption || '').slice(0, 60),
      bubbles,
      shot: String(p.shot || p.cam || 'medium shot').slice(0, 60)
    };
  });
  if (ps.length < 2) return null;
  return { title: String(j.title || '').slice(0, 80), cast, panels: ps };
}

const castTxt = sc => sc.cast.map(c => `${c.name}: ${c.look}`).join('; ');
/** build image prompt from panel: scene_en + speaker position + "no text, no letters" */
export function panelPrompt(panel, cast) {
  const speakerHint = panel.bubbles.length > 0 ? ` The speaking character is on the ${panel.bubbles[0].pos} side of the frame.` : '';
  return `${LOOK}. ${panel.shot}. Characters (keep consistent): ${cast.map(c => `${c.name}: ${c.look}`).join('; ')}. Scene: ${panel.scene_en}.${speakerHint} Empty space at top for speech bubbles, no text, no letters, no speech bubbles.`;
}
async function draw(prompt, adult, w, h, model = MODEL_CHEAP) {
  const r = await api('/api/image', { method: 'POST', body: { prompt: prompt.slice(0, 1900), negative: NEG, style: 'comic', adult, model, width: w, height: h } });
  const url = r.url || r.dataUrl || (r.b64_json ? `data:image/png;base64,${r.b64_json}` : ''); if (!url) throw new Error('Kein Bild');
  return { url, cost: r.cost || 0, model: r.model || '' };
}
function fontOnce() { if (document.getElementById('cm-font')) return; const l = document.createElement('link'); l.id = 'cm-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@700&display=swap'; document.head.appendChild(l); }

export function mount(el) { if (root === el) return; root = el; fontOnce(); render(); onAdultChange(() => { if (!busy) refreshChars(); }); }
function refreshChars() { const sel = root?.querySelector('#cm-char'); if (!sel) return; const v = sel.value; const profs = (() => { try { return getProfiles().filter(p => p.enabled !== false); } catch { return []; } })(); sel.innerHTML = `<option value="">– frei –</option>` + profs.map(p => `<option value="${esc(p.id)}">${p.adult ? '🔞 ' : ''}${esc(p.name)}</option>`).join(''); sel.value = v; root.querySelector('#cm-fsk').innerHTML = isAdult() ? '<option value="0">Standard</option><option value="1" selected>🔞 FSK18</option>' : '<option value="0">Standard</option>'; updCost(); }
let updCost = () => {};
function render() {
  const profs = (() => { try { return getProfiles().filter(p => p.enabled !== false); } catch { return []; } })();
  queueMicrotask(() => import('./shared/quickfill.js').then((q) => q.quickfill(root)).catch(() => {})); // v64 presets
  root.innerHTML = `<div class="comic-wrap">
    <button class="btn-primary" data-open-bild style="width:100%;margin-bottom:10px">🖼 Bild-App öffnen</button>
    <div class="card comic-form">
      <label class="field-label">Geschichte / Szene</label><textarea id="cm-story" rows="3" style="min-height:4.5em;resize:vertical" placeholder="z. B. Lena bestellt in einer Bar in Valencia Tapas und versteht die Kellnerin falsch"></textarea>
      <div class="comic-row">
        <div><label class="field-label">Figur</label><select id="cm-char"></select></div>
        <div><label class="field-label">Panels</label><select id="cm-panels"><option>2</option><option selected>3</option><option>4</option></select></div>
        <div><label class="field-label">Freigabe</label><select id="cm-fsk"></select></div>
        <div><label class="field-label">Niveau</label><select id="cm-lvl"><option>A1-A2</option><option selected>A2-B1</option><option>B1-B2</option></select></div>
      </div>
      <label class="toggle-label"><input type="checkbox" id="cm-keyhq"><span>Hauptbild in höherer Qualität (qwen, +0,01 $)</span></label>
      <div class="hint" id="cm-cost"></div>
      <button class="btn btn-primary" id="cm-go" style="width:100%;margin-top:6px">✨ Comic erstellen</button>
      <div class="hint" id="cm-status"></div>
    </div>
    <div id="cm-out"></div>
    <details class="comic-saved"><summary>Gespeicherte Comics</summary><div id="cm-list"></div></details></div>`;
  const panelsSel = root.querySelector('#cm-panels'), keyHQCb = root.querySelector('#cm-keyhq'), fskSel = root.querySelector('#cm-fsk');
  updCost = () => {
    const n = parseInt(panelsSel.value) || 3, hq = keyHQCb.checked, a = fskSel.value === '1';
    const cost = costOf(n, hq, a);
    root.querySelector('#cm-cost').textContent = `${n} Bilder · ≈ ${cost.toFixed(2).replace('.', ',')} $${a ? ' · 🔞 chroma' : hq ? ' · qwen' : ' · z-image-turbo'}`;
  };
  panelsSel.onchange = () => updCost(); keyHQCb.onchange = () => updCost(); fskSel.onchange = () => updCost();
  refreshChars(); root.querySelector('#cm-go').onclick = () => create();
  const list = root.querySelector('#cm-list');
  list.innerHTML = saved().map(c => `<button class="btn-sm secondary" data-id="${esc(c.id)}">${esc(c.script.title || 'Comic')} · ${new Date(c.ts).toLocaleDateString('de-DE')}</button>`).join(' ') || '<div class="hint">Noch keine.</div>';
  list.querySelectorAll('[data-id]').forEach(b => b.onclick = () => show(saved().find(c => c.id === b.dataset.id)));
}

/** generate a comic (also used by tests) */
export async function makeComic({ story, panels = 3, keyHQ = false, adult = isAdult(), level = 'A2-B1', chars = '', onStep = () => {} }) {
  onStep('✍️ LLM schreibt das Skript…');
  const script = await comicScript(story, { panels, level, chars, adult });
  const d = design(script.panels.map(p => p.bubbles.length));
  const c = { id: 'c' + Date.now().toString(36), ts: Date.now(), page: saved().length + 1, panels, keyHQ, adult, script, design: d, images: [], cost: 0, models: [], bubblePos: {} };
  onStep('🎨 Zeichne…', c);
  const kp = keyPanel(d);
  for (let i = 0; i < panels; i++) {
    onStep(`🎨 Panel ${i + 1}/${panels}…`, c);
    const p = d.panels[i], sp = script.panels[i], wide = p.w / p.h > 1.3;
    const ci = getModuleChain('comic_image', { adult })[0];
    const model = ci || (adult ? 'chroma' : (keyHQ && i === kp ? MODEL_KEY : MODEL_CHEAP));
    const r = await draw(panelPrompt(sp, script.cast), adult, wide ? 1024 : 768, wide ? 640 : 1024, model);
    c.images[i] = r.url; c.cost += r.cost; c.models.push(r.model);
  }
  return c;
}
async function create() {
  if (busy) return;
  const story = root.querySelector('#cm-story').value.trim(); if (!story) return alert('Bitte eine Geschichte oder Szene eingeben.');
  const panels = parseInt(root.querySelector('#cm-panels').value) || 3, keyHQ = root.querySelector('#cm-keyhq').checked;
  const adult = isAdult() && root.querySelector('#cm-fsk').value === '1';
  const pid = root.querySelector('#cm-char').value, prof = pid ? getProfiles().find(p => p.id === pid) : null;
  const cost = costOf(panels, keyHQ, adult);
  if (!(await askDlg(`${panels} Bilder malen? Kosten ca. ${cost.toFixed(2).replace('.', ',')} $`))) return;
  const st = root.querySelector('#cm-status'), go = root.querySelector('#cm-go'); busy = true; go.disabled = true;
  try {
    const c = await makeComic({ story, panels, keyHQ, adult, level: root.querySelector('#cm-lvl').value, chars: prof ? `${prof.name}${prof.description ? ' – ' + prof.description.slice(0, 120) : ''}` : '', onStep: (t, cc) => { st.textContent = t; if (cc) show(cc); } });
    save(c); show(c); st.textContent = `✅ Fertig · $${c.cost.toFixed(2)}`;
  } catch (e) { st.textContent = '⚠️ ' + e.message; }
  busy = false; go.disabled = false;
}

const pct = (v, t) => (v / t * 100).toFixed(3) + '%';
function imgStyle(c, i) {
  const url = c.images[i]; if (!url) return '';
  return `background-image:url('${esc(url)}');background-size:cover;background-position:center`;
}

/** bubble geometry: {x,y,w,h, tailX, tailY} in page units */
export function bubbleGeom(panel, bubble, index) {
  const maxTop = 0.22, bw = panel.w * 0.36, bh = 50;
  let x = bubble.pos === 'right' ? panel.x + panel.w * 0.6 : bubble.pos === 'center' ? panel.x + panel.w * 0.32 : panel.x + panel.w * 0.04;
  let y = panel.y + panel.h * 0.04 + index * (bh + 8);
  if (y + bh > panel.y + panel.h * maxTop) y = panel.y + panel.h * maxTop - bh;
  const tailX = bubble.pos === 'right' ? x + bw * 0.7 : bubble.pos === 'center' ? x + bw * 0.5 : x + bw * 0.3;
  const tailY = y + bh * 0.85;
  return { x: Math.max(panel.x, Math.min(panel.x + panel.w - bw, x)), y: Math.max(panel.y, y), w: bw, h: bh, tailX, tailY };
}
export function comicHtml(c) {
  const { W, H, FOOT } = PAGE, s = c.script;
  const cells = c.design.panels.slice(0, c.panels || s.panels.length).map((p, i) => {
    const sp = s.panels[i]; if (!sp) return '';
    const bubbles = sp.bubbles.map((b, k) => {
      const pos = c.bubblePos?.[`${i}-${k}`] || bubbleGeom(p, b, k);
      return `<div class="cm-bubble" data-panel="${i}" data-bubble="${k}" style="left:${pct(pos.x - p.x, p.w)};top:${pct(pos.y - p.y, p.h)};width:${pct(pos.w, p.w)};height:${pct(pos.h, p.h)}" data-es="${esc(b.text_es)}" title="${esc(b.speaker)}"><span>${esc(b.text_es)}</span><div class="cm-tail" style="left:${pct(pos.tailX - pos.x, pos.w)};top:${pct(pos.tailY - pos.y, pos.h)}"></div></div>`;
    }).join('');
    return `<div class="cm-panel ${c.images[i] ? '' : 'loading'}" style="left:${pct(p.x, W)};top:${pct(p.y, H)};width:${pct(p.w, W)};height:${pct(p.h, H)};${imgStyle(c, i)}">
      ${sp.caption_es ? `<div class="cm-cap" data-es="${esc(sp.caption_es.toUpperCase())}">${esc(sp.caption_es.toUpperCase())}</div>` : ''}
      ${bubbles}</div>`;
  }).join('');
  return `<div class="cm-page" data-tpl="${esc(c.design.tpl)}" style="aspect-ratio:${W}/${H}">${cells}<div class="cm-foot" style="height:${pct(FOOT, H)}">${c.page || 1}</div></div>`;
}

function show(c) {
  if (!c) return; const out = root.querySelector('#cm-out');
  out.innerHTML = `<h3 class="cm-title">${esc(c.script.title)}</h3>` + comicHtml(c) + `<div class="row-btns"><button class="btn-sm" id="cm-png" ${c.images.filter(Boolean).length ? '' : 'disabled'}>🖼 Als PNG speichern</button><span class="hint">Tippe auf eine Sprechblase für Deutsch.</span></div>`;
  out.querySelectorAll('.cm-bubble').forEach(b => {
    b.onclick = e => { if (dragState) return; const de = b.classList.toggle('de'); b.querySelector('span').textContent = de ? '(Übersetzung später)' : b.dataset.es; };
    b.addEventListener('touchstart', e => dragStart(e, c), { passive: false });
    b.addEventListener('mousedown', e => dragStart(e, c));
  });
  out.querySelector('#cm-png').onclick = () => exportPng(c).catch(e => alert('Export fehlgeschlagen: ' + e.message));
}

function dragStart(e, c) {
  const b = e.currentTarget, panel = b.parentElement, pr = panel.getBoundingClientRect(), rect = b.getBoundingClientRect();
  const t = e.touches?.[0] || e, sx = t.clientX, sy = t.clientY; let moved = false;
  const move = e2 => { const t2 = e2.touches?.[0] || e2; if (!moved && Math.hypot(t2.clientX - sx, t2.clientY - sy) < 6) return; moved = true; dragState = true; e2.preventDefault?.();
    b.style.left = ((rect.left - pr.left + t2.clientX - sx) / pr.width * 100) + '%'; b.style.top = ((rect.top - pr.top + t2.clientY - sy) / pr.height * 100) + '%'; };
  const end = () => { document.removeEventListener('touchmove', move); document.removeEventListener('mousemove', move); document.removeEventListener('touchend', end); document.removeEventListener('mouseup', end);
    if (moved) { const i = +b.dataset.panel, k = +b.dataset.bubble, p = c.design.panels[i], g = bubbleGeom(p, c.script.panels[i].bubbles[k], k), nr = b.getBoundingClientRect();
      const x = p.x + (nr.left - pr.left) / pr.width * p.w, y = p.y + (nr.top - pr.top) / pr.height * p.h;
      c.bubblePos = c.bubblePos || {}; c.bubblePos[`${i}-${k}`] = { ...g, x, y, tailX: g.tailX + x - g.x, tailY: g.tailY + y - g.y }; try { save(c); } catch {} }
    setTimeout(() => { dragState = null; }, 0); };
  document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('mousemove', move);
  document.addEventListener('touchend', end); document.addEventListener('mouseup', end);
}

// ---- PNG export: same geometry on a canvas (page units -> 1000x1800 px)
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => no(new Error('Bild nicht ladbar')); i.src = src; });
function wrap(ctx, text, maxW) { const words = text.split(/\s+/), lines = []; let l = ''; for (const w of words) { const t = l ? l + ' ' + w : w; if (ctx.measureText(t).width > maxW && l) { lines.push(l); l = w; } else l = t; } if (l) lines.push(l); return lines; }
export async function exportPng(c, download = true) {
  const { W, H, FOOT } = PAGE, s = c.script;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imgs = await Promise.all(c.images.map(u => u ? loadImg(u) : null));
  const font = '"Comic Neue","Comic Sans MS",cursive';
  c.design.panels.slice(0, c.panels || s.panels.length).forEach((p, i) => {
    const im = imgs[i], sp = s.panels[i]; if (!sp) return;
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
    if (im) { const sc = Math.max(p.w / im.width, p.h / im.height); ctx.drawImage(im, p.x + (p.w - im.width * sc) / 2, p.y + (p.h - im.height * sc) / 2, im.width * sc, im.height * sc); }
    else { ctx.fillStyle = '#e7e1d4'; ctx.fillRect(p.x, p.y, p.w, p.h); }
    if (sp.caption_es) { ctx.font = `700 22px ${font}`; const t = sp.caption_es.toUpperCase(), lines = wrap(ctx, t, p.w * 0.5), bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, bh = lines.length * 25 + 12;
      ctx.fillStyle = '#f7e9a8'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.fillRect(p.x, p.y, bw, bh); ctx.strokeRect(p.x, p.y, bw, bh); ctx.fillStyle = '#000'; lines.forEach((l, j) => ctx.fillText(l, p.x + 10, p.y + 28 + j * 25)); }
    sp.bubbles.forEach((b, k) => {
      const geom = c.bubblePos?.[`${i}-${k}`] || bubbleGeom(p, b, k);
      ctx.font = `700 26px ${font}`; const lines = wrap(ctx, b.text_es, geom.w - 16), tw = Math.max(...lines.map(l => ctx.measureText(l).width));
      const rx = tw / 2 + 18, ry = lines.length * 16 + 14;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(geom.x + geom.w / 2, geom.y + geom.h / 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const tx = geom.tailX, ty = geom.tailY, ang = b.pos === 'right' ? 25 : -25;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang * Math.PI / 180); ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(0, 10); ctx.lineTo(8, -12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center'; lines.forEach((l, j) => ctx.fillText(l, geom.x + geom.w / 2, geom.y + geom.h / 2 - (lines.length - 1) * 15 + j * 30 + 9)); ctx.textAlign = 'left';
    });
    ctx.restore();
  });
  ctx.fillStyle = '#fff'; ctx.font = `700 26px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(c.page || 1), W / 2, H - FOOT / 2 + 9);
  if (!download) return cv;
  const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (s.title || 'comic').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return cv;
}

/** v36: in-app confirm dialog (no native confirm) */
function askDlg(text) { return new Promise(res => { const d = document.createElement('div'); d.className = 'cm-dlg';
  d.innerHTML = `<div class="cm-dlg-box"><p>${esc(text)}</p><div class="row-btns"><button class="btn-sm secondary" data-v="0">Abbrechen</button><button class="btn btn-primary" data-v="1">🎨 Malen</button></div></div>`;
  d.onclick = e => { const v = e.target.dataset?.v; if (v == null && e.target !== d) return; d.remove(); res(v === '1'); }; d.style.setProperty('visibility', 'visible', 'important'); document.body.appendChild(d); }); }
