// v85 (19): EINE zentrale Szenen- und Tageszeitenliste für Chat-Fotomenü, Bild-App und Server-Erkennung.
// Rein (kein DOM). Server-Code importiert diese Datei relativ (src/promptapp/scene-map.js), der Browser als ./shared/scenes.js.
//
// Felder: id, label (Deutsch, Menü), group (Menü-Gruppe; fehlt = nicht im Menü), prompt (Menü-Text für den Bild-Prompt),
//         adult (1 = nur FSK18), detect (RegExp für die Erkennung im Chattext), scene/location/pose (Erkennungs-Ergebnis).
// Reihenfolge der Einträge mit `detect` = Erkennungs-Reihenfolge (spezifisch vor allgemein) – nicht umsortieren.
const DETECT = [
  { id: 'ort_parkdeck', label: 'Parkdeck mit Stadtlichtern', group: 'Alltag', detect: /\b(parkdeck|parkhaus|parkgarage|rooftop parking|parking deck|tiefgarage)/i,
    scene: 'empty rooftop parking deck, city lights', location: 'parking deck', pose: 'leaning against the railing, gazing out at the city' },
  { id: 'ort_auto', label: 'Im Auto (Beifahrersitz)', group: 'Alltag', detect: /\b(beifahrersitz|passenger seat|auto\b|car\b|fahrersitz|driver's seat|lenkrad|steering wheel)\b/i,
    scene: 'inside a car, passenger seat, door open', location: 'car', pose: 'sitting sideways in the passenger seat, one leg outside' },
  { id: 'ort_parkbank', label: 'Parkbank', group: 'Alltag', detect: /\b(bank\b|park bench|parkbank|sitzbank)\b/i,
    scene: 'wooden park bench', location: 'bench', pose: 'sitting upright on the bench, knees together, hands in lap' },
  { id: 'ort_garten', label: 'Rosengarten', group: 'Alltag', detect: /\b(garten|garden|rosen|roses|blumen|flowers)\b/i,
    scene: 'garden with blooming roses, green foliage', location: 'garden', pose: 'standing on the garden path, looking toward the camera' },
  { id: 'ort_dusche', label: 'Dusche', group: 'Zuhause', detect: /\b(dusche|shower|duschkabine)\b/i,
    scene: 'shower with tiled walls, steam', location: 'shower', pose: 'standing under the shower, facing the camera' },
  { id: 'ort_wohnzimmer', label: 'Wohnzimmer mit Sofa', group: 'Zuhause', detect: /\b(wohnzimmer|living room|sofa|couch)\b/i,
    scene: 'living room with a sofa, large window', location: 'living room', pose: 'sitting upright on the sofa, hands in lap' },
  { id: 'ort_hotelbar', label: 'Hotelbar', group: 'Reise & Luxus', detect: /\b(hotelbar|hotel bar|bar\b|lounge|cocktail bar)\b/i,
    scene: 'hotel bar with warm lamps, elegant counter', location: 'bar', pose: 'sitting at the bar, hands around a glass' },
  { id: 'ort_pool', label: 'Pool (am Tag)', group: 'Reise & Luxus', detect: /(pool|\bschwimmbecken|swimming pool|infinity pool)\b/i,
    scene: 'swimming pool with turquoise water', location: 'pool', pose: 'sitting on the edge of the pool, feet in the water' },
  { id: 'ort_bett', label: 'Schlafzimmer (Bett, warme Lampen)', detect: /\b(bett\b|hotelzimmer|schlafzimmer|bedroom|bedroom\b|bed\b)\b/i,
    scene: 'bedroom with a large bed and warm lamps', location: 'bedroom', pose: 'sitting on the edge of the bed, hands in lap' },
  { id: 'ort_strand', label: 'Strand am Meer', detect: /\b(strand|beach|meer|ocean|sea\b)\b/i,
    scene: 'sandy beach by the sea, gentle waves', location: 'beach', pose: 'standing on the sand, feet in the shallow water' },
  { id: 'ort_buero', label: 'Büro', group: 'Alltag', detect: /\b(büro|buero|office|schreibtisch|desk)\b/i,
    scene: 'modern office with a desk and large windows', location: 'office', pose: 'sitting at the desk, hands folded' },
  { id: 'ort_kueche', label: 'Küche', group: 'Zuhause', detect: /\b(küche|kueche|kitchen)\b/i,
    scene: 'bright home kitchen, counter and window', location: 'kitchen', pose: 'standing at the kitchen counter, hands resting on it' },
  { id: 'ort_wald', label: 'Waldweg', group: 'Natur', detect: /\b(wald|forest|bäume|trees)\b/i,
    scene: 'forest path with dappled sunlight', location: 'forest', pose: 'walking along the forest path' },
  { id: 'ort_cafe', label: 'Café', group: 'Alltag', detect: /\b(café|cafe|kaffee|cappuccino|coffee shop)/i,
    scene: 'cozy café, window table, soft daylight', location: 'café', pose: 'sitting at the window table, hands around a coffee cup' },
  { id: 'ort_betonwand', label: 'Betonwand', detect: /\b(betonwand|concrete wall|sichtbeton)/i,
    scene: 'raw grey concrete wall, soft studio light', location: 'concrete wall', pose: 'standing in front of the concrete wall' },
  { id: 'ort_strasse', label: 'Stadtstraße', group: 'Alltag', detect: /\b(stadt|city|straße|street|gasse|alley)\b/i,
    scene: 'city street with soft evening light', location: 'street', pose: 'walking along the street' },
  { id: 'ort_restaurant', label: 'Restaurant bei Kerzenlicht', group: 'Alltag', detect: /\b(restaurant|dinner|candlelight)\b/i,
    scene: 'upscale restaurant with warm candlelight', location: 'restaurant', pose: 'sitting at a table, hands folded on the table' },
  { id: 'ort_balkon', label: 'Balkon', group: 'Zuhause', detect: /\b(balkon|balcony|terrasse|terrace|geländer|railing)\b/i,
    scene: 'balcony with plants, evening light', location: 'balcony', pose: 'leaning on the railing, gazing into the distance' },
  { id: 'ort_yacht', label: 'Yacht-Deck', group: 'Reise & Luxus', detect: /\b(yacht|boot|boat|schiff)\b/i,
    scene: 'yacht deck, open sea', location: 'yacht', pose: 'standing on the deck, one hand on the railing' },
  { id: 'ort_sauna', label: 'Sauna', detect: /\b(sauna|spa)\b/i,
    scene: 'wooden sauna interior, warm steam', location: 'sauna', pose: 'sitting upright on the wooden bench, hands in lap' },
  { id: 'ort_gym', label: 'Fitnessstudio', group: 'Alltag', detect: /\b(gym|fitnessstudio|fitness)\b/i,
    scene: 'modern gym with equipment', location: 'gym', pose: 'standing in the gym, hands on her hips' },
  { id: 'ort_bibliothek', label: 'Bibliothek', group: 'Alltag', detect: /\b(bibliothek|library)\b/i,
    scene: 'old library with wooden shelves', location: 'library', pose: 'standing between bookshelves, holding a book' },
  { id: 'ort_see', label: 'Bergsee', group: 'Natur', detect: /\b(see\b|lake|teich|pond)\b/i,
    scene: 'lakeshore with calm water', location: 'lake', pose: 'standing at the lakeshore, hands at her sides' },
  { id: 'ort_studio', label: 'Fotostudio (weiß)', group: 'Alltag', detect: /\b(studio|backdrop)\b/i,
    scene: 'photo studio, seamless white backdrop', location: 'studio', pose: 'standing facing the camera' },
  { id: 'ort_flughafen', label: 'Flughafen-Lounge', group: 'Reise & Luxus', detect: /\b(flughafen|airport|lounge)\b/i,
    scene: 'airport lounge with large windows', location: 'airport', pose: 'sitting upright on a lounge chair' },
  { id: 'ort_schnee', label: 'Schneelandschaft', group: 'Natur', detect: /\b(schnee|snow|winter)\b/i,
    scene: 'snowy landscape, soft winter light', location: 'snow', pose: 'standing in the snow, facing the camera' },
];
// Menü-Szenen ohne eigene Erkennung (bisher photoopts.SCENE und Bild-App-Liste). IDs bleiben stabil (gespeicherte Profile!).
const MENU = [
  { id: 'betonwand', label: '⭐ Betonwand-Studio – Hauptlook (Latex-Bikini)', group: 'Nachtfalter-Looks', adult: 1, prompt: 'minimalist photo studio with a raw grey concrete wall, soft studio light' },
  { id: 'parkplatz', label: 'Parkplatz bei Nacht mit Auto (ohne Kleidung)', group: 'Nachtfalter-Looks', adult: 1, prompt: 'empty parking lot at night next to a dark sports car, streetlights' },
  { id: 'poolnacht', label: 'Pool (ohne Kleidung)', group: 'Nachtfalter-Looks', adult: 1, prompt: 'private pool with turquoise water, sun loungers' },
  { id: 'yoga', label: 'Yogastudio, Leute im Hintergrund (Latex-Bikini)', group: 'Nachtfalter-Looks', adult: 1, prompt: 'bright yoga studio with wooden floor, a few people blurred in the background' },
  { id: 'hotel', label: 'Hotelzimmer mit Blick auf die Stadt', group: 'Reise & Luxus', prompt: 'luxury hotel room with floor-to-ceiling windows and a city skyline view' },
  { id: 'strand', label: 'Strand bei Sonnenuntergang', group: 'Reise & Luxus', prompt: 'sandy beach at sunset, gentle waves' },
  { id: 'dach', label: 'Dachterrasse bei Nacht', group: 'Reise & Luxus', prompt: 'rooftop terrace at night, city lights below' },
  { id: 'spa', label: 'Sauna & Spa', group: 'Reise & Luxus', prompt: 'wooden sauna and spa area, warm steam' },
  { id: 'jet', label: 'Privatjet-Kabine', group: 'Reise & Luxus', prompt: 'private jet cabin with cream leather seats' },
  { id: 'weingut', label: 'Weinberg-Terrasse', group: 'Reise & Luxus', prompt: 'vineyard terrace in the countryside, rows of vines' },
  { id: 'loft', label: 'Loft-Küche am Morgen', group: 'Zuhause', prompt: 'modern loft kitchen in the morning' },
  { id: 'schlafzimmer', label: 'Schlafzimmer, zerwühlte Laken', group: 'Zuhause', prompt: 'bedroom with rumpled white sheets' },
  // bisher nur in der Bild-App
  { id: 'stadtpark', label: 'Stadtpark', group: 'Natur', prompt: 'green city park with old trees and a gravel path' },
  { id: 'bahnhof', label: 'Bahnhof', group: 'Alltag', prompt: 'busy train station platform, arriving train' },
  { id: 'neon', label: 'Neon-Straße bei Nacht', group: 'Alltag', prompt: 'city street at night with colorful neon signs and wet asphalt' },
];
export const SCENES = [...DETECT, ...MENU];
/** Menü-Gruppen in fester Reihenfolge (Nachtfalter zuerst = wie bisher im Fotomenü). */
export const SCENE_GROUPS = ['Nachtfalter-Looks', 'Reise & Luxus', 'Zuhause', 'Alltag', 'Natur'];
/** Erkennungs-Tabelle im alten Format [regex, {scene, location, pose}] (Reihenfolge = DETECT). */
export const SCENE_DETECT = DETECT.map((s) => [s.detect, { scene: s.scene, location: s.location, pose: s.pose }]);
/** Text, der für eine Menü-Szene in den Bild-Prompt geht. */
export const scenePrompt = (s) => (s && (s.prompt || s.scene)) || '';
/** Menü-Einträge (mit group), optional ohne 18+-Einträge; gruppiert in SCENE_GROUPS-Reihenfolge. → [[group, [entry…]]…] */
export function sceneMenu(adult = false) {
  const list = [...MENU, ...DETECT].filter((s) => s.group && (!s.adult || adult)); // alte Menü-Einträge zuerst (Reihenfolge wie bisher)
  return SCENE_GROUPS.map((g) => [g, list.filter((s) => s.group === g)]).filter(([, l]) => l.length);
}
export const sceneById = (id) => SCENES.find((s) => s.id === id) || null;

/** Tageszeit: Menü-IDs → kanonischer englischer Schlüssel (wie story.time_of_day). '' = automatisch aus dem Chat. */
export const TIMES_OF_DAY = [
  { id: 'morgen', label: 'Morgen', key: 'morning' },
  { id: 'tag', label: 'Tag', key: 'day' },
  { id: 'abend', label: 'Abend', key: 'evening' },
  { id: 'nacht', label: 'Nacht', key: 'night' },
];
const TOD_KEYS = new Set(TIMES_OF_DAY.map((t) => t.key));
/** 'morgen'|'morning'|… → 'morning'|'day'|'evening'|'night'; alles andere (auch 'auto') → '' */
export function timeOfDayKey(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === 'auto') return '';
  if (TOD_KEYS.has(s)) return s;
  const t = TIMES_OF_DAY.find((x) => x.id === s);
  return t ? t.key : '';
}
/** kurze englische Licht-Beschreibung je Tageszeit (für den Legacy-Prompt der Bild-App ohne Profil) */
export const TIME_PHRASE = { morning: 'early morning, soft morning light', day: 'bright natural daylight', evening: 'warm golden evening light', night: 'night, dim artificial light' };
