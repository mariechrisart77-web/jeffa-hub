// v69 Prompt-Paket: EIN serverseitiger Bild-Plan (pure, node-testbar). Chat und Bild-App senden nur Profil, Verlauf und Dropdowns.
// Reihenfolge: Altersschutz → Ebenen → Story-Zustand → Composer (JSON) → Dropdown-Vorrang → Abgleich (v69) → Personenfilter → Prompt → Seed → Modell.
import { detectPoseDetails, detectTimeOfDay } from './promptapp/scene-time.js';
import { timeOfDayKey } from '../apps/shared/scenes.js';
import { detectScene as detectSceneV83 } from './promptapp/scene-map.js';
import { resolveLayers, minorRisk, scrubYouth, youthRisk, dedupeSeg, pickVariation, routeModel, buildRulePrompt, STYLE, NEG_SINGLE, vibeCues, useScene, stripConflicts, VARIATIONS, normQuality, fsk18Family } from './imgsvc-core.js';
import { abgleich } from './imgsvc-abgleich.js';
import { normalizeIntensity, intensityDefaults, intensityPose, poseForKind, poseKindOf, FRAMING, sharpTags } from './imgsvc-formulate.js';
import { buildPromptPlan, PORTRAIT_RX } from './promptapp/index.js';
import { dropNegativeConflicts } from './promptapp/util.js';
import { sparMixModel } from './imgsvc-core.js';
import { subjectOf } from './promptapp/identity.js';
function stripPortraitWords(t) {
  return String(t || '').replace(/\b(close-?up|portrait|headshot|head and shoulders|kopf und schultern|nahaufnahme|brustbild)\b/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

const AGE_MSG = 'Profil muss eindeutig erwachsen sein (18+)';
const NEG_ADULT_REAL = 'cartoon, 3d render, cgi, doll, plastic skin, airbrushed, stiff posed portrait';
const NEG_ANATOMY = 'extra hands, extra arms, extra legs, extra fingers, missing fingers, fused fingers, fused limbs, deformed legs, malformed limbs, three hands';
const WEIGHT_RX = /\(([^()]*?):\s*\d+(?:\.\d+)?\)/g;
export const noWeights = (t) => String(t || '').replace(WEIGHT_RX, '$1');

// ---------- Seed ----------
export function hashStr(s) { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
/** gleiche Szene → gleicher Seed, andere Szene → anderer Seed (Identität hält Referenzbild + Identitätstext, nicht der Seed) */
export function sceneSeed(base, key) { const b = Number.isInteger(base) ? Math.abs(base) : 0; return (b + hashStr(String(key || '').toLowerCase().replace(/\s+/g, ' ').trim())) % 999999999; }
/** seedMode: 'scene' (Standard) | 'same' (Ähnlich wie letztes Bild / 🔁, braucht bodySeed) | 'random' */
export function resolveSeed({ bodySeed, seedMode = 'scene', profile = {}, profileId = '', sceneKey = '', rnd = Math.random } = {}) {
  if (Number.isInteger(bodySeed) && (seedMode === 'same' || seedMode === 'scene' || !seedMode)) return Math.abs(bodySeed) % 999999999;
  if (seedMode === 'random' || profile.seedVary) return Math.floor(rnd() * 999999999);
  const base = Number.isInteger(profile.seed) ? profile.seed : hashStr('profile:' + profileId);
  return sceneSeed(base, sceneKey);
}

// ---------- Identität kompakt ----------
// häufige deutsche Profil-Begriffe → Englisch (Bildmodelle verstehen z. B. "Brille" nicht)
const DE_EN = [[/\bBrille\b/gi, 'wearing glasses'], [/\bSommersprossen\b/gi, 'freckles'], [/\blange\b/gi, 'long'], [/\bkurze\b/gi, 'short'], [/\bschwarze\b/gi, 'black'], [/\bblonde\b/gi, 'blonde'], [/\bbraune\b/gi, 'brown'], [/\brote\b/gi, 'red'], [/\bHaare\b/gi, 'hair'], [/\bAugen\b/gi, 'eyes'], [/\bgrüne\b/gi, 'green'], [/\bblaue\b/gi, 'blue'], [/\berwachsene Frau\b/gi, 'adult woman'], [/\bMitte (\d0)\b/gi, 'mid $1s'], [/^Frau$/i, 'woman'], [/\bTattoo(s)?\b/gi, 'tattoo$1']];
export function deToEn(t) { let o = String(t || ''); for (const [r, v] of DE_EN) o = o.replace(r, v); return o; }
export function compactIdentity(identity, max = 300) {
  const segs = dedupeSeg(scrubYouth(identity)).split(/\s*,\s*/).map(deToEn).join(', ').split(/\s*,\s*/).filter(Boolean); let out = '';
  for (const s of segs) { const n = out ? out + ', ' + s : s; if (n.length > max) { if (!out) out = s.slice(0, max); break; } out = n; }
  return out;
}

// ---------- Composer (LLM, striktes JSON) ----------
export const PART_KEYS = ['scene', 'action', 'pose', 'camera', 'lighting', 'outfit', 'outfit_state', 'background', 'expression'];
export const COMPOSER_JSON_SYSTEM = 'You turn an ongoing role-play chat into the parts of ONE photo of the CURRENT moment of the story. Use the STORY STATE (what is true so far) and update it from the latest messages: earlier facts stay true unless the chat changes them (if they moved to the bedroom, the place is the bedroom; being wet only lasts within the SAME location – after a change of location set outfit_state to "" unless the new scene makes her wet again). Answer ONLY with JSON: {"scene":"","action":"","pose":"","camera":"","lighting":"","outfit":"","outfit_state":"","background":"","expression":"","story":{"location":"","time_of_day":"","present":[],"outfit":"","outfit_state":"","action":""}}. ALL values in English, short concrete visual phrases – translate every German word (places, colors, objects) into English. outfit_state is one of "", "wet", "torn", "dirty", "dry" ("dry" only when the chat says she dried off or changed). RULES: "pose" is ONE static, anatomically simple body position (an END STATE, never a motion verb – not "falling", "jumping", "sitting down", "walking"; use "lying on the sofa", "sitting on the bed", "kneeling on the floor"). "pose" contains AT MOST ONE explicit hand placement (e.g. "hands on her thighs") – do NOT stack several hand placements anywhere. "action" describes what she is doing at this moment and must NOT repeat the body position already in "pose" (no second position, no second hand placement). NEVER describe her face, hair, eyes, skin, age, ethnicity or body shape (added separately). NEVER add people: the photo shows only the woman unless the latest messages clearly say another person is physically present right now; then list them in story.present. All persons are adults (18+). No text in the image. Output only the JSON.';
/** Composer-Anweisung; für 18+-Profile mit Pose-Intensität zusätzlich "bold pose" – nur adult. */
export function composerSystemFor({ adult = false, intensity = '' } = {}) {
  if (!adult) return COMPOSER_JSON_SYSTEM;
  const k = normalizeIntensity(intensity);
  if (k === 'stark' || k === 'offen') {
    return COMPOSER_JSON_SYSTEM + ' POSE INTENSITY (adult 18+ character, exhibitionistic): the "pose" and "action" must be BOLD, confident, open, inviting and lively – showing off her body to the camera' + (k === 'stark' ? ' (legs spread wide, arched back, hips pushed forward, proudly exhibitionistic, candid dynamic moment)' : ' (confident open stance, playful inviting body language)') + '. Still exactly ONE static body position, at most ONE hand placement, no motion verbs.';
  }
  return COMPOSER_JSON_SYSTEM;
}
// v78: Composer-Cache – gleicher Story-Kontext → kein erneuter LLM-Aufruf (FIFO, max 200)
const COMPOSER_CACHE = new Map();
const djb2 = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + t.length; };
export function clearComposerCache() { COMPOSER_CACHE.clear(); }
export async function cachedCompose(sys, input, composeLLM) {
  const key = djb2(String(sys) + '\u0000' + (typeof input === 'string' ? input : JSON.stringify(input)));
  if (COMPOSER_CACHE.has(key)) return COMPOSER_CACHE.get(key);
  const out = await composeLLM(sys, input);
  if (out) { COMPOSER_CACHE.set(key, out); if (COMPOSER_CACHE.size > 200) COMPOSER_CACHE.delete(COMPOSER_CACHE.keys().next().value); }
  return out;
}
export function parseComposerJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, ''); const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(t.slice(a, b + 1)); if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const out = {}; for (const k of PART_KEYS) out[k] = typeof o[k] === 'string' ? o[k].slice(0, 300) : '';
    const st = o.story && typeof o.story === 'object' ? o.story : {};
    out.story = { location: str(st.location), time_of_day: str(st.time_of_day), present: Array.isArray(st.present) ? st.present.map(String).slice(0, 4) : [], outfit: str(st.outfit), outfit_state: str(st.outfit_state), action: str(st.action) };
    return out; } catch { return null; }
}
const str = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
export function composerInput(L, prev, msgs) {
  const st = prev || {};
  return ['STORY STATE so far: ' + JSON.stringify({ location: st.location || '', time_of_day: st.time_of_day || '', present: st.present || [], outfit: st.outfit || '', outfit_state: st.outfit_state || '', action: st.action || '' }),
    L.fixed && 'FIXED by the user (keep exactly): ' + L.fixed,
    L.outfit && 'Outfit preset (use unless the chat says otherwise): ' + L.outfit,
    L.defaults?.place && 'Default place if the story has none: ' + L.defaults.place,
    L.scene && 'Picture request (highest priority for place, action and pose – overrides the story state and presets): ' + L.scene,
    L.corrections?.positive && 'Feedback to respect: ' + L.corrections.positive,
    'LATEST MESSAGES (oldest first):', ...msgs.map((m) => `${m.role}: ${String(m.content).slice(0, 700)}`)].filter(Boolean).join('\n').slice(0, 5000);
}

