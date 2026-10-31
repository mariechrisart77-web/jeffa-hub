// v75 Sprach-/Identitäts-Filter für Charakter-Card-Texte.
// Generisch: erkennt deutsche Fragmente, Fremd-Personen-Fragmente, explizite Anatomie, Kamera-Junk.
import { low, splitSegs, tidy } from './util.js';

/** Häufige deutsche Stoppwörter + Umlaute → Indikator für deutschen Text */
const DE_STOPWORDS = new Set([
  'ist', 'sie', 'und', 'oder', 'gerne', 'gern', 'zeigt', 'sich', 'der', 'das', 'mit', 'ein', 'eine',
  'einen', 'einem', 'eines', 'auch', 'aber', 'nicht', 'sind', 'wir', 'ihr', 'ich', 'du', 'er', 'als',
  'wie', 'bei', 'auf', 'aus', 'für', 'von', 'zu', 'im', 'dem', 'den', 'des', 'noch', 'nur',
  'sehr', 'schon', 'jetzt', 'dann', 'voll', 'ganz', 'mehr', 'wird', 'werden', 'kann', 'können', 'muss',
  'müssen', 'willst', 'steht', 'liebt', 'mag', 'trägt', 'nimmt', 'lässt', 'wirkt', 'scheint',
]);
// v75b: EN-mehrdeutige Wörter (in, an, am, so, es, will, war, die, hat) entfernt – 'hair in a ponytail' ist kein Deutsch
/** Zeichen auf Umlaute/SZ prüfen */
const DE_CHARS = /[äöüßÄÖÜ]/;

/** Fragment enthält deutschen Text? */
export function isGermanFragment(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  if (DE_CHARS.test(s)) return true;
  const words = low(s).match(/\b[a-zäöüß]+\b/g) || [];
  for (const w of words) if (DE_STOPWORDS.has(w)) return true;
  return false;
}

/** Fremdpersonen / Hand / Betrachter */
const OTHER_PERSON_RX = /\b(male hand|man hand|man's hand|his hand|his arm|his body|his hips?|viewer's hand|second person|another (?:wo)?man|man entering|hand entering|hand resting on|boyfriend|girlfriend|partner's|husband|wife|lover|lovers|they|them|their|crowd)\b/i;

/** Explizite Anatomie / Arousal (nur für Outfit-Text bei 18+, nie Identität) */
const EXPLICIT_RX = /\b(?:sideboob|underboob|visible veins?|goosebumps?|labia(?: minora| majora)?|clitoris|clitoral|pubic|arousal|aroused|wet sheen|flushed|nipples?|areolas?|erect|erection|penis|cock|pussy|vagina|cum|sex|blowjob|fuck(?:ed|ing)?|oily|dampens)\b/i;

/** Kamera- / Qualitäts-Junk */
const CAMERA_JUNK_RX = /\b(?:8k|4k|2k|raw|intimate|unposed|macro detail|shallow depth of field|photorealistic glamour(?: photo)?|85mm|50mm|35mm|softbox|rim light|studio rim light|high detail skin|high detail|sharp focus|no text|no letters|watermark)\b/i;

/** Stray Quotes / Asterisks */
const STRAY_RX = /["'“”„‘’*]/g;

/** Ein Fragment ist identitätstauglich? */
export function isCleanIdentityFragment(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  if (STRAY_RX.test(s)) return false;
  STRAY_RX.lastIndex = 0;
  if (isGermanFragment(s)) return false;
  if (OTHER_PERSON_RX.test(s)) return false;
  if (EXPLICIT_RX.test(s)) return false;
  if (CAMERA_JUNK_RX.test(s)) return false;
  // zu lang / Satzzeichen deuten auf Beschreibung statt Epitheton
  if (s.length > 90) return false;
  if (/[.!?]\s+[A-Z]/.test(s)) return false;
  if (/\d{3,}/.test(s.replace(/\d{2,3}\s*cm/, ''))) return false; // Ziffernblöcke (außer cm)
  if (/^[a-z]/.test(s) === false && /^[A-ZÄÖÜ]/.test(s) && /\s/.test(s) && !/^(long|short|black|blonde|brown|red|fair|tan|dark|blue|green|grey|light|curvy|petite|slim)/i.test(s)) return false;
  return true;
}

/** Kurz-Liste bekannter Schlecht-Sätze (Kleidungs- und Handlungs-Fragmente, v74-Bestand) */
export const SKIP_FRAGMENT_RX = /\b(parkplatzsex|exhibitionis\w*|liebt|steht auf|zeigt sich gern|mag\b|grins\w*|lächelt|smile)\b/i;

/** Zahl > 120 ist kein Alter */
export function isBogusAge(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 120;
}

/** Haarfarben aus deutschen Phrasen → EN */
const HAIR_DE = [
  [/\bschwarz(?:e|en|er)?\s+haare?\b/i, 'black hair'],
  [/\bblonde?\s+haare?\b/i, 'blonde hair'],
  [/\bbrünett\w*\b/i, 'brunette hair'],
  [/\bbraune?\s+haare?\b/i, 'brown hair'],
  [/\brote?\s+haare?\b/i, 'red hair'],
  [/\bschwarzhaarig\w*\b/i, 'black hair'],
  [/\bblondhaarig\w*\b/i, 'blonde hair'],
  [/\brothaarig\w*\b/i, 'red-haired'],
  [/\bbraunhaarig\w*\b/i, 'brown-haired'],
];
export function extractHairFromGerman(text) {
  const found = [];
  const t = String(text || '');
  for (const [rx, en] of HAIR_DE) if (rx.test(t)) found.push(en);
  return found;
}
export { EXPLICIT_RX, OTHER_PERSON_RX, CAMERA_JUNK_RX, DE_STOPWORDS };
