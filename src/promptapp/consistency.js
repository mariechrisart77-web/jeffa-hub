// v83 Konsistenz: Wunsch-Szene hat Vorrang; Pose/Kleidung/Umgebung werden gegen die aufgelöste Szene geprüft.
// Reine Funktionen, kein I/O. Wird von buildPromptPlan (Prompt-App) und über den Adapter von imgsvc-plan genutzt.
import { low, splitSegs, tidy } from './util.js';
import { detectScene } from './scene-map.js';

// ---------- Requisiten-Tabelle ----------
// Jedes Requisit hat eine Regex und eine Liste erlaubter Orte (aus SCENE_MAP.location-Werten).
const PROPS = [
  { key: 'car', rx: /\b(hood of (?:a |the )?car|car hood|in the car|on the hood|passenger seat|driver'?s? seat|steering wheel|car door|\bauto\b|motorhaube|beifahrersitz|fahrersitz|lenkrad|\bcar\b|\bhood\b|\bauto\b)/i, allowed: ['car', 'parking deck', 'street', 'garage'] },
  { key: 'bed', rx: /\b(on|at|edge of) (the )?bed\b|\bedge of the bed\b|\blying on the bed\b|\bbed\b|\bbett\b/i, allowed: ['bedroom'] },
  { key: 'sofa', rx: /\b(sofa|couch|settee)\b/i, allowed: ['living room', 'bedroom', 'hotel room', 'studio'] },
  { key: 'desk', rx: /\b(desk|schreibtisch)\b/i, allowed: ['office', 'library', 'bedroom', 'hotel room'] },
  { key: 'table', rx: /\b(window table|coffee cup|cappuccino|tasse kaffee|\btable\b|\btisch\b)/i, allowed: ['café', 'restaurant', 'bar', 'kitchen', 'office', 'living room', 'library'] },
  { key: 'bench', rx: /\b(bench|parkbank|sitzbank)\b/i, allowed: ['bench', 'garden', 'park', 'sauna', 'gym'] },
  { key: 'railing', rx: /\b(railing|geländer|balcony rail)\b/i, allowed: ['balcony', 'parking deck', 'yacht'] },
  { key: 'pool', rx: /\b(pool|pool edge|poolrand|schwimmbecken)\b/i, allowed: ['pool', 'sauna', 'yacht'] },
  { key: 'shower', rx: /\b(shower|dusche)\b/i, allowed: ['shower', 'bathroom', 'sauna'] },
  { key: 'counter', rx: /\b(kitchen counter|küchentheke|kitchentheke|theke|bar counter|counter)\b/i, allowed: ['kitchen', 'bar'] },
  { key: 'bookshelf', rx: /\b(bookshelf|bookshelves|buchregal|bücherregal|regal|shelves)\b/i, allowed: ['library'] },
  { key: 'sand', rx: /\b(sand|sandy|strand)\b/i, allowed: ['beach'] },
];

// ---------- Ortsgerechte Sitz-/Stand-/Lieg-/Lehn-Texte ----------
const SIT_AT = {
  beach: 'sitting in the sand',
  library: 'sitting in a leather armchair between the bookshelves',
  caf\u00e9: 'sitting at the window table',
  cafe: 'sitting at the window table',
  bedroom: 'sitting on the edge of the bed',
  car: 'sitting in the passenger seat',
  office: 'sitting at the desk',
  'living room': 'sitting on the sofa',
  kitchen: 'sitting at the kitchen counter',
  bar: 'sitting at the bar',
  bench: 'sitting upright on the bench',
  pool: 'sitting on the edge of the pool',
  restaurant: 'sitting at a table',
};
const STAND_AT = {
  beach: 'standing on the sand',
  library: 'standing between the bookshelves',
  caf\u00e9: 'standing beside the window table',
  bedroom: 'standing beside the bed',
  office: 'standing beside the desk',
};
const LIE_AT = {
  beach: 'lying on the sand',
  bedroom: 'lying on the bed',
  'living room': 'lying on the sofa',
};
const LEAN_AT = {
  beach: 'leaning back on her hands in the sand',
  balcony: 'leaning on the railing',
  library: 'leaning against the bookshelf',
};

function kindOf(seg) {
  if (/\bsitting\b|\bsitzt\b|\bsits\b/i.test(seg)) return 'sitting';
  if (/\bstanding\b|\bsteht\b|\bstanding\b/i.test(seg)) return 'standing';
  if (/\blying\b|\bliegt\b|\blies\b/i.test(seg)) return 'lying';
  if (/\bleaning\b|\blehnt\b/i.test(seg)) return 'leaning';
  return '';
}

function propAllowedAt(prop, location, sceneText) {
  if (!prop) return true;
  if (prop.allowed.includes(location)) return true;
  // zusätzlich: Szene/Wunsch nennt das Requisit ausdrücklich
  if (prop.rx.test(sceneText || '')) return true;
  return false;
}

/** Ersetzt ortsfremde Requisiten in Pose/Action. Körperhaltung bleibt erhalten, nur der ortsgebundene Teil. */
export function fitPoseToScene({ pose = '', action = '', location = '', sceneText = '', adult = false } = {}) {
  const notes = [];
  const lines = String(sceneText || '');
  const loc = low(location).trim();
  if (!loc) return { pose: String(pose || ''), action: String(action || ''), notes };
  const fixSeg = (seg) => {
    const k = kindOf(seg);
    if (!k) return ''; // ortsfremdes Requisit ohne Körperhaltung (z. B. „hands on the car hood“) → Segment entfällt
    if (k === 'sitting') return SIT_AT[loc] || `${seg}`;
    if (k === 'standing') return STAND_AT[loc] || seg;
    if (k === 'lying') return LIE_AT[loc] || seg;
    if (k === 'leaning') return LEAN_AT[loc] || seg;
    return seg;
  };
  const walk = (text) => {
    const out = [];
    const replaced = [];
    for (const s of splitSegs(text)) {
      let hit = null;
      for (const p of PROPS) {
        if (p.rx.test(s) && !propAllowedAt(p, loc, lines)) { hit = p; break; }
      }
      if (!hit) { out.push(s); continue; }
      const replacement = fixSeg(s);
      if (replacement !== s) replaced.push({ from: s, to: replacement });
      if (replacement) out.push(replacement);
    }
    return { text: tidy(out.join(', ')), replaced };
  };
  const poseOut = walk(String(pose || ''));
  const actionOut = walk(String(action || ''));
  // Wenn Replaced in der Pose war: Notiz
  for (const r of poseOut.replaced.filter((x) => !x.to)) notes.push(`Pose an Szene „${loc}“ angepasst: „${r.from}“ entfernt`);
  for (const r of poseOut.replaced.filter((x) => x.to)) notes.push(`Pose an Szene „${loc}“ angepasst: „${r.from}“ → „${r.to}“`);
  for (const r of actionOut.replaced) notes.push(`Action an Szene „${loc}“ angepasst: „${r.from}“ → „${r.to || '(entfernt)'}“`);
  // Aktion, die nach dem Ersetzen keine Substanz mehr hat → leer (Story-Action ersetzt sie ggf.)
  const actionResult = actionOut.text;
  return { pose: poseOut.text, action: actionResult, notes };
}

/** v83: Pose-Segmente ohne Körperhaltung und ohne Requisit (z. B. „legs crossed“, „confident grin“) – bleiben beim Wunsch-Posen-Wechsel erhalten. */
export function poseExtras(pose = '') {
  return splitSegs(pose).filter((s) => !kindOf(s) && !PROPS.some((p) => p.rx.test(s)));
}

/** Wunsch-Szene + savedScene + Composer-Parts → aufgelöste Szene. */
export function resolveSceneTarget({ wish = '', override = '', savedScene = '', parts = {}, story = null, msgs = [] } = {}) {
  const P = parts || {};
  const ST = story || {};
  const wishDet = detectScene(wish);
  const overrideDet = detectScene(override);
  const savedDet = detectScene(savedScene);
  const partsDet = detectScene([String(P.scene || ''), String(P.background || '')].filter(Boolean).join(', '));
  const messages = Array.isArray(msgs) ? msgs : [];
  const latestMsg = messages.length ? String(messages[messages.length - 1].content || '') : '';
  const msgDet = detectScene(latestMsg);
  const storyDet = detectScene(String(ST.location || ''));
  const prevLocation = String(ST.location || '');

  // einmalige Auswahl: Text wörtlich übernehmen (wie die Dropdown-Szene), Ort nur zur Pose-Prüfung erkennen
  if (String(override || '').trim()) return { scene: String(override).trim(), location: overrideDet ? overrideDet.location : '', pose: overrideDet ? overrideDet.pose || '' : '', source: 'override', locked: true, prevLocation };
  if (wishDet) return { scene: wishDet.scene, location: wishDet.location, pose: wishDet.pose || '', source: 'wish', locked: true, prevLocation };
  // Composer-Hintergrund zählt (er hat die Wunsch-Szene gesehen)
  if (partsDet) return { scene: String(P.background || '').trim() || partsDet.scene, location: partsDet.location, pose: partsDet.pose || '', source: 'composer', locked: false, prevLocation };
  if (msgDet) return { scene: msgDet.scene, location: msgDet.location, pose: msgDet.pose || '', source: 'message', locked: false, prevLocation };
  if (storyDet) return { scene: storyDet.scene, location: storyDet.location, pose: storyDet.pose || '', source: 'story', locked: false, prevLocation };
  if (savedDet) return { scene: savedDet.scene, location: savedDet.location, pose: savedDet.pose || '', source: 'saved', locked: false, prevLocation };
  return { scene: '', location: '', pose: '', source: 'none', locked: false, prevLocation };
}