// ---------- Regel-Composer (ohne LLM, deterministisch) ----------
const LOCS = [
  [/\b(schlafzimmer|bedroom|ins bett|im bett|aufs bett|auf dem bett|bett\b|bed\b)/i, 'bedroom', 'cozy bedroom with a large bed'],
  [/\b(badezimmer|bathroom|dusche|shower|badewanne|bathtub)/i, 'bathroom', 'bathroom with tiled walls'],
  [/\b(büro|office|schreibtisch|desk)/i, 'office', 'modern office with a desk and large windows'],
  [/\b(küche|kitchen)/i, 'kitchen', 'home kitchen'],
  [/\b(wohnzimmer|living room|sofa|couch)/i, 'living room', 'living room with a sofa'],
  [/\b(pool)/i, 'pool', 'swimming pool'],
  [/\b(strand|beach|meer|ocean|sea\b|wellen|waves)/i, 'beach', 'sandy beach by the sea'],
  [/\b(see\b|lake)/i, 'lake', 'lakeshore'],
  [/\b(wald|forest)/i, 'forest', 'forest path'],
  [/\b(park|garten|garden)/i, 'park', 'green park'],
  [/\b(auto|car\b)/i, 'car', 'inside a car'],
  [/\b(straße|street|stadt|city)/i, 'street', 'city street'],
  [/\b(restaurant|bar\b|café|cafe|club)/i, 'bar', 'cozy bar'],
  [/\b(hotel)/i, 'hotel room', 'hotel room'],
  [/\b(sauna)/i, 'sauna', 'wooden sauna'],
  [/\b(gym|fitnessstudio)/i, 'gym', 'gym'],
];
const BG = Object.fromEntries(LOCS.map(([, k, v]) => [k, v]));
const TIMES = [[/\b(nachts?|night|mitternacht|midnight)\b/i, 'night'], [/\b(abends?|evening|sonnenuntergang|sunset)\b/i, 'evening'], [/\b(morgens?|morning|sonnenaufgang|sunrise)\b/i, 'morning'], [/\b(mittags?|noon|tagsüber|daytime)\b/i, 'day']];
const LIGHT = { night: 'dim night lighting, warm lamps', evening: 'warm golden evening light', morning: 'soft morning light', day: 'bright natural daylight' };
const WET = /\b(\w*nass\w*|welle erwischt|durchnässt\w*|wet|soaked|soaking|tropf\w*|dripping|spritz\w*|splash\w*|ins wasser|in the water|regen|rain)\b/i;
const DRY = /\b(abgetrocknet|trocknet sich|trocken|dried( off)?|towel(s|ed)? (herself )?off|umgezogen|zieht sich um|changed (her )?clothes|frische kleidung|dry clothes)\b/i;
const TORN = /\b(zerrissen\w*|torn|ripped)\b/i;
const COLORS = { weiß: 'white', weiss: 'white', weißes: 'white', weisses: 'white', weißen: 'white', schwarz: 'black', schwarzes: 'black', schwarzen: 'black', rot: 'red', rotes: 'red', roten: 'red', blau: 'blue', blaues: 'blue', blauen: 'blue', grün: 'green', grünes: 'green', white: 'white', black: 'black', red: 'red', blue: 'blue', green: 'green', pink: 'pink', rosa: 'pink', gelb: 'yellow', gelbes: 'yellow' };
const GARMENTS = { 't-shirt': 't-shirt', shirt: 'shirt', bluse: 'blouse', blouse: 'blouse', kleid: 'dress', sommerkleid: 'summer dress', dress: 'dress', bikini: 'bikini', badeanzug: 'swimsuit', swimsuit: 'swimsuit', jeans: 'jeans', rock: 'skirt', skirt: 'skirt', hoodie: 'hoodie', pyjama: 'pyjamas', bademantel: 'bathrobe', handtuch: 'towel', towel: 'towel', dessous: 'lingerie', lingerie: 'lingerie', top: 'top', tanktop: 'tank top', pullover: 'sweater', sweater: 'sweater', anzug: 'suit', uniform: 'uniform' };
const GARMENT_RX = new RegExp('\\b(?:(' + Object.keys(COLORS).join('|') + ')\\s+)?(' + Object.keys(GARMENTS).map((k) => k.replace('-', '\\-')).join('|') + ')\\b', 'i');
const POSES = [[/\b(setzt sich|setze mich|setzen uns|sitzt|sitze|sitzen|sits?|sitting|sat down)\b/i, 'sitting'], [/\b(legt sich|lege mich|liegt|liege|liegen|lies|lying|lay down)\b/i, 'lying'], [/\b(kniet|kneeling|kneels)\b/i, 'kneeling'], [/\b(lehnt|leaning|leans)\b/i, 'leaning'], [/\b(tanzt|dancing|dances)\b/i, 'dancing'], [/\b(läuft|spaziert|walking|walks)\b/i, 'walking'], [/\b(steht|stehe|standing|stands)\b/i, 'standing']];
const ACTIONS = [[/\b(spritz\w*|splash\w*)\b/i, 'laughing as water splashes around her'], [/\b(lacht|laughs?|laughing)\b/i, 'laughing'], [/\b(liest|reading|reads)\b/i, 'reading'], [/\b(arbeitet|working|works|tippt|typing)\b/i, 'working at the desk'], [/\b(trinkt|drinking|drinks)\b/i, 'holding a drink'], [/\b(schwimmt|swimming|swims)\b/i, 'swimming'], [/\b(küsst|kissing)\b/i, 'leaning in for a kiss']];
const first = (list, t) => { for (const [rx, v] of list) if (rx.test(t)) return v; return ''; };

