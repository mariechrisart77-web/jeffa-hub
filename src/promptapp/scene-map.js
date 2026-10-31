// v75 Story-Ort → englische Szene. Generische Tabelle, kein Charakter-Bezug.
// Wird auf den Story-Text (letzte Assistant-Antwort + User-Nachricht) angewendet.
import { low } from './util.js';
import { SCENE_DETECT } from '../../apps/shared/scenes.js';

/** Ort-Dictionary: [regex, { scene, location, pose? }] – v85: aus der zentralen Liste apps/shared/scenes.js */
const SCENE_MAP = SCENE_DETECT;

/** v83: Ortsschlüssel → SCENE_MAP-Info (Tabellen-Lookup für andere Module) */
export function sceneByLocation(location = '') {
  const l = low(location).trim();
  if (!l) return null;
  for (const [, info] of SCENE_MAP) if (low(info.location) === l) return info;
  return null;
}

/** Erkennt bekannte Szenen im Text (letzter Treffer gewinnt) */
export function detectScene(text) {
  // v75: Segmente (älteste → neueste); das NEUESTE Segment mit Treffer gewinnt, darin der spezifischste (Tabellen-Reihenfolge).
  const segs = (Array.isArray(text) ? text : [text]).map((x) => String(x || '')).filter((x) => x.trim());
  for (let k = segs.length - 1; k >= 0; k--) {
    for (const [rx, info] of SCENE_MAP) if (rx.test(segs[k])) return info;
  }
  return null;
}

/** Erkennt eine Story-Pose ("sitzt seitlich auf dem Beifahrersitz", "lehnt am Geländer") */
const STORY_POSE_MAP = [
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(beifahrersitz|passenger seat)\b/i, 'sitting sideways in the passenger seat, one leg outside'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*(bank|bench)\b/i, 'sitting upright on the bench, knees together, hands in lap'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(bett|bed)\b/i, 'sitting on the edge of the bed, hands in lap'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(sofa|couch)\b/i, 'sitting upright on the sofa, hands in lap'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(tisch|fenstertisch|table|café|cafe|kaffee)/i, 'sitting at the window table, hands around a coffee cup'],
  [/\b(lehnt|leaning|leans)\b.*\b(geländer|railing|balcony|balkon)\b/i, 'leaning on the railing, gazing into the distance'],
  [/\b(lehnt|leaning|leans)\b.*\b(wand|wall)\b/i, 'leaning against the wall, one knee bent'],
  [/\b(steht|stehe|standing)\b.*\b(dusche|shower)\b/i, 'standing under the shower, facing the camera'],
  [/\b(steht|stehe|standing)\b.*\b(strand|beach)\b/i, 'standing on the sand, feet in the shallow water'],
  [/\b(liegt|liege|lying|lies)\b.*\b(bett|bed)\b/i, 'lying on the bed, propped on one elbow'],
  [/\b(läuft|geht|walks|walking)\b.*\b(garten|garden)\b/i, 'walking along the garden path'],
  [/\b(läuft|geht|walks|walking)\b.*\b(strand|beach)\b/i, 'walking along the shoreline'],
  // v83: Bibliothek / Sand
  [/\b(steht|stehe|standing|stands)\b.*\b(bücherregal\w*|regal\w*|bookshel\w*|bibliothek|library)/i, 'standing between the bookshelves'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(sessel|armchair)\b/i, 'sitting in an armchair'],
  [/\b(sitzt|sitze|setzt|setze|sitting|sits)\b.*\b(sand|strand|beach)\b/i, 'sitting in the sand'],
];

/** Erkennt eine Story-Pose im Text (erster Treffer) */
export function detectStoryPose(text) {
  const segs = (Array.isArray(text) ? text : [text]).map((x) => String(x || '')).filter((x) => x.trim());
  for (let k = segs.length - 1; k >= 0; k--) {
    for (const [rx, pose] of STORY_POSE_MAP) if (rx.test(segs[k])) return pose;
    // v75: Segment mit Ortswechsel ohne erkannte Pose → ältere Posen gelten nicht mehr
    if (SCENE_MAP.some(([rx]) => rx.test(segs[k]))) return null;
  }
  return null;
}

/** Erkennt einen Story-Ort aus beliebigem Text (baut Szenen-String) */
export function storyScene(text) {
  const s = detectScene(text);
  return s ? s.scene : '';
}

export { SCENE_MAP, STORY_POSE_MAP };
