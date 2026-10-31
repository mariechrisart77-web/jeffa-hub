// v75 SFW-Filter: generische Filterung von FSK18-Begriffen für nicht-18+-Profile / nicht-adulte Requests.
// Reine Funktionen, keine I/O. Wird auf EVERY prompt part angewendet (Pose, Szene, Outfit, Identität, Story).
import { low, splitSegs, tidy } from './util.js';

/** FSK18-Begriffe (auch als Substring-Fragmente), die bei SFW entfernt werden müssen */
// v75: HARTE FSK18-Begriffe – werden IMMER entfernt, unabhängig vom Ort
const FSK18_PHRASES = [
  'legs spread', 'spread legs', 'legs wide', 'knees apart', 'legs apart', 'opening her legs',
  'upskirt', 'lingerie', 'nude', 'naked', 'topless', 'sideboob', 'underboob', 'side boob', 'under boob',
  'cleavage', 'cleavage focus', 'between legs', 'crotch', 'cameltoe', 'camel toe',
  'labia', 'nipples', 'nipple', 'areola', 'breasts', 'boobs', 'bust', 'bikini', 'micro bikini', 'microbikini',
  'aroused', 'arousal', 'seductive', 'sultry', 'bedroom eyes', 'inviting',
  'goosebumps', 'visible veins', 'wet sheen', 'wet look', 'clinging', 'clinging to',
  'clitoris', 'clitoral', 'pubic', 'thong', 'g-string', 'gstring', 'v-strap', 'v strap',
  'male hand', 'man hand', "viewer's hand", 'boyfriend', 'boyfriend', 'boy friend',
  'his hand', 'his arm', 'his body', 'male body', 'man entering',
  'see-through', 'see through', 'semi-sheer', 'semi sheer', 'sheer', 'transparent latex',
  'latex', 'bodysuit', 'catsuit', 'negligee', 'garter', 'fishnet',
  'exhibitionist', 'exhibitionistic', 'exhib', 'flushed', 'erection', 'erect',
  'hairless', 'pubic hair', 'spread open',
  'fuck', 'cock', 'penis', 'pussy', 'vagina', 'cum', 'blowjob', 'sex',
  'oiled', 'oily skin', 'wet skin', 'damp skin', 'piercing', 'piercings',
  'raw, intimate', 'unposed, 8k', '8k', 'macro detail', '85mm', 'photorealistic glamour',
  'shallow depth of field', 'high detail skin', 'second skin', 'frayed ends',
  'erect,', 'pressing through material', 'disappearing completely',
  'knotted at hips', 'single strings', 'tiny triangle', 'tiny string',
  'minuscule triangle', 'crisp fabric detail', 'glossy latex', 'latex sheen',
  'sharp focus on skin', 'right between legs', 'inner thighs',
];
// v75: BETT-Begriffe – nur entfernen, wenn die Szene KEIN Schlafzimmer ist (allowBed = true lässt sie stehen)
const BED_PHRASES = ['on the edge of the bed', 'at the edge of the bed', 'edge of the bed', 'lying on the bed', 'the bed', 'on the bed', 'in bed', 'on bed', 'bed', 'bedroom', 'hotel room with a large bed'];
const mkRx = (list) => new RegExp(
  '\\b(?:' + list.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
  'i',
);
const FSK18_RX = mkRx(FSK18_PHRASES);
const BED_RX = mkRx(BED_PHRASES);

/** Faulheit-Trick: 21+ nur wenn Flag gesetzt */
export function isExplicitAdult(profile = {}) {
  return profile.adult === true || profile.fsk === true || profile.fsk18 === true;
}

/** Segment enthält einen FSK18-Begriff? opts.allowBed = true, wenn die Szene ein Schlafzimmer ist */
export function isFsk18Segment(seg, opts = {}) {
  const s = String(seg || '');
  if (!s.trim()) return false;
  if (FSK18_RX.test(s)) return true;
  if (opts.allowBed === true) return false;
  return BED_RX.test(s);
}

/** Segmente filtern; bei komplett weggefallenem Text optional neutralen Ersatz einsetzen */
export function filterSfwSegments(text, fallback = '', opts = {}) {
  const segs = splitSegs(text);
  const kept = segs.filter((s) => !isFsk18Segment(s, opts));
  const joined = kept.join(', ');
  if (!joined.trim() && String(text || '').trim()) return tidy(fallback);
  return tidy(joined);
}

/** Pose-Fallback je nach Szene (wenn gespeicherte Pose FSK18 war) */
export function neutralPose(scene = '') {
  const s = low(scene);
  if (/bench|park|garten|garden|bank/.test(s)) return 'sitting upright on the bench, knees together, hands in lap';
  if (/car|auto|passenger|beifahrer/.test(s)) return 'sitting upright in the passenger seat, hands in lap, facing forward';
  if (/railing|geländer|balcony|balkon/.test(s)) return 'standing by the railing, hands resting on the railing, looking at the view';
  if (/pool|beach|strand|lake|see\b/.test(s)) return 'standing on the sand, relaxed, facing the camera';
  if (/bedroom|schlafzimmer|bed\b|bett/.test(s)) return 'sitting upright on the bed, hands in lap, facing the camera';
  if (/office|büro|desk|schreibtisch/.test(s)) return 'sitting upright at the desk, hands folded';
  if (/kitchen|küche/.test(s)) return 'standing in the kitchen, hands on the counter';
  if (/shower|dusche/.test(s)) return 'standing in the shower, facing the camera';
  if (/hotel room|hotelzimmer|hotel/.test(s)) return 'standing near the window, hands at her sides';
  return 'standing naturally, hands relaxed at her sides';
}

/** SFW-Negativblock (nicht-adult) */
export const SFW_NEGATIVES = 'nsfw, nude, cleavage, upskirt, spread legs, lingerie, see-through, topless, sideboob, underboob, cameltoe, labia, nipples, aroused, seductive, sultry';

/** Generisch: entfernt FSK18-Fragmente aus jedem Satz; bei leerem Ergebnis Fallback */
export function sfwText(text, fallback = '', opts = {}) {
  return filterSfwSegments(text, fallback, opts);
}

export { FSK18_RX, FSK18_PHRASES, BED_RX, BED_PHRASES };