const low70 = (t) => String(t || '').toLowerCase().trim();
export function emptyStory() { return { location: '', time_of_day: '', present: [], outfit: '', outfit_state: '', action: '', pose: '' }; }
const hasOwnKey = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
/** leere Felder behalten den alten Wert; 'dry' setzt den Zustand zurück */
export function mergeStory(prev, next) {
  const p = { ...emptyStory(), ...(prev || {}) }, n = next || {}, out = { ...p };
  // v83: echte Leerstrings löschen alte Werte (Ortswechsel darf action/pose verwerfen); undefined lässt den Wert stehen
  for (const k of ['location', 'time_of_day', 'outfit', 'action', 'pose']) {
    if (typeof n[k] === 'string' && n[k].trim()) out[k] = scrubYouth(n[k].trim()).slice(0, 200);
    else if (typeof n[k] === 'string' && hasOwnKey(n, k) && n[k] === '') out[k] = '';
  }
  if (typeof n.outfit_state === 'string' && n.outfit_state.trim()) out.outfit_state = /^(dry|none|clean|normal)$/i.test(n.outfit_state.trim()) ? '' : n.outfit_state.trim().toLowerCase().slice(0, 40);
  if (Array.isArray(n.present) && n.present.length) out.present = n.present.map((x) => scrubYouth(String(x)).slice(0, 60)).filter(Boolean).slice(0, 4);
  out.updatedAt = Date.now();
  return out;
}
/** wendet eine Nachricht auf den Story-Zustand an (Ort, Zeit, Kleidung, Zustand, Pose, Handlung) */
export function storyStep(prev, text) {
  const t = String(text || ''), n = {};
  let loc = LOCS.find(([rx]) => rx.test(t));
  // v83: Fallback über SCENE_MAP, wenn LOCS nichts kennt (z. B. Bibliothek)
  if (!loc) {
    const sv = detectSceneV83(t);
    if (sv) loc = [null, sv.location, sv.scene];
  }
  if (loc) n.location = loc[1];
  const tm = first(TIMES, t); if (tm) n.time_of_day = tm;
  const g = t.match(GARMENT_RX); if (g) n.outfit = [g[1] ? COLORS[g[1].toLowerCase()] : '', GARMENTS[g[2].toLowerCase()]].filter(Boolean).join(' ');
  if (DRY.test(t)) n.outfit_state = 'dry'; else if (WET.test(t)) n.outfit_state = 'wet'; else if (TORN.test(t)) n.outfit_state = 'torn';
  if (n.outfit && g && /umgezogen|zieht sich um|changed|anderes|frisch/i.test(t) && !WET.test(t)) n.outfit_state = 'dry';
  const po = first(POSES, t); if (po) n.pose = po;
  const ac = first(ACTIONS, t); n.action = ac || (loc && loc[1] !== prev?.location ? 'arriving' : '');
  // v83: Ortswechsel → alte Pose verwerfen, wenn die neue Nachricht keine eigene liefert (action wird oben schon auf 'arriving' gesetzt)
  if (!po && loc && loc[1] && prev && prev.location && low70(prev.location) !== low70(loc[1])) n.pose = '';
  return mergeStory(prev, n);
}
export function ruleComposer(L, prevStory, msgs) {
  let st = mergeStory(prevStory, {});
  // Story-Zustand vorhanden → nur die neueste Nachricht fortschreiben; sonst den ganzen Verlauf (alt → neu) abspielen
  const list = prevStory && prevStory.updatedAt ? (msgs || []).slice(-1) : (msgs || []);
  for (const m of list) st = storyStep(st, m.content);
  if (L?.scene) st = storyStep(st, L.scene);
  const AT = { bedroom: 'on the edge of the bed', office: 'at the desk', kitchen: 'at the kitchen counter', 'living room': 'on the sofa', beach: 'in the sand', pool: 'at the edge of the pool', car: 'in the passenger seat', bar: 'at the bar' };
  const pose0 = st.pose === 'sitting' && AT[st.location] ? 'sitting ' + AT[st.location] : st.pose === 'lying' && st.location === 'bedroom' ? 'lying on the bed' : st.pose;
  // v78: Pose-Details aus der neuesten Nachricht (Tür offen, Bein draußen)
  const pd = detectPoseDetails((msgs || []).slice(-1).map((m) => m.content).join(' '));
  const pose = [pose0, ...(Array.isArray(pd) ? pd : pd ? [pd] : [])].filter(Boolean).join(', ');
  return {
    scene: st.location ? `the woman ${st.action && st.action !== 'arriving' ? st.action + ' ' : ''}${/^(beach|pool|lake|forest|park|street|bar|gym|sauna|office)$/.test(st.location) ? 'at the' : 'in the'} ${st.location}${st.time_of_day ? ' in the ' + (st.time_of_day === 'day' ? 'daytime' : st.time_of_day) : ''}` : (st.action ? 'the woman ' + st.action : ''),
    action: st.action === 'arriving' ? '' : st.action, pose, camera: '', lighting: LIGHT[st.time_of_day] || '', outfit: st.outfit, outfit_state: st.outfit_state,
    background: BG[st.location] || st.location || '', expression: '', story: st,
  };
}

