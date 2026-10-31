// v71 Formulator: modellbewusster Prompt-Bau (lustify-v8 = SDXL/booru-Tags, chroma = natürliche Sprache).
// Pure, node-testbar. Kein I/O, keine Abhängigkeiten außer sich selbst.
// Reihenfolge im Prompt: (a) Framing → (b) Subjekt/Identität → (c) Outfit → (d) Pose → (e) Szene → (f) Licht → (g) Qualität.
// Framing + Identität + Outfit werden nie gekürzt (siehe fitPrompt in imgsvc-plan.js).

/** Framing-Block: immer zuerst, immer mit Gesicht + Kopf im Bild. */
export const FRAMING = 'full body shot, entire face and head in frame, looking at camera';

/** Zusatz-Tags für Mikro-Bikini-Outfits (nur adult) – booru-artig, funktionieren auf lustify-v8 am besten. */
export const MICRO_TAGS = 'tiny string micro bikini, minuscule triangles barely the size of a nipple, sideboob, underboob, thong string bottom';

const MICRO_RX = /\b(micro\s*bikini|microscopic|string\s+bikini|tiny\s+bikini|micro\s*string|knapp\w*\s*bikini)\b|\bminuscule\s+triangles\b|\bunderboob\b/i;

/** Pose-Intensitätsstufen. '' = Standard (keine Änderung). */
export const INTENSITY = ['', 'dezent', 'offen', 'stark'];
export const INTENSITY_LABEL = { '': 'Standard', dezent: 'Dezent', offen: 'Offen (18+)', stark: 'Stark exhibitionistisch (18+)' };

/** normalisiert Rohwerte (Dropdown, Profil, body) auf '' | 'dezent' | 'offen' | 'stark' */
export function normalizeIntensity(v) {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return '';
  if (/^(stark|stark exhibitionistisch|exhibitionist\w*|bold|max)$/.test(t)) return 'stark';
  if (/^(offen|open|inviting)$/.test(t)) return 'offen';
  if (/^(dezent|subtle|gentle|low)$/.test(t)) return 'dezent';
  return '';
}

/** Pose-Intensität aus Profil/Dropdown/body. Nur adult wirksam. v74: kein Namens-Fallback mehr. */
export function intensityDefaults({ profile = {}, resolved = {}, body = {} } = {}) {
  const adult = body.adult === true;
  if (!adult) return '';
  const po = body.photoOverride;
  const raw = (po && typeof po === 'object' && typeof po.intensity === 'string' && po.intensity) || resolved.photo?.intensity || profile.photo?.intensity || '';
  return normalizeIntensity(raw);
}

/** Posen-Varianten je Körperhaltung; 'stark' ist deutlich expliziter, 'offen' selbstbewusst-einladend. */
const POSE_VARIANTS = {
  lying: {
    offen: 'lying on her back with her legs casually open, one knee raised, arching slightly, inviting eye contact',
    stark: 'lying on her back, legs spread wide and knees raised, back arched, hips pushed toward the camera, pussy barely covered by the string, proudly showing off her body, proud exhibitionistic smile',
  },
  sitting: {
    offen: 'sitting with her legs open toward the camera, leaning back on one hand, confident open posture, inviting look',
    stark: 'sitting with her legs spread wide open toward the camera, leaning back on both hands, hips pushed forward, chest out, arched back, boldly exhibitionistic and unashamed',
  },
  kneeling: {
    offen: 'kneeling upright with her thighs slightly apart, shoulders back, confident inviting gaze',
    stark: 'kneeling with her knees wide apart, thighs spread, back arched, hips pushed forward, proudly showing off, exhibitionistic and unashamed',
  },
  leaning: {
    offen: 'leaning back with her hips forward, one knee turned out, playful confident body language',
    stark: 'leaning back against the surface, back arched, hips pushed forward, legs apart, chest out, boldly exhibitionistic seductive pose',
  },
  standing: {
    offen: 'standing with her weight on one leg, one knee turned out, shoulders back, chest open, welcoming and confident',
    stark: 'standing with her legs spread wide, hips pushed forward, back arched, chest out, hands on her hips, boldly exhibitionistic, proud and unashamed, looking straight into the camera',
  },
};

/** erkannte Körperhaltung eines Pose-Textes (Default: standing) */
export function poseKindOf(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(lying|lying down|on her back|liegt|liegen|reclining)\b/.test(t)) return 'lying';
  if (/\b(sitting|sitzt|sits|on the edge|seated|kneeling on bed)\b/.test(t)) return 'sitting';
  if (/\b(kneeling|kniet|on her knees|kneels)\b/.test(t)) return 'kneeling';
  if (/\b(leaning|lehnt|against the wall)\b/.test(t)) return 'leaning';
  return 'standing';
}

/** liefert den Zusatz-Pose-Text für eine Haltung + Intensität */
export function intensityPose(intensity, kind = 'standing') {
  const k = normalizeIntensity(intensity);
  if (k !== 'offen' && k !== 'stark') return '';
  const v = POSE_VARIANTS[kind] || POSE_VARIANTS.standing;
  return v[k] || '';
}

/** ersetzt die Körperhaltung am Anfang eines Pose-Textes, ohne Handplatzierungen zu verdoppeln */
export function poseForKind(kind, extra) {
  if (!extra) return '';
  // Der Intensitäts-Text beschreibt die Haltung selbst; alte Haltung abschneiden, Handplatzierungen aus dem Original erhalten.
  return extra;
}

/** Zusatz-Tags, die das Modell (lustify-v8 / SDXL) für knappe Wäsche, Cameltoe und Glanz braucht */
export function sharpTags({ intensity = '', outfit = '', scene = '' } = {}) {
  const txt = String(outfit || ''); // v73: nur das aktive Outfit, nicht die Szene
  const tags = [];
  if (/\b(latex|bikini|micro|string|thong|bodysuit|catsuit|lingerie|dessous)\b/i.test(txt)) {
    tags.push('cameltoe, labia outline visible through the tight fabric', 'glossy latex sheen, crisp fabric detail');
  }
  if (/\bmicrolatex|micro\s*bikini|string\s+bikini\b/i.test(txt)) tags.push(MICRO_TAGS);
  const k = normalizeIntensity(intensity);
  if (k === 'stark') tags.push('confident seductive eye contact, lively natural expression, dynamic candid moment');
  if (k === 'offen') tags.push('confident open pose, inviting, playful');
  return tags;
}

/** 5. Katalogeintrag (negativ) in den Client-Fragmenten als `neg_<key>`/`negative` zusammenführen – Server-Version für Tests */
export function mergePresetNegatives(entries = []) {
  const seen = new Set(), out = [];
  for (const e of entries) {
    const t = String(e || '').trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t); out.push(String(e).trim());
  }
  return out.join(', ');
}

/** Negative für Ausschnitt/Intensität (nur adult aufgerufen) */
export function framingNegatives() { return 'cropped head, head out of frame, cut off face'; }

