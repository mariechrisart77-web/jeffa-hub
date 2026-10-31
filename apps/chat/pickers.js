// Shared tap/slider pickers for profile + "Über mich" editors.
// Stored values stay plain strings (same fields as before), so prompts and old data keep working.
export const TYP = ['Frau', 'Mann', 'Divers'];
export const HAIR_COLOR = ['blond', 'brünett', 'schwarz', 'rot', 'grau'];
export const HAIR_LEN = ['kurze', 'schulterlange', 'lange'];
export const STYLE = ['elegant', 'sportlich', 'lässig', 'klassisch', 'modern', 'verspielt'];
export const SPECIAL = ['Tätowierung', 'Piercing', 'Brille', 'Sommersprossen', 'Narbe'];
export const GROESSE = ['keine Angabe', 'klein', 'eher klein', 'mittelgroß', 'groß', 'sehr groß'];
export const STATUR = ['keine Angabe', 'zierlich', 'schlank', 'athletisch', 'durchschnittlich', 'kräftig'];

const norm = (s) => String(s || '').trim().toLowerCase();
export const hairText = (len, col) => [len, col ? col + 'e' : ''].filter(Boolean).join(' ') + (len || col ? ' Haare' : '');

/** Map an old free-text value onto picker state. exact=true when the text is reproduced 1:1 by the picker. */
// English / synonym words in older free-text values (selection only; the stored text is never rewritten here)
const HAIR_COL_SYN = { blond: /\bblond/, brünett: /brünett|brunett|\bbrown|brunette|chestnut|braun/, schwarz: /schwarz|\bblack|raven|jet-black/, rot: /\brot(e|en)?\b|\bred\b|ginger|auburn|copper/, grau: /\bgrau|\bgr[ae]y\b|silver|silber/ };
const HAIR_LEN_SYN = { kurze: /\bkurz|\bshort|pixie|\bbob\b/, schulterlange: /schulterlang|shoulder/, lange: /\blang(e|en)?\b|\blong\b/ };
export function matchHair(v) {
  const t = norm(v);
  const col = HAIR_COLOR.find(c => HAIR_COL_SYN[c].test(t)) || '';
  const len = HAIR_LEN.find(l => HAIR_LEN_SYN[l].test(t)) || '';
  return { col, len, exact: !t || norm(hairText(len, col)) === t };
}
const TYP_SYN = { Frau: /\b(frau|woman|female|girl|lady|mädchen)\b/, Mann: /\b(mann|man|male|guy|boy|junge)\b/, Divers: /\b(divers|non-?binary|nonbinary|androgyn)/ };
export function matchTyp(v) {
  const t = norm(v), hit = TYP.find(x => norm(x) === t);
  return { val: hit || TYP.find(x => TYP_SYN[x].test(t)) || '', exact: !t || !!hit };
}

export function matchOne(list, v) {
  const t = norm(v);
  const hit = list.find(x => norm(x) === t);
  const near = hit || list.find(x => t && (t.includes(norm(x)) || norm(x).includes(t))) || '';
  return { val: near, exact: !t || !!hit };
}
export function matchMulti(list, v) {
  const parts = String(v || '').split(',').map(norm).filter(Boolean);
  const vals = list.filter(x => parts.some(p => p.includes(norm(x))));
  return { vals, exact: parts.every(p => list.some(x => norm(x) === p)) };
}
export function matchScale(labels, v) {
  const t = norm(v);
  let i = labels.findIndex(x => norm(x) === t);
  const exact = !t || i > 0;
  if (i < 1) i = t ? labels.findIndex((x, k) => k > 0 && t.includes(norm(x))) : 0;
  return { idx: Math.max(0, i), exact };
}

const e = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Single (radio) or multi (checkbox) chip row. */
export function chips(name, list, selected, multi = false, labels = null) {
  const sel = multi ? selected : [selected];
  return `<div class="chipset">${list.map((v, i) => `<label class="pchip"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${e(v)}" ${sel.includes(v) ? 'checked' : ''}><span>${e(labels ? labels[i] : v)}</span></label>`).join('')}</div>`;
}
/** v42: descriptive German step names for a 1..n scale between two poles (no numbers shown) */
export function scaleNames(left, right, n = 10) {
  const l = String(left).toLowerCase(), r = String(right).toLowerCase();
  const ten = [`sehr ${l}`, `deutlich ${l}`, l, `eher ${l}`, 'ausgewogen', 'ausgewogen', `eher ${r}`, r, `deutlich ${r}`, `sehr ${r}`];
  if (n === 10) return ten.map(x => x[0].toUpperCase() + x.slice(1));
  return Array.from({ length: n }, (_, i) => ten[Math.round(i * 9 / Math.max(1, n - 1))]).map(x => x[0].toUpperCase() + x.slice(1));
}
/** bipolar -5..5 -> words instead of numbers */
export function bipolarName(v, left, right) {
  v = Math.round(+v || 0); if (!v) return 'neutral';
  const a = Math.abs(v), w = a >= 5 ? 'sehr' : a >= 3 ? 'deutlich' : 'leicht';
  return `${w} ${v > 0 ? right : left}`;
}
/** voice tempo / pitch 0.5..2 -> words */
export const voiceName = (v, kind = 'rate') => { v = +v || 1; const w = kind === 'rate' ? ['sehr langsam', 'langsam', 'normal', 'schnell', 'sehr schnell'] : ['sehr tief', 'tief', 'normal', 'hoch', 'sehr hoch']; return w[v < 0.75 ? 0 : v < 0.95 ? 1 : v <= 1.1 ? 2 : v <= 1.5 ? 3 : 4]; };
/** Range slider with a live text label. */
export function slider(id, label, min, max, value, left, right, names = null) {
  const show = (v) => names ? names[v - min] : v;
  return `<div class="form-group pslider"><label>${e(label)}: <b id="${id}-val">${e(show(value))}</b></label>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${value}" ${names ? `data-names='${e(JSON.stringify(names))}' data-min="${min}"` : ''}>
    <div class="slider-labels"><span>${e(left)}</span><span>${e(right)}</span></div></div>`;
}
/** Live-update slider labels and let a selected radio chip be tapped again to clear it. */
export function wirePickers(root) {
  if (root.dataset.pk) return; root.dataset.pk = 1;
  root.addEventListener('input', (ev) => {
    const t = ev.target; if (t.type !== 'range' || !t.id || !(t.dataset.unit || t.dataset.names)) return; // others update their own label
    const out = root.querySelector('#' + t.id + '-val'); if (!out) return;
    out.textContent = t.dataset.unit ? (+t.value <= +t.min ? 'keine Angabe' : t.value + ' ' + t.dataset.unit) : JSON.parse(t.dataset.names)[t.value - t.dataset.min];
  });
  root.addEventListener('click', (ev) => {
    const inp = ev.target.closest('.pchip')?.querySelector('input[type=radio]');
    if (!inp || ev.target.tagName === 'INPUT') return;
    if (inp.checked) { ev.preventDefault(); inp.checked = false; inp.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}
export const picked = (root, name) => root.querySelector(`input[name="${name}"]:checked`)?.value || '';
export const pickedAll = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