// ---------- Personenfilter (B3) ----------
const PERSON_RX = /\b(?:(?:a|an|the|one|two|three|another|second|other|his|her)\s+)?(?:man|men|guy|guys|boyfriend|girlfriend|husband|wife|partner|friend|friends|couple|crowd|people|person|persons|stranger|strangers|woman friend|another woman|second woman|other women|lover|he|him|they|them|mann|männer|freund|freundin|leute)\b/gi;
const PRESENT_ASK = /\b(mit ihm|mit ihr|zusammen mit|with him|with her|together with|neben ihm|next to him|in seinen armen|in his arms|beide|both of them|er und sie|he and she)\b/i;
export function peopleAllowed(story, msgs) { const last = (msgs || []).slice(-2).map((m) => m.content).join(' '); return PRESENT_ASK.test(last) && Array.isArray(story?.present) && story.present.filter((p) => !/^(the )?woman$|^she$|^her$/i.test(String(p).trim())).length > 0; }
export function filterPeople(parts, allowed = false) {
  if (allowed) return { ...parts };
  const out = { ...parts };
  for (const k of PART_KEYS) if (typeof out[k] === 'string') out[k] = out[k].replace(/\b(with|next to|beside|and|together with|in the arms of|mit|neben)\s+(?:a|an|the|his|her)?\s*(?:man|guy|boyfriend|friend|partner|husband|lover|stranger|mann|freund)\b/gi, '').replace(PERSON_RX, (m) => (/^(the )?(woman)$/i.test(m) ? m : '')).replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  return out;
}

