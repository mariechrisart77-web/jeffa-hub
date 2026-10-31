// v78 Figur: eine Quelle für Figur→Text (Client + Server). Reines JS, keine Browser-APIs.

export const BUST_EN = ['', 'small A-cup bust', 'small B-cup bust', 'medium C-cup bust', 'full D-cup bust', 'large DD-cup bust', 'very large F-cup bust', 'huge G-cup bust'];

export const HIPS_EN = ['', 'very slim straight hips', 'slim hips', 'slender hips', 'narrow hips and waist', 'average hips and waist', 'softly rounded hips', 'curvy hips and defined waist', 'very curvy hips and narrow waist', 'wide curvy hips and narrow waist', 'very wide curvy hips and narrow waist'];

const CUP_LETTERS = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Oberweite 1–7 → Körbchenbuchstabe */
export function cupLetter(oberweite) {
  const o = Math.max(0, Math.min(7, Number(oberweite) || 0));
  return CUP_LETTERS[o] || '';
}

/** BMI auf 1 Nachkommastelle, null bei fehlenden/unplausiblen Werten */
export function bmi(cm, kg) {
  const c = Number(cm), k = Number(kg);
  if (!Number.isFinite(c) || !Number.isFinite(k)) return null;
  if (c < 100 || c > 250 || k < 20 || k > 400) return null;
  const m = c / 100;
  const v = k / (m * m);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 10) / 10;
}

/** BMI → deutsches Label + englischer Prompt-Baustein */
export function bmiClass(b) {
  const v = Number(b);
  if (!Number.isFinite(v)) return { de: '', en: '' };
  if (v < 18.5) return { de: 'sehr schlank', en: 'very slim, slender build' };
  if (v < 22) return { de: 'schlank', en: 'slim build' };
  if (v < 25) return { de: 'normal', en: 'average build' };
  if (v < 30) return { de: 'kräftiger', en: 'soft, full-figured build' };
  return { de: 'stark', en: 'plus-size build' };
}

/** Kalibrier-Offsets pro Modellfamilie (Stufen; 0 = keine Änderung, -1 = eine Stufe kleiner formulieren) */
export const BUST_CALIBRATION = { chroma: 0, lustify: 0, zimage: 0, default: 0 };

function calOffset(model) {
  const m = String(model || '').toLowerCase();
  for (const key of Object.keys(BUST_CALIBRATION)) {
    if (key !== 'default' && m && m.includes(key)) return Number(BUST_CALIBRATION[key]) || 0;
  }
  return Number(BUST_CALIBRATION.default) || 0;
}

/** Negativ-Prompt für Brust, wenn kalibriert wurde und Ausgangswert klein ist (A/B) */
export function bustNegative({ model, oberweite } = {}) {
  const off = calOffset(model);
  const o = Math.max(0, Math.min(7, Number(oberweite) || 0));
  if (off < 0 && (o === 1 || o === 2)) return 'large breasts, big bust';
  return '';
}

const BUST_EXTRA = {
  1: 'petite %SIZE% bust, very small flat chest',
  2: 'petite %SIZE% bust, small chest',
  3: 'medium %SIZE% bust',
  4: 'full %SIZE% bust',
  5: 'large %SIZE% bust',
  6: 'very large %SIZE% bust',
  7: 'huge %SIZE% bust',
};

/** Brust-Text: ohne Unterbrust exakt BUST_EN (Altprofile unverändert) */
export function bustText({ oberweite, unterbrustCm, model } = {}) {
  let o = Math.max(0, Math.min(7, Number(oberweite) || 0));
  if (o < 1) return '';
  const off = calOffset(model);
  const eff = Math.max(1, Math.min(7, o + off));
  const ub = Number(unterbrustCm);
  if (!Number.isFinite(ub) || ub < 50 || ub > 120) return BUST_EN[eff];
  const size = `${Math.round(ub)}${cupLetter(eff)}`;
  const tpl = BUST_EXTRA[eff] || BUST_EN[eff];
  return tpl.replace('%SIZE%', size);
}

/** Figur-Bausteine in fester Reihenfolge: Größe, BMI (nur mit kg), Hüfte, Brust */
export function figureParts(figur = {}, opts = {}) {
  const { staturFromLook = '', model = '', translate = null } = opts || {};
  const parts = [];
  const h = String(figur.groesse || '').match(/\d{2,3}/)?.[0];
  if (h) parts.push(`${h} cm tall`);
  const stat = String(figur.statur || staturFromLook || '').trim();
  if (stat) {
    const en = translate ? translate(stat) : deToEnTidy(stat);
    if (en) parts.push(/\b(build|figure|frame)\b/i.test(en) ? en : `a ${en} build`);
  }
  if (figur.gewichtKg) {
    const b = bmi(Number(h) || 0, Number(figur.gewichtKg));
    if (b != null) parts.push(bmiClass(b).en);
  }
  const k = Math.max(0, Math.min(10, Number(figur.kurven) || 0));
  if (k >= 1) parts.push(HIPS_EN[k]);
  const bt = bustText({ oberweite: figur.oberweite, unterbrustCm: figur.unterbrustCm, model });
  if (bt) parts.push(bt);
  return parts;
}

// Minimale, identische Statur-Normalisierung wie in util.js (kein Server-Import im Client-Bundle)
const DE_TO_EN_BODY = {
  'zierlich': 'petite delicate',
  'schlank': 'slim',
  'athletisch': 'athletic toned',
  'durchschnittlich': 'average',
  'kräftig': 'sturdy strong',
  'klein': 'short height, petite',
  'eher klein': 'rather short height',
  'mittelgroß': 'average height',
  'groß': 'tall',
  'sehr groß': 'very tall',
};
function deToEnTidy(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const k = t.toLowerCase();
  return DE_TO_EN_BODY[k] || t;
}
