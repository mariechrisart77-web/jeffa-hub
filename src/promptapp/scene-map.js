// v75 Story-Ort → englische Szene. Generische Tabelle, kein Charakter-Bezug.
// Wird auf den Story-Text (letzte Assistant-Antwort + User-Nachricht) angewendet.
import { low } from './util.js';

/** Ort-Dictionary: [regex, { scene, location, pose? }] */
const SCENE_MAP = [
  [/\b(parkdeck|parkhaus|parkgarage|rooftop parking|parking deck|tiefgarage)/i,
    { scene: 'empty rooftop parking deck, city lights', location: 'parking deck', pose: 'leaning against the railing, gazing out at the city' }],
  [/\b(beifahrersitz|passenger seat|auto\b|car\b|fahrersitz|driver's seat|lenkrad|steering wheel)\b/i,
    { scene: 'inside a car, passenger seat, door open', location: 'car', pose: 'sitting sideways in the passenger seat, one leg outside' }],
  [/\b(bank\b|park bench|parkbank|sitzbank)\b/i,
    { scene: 'wooden park bench', location: 'bench', pose: 'sitting upright on the bench, knees together, hands in lap' }],
  [/\b(garten|garden|rosen|roses|blumen|flowers)\b/i,
    { scene: 'garden with blooming roses, green foliage', location: 'garden', pose: 'standing on the garden path, looking toward the camera' }],
  [/\b(dusche|shower|duschkabine)\b/i,
    { scene: 'shower with tiled walls, steam', location: 'shower', pose: 'standing under the shower, facing the camera' }],
  [/\b(wohnzimmer|living room|sofa|couch)\b/i,
    { scene: 'living room with a sofa, large window', location: 'living room', pose: 'sitting upright on the sofa, hands in lap' }],
  [/\b(hotelbar|hotel bar|bar\b|lounge|cocktail bar)\b/i,
    { scene: 'hotel bar with warm lamps, elegant counter', location: 'bar', pose: 'sitting at the bar, hands around a glass' }],
  [/(pool|\bschwimmbecken|swimming pool|infinity pool)\b/i,
    { scene: 'swimming pool with turquoise water', location: 'pool', pose: 'sitting on the edge of the pool, feet in the water' }],
  [/\b(bett\b|hotelzimmer|schlafzimmer|bedroom|bedroom\b|bed\b)\b/i,
    { scene: 'bedroom with a large bed and warm lamps', location: 'bedroom', pose: 'sitting on the edge of the bed, hands in lap' }],
  [/\b(strand|beach|meer|ocean|sea\b)\b/i,
    { scene: 'sandy beach by the sea, gentle waves', location: 'beach', pose: 'standing on the sand, feet in the shallow water' }],
  [/\b(büro|buero|office|schreibtisch|desk)\b/i,
    { scene: 'modern office with a desk and large windows', location: 'office', pose: 'sitting at the desk, hands folded' }],
  [/\b(küche|kueche|kitchen)\b/i,
    { scene: 'bright home kitchen, counter and window', location: 'kitchen', pose: 'standing at the kitchen counter, hands resting on it' }],
  [/\b(wald|forest|bäume|trees)\b/i,
    { scene: 'forest path with dappled sunlight', location: 'forest', pose: 'walking along the forest path' }],
  [/\b(café|cafe|kaffee|cappuccino|coffee shop)/i,
    { scene: 'cozy café, window table, soft daylight', location: 'café', pose: 'sitting at the window table, hands around a coffee cup' }],
  [/\b(betonwand|concrete wall|sichtbeton)/i,
    { scene: 'raw grey concrete wall, soft studio light', location: 'concrete wall', pose: 'standing in front of the concrete wall' }],
  [/\b(stadt|city|straße|street|gasse|alley)\b/i,
    { scene: 'city street with soft evening light', location: 'street', pose: 'walking along the street' }],
  [/\b(restaurant|dinner|candlelight)\b/i,
    { scene: 'upscale restaurant with warm candlelight', location: 'restaurant', pose: 'sitting at a table, hands folded on the table' }],
  [/\b(balkon|balcony|terrasse|terrace|geländer|railing)\b/i,
    { scene: 'balcony with plants, evening light', location: 'balcony', pose: 'leaning on the railing, gazing into the distance' }],
  [/\b(yacht|boot|boat|schiff)\b/i,
    { scene: 'yacht deck, open sea', location: 'yacht', pose: 'standing on the deck, one hand on the railing' }],
  [/\b(sauna|spa)\b/i,
    { scene: 'wooden sauna interior, warm steam', location: 'sauna', pose: 'sitting upright on the wooden bench, hands in lap' }],
  [/\b(gym|fitnessstudio|fitness)\b/i,
    { scene: 'modern gym with equipment', location: 'gym', pose: 'standing in the gym, hands on her hips' }],
  [/\b(bibliothek|library)\b/i,
    { scene: 'old library with wooden shelves', location: 'library', pose: 'standing between bookshelves, holding a book' }],
  [/\b(see\b|lake|teich|pond)\b/i,
    { scene: 'lakeshore with calm water', location: 'lake', pose: 'standing at the lakeshore, hands at her sides' }],
  [/\b(studio|backdrop)\b/i,
    { scene: 'photo studio, seamless white backdrop', location: 'studio', pose: 'standing facing the camera' }],
  [/\b(flughafen|airport|lounge)\b/i,
    { scene: 'airport lounge with large windows', location: 'airport', pose: 'sitting upright on a lounge chair' }],
  [/\b(schnee|snow|winter)\b/i,
    { scene: 'snowy landscape, soft winter light', location: 'snow', pose: 'standing in the snow, facing the camera' }],
];

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