// ---------- Prompt zusammenbauen (feste Reihenfolge, keine Gewichte) ----------
export function outfitPhrase(outfit, state) {
  const o = String(outfit || '').trim(), s = String(state || '').toLowerCase();
  if (/wet|nass|soak/.test(s)) return `visibly soaking wet ${o || 'clothes'} clinging to her skin, dark damp patches on the fabric, water droplets on her skin and hair`;
  if (/torn|zerriss/.test(s)) return `visibly torn ${o || 'clothes'} with ripped fabric`;
  if (/dirty|schmutz/.test(s)) return `visibly dirty ${o || 'clothes'} with stains`;
  return o ? `wearing ${o}` : '';
}
export function outfitNegative(state) { const s = String(state || '').toLowerCase(); return /wet|nass|soak/.test(s) ? 'dry clothes, dry fabric, dry hair' : /torn/.test(s) ? 'intact clothes' : /dirty|schmutz/.test(s) ? 'clean spotless clothes' : ''; }
const SOLO_NEG = 'extra people, second person, man, crowd, duplicate woman';
const SOLO_NEG_MALE = 'extra people, second person, woman, crowd, duplicate man';
// v87: Default-Negatives (alle Modi) und positive Kurzform für Modelle, die negative_prompt ignorieren
const NEG_DEFAULTS_FRONT = 'broken hands, broken fingers, bad teeth, crooked teeth';
const NAVEL_NEG = 'navel piercing, belly button piercing';
const NAVEL_RX87 = /\bnavel|belly[- ]button|bauchnabel/i;
const NEG_PHOTO87 = 'photorealistic, photo, photograph, realistic skin texture';
const POSE_MARK = /\b(?:pose|action|outfit)\s*:/i;
/** Teile eines Prompt-Textes für Prioritäts-Truncation (framing → Identität → Outfit zuerst) */
export function sectionsOf(prompt) {
  const s = String(prompt || '');
  const out = [];
  const rx = /(?:^|\. )(?=(?:Framing|Scene|Camera and pose|Outfit|The woman|The man|Style|Quality)\s*:)/g;
  let last = 0;
  for (const m of s.matchAll(rx)) {
    const at = m.index + (/^\. /.test(m[0]) ? 2 : 0);
    if (at > last) out.push({ text: s.slice(last, at), prio: prioOf(s.slice(last, at)) });
    last = at;
  }
  out.push({ text: s.slice(last), prio: prioOf(s.slice(last)) });
  return out;
}
function prioOf(t) {
  if (/^\s*Framing\s*:/i.test(t) || /\bThe (?:wo)?man\s*:/i.test(t) || /\bOutfit\s*:/i.test(t)) return 1;
  if (/^\s*Camera and pose\s*:/i.test(t)) return 2;
  if (/^\s*Scene\s*:/i.test(t)) return 2;
  return 9;
}
/** Prioritäts-Truncation: Framing + Identität + Outfit bleiben vollständig, Background/Quality fallen zuerst. */
export function fitPrompt(prompt, max = 2000) {
  const s = String(prompt || '');
  if (s.length <= max) return s;
  // v71: Framing, Identität, Outfit und Pose bleiben ganz; Szene/Hintergrund/Stil/Qualität werden gekürzt (Reihenfolge bleibt)
  const secs = sectionsOf(s);
  const prot = (t) => /^(Framing|The woman|The man|Outfit|Camera and pose)\s*:/.test(t.trim());
  const protLen = secs.filter((x) => prot(x.text)).reduce((n, x) => n + x.text.length, 0);
  let room = Math.max(0, max - protLen);
  const free = secs.filter((x) => !prot(x.text));
  const out = secs.map((x) => {
    if (prot(x.text)) return x.text;
    const share = Math.floor(room / Math.max(1, free.length - free.indexOf(x)));
    const t = x.text.length <= share ? x.text : (share > 20 ? x.text.slice(0, share - 2).replace(/[,\s]+\S*$/, '') + '. ' : '');
    room -= t.length; return t;
  });
  return out.join('').slice(0, max);
}
export function assemblePrompt(parts, L, { style = 'real', adult = false, variation = '', solo = true, intensity = '', frame = '', presetNegative = '' } = {}) {
  const P = parts || {}, j = (a) => a.map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  // (a) Framing ZUERST – Ausschnitt-Dropdown nur wenn es Nahaufnahme o. Ä. ausdrücklich setzt; Gesicht/Kopf bleibt immer im Bild
  const fr = String(frame || P.camera || '').trim();
  const closeFrame = /\b(close-up|close up|portrait|nahaufnahme)\b/i.test(fr);
  const framing = closeFrame ? `${fr}, entire head and face in frame, looking at camera` : `${FRAMING}${fr ? ', ' + fr : ''}`;
  const scene = j([P.scene, P.action && !String(P.scene || '').includes(P.action) ? P.action : '', P.background && 'background: ' + P.background, P.lighting]);
  const cam = j([String(P.pose || '').replace(/^pose:\s*/i, ''), P.expression || L.expression || L.defaults?.expression, variation]);
  const outfit = outfitPhrase(P.outfit, P.outfit_state);
  const ident = compactIdentity(L.identity || '', 300);
  const male = /^\s*adult man\b/i.test(ident);
  const render = L.render ? L.render : adult && (style === 'real' || style === 'story') ? 'raw candid smartphone photo, realistic natural lighting, natural skin texture with visible pores, photorealistic' : `${STYLE[style] || STYLE.real}, candid natural moment`;
  const styleTxt = j([L.styleText, L.stylePose, L.corrections?.positive, render]);
  const quality = 'high detail, sharp focus, no text, no letters';
  const sections = ['Framing: ' + framing, scene && 'Scene: ' + scene, cam && 'Camera and pose: ' + cam, outfit && 'Outfit: ' + outfit, ident && (male ? 'The man: ' : 'The woman: ') + ident, styleTxt && 'Style: ' + styleTxt, 'Quality: ' + quality];
  const prompt = fitPrompt(scrubYouth(noWeights(sections.filter(Boolean).join('. '))), 2000);
  const negative = mergeNegative(noWeights([
    NEG_SINGLE, NEG_ANATOMY, adult && style !== 'comic' && style !== 'manhwa' ? NEG_ADULT_REAL : '', outfitNegative(P.outfit_state),
    L.outfitNeg, L.corrections?.negative, presetNegative, solo ? (male ? SOLO_NEG_MALE : SOLO_NEG) : '', /^(real|story)$/.test(style) ? 'cropped head, head out of frame, cut off face' : '', style === 'comic' || style === 'manhwa' ? NEG_PHOTO87 : '',
  ].filter(Boolean).join(', ')), [], 1000);
  return { prompt, negative };
}

const ID_LOCK = { hair: { text: '' }, eyes: { text: '' }, age: { text: '' } };
const cleanPart = (t) => scrubYouth(stripConflicts(noWeights(String(t || '')), ID_LOCK).text);

/** v74: Prompt-App-Adapter – nutzt buildPromptPlan für Prompt/Identität, hält Routing/Seeds/Story in imgsvc-plan.js. */
const PROMPTAPP_MODELS = new Set(['lustify-v8', 'chroma', 'qwen-image-3', 'qwen-image-2-1-turbo', 'z-image-turbo', 'flux-2-pro']);

/** pure Plan-Funktion; imageNewMode macht nur I/O drumherum. composeLLM(system, input) → Text (optional). */
export async function buildImagePlan({ profile = {}, resolved = {}, card = null, corrections = {}, body = {}, prevStory = null, composeLLM = null, rnd = Math.random, hasRef = false, refMode = 'off' } = {}) {
  const adult = body.adult === true;
  // Altersschutz 18+ vor allem anderen (auch dryRun)
  if (adult && (minorRisk(profile, resolved) || youthRisk(body.context?.scene))) return { error: { status: 403, code: 'not_adult', message: AGE_MSG } };
  let res = resolved || {};
  const po = body.photoOverride;
  if (po && typeof po === 'object' && !Array.isArray(po)) {
    const photo = {}; for (const k of ['outfit', 'pose', 'scene', 'light', 'frame', 'mood', 'render']) if (typeof po[k] === 'string') photo[k] = po[k].slice(0, 900); // '' = automatisch (gespeicherten Wert für dieses Bild aufheben)
    const d = { ...(res.defaults || {}) }; if ('outfit' in photo) d.outfit = undefined; if ('pose' in photo) d.pose = undefined; if ('scene' in photo) d.place = undefined; if ('mood' in photo) d.expression = undefined;
    res = { ...res, photo: { ...(res.photo || {}), ...photo }, defaults: d };
  }
  const style = ['real', 'story', 'comic', 'manhwa', 'comicpage'].includes(String(body.style)) ? String(body.style) : 'real';
  const bc = body.context || {};
  const msgs0 = (Array.isArray(bc.messages) ? bc.messages : []).filter((m) => m && m.content && !m.generated).slice(-6);
  const msgs = msgs0.map((m, i) => ({ role: String(m.role || 'user'), content: scrubYouth(String(m.content)).slice(0, i === msgs0.length - 1 ? 1800 : 700) }));
  const sceneReq = scrubYouth(String(bc.scene || '')).slice(0, 400);
  const L0 = resolveLayers({ profile, resolved: res, card, scene: sceneReq, context: { summary: String(bc.summary || '').slice(0, 800), messages: msgs }, corrections });
  const L = { ...L0, ...useScene(L0, msgs[msgs.length - 1]?.content || sceneReq), vibe: vibeCues(String(profile.traits || '')) };
  // v83: Wenn die Wunsch-Szene einen Ort nennt, gespeicherten setting:-Fixtext ausblenden (Foto-Override gilt immer).
  if (sceneReq && detectSceneV83(sceneReq) && !(po && typeof po === 'object' && typeof po.scene === 'string')) {
    L.fixed = String(L.fixed || '').split('; ').filter((x) => x && !x.startsWith('setting: ')).join('; ');
  }
  const q0 = String(body.quality || '');
  // v75 (e): explizit = der NUTZER hat im Dropdown ein Modell gewählt (nicht 'auto'/'single'/leer)
  const explicitModel = !!(q0 && !/^(auto|single)$/i.test(q0));
  const quality = normQuality(!q0 || q0 === 'single' || q0 === 'auto' ? profile.photo?.quality || q0 || 'single' : q0);
  const route = routeModel({ style, adult, quality, refMode, hasRef, explicit: explicitModel, fsk18Sheer: false });
  // v87: Porträt nur aus Nutzerquellen (Wunsch-Szene, Ausschnitt-Dropdown, body.camera, photoOverride.frame, Porträt-Pose)
  const userPortrait = PORTRAIT_RX.test(String(sceneReq || '')) || PORTRAIT_RX.test(String(po && typeof po === 'object' ? po.frame || '' : '')) || PORTRAIT_RX.test(String(res.photo?.frame || '')) || PORTRAIT_RX.test(String(body.camera || '')) || PORTRAIT_RX.test(String(res.photo?.pose || ''));

  if (style === 'comicpage') {
    const r = buildRulePrompt(L, { style });
    const seed = resolveSeed({ bodySeed: body.seed, seedMode: body.seedMode, profile, profileId: body.profile, sceneKey: 'comic|' + L.scene, rnd });
    return { prompt: scrubYouth(noWeights(r.prompt)), negative: noWeights(r.negative), parts: null, story: prevStory, seed, route, composer: 'rule', variation: '', conflicts: L.conflicts, quality, style, abgleich: [], adult };
  }
  // Composer: LLM (JSON) → sonst Regel-Composer; beide bekommen Story-Zustand + letzte Nachrichten
  let parts = null, composer = 'rule';
  if (composeLLM && (msgs.length || L.scene)) {
    const sys = composerSystemFor({ adult, intensity: intensityDefaults({ profile, resolved: res, body }) });
    try { parts = parseComposerJson(await cachedCompose(sys, composerInput(L, prevStory, msgs), composeLLM)); if (parts) composer = 'llm'; } catch { parts = null; }
  }
  const rule = ruleComposer({ ...L, scene: sceneReq }, prevStory, msgs);
  if (!parts) parts = rule;
  for (const k of PART_KEYS) parts[k] = cleanPart(parts[k]);
  // v87: LLM-Kamera darf kein Porträt erfinden, wenn keine Nutzerquelle es will
  if (!userPortrait && parts.camera && PORTRAIT_RX.test(parts.camera)) parts.camera = stripPortraitWords(parts.camera);
  // Story fortschreiben: LLM-Story über die Regel-Story mergen (Regel liefert Fallback für leere Felder)
  let story = composer === 'llm' ? mergeStory(rule.story, { ...(parts.story || {}), outfit_state: parts.story?.outfit_state || parts.outfit_state || '' }) : rule.story;
  // v70: Nässe verfällt bei Ortswechsel, sofern die neuesten Nachrichten nicht wieder Nässe nennen
  {
    const lastTxt = msgs.slice(-2).map((m) => m.content || '').join(' ');
    if (prevStory?.location && story.location && low70(prevStory.location) !== low70(story.location) && /wet/i.test(story.outfit_state || '') && !WET.test(lastTxt)) {
      story = { ...story, outfit_state: '' };
      if (/wet/i.test(parts.outfit_state || '')) parts.outfit_state = '';
    }
  }
  if (!parts.outfit_state && story.outfit_state) parts.outfit_state = story.outfit_state;
  if (/^(dry|none)$/i.test(parts.outfit_state)) parts.outfit_state = '';
  if (!parts.outfit && story.outfit) parts.outfit = story.outfit;
  if (!parts.background && story.location) parts.background = story.location;
  // v85 (19): Tageszeit – Wahl im Foto-Menü / in der Bild-App überschreibt die Story-Tageszeit (und das Licht, außer Licht ist gewählt).
  //   '' = automatisch: Story-Tageszeit; fehlt sie, wird sie aus den letzten Chat-Nachrichten erkannt (deutsch: abends, nachts, morgens, mittags …).
  const todPick = timeOfDayKey(body.timeOfDay) || timeOfDayKey(po && typeof po === 'object' ? po.time : '') || timeOfDayKey(res.photo?.time);
  if (todPick) {
    story = { ...story, time_of_day: todPick };
    if (!res.photo?.light) parts.lighting = LIGHT[todPick];
    if (parts.scene) parts.scene = parts.scene.replace(/\bin the (morning|daytime|day|evening|night)\b/i, 'in the ' + (todPick === 'day' ? 'daytime' : todPick));
  } else if (!story.time_of_day) {
    const t85 = detectTimeOfDay(msgs.slice(-2).map((m) => m.content || '').join(' '));
    if (LIGHT[t85]) story = { ...story, time_of_day: t85 };
  }
  if (!parts.lighting && LIGHT[story.time_of_day]) parts.lighting = LIGHT[story.time_of_day];
  // Defaults nur wo die Story nichts sagt
  if (!parts.outfit && L.defaults?.outfit) parts.outfit = L.defaults.outfit;
  if (!parts.background && L.defaults?.place) parts.background = L.defaults.place;
  // Dropdowns gewinnen IMMER (Pose, Umgebung, Outfit, Licht, Ausschnitt, Ausdruck)
  const ph = res.photo || {};
  // v76: Kleidung „automatisch“ – ein Story-Outfit schlägt Regel-/Karten-Presets (nur Dropdown-Auswahl gewinnt immer)
  //   (der LLM-Composer kopiert oft das Preset in parts.outfit, obwohl story.outfit die Szene korrekt kennt)
  const storyOutfitNow = String(story.outfit || '').trim();
  if (!L.outfitPicked && storyOutfitNow && storyOutfitNow.toLowerCase() !== String(L.outfit || '').trim().toLowerCase()) {
    if (L.outfit) { L.outfit = ''; L.outfitNeg = ''; L.outfitFromChat = true; }
    parts.outfit = storyOutfitNow;
  }
  if (L.outfit) parts.outfit = L.outfit;
  if (ph.pose) parts.pose = ph.pose; else if (!parts.pose && L.defaults?.pose) parts.pose = L.defaults.pose;
  // v83: gespeicherte Dropdown-Szene gilt nur, wenn die Wunsch-Szene keinen Ort nennt; photoOverride.scene gilt immer.
  const wishHasPlace83 = !!(sceneReq && detectSceneV83(sceneReq));
  const poScene83 = po && typeof po === 'object' && typeof po.scene === 'string' && po.scene !== '';
  if (ph.scene && (poScene83 || !wishHasPlace83)) parts.background = ph.scene;
  if (ph.light) parts.lighting = ph.light;
  if (ph.frame) parts.camera = ph.frame;
  if (ph.mood) parts.expression = ph.mood;
  if (typeof body.camera === 'string' && body.camera) parts.camera = body.camera.slice(0, 120);
  // v87: Porträt-Ausschnitt – Kamera fixieren; Ganzkörper-Pose kommt aus buildPromptPlan nicht zurück
  if (userPortrait) parts.camera = (ph.frame && PORTRAIT_RX.test(ph.frame)) ? ph.frame : 'close-up portrait, head and shoulders';
  // v71: Pose-Intensität (nur adult) – Dropdown > Profil > Profilname-Fallback ('lora' → stark)
  const intensity = intensityDefaults({ profile, resolved: res, body });
  if (adult && intensity && !userPortrait) {
    const kind = poseKindOf(parts.pose);
    parts.pose = poseForKind(kind, intensityPose(intensity, kind));
    const extra = sharpTags({ intensity, outfit: parts.outfit || L.outfit || '', scene: [parts.scene, parts.background].join(' ') });
    if (extra.length) parts.outfit = [parts.outfit, extra.join(', ')].filter(Boolean).join(', ');
  }
  // v73: Bikini nur wenn aktiv (Dropdown oder Story) → Oberteil erzwingen; sonst keine Bikini-Tags
  const bikiniActive = adult && /\bbikini\b/i.test(parts.outfit || '') && !/\b(nude|naked|nackt|topless|oben ohne)\b/i.test(parts.outfit || '');
  if (bikiniActive) parts.outfit = parts.outfit + ', bikini top worn, both triangles on';
  const strongNeg = adult && intensity && !userPortrait ? intensityNegatives({ intensity, frame: ph.frame || parts.camera }) : { extra: [], pinFrame: false };

  // v69: Abgleich (Dropdown > Story > Profil-Defaults, Alter, FSK18, Hände, Pose, Szene) – bereinigte Identität per L-Override
  const ab = abgleich({ profile, resolved: res, photo: ph, parts, story, adult, msgs });
  if (ab.block) return { error: { status: 403, code: ab.block.code, message: ab.block.message } };
  parts = ab.parts;
  // v75 (e): adult + FSK18-Sheer/Micro + keine explizite Dropdown-Wahl → chroma (nach dem Outfit-Merge, nicht vorher)
  if (adult && !explicitModel && route && route.model !== 'chroma' && fsk18Family(parts.outfit || L.outfit)) {
    route.model = 'chroma';
    route.steps = undefined;
    route.edit = null;
    route.mix = false;
  }
  const L2 = { ...L, identity: ab.identity };
  // keine Extra-Personen
  const allowed = peopleAllowed(story, msgs);
  parts = filterPeople(parts, allowed);
  if (!allowed) story = { ...story, present: ['the woman'] };
  // v87: Spar-Mix nur ohne Partner/Mann, adult und ohne explizite Sonderwahl
  const maleSubject = subjectOf(profile).sex === 'man';
  const partnerNames = allowed ? (story?.present || []).filter((p) => !/^(the )?woman$|^she$|^her$/i.test(String(p).trim())).map((p) => String(p).slice(0, 40)).slice(0, 3) : [];
  { const sm = sparMixModel({ adult, quality, partner: allowed, male: maleSubject }); if (sm) { route.model = sm.model; route.cost = sm.cost; route.steps = undefined; route.edit = null; route.mix = false; } }

  // v74: Prompt-App-Adapter. Wir überlassen buildPromptPlan das eigentliche Formulieren;
  // Routing, Seeds und Story bleiben hier. Wenn `model` nicht in der Prompt-App-Tabelle ist,
  // fällt der Format-Stil auf 'prose' und Prompt ist kompatibel zur alten assemble-Pipeline.
  const plannedModel = route?.model && PROMPTAPP_MODELS.has(route.model) ? route.model : 'chroma';
  const promptPlan = buildPromptPlan({
    profile, resolved: { ...res, identity: ab.identity }, photoOverride: po || {}, story,
    msgs: msgs.map((m) => ({ role: m.role, content: String(m.content || '') })),
    adult: adult && !!body.adult, model: plannedModel, quality,
    body: {
      parts: { ...parts },
      seed: Number.isInteger(body.seed) ? body.seed : undefined,
      wish: sceneReq,
      style,
      partner: allowed,
      partnerNames,
      portrait: userPortrait,
    },
  });
  if (promptPlan.error) return { error: { status: 403, code: promptPlan.error.code, message: promptPlan.error.message } };
  // v83: Story (zurückgespeichert in KV) auf die aufgelöste Szene aktualisieren
  if (promptPlan.story) story = { ...story, ...promptPlan.story };
  // Abgleich-Notes zusammenführen
  // v83: EIN Alters-Hinweis – meldet die Prompt-App (Einstellungsfeld-Priorität) schon einen, entfällt der doppelte aus abgleich()
  const ppAge83 = (promptPlan.abgleich || []).some((w) => /^Alter widersprüchlich/.test(w));
  const abWarn83 = (ab.warnings || []).filter((w) => !(ppAge83 && /^Alter widersprüchlich/.test(w)));
  const abgleichMerged = Array.from(new Set([...abWarn83, ...(promptPlan.abgleich || [])]));
  const appParts = { ...parts, ...(promptPlan.parts || {}) };

  // Variation: automatische Pose bleibt variabel; Dropdown-Pose → nur Linse
  let variation = style === 'real' || style === 'story' ? pickVariation({ pose: ph.pose || appParts.pose, frame: appParts.camera, defaults: {} }, rnd) : '';
  if (variation && /\b(hands?|arms?)\b/i.test([appParts.pose, appParts.action].join(' ')) && /\b(hand|hands|arm|arms|reaching)\b/i.test(variation)) variation = '';
  const sceneKey = [story.location, story.time_of_day, appParts.scene, appParts.action, appParts.pose, appParts.outfit, appParts.outfit_state, appParts.background].join('|');
  const seed = resolveSeed({ bodySeed: body.seed, seedMode: body.seedMode, profile, profileId: body.profile, sceneKey, rnd });

  // Prompt + Negative der Prompt-App; einheitliche Default-Negatives und Anpassungen aus abgleich/strongNeg.
  let prompt = promptPlan.prompt;
  let negative = promptPlan.negative;
  const navDefault87 = !NAVEL_RX87.test(String(promptPlan.identity || '') + ' ' + String(appParts.outfit || ''));
  // v87: Defaults ganz vorne (Venice kürzt bei 800), Solo-Begriffe nur ohne Partner
  negative = mergeNegative([
    NEG_DEFAULTS_FRONT,
    navDefault87 ? NAVEL_NEG : '',
    !allowed ? 'duplicate person, extra persons' : '',
  ].filter(Boolean).join(', '), [
    negative,
    NEG_ANATOMY,
    NEG_SINGLE,
    !allowed ? (maleSubject ? 'extra people, second person, woman, crowd' : 'extra people, second person, man, crowd') : '',
    'cropped head, cut off face, out of frame',
    adult && style !== 'comic' && style !== 'manhwa' ? NEG_ADULT_REAL : '',
    style === 'comic' || style === 'manhwa' ? NEG_PHOTO87 : '',
    ...strongNeg.extra,
  ].filter(Boolean), 1000);
  // v87: Negatives, die das positive Outfit/den Stil verbieten, entfernen (Nacktheit nur in hemmungslos)
  negative = dropNegativeConflicts(negative, adult ? String(appParts.outfit || '') + ', ' + String(prompt).slice(0, 600) : String(prompt).slice(0, 300));
  // Bei Nicht-Prompt-App-Modellen Wrapping in alten Stil, damit Kompatibilität erhalten bleibt (prose)
  if (!PROMPTAPP_MODELS.has(route?.model || '')) {
    const wrapped = assemblePrompt(appParts, L2, {
      style, adult, variation, solo: !allowed, intensity: adult ? intensity : '', frame: ph.frame || appParts.camera || '',
      presetNegative: [res.photo?.negative, photoOverrideNegative(po)].filter(Boolean).join(', '),
    });
    prompt = wrapped.prompt;
    negative = mergeNegative(wrapped.negative, [negative], 1200);
  }
  return {
    prompt, negative, parts: { ...appParts, story: undefined }, story, seed, route, composer, variation, conflicts: L.conflicts,
    quality, style, abgleich: abgleichMerged, adult, intensity: adult ? intensity : '', bikiniActive: !!promptPlan.garment && promptPlan.garment.kind !== 'other' && promptPlan.garment.kind !== 'nude',
    checkSpec: promptPlan.checkSpec, identity: promptPlan.identity,
  };
}
function photoOverrideNegative(po) { return po && typeof po === 'object' && typeof po.negative === 'string' ? po.negative.slice(0, 400) : ''; }
function intensityNegatives({ intensity, frame = '' }) {
  const extra = [], k = normalizeIntensity(intensity);
  if (k === 'stark') extra.push('shy, closed legs, crossed arms, covering body');
  extra.push('cropped head, head out of frame, cut off face');
  const pinFrame = !/\b(close-up|close up|portrait|nahaufnahme)\b/i.test(String(frame));
  if (pinFrame) extra.unshift(...FRAMING.split(', '));
  return { extra, pinFrame };
}
export function mergeNegative(base, extra, max = 1000) {
  const out = dedupeSeg([base, ...(extra || [])].filter(Boolean).join(', '));
  return scrubYouth(out).slice(0, max);
}
export { VARIATIONS, AGE_MSG };
export { sparMixModel } from './imgsvc-core.js';
