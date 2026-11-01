import { subjectOf } from './identity.js';
// v74 Prompt-App: EIN reiner Prompt-Plan. `buildPromptPlan` liefert prompt/negative/parts/story/seed/checkSpec/identity.
// Kein I/O, keine Seiteneffekte. Routing, Seeds (Policy), Storage bleiben in imgsvc-plan.js / imgsvc-image.ts.
import { buildIdentity, collectDefaultOutfitSegs, resolveAge, FSK18_ID_RX, CLOTHING_RX } from './identity.js';
import { classifyOutfit, specFor, specForRendered, activeGarmentBits, renderOutfitPhrase } from './garments.js';
import { FORMAT, framingFor, formatPrompt, FRAMING, STYLE_TEXT } from './format.js';
import { makeCheckSpec } from './check-spec.js';
import { dedupe, dedupeText, dropSegs, dropNegativeConflicts, low, splitSegs, stripConflictingAge, tidy, truncateSegs } from './util.js';
import { isExplicitAdult, isFsk18Segment, neutralPose, SFW_NEGATIVES, sfwText } from './sfw.js';
import { storyScene, detectStoryPose, detectScene } from './scene-map.js';
import { resolveSceneTarget, fitPoseToScene, poseExtras } from './consistency.js';
import { reconcileOutfitNudity, dedupeGarmentTags } from './garments.js';

const AGE_MSG_DE = 'Profil muss eindeutig erwachsen sein (18+)';

/** Basis-Negatives: Anatomie + Solo (Basislinie der Pipeline seit v68) */
const NEG_BASE = 'bad anatomy, extra limbs, deformed hands, watermark, text, letters, logo, signature, lowres, blur, jpeg artifacts';
const NEG_ANATOMY = 'extra hands, extra arms, extra legs, extra fingers, missing fingers, fused fingers, three hands';
const NEG_SOLO = 'extra people, second person, man, crowd';
// v87: feste Default-Negatives (ganz vorne, weil Venice bei 800 Zeichen abschneidet)
export const NEG_DEFAULTS = 'broken hands, broken fingers, bad teeth, crooked teeth';
export const NEG_NAVEL = 'navel piercing, belly button piercing';
const SOLO_CLAUSE = 'duplicate person, extra persons';
// v87: Komik-Handwerk statt Foto-Handwerk im Negativ
const NEG_PHOTO = 'photorealistic, photo, photograph, realistic skin texture';
const NAVEL_RX = /\bnavel|belly[- ]button|bauchnabel/i;
/** Porträt-Erkennung (nur Nutzerquellen; Regex laut v87-Spez) */
export const PORTRAIT_RX = /porträt|portrait|nahaufnahme|close-?up|kopf und schultern|head and shoulders|headshot|brustbild|gesicht in nahaufnahme/i;
/** v87: positive Kurzform der wichtigsten Negatives (nur für Modelle ohne negative_prompt) */
function positiveMirror({ navel = true } = {}) {
  return ['natural hands with five fingers', 'natural even teeth', navel ? 'bare navel without jewelry' : ''].filter(Boolean).join(', ');
}
/** v87: kleine Oberweite – Segment aus der Identität lösen und hinter dem Alter einsortieren */
const SMALL_BUST_RX = /\b(AA|A)-cup\b|\bsmall\b[^,]*\bbust\b|\bflat chest\b/i;
export function amplifySmallBust(identity) {
  const segs = splitSegs(identity);
  const idx = segs.findIndex((s) => SMALL_BUST_RX.test(s));
  if (idx < 0) return { identity, extra: [], navel: false };
  const seg = segs[idx];
  const curvy = segs.some((s) => /\b(curvy|hourglass)\b/i.test(s));
  const full = seg + (curvy && !/\bcurves? in the hips/i.test(seg) ? ', curves in the hips and waist, not the bust' : '') + (/\bsmall breasts/i.test(seg) ? '' : ', small breasts, flat petite chest');
  const rest = segs.slice(0, idx).concat(segs.slice(idx + 1));
  const ageIdx = rest.findIndex((s) => /looks exactly \d+ years old/i.test(s));
  const at = ageIdx < 0 ? 0 : ageIdx + 1;
  const out = rest.slice(0, at).concat([full], rest.slice(at));
  return { identity: out.join(', '), extra: ['large breasts', 'big breasts', 'busty', 'huge breasts'], navel: false };
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const str = (v) => (typeof v === 'string' ? tidy(v) : '');

/** Ist das Profil als 18+ markiert? */
export function isAdultProfile(profile = {}) {
  return isExplicitAdult(profile);
}

/** Story-Heuristik: welches Outfit nennt die letzte Antwort/der Story-State? */
const GARMENT_HINTS = [
  [/\b(red dress|rotes kleid)\b/i, 'red dress'],
  [/\b(black dress|schwarzes kleid)\b/i, 'black dress'],
  [/\b(bikini)\b/i, 'bikini'],
  [/\b(nackt|nude|naked|topless|oben ohne)\b/i, 'nude'],
  [/\b(latex|pvc)\b/i, 'latex outfit'],
  [/\b(lingerie|dessous)\b/i, 'lingerie'],
  [/\b(handtuch|towel)\b/i, 'white towel'],
  [/\b(white t-?shirt|weißes t-?shirt)\b/i, 'white t-shirt'],
  [/\b(shirt|t-?shirt|hemd)\b/i, 'shirt'],
  [/\b(pyjama|pajama)\b/i, 'pyjamas'],
  [/\b(kleid|dress)\b/i, 'dress'],
];

/** Scene-Presets mit Default-Outfit (Spiegel von photoopts.SCENE_DEFAULTS) */
export const SCENE_DEFAULTS = {
  betonwand: { outfit: 'bikini', pose: 'standing, hand on hip' },
  parkplatz: { outfit: 'nude', pose: 'standing confidently' },
  poolnacht: { outfit: 'nude', pose: 'lounging by the pool' },
  yoga: { outfit: 'bikini', pose: 'yoga pose' },
};

/**
 * 18+/FSK18-Guard: der Request-Flag `adult === true` ist maßgeblich (v81). Herabgestuft wird nur
 * noch bei ausdrücklicher Sperre im Profil (`adult === 'never'` oder `adultMode === false`).
 * Ein Profil-Flag `adult|fsk|fsk18 === false` stuft eine adult-Anfrage NICHT mehr herab.
 * `ph` wird IN-PLACE bereinigt (Aufrufer erwartet Änderungen am selben Objekt).
 */
export function guardAdult({ profile = {}, adult = false, ph = {}, notes = [] } = {}) {
  const explicitNotAdult = profile.adult === 'never' || profile.adultMode === false;
  const effectiveAdult = !!adult && !explicitNotAdult;
  if (!effectiveAdult) {
    for (const k of ['intensity', 'koerper']) {
      if (hasOwn(ph, k) && String(ph[k] || '').trim()) {
        notes.push(`FSK18-Preset „${k}“ ignoriert (Modus jugendfrei)`);
        delete ph[k];
      }
    }
    if (hasOwn(ph, 'outfit') && /\b(latex|lingerie|nude|nackt|micro\s*-?\s*bikini|topless|bikini|bodysuit|sideboob|underboob|cup bust)\b/i.test(String(ph.outfit))) {
      notes.push('FSK18-Details aus der Auswahl für dieses Bild entfernt (Modus jugendfrei)');
      ph.outfit = ''; // v81: '' = automatisch → Story/Profil-Default, danach SFW-Filter (überdeckt auch resolved.photo.outfit)
    }
  }
  return { effectiveAdult, ph, notes };
}

/** Fachwerk: Dropdown → Story → Story-State → Profil-Default. Liefert parts + deutsche Notes. */
export function reconcile({ profile = {}, resolved = {}, photoOverride = {}, parts = {}, story = null, wish = '', oneTimeScene = '' } = {}) {
  const notes = [];
  const P = { ...(parts || {}) };
  // Dropdown-Werte können in `photoOverride` (Request) ODER in `resolved.photo` (gespeicherte Auswahl) liegen.
  // `photoOverride` gewinnt pro Schlüssel – ein explizites `''` hebt die gespeicherte Auswahl für dieses Bild auf.
  const ph = { ...((resolved && resolved.photo) || {}), ...(photoOverride || {}) };
  const ST = story || {};
  const R = resolved || {};

  // ---------- Outfit ----------
  const ddRaw = hasOwn(ph, 'outfit') ? String(ph.outfit || '').trim() : '';
  const ddAuto = !ddRaw || /^(automatisch|auto|frei|passend.*szene)$/i.test(ddRaw);
  const storyOutfit = str(P.outfit) || str(ST.outfit);
  const profileOutfit = str(R.defaults?.outfit) || str(R.photo?.outfit && hasOwn(ph, 'outfit') ? '' : '');

  let outfitSource = 'none';
  if (!ddAuto) {
    // v75 (f): nach Normalisierung identischer Text ist kein Widerspruch
    const norm = (s) => low(s).replace(/\s+/g, ' ').trim();
    if (storyOutfit && norm(storyOutfit) !== norm(ddRaw) && !norm(ddRaw).includes(norm(storyOutfit))) {
      // beide Formulierungen: neue Prompt-App-Notiz + alte Abgleich-Notiz (Abwärtskompatibilität)
      notes.push(`Dropdown-Kleidung überschreibt Story („${storyOutfit}“ → „${ddRaw}“)`);
      notes.push(`Kleidung: Auswahl „${ddRaw}“ hat Vorrang vor der Story („${storyOutfit}“)`);
    }
    P.outfit = ddRaw;
    outfitSource = 'dropdown';
  } else if (storyOutfit) {
    P.outfit = storyOutfit;
    outfitSource = 'story';
    if (profileOutfit && low(profileOutfit) !== low(storyOutfit)) {
      notes.push(`Kleidung: Story-Outfit „${storyOutfit}“ hat Vorrang vor Profil-Default „${profileOutfit}“`);
    }
  } else if (profileOutfit) {
    P.outfit = profileOutfit;
    outfitSource = 'profile';
  } else {
    P.outfit = '';
    outfitSource = 'auto';
  }
  if (!P.outfit_state && ST.outfit_state) P.outfit_state = ST.outfit_state;

  // ---------- Pose ----------
  const ddPose = hasOwn(ph, 'pose') ? str(ph.pose) : '';
  if (ddPose) {
    const cur = str(P.pose);
    if (cur && low(cur) !== low(ddPose)) notes.push(`Pose: Auswahl „${ddPose}“ ersetzt „${cur}“ aus der Story`);
    P.pose = ddPose;
  }

  // ---------- Szene ----------
  // v83: Eine gespeicherte Dropdown-Szene gilt NUR, wenn die Wunsch-Szene keinen Ort nennt (Aufgabe 2).
  // photoOverride.scene (einmalige Auswahl) wird hier weiterhin gesetzt und gewinnt in resolveSceneTarget.
  const ddScene = hasOwn(ph, 'scene') ? str(ph.scene) : '';
  const wishHasPlace = !!detectScene(str(wish));
  if (ddScene && (str(oneTimeScene) || !wishHasPlace)) {
    const curBg = str(P.background);
    if (curBg && low(curBg) !== low(ddScene) && !low(ddScene).includes(low(curBg))) {
      notes.push(`Szene: Auswahl „${ddScene}“ hat Vorrang vor Story-Ort „${curBg}“`);
    }
    P.background = ddScene;
  }

  // ---------- Light / Mood / Frame ----------
  if (hasOwn(ph, 'light') && str(ph.light)) P.lighting = str(ph.light);
  if (hasOwn(ph, 'mood') && str(ph.mood)) P.expression = str(ph.mood);
  if (hasOwn(ph, 'frame') && str(ph.frame)) P.camera = str(ph.frame);

  return { parts: P, notes, outfitSource, ddOutfit: ddAuto ? '' : ddRaw };
}

/** v83: Wunsch-Outfit aus der deutschen Wunsch-Szene (z. B. „im roten Sommerkleid“ → 'red summer dress'). */
export function wishOutfitFromScene(wish = '') {
  const m = String(wish).match(/\b(?:im|in(?: einem)?|in der|im)\s+(?:(rot\w*|blau\w*|schwarz\w*|wei\w*|grün\w*|rosa|pink|gelb\w*|braun\w*)\s+)?(sommerkleid|kleid|abendkleid|dirndl|rock|bluse|shirt|t-shirt|tanktop|pullover|mantel|jacke|jeans|short\w*|badeanzug|hosenanzug|jumpsuit)\b/i);
  if (!m) {
    const en = String(wish).match(/\b(?:(red|blue|black|white|green|pink|yellow|brown)\s+)?(summer dress|evening dress|dress|skirt|blouse|shirt|t-shirt|tank top|sweater|coat|jacket|jeans|shorts|swimsuit|jumpsuit)\b/i);
    if (!en) return '';
    return [en[1] ? en[1].toLowerCase() : '', en[2].toLowerCase()].filter(Boolean).join(' ');
  }
  const col = { rot: 'red', rote: 'red', roten: 'red', blau: 'blue', blaue: 'blue', blauen: 'blue', schwarz: 'black', schwarze: 'black', wei: 'white', weiße: 'white', weißen: 'white', grün: 'green', grüne: 'green', rosa: 'pink', pink: 'pink', gelb: 'yellow', gelbe: 'yellow', braun: 'brown', braune: 'brown' };
  const g = { sommerkleid: 'summer dress', kleid: 'dress', abendkleid: 'evening dress', dirndl: 'dirndl', rock: 'skirt', bluse: 'blouse', shirt: 'shirt', 't-shirt': 't-shirt', tanktop: 'tank top', pullover: 'sweater', mantel: 'coat', jacke: 'jacket', jeans: 'jeans', shorts: 'shorts', badeanzug: 'swimsuit', hosenanzug: 'suit', jumpsuit: 'jumpsuit' };
  const c = m[1] ? (col[low(m[1]).replace(/[^a-zäöüß]/g, '')] || low(m[1])) : '';
  return [c, g[low(m[2])] || low(m[2])].filter(Boolean).join(' ');
}


/** Entfernt FSK18-Segmente aus Identität und Parts (nicht-18+-Pfad) – v75: verschärft via SFW-Filter */
/** v83: Outfit-Segment enthält ein echtes jugendfreies Kleidungsstück? */
const SFW_GARMENT_RX = /\b(dress|skirt|jeans|trousers|pants|shorts|shirt|t-?shirt|blouse|sweater|pullover|hoodie|cardigan|jacket|coat|blazer|suit|uniform|jumpsuit|pyjamas|pajama|bathrobe|robe|swimsuit|one-piece swimsuit|badeanzug)\b/i;
const SFW_OUTFIT_BAD_RX = /\b(bikini|latex|lingerie|string|thong|g-string|see-through|sheer|nude|naked|topless|micro)\b/i;
/** v83: Ist der Text ein echtes jugendfreies Kleidungsstück (ohne FSK18-Anteile)? */
export function isSfwGarment(text) {
  const t = String(text || '');
  if (!SFW_GARMENT_RX.test(t)) return false;
  if (SFW_OUTFIT_BAD_RX.test(t)) return false;
  return true;
}

function stripFsk18(identity, parts, notes, opts = {}) {
  const hit = [];
  const identityOut = splitSegs(identity).filter((s) => {
    const bad = FSK18_ID_RX.test(s) || isFsk18Segment(s, opts);
    if (bad) hit.push(s);
    return !bad;
  }).join(', ');
  const partsOut = { ...parts };
  for (const k of Object.keys(partsOut)) {
    if (typeof partsOut[k] !== 'string' || !partsOut[k]) continue;
    const kept = [];
    for (const s of splitSegs(partsOut[k])) {
      if (FSK18_ID_RX.test(s) || isFsk18Segment(s, opts)) hit.push(s); else kept.push(s);
    }
    partsOut[k] = kept.join(', ');
  }
  if (hit.length) {
    notes.push(`FSK18-Details aus dem Profil für dieses Bild entfernt (Modus jugendfrei): ${dedupe(hit).slice(0, 4).join(' / ')}`);
  }
  return { identity: identityOut, parts: partsOut };
}

/** v75: SFW-Filter auf ALLE Parts anwenden (Pose, Szene, Outfit, Action, Kamera, etc.). opts.allowBed === true, wenn die Story im Schlafzimmer spielt. */
function applySfwToParts(parts, scene = '', notes = [], opts = {}) {
  const out = { ...parts };
  const dropped = [];
  for (const k of Object.keys(out)) {
    if (typeof out[k] !== 'string' || !out[k]) continue;
    if (k === 'story') continue;
    const filtered = sfwText(out[k], '', opts);
    if (filtered !== tidy(out[k])) dropped.push(k);
    out[k] = filtered;
  }
  // Pose: FSK18-Pose wurde entfernt → neutralen Ersatz passend zur Szene
  if (!out.pose || !String(out.pose).trim()) {
    const fallback = neutralPose(scene);
    if (parts.pose && String(parts.pose).trim()) {
      notes.push(`Pose auf SFW-Variante ersetzt („${fallback}“) – Modus jugendfrei`);
    }
    out.pose = fallback;
  }
  // Outfit: bei FSK18-Kleidung → casual summer outfit
  if (!out.outfit || !String(out.outfit).trim()) out.outfit = 'casual summer outfit';
  if (dropped.length) {
    notes.push(`FSK18-Inhalte für dieses Bild entfernt (Modus jugendfrei): ${dropped.join(', ')}`);
  }
  return out;
}

/**
 * Hauptfunktion. Rückgabe (abwärtskompatibel zu buildImagePlan):
 *  { prompt, negative, parts, story, seed, model, checkSpec, identity, abgleich, garment, quality }
 */
export function buildPromptPlan({ profile = {}, resolved = {}, photoOverride = {}, story = null, msgs = [], adult = false, model = 'chroma', quality = 'single', body = {} } = {}) {
  const style = ['comic', 'manhwa', 'comicpage'].includes(String(body && body.style)) ? String(body.style) : 'real';
  const partner = (body && body.partner) === true;
  const portrait = (body && body.portrait) === true;
  const partnerNames = Array.isArray(body && body.partnerNames) ? body.partnerNames.map(String).slice(0, 3) : [];
  const notes = [];
  const R = resolved || {};
  const ST = story || {};

  // 1. Identität
  const idBuilt = buildIdentity({ profile, resolved: R, adult });
  for (const n of idBuilt.notes) notes.push(n);
  let identity = idBuilt.identity;
  const age = idBuilt.age;
  // v87 Nebenbefund A: kleine Oberweite – nur bei adult; jugendfrei nur „slim petite figure“
  let bustNeg = [];
  if (adult) {
    const amp = amplifySmallBust(identity);
    if (amp.identity !== identity) { identity = amp.identity; bustNeg = amp.extra; }
  } else if (/\b(AA|A)-cup\b|\bsmall\b[^,]*\bbust\b/i.test(identity) && !/\bpetite figure\b/i.test(identity)) {
    identity = identity + ', slim petite figure';
  }

  // 2. 18+-Block
  if (adult && !isAdultProfile(profile) && age < 18) {
    return { error: { code: 'not_adult', message: AGE_MSG_DE } };
  }

  // 3. FSK18-Guard (Request-adult AND Profil-18+)
  const guard = guardAdult({ profile, adult, ph: { ...(photoOverride || {}), ...(R.photo || {}) }, notes });
  const effectiveAdult = guard.effectiveAdult;
  const ph = guard.ph;

  // 4. Story → parts
  const reply = String((msgs || []).filter((m) => m && m.role === 'assistant' && m.content).slice(-1)[0]?.content || '');
  const partsIn = { ...((body && body.parts) || {}) };
  if (!partsIn.scene && reply) partsIn.scene = reply.slice(0, 260);
  if (!partsIn.outfit && str(ST.outfit)) partsIn.outfit = str(ST.outfit);
  if (!partsIn.outfit && reply) {
    for (const [rx, val] of GARMENT_HINTS) {
      if (rx.test(reply)) { partsIn.outfit = val; break; }
    }
  }
  // Scene-Preset-Defaults nur wenn outfit auto UND Story keine Kleidung nennt
  const storyNamesClothes = /\b(wearing|trägt|wear|dress|kleid|bikini|bluse|shirt|top|nackt|nude|latex|lingerie|pyjama|towel|handtuch)\b/i.test(reply + ' ' + str(ST.outfit));
  if (!partsIn.outfit && !storyNamesClothes && R.photo?.scene && SCENE_DEFAULTS[R.photo.scene]) {
    const sd = SCENE_DEFAULTS[R.photo.scene];
    if (sd.outfit) partsIn.outfit = sd.outfit;
    if (sd.pose && !partsIn.pose) partsIn.pose = sd.pose;
  }

  // 5. Reconcile (Dropdown > Story > State > Default)
  // v83: Wunsch-Szene (Bild-Wunsch des Nutzers) – schlägt Story und gespeicherte Dropdown-Szene
  const wishScene = str((body && (body.wish || body.sceneReq)) || '');
  const rec = reconcile({ profile, resolved: R, photoOverride: ph, parts: partsIn, story: ST, wish: wishScene, oneTimeScene: str((photoOverride || {}).scene) });
  for (const n of rec.notes) notes.push(n);
  let parts = rec.parts;

  // 6. Default-Outfit aus Profil nur wenn Dropdown und Story leer
  if (!parts.outfit) {
    const defs = collectDefaultOutfitSegs(profile, R);
    if (defs.length) { parts.outfit = defs.join(', '); rec.outfitSource = 'profile'; }
  }
  if (!parts.outfit) { parts.outfit = 'simple neutral outfit'; rec.outfitSource = 'generic'; }

  // v75: Story-Text aus ALLEN Chat-Nachrichten + Story-Location + Parts
  // v83: Reihenfolge älteste → neueste: alte Nachrichten, Story-Ort, Composer-Parts, Wunsch-Szene (neueste gewinnt).
  const storySegs = [
    ...((msgs || []).map((m) => String((m && m.content) || ''))),
    str(ST.location),
    str(parts.scene),
    str(parts.background),
    wishScene,
  ].filter(Boolean);
  const allStoryText = storySegs.join(' ');
  // v83: Wunsch-Szene + photoOverride haben Vorrang (Aufgabe 2).
  const target = resolveSceneTarget({
    wish: wishScene,
    override: str((photoOverride || {}).scene),
    savedScene: str((R.photo || {}).scene),
    parts,
    story: ST,
    msgs,
  });
  let ddSceneSet = hasOwn(ph, 'scene') && str(ph.scene) !== '' && !target.locked;
  const detected = detectScene(storySegs);
  const storyPose = detectStoryPose(storySegs);
  const storyLooksBedroom = !!detected && /bedroom/i.test(detected.scene);

  // v83 (Aufgabe 2/3): Nennt die Wunsch-Szene eine Haltung („sie steht …“, „sie sitzt im Sand“), schlägt sie die
  // gespeicherte Dropdown-Pose (eine einmalige Pose-Auswahl photoOverride.pose gewinnt weiterhin).
  // Im Modus hemmungslos bleiben ortsunabhängige Details der Dropdown-Pose (z. B. „legs spread“) erhalten.
  const wishPose = wishScene ? detectStoryPose(wishScene) : null;
  // v87: Porträt-Ausschnitt – keine Intensitäts-/Ganzkörper-Pose zurückschreiben
  if (!portrait && wishPose && !str((photoOverride || {}).pose) && low(str(parts.pose)) !== low(wishPose)) {
    const extras = effectiveAdult ? poseExtras(str(parts.pose)) : [];
    parts.pose = [wishPose, ...extras].join(', ');
    notes.push(`Pose aus dem Bild-Wunsch übernommen („${wishPose}“)`);
  }
  // v83: „nude“ + Kleidungsstück im selben Outfit → Kleidungsstück gilt (beide Modi)
  {
    const nr = reconcileOutfitNudity(str(parts.outfit));
    if (nr.removed.length) {
      parts.outfit = nr.text;
      notes.push(`Kleidung: Widerspruch „${nr.removed.join(' / ')}“ vs. Kleidungsstück – Kleidungsstück gilt`);
    }
  }
  // v75 (c): Story-Pose ersetzt gespeicherte/Preset-Pose auch bei 18+, solange das Dropdown keine Pose setzt
  if (!portrait && effectiveAdult && storyPose && !((hasOwn(ph, 'pose') && str(ph.pose))) && low(str(parts.pose)) !== low(storyPose)) {
    parts.pose = storyPose;
    notes.push(`Pose aus der Story übernommen („${storyPose}“)`);
  }
  // v83 (Aufgabe 3): Pose/Kleidung/Umgebung gegen die aufgelöste Szene abgleichen – in BEIDEN Modi.
  if (!portrait) {
    const poseFit = fitPoseToScene({
      pose: str(parts.pose),
      action: str(parts.action),
      location: target.location || (detected && detected.location) || '',
      sceneText: [target.scene, str(parts.background), str(parts.scene)].filter(Boolean).join(', '),
      adult: effectiveAdult,
    });
    if (poseFit.pose !== str(parts.pose)) parts.pose = poseFit.pose;
    if (poseFit.action !== str(parts.action)) parts.action = poseFit.action;
    for (const n of poseFit.notes) notes.push(n);
  }
  // v87: Porträt erzwingt Kopf-/Schulter-Pose; gespeicherte Dropdown-Pose wird verworfen
  if (portrait) {
    if (parts.pose && low(str(parts.pose)) !== low('head and shoulders, facing the camera')) notes.push(`Pose „${parts.pose}“ für Porträt-Ausschnitt weggelassen`);
    parts.pose = 'head and shoulders, facing the camera';
  }
  // 7. Nicht-18+: FSK18-Details aus Identität/Parts entfernen
  if (!effectiveAdult) {
    // v75 (a)/(c): Story-Pose (falls vorhanden) ersetzt gespeicherte FSK18-/Preset-Pose; sonst Story-Ort schlägt Bett-Pose
    const poseText = String(parts.pose || '');
    const poseSpeaksBed = /\bbed\b|schlafzimmer|bedroom|bett/i.test(poseText);
    if (storyPose) {
      if (low(poseText) !== low(storyPose)) {
        parts.pose = storyPose;
        notes.push(`Pose aus der Story übernommen („${storyPose}“)`);
      }
    } else if (detected && poseSpeaksBed && !/\bbed\b|schlafzimmer|bedroom|bett/i.test(detected.scene)) {
      parts.pose = detected.pose || 'standing naturally, hands relaxed at her sides';
      notes.push(`Pose an Story-Ort „${detected.location}“ angepasst (nicht Bett)`);
    } else if (/\bleds?\s+spread|spread\s+legs\b/i.test(poseText)) {
      parts.pose = (detected && detected.pose) || neutralPose(str(parts.scene) + ' ' + str(parts.background));
      notes.push('FSK18-Pose auf neutralen Stand/Sitz reduziert (Modus jugendfrei)');
    } else if (detected && poseText && low(poseText) !== low(detected.pose || '') && /\b(bed|bett|schlafzimmer)\b/i.test(poseText) && !/\b(bed|bett|schlafzimmer|bedroom)\b/i.test(String(detected.location || detected.scene || ''))) {
      parts.pose = detected.pose || 'standing naturally, hands relaxed at her sides';
      notes.push(`Pose an Story-Ort „${detected.location}“ angepasst (nicht Bett)`);
    }
    const stripped = stripFsk18(identity, parts, notes, { allowBed: storyLooksBedroom });
    identity = stripped.identity; parts = stripped.parts;
    parts = applySfwToParts(parts, str(parts.scene) + ' ' + str(parts.background), notes, { allowBed: storyLooksBedroom });
    // v83 (Aufgabe 4): nach dem SFW-Filter muss ein ECHTES jugendfreies Kleidungsstück übrig bleiben.
    const hadFsk = /\b(bikini|latex|lingerie|nude|naked|topless|micro|string|thong|sideboob|underboob|bust)\b/i.test(String(rec.ddOutfit || '') + ' ' + String((R.photo || {}).outfit || '') + ' ' + String((photoOverride || {}).outfit || ''));
    const keptSegs = splitSegs(parts.outfit).filter((s) => SFW_GARMENT_RX.test(s) && !SFW_OUTFIT_BAD_RX.test(s));
    if (!keptSegs.length) {
      let repl = '', src = '';
      const wishOutfit = wishOutfitFromScene(wishScene);
      if (wishOutfit) { repl = wishOutfit; src = 'Wunsch-Szene'; }
      else if (str(ST.outfit) && isSfwGarment(str(ST.outfit))) { repl = str(ST.outfit); src = 'Story'; }
      else if (str((R.defaults || {}).outfit) && isSfwGarment(str(R.defaults.outfit))) { repl = str(R.defaults.outfit); src = 'Profil-Default'; }
      else {
        const scn = low(String(target.location || '') + ' ' + String(target.scene || ''));
        if (/beach|strand|sand/.test(scn)) repl = 'light summer dress';
        else if (/office|büro|desk/.test(scn)) repl = 'smart blouse and skirt';
        else repl = 'casual summer outfit';
        src = 'szenenpassender Standard';
      }
      parts.outfit = repl;
      const why = hadFsk ? 'Auswahl im Modus jugendfrei komplett gefiltert' : 'nach dem FSK18-Filter kein echtes Kleidungsstück';
      notes.push(`Kleidung: ${why} – verwendet: „${repl}“ (${src})`);
    } else {
      // echtes Kleidungsstück vorhanden → nur FSK18-Reste entfernen, beschreibende Segmente bleiben
      const clean = splitSegs(parts.outfit).filter((s) => !SFW_OUTFIT_BAD_RX.test(s));
      if (clean.length !== splitSegs(parts.outfit).length) parts.outfit = clean.join(', ');
    }
  }

  // 8. Garment-Spec + aktive Bits (nur wenn aktiv)
  const garment = specForRendered(parts.outfit, parts.outfit_state);
  const bits = activeGarmentBits(garment);
  const nudeNow = !!garment && garment.kind === 'nude';
  // v83: Tags, die sinngleich schon im Outfit stehen, nicht doppelt anhängen
  const garmentTags = garment ? dedupeGarmentTags(bits.tags.slice(), parts.outfit) : [];

  // 9. Prompt bauen
  const framing = framingFor(parts.camera || '');
  const outfitText = renderOutfitPhrase(parts.outfit, parts.outfit_state);
  // v87: Bikini-Oberteil nur, wenn das finale Outfit wirklich ein Bikini ist
  const bikiniTop = !!garment && /bikini/i.test(String(garment.kind || '')) && !nudeNow && !/\b(bikini top|triangles on)\b/i.test(String(outfitText) + ' ' + garmentTags.join(' '));
  if (bikiniTop) garmentTags.push('bikini top worn, both triangles on');
  // v75 (c): Story-Szene aus ALLEN Story-Texten; Dropdown-Szene gewinnt immer
  // v83: aufgelöste Szene hat Vorrang; ein roher Chat-Satz darf NICHT als Szene im Prompt landen.
  let sceneText = target.scene || [str(parts.scene), str(parts.background)].filter(Boolean).join(', ');
  if (target.locked && target.scene) {
    sceneText = target.scene;
  } else if (ddSceneSet) {
    // Dropdown hat die Szene gesetzt – Story-Szene wird NICHT injiziert
    sceneText = [str(parts.background), str(parts.scene)].filter(Boolean).join(', ');
  } else if (detected && !target.scene) {
    const storySceneText = effectiveAdult ? detected.scene : sfwText(detected.scene, '', { allowBed: storyLooksBedroom });
    if (storySceneText && !low(sceneText).includes(low(storySceneText))) {
      sceneText = storySceneText;
    }
  }
  // v75: kein "in the described scene"-Platzhalter
  if (/^in the described scene$/i.test(sceneText.trim())) sceneText = '';
  // v87 Nebenbefund B: widersprüchliche Altersangaben aus Szene/Pose/Outfit … entfernen (Identitätszeile ausgenommen)
  let ageRemoved = false;
  const fixAge = (t) => { const c = stripConflictingAge(t, age); if (c !== tidy(String(t || ''))) ageRemoved = true; return c; };
  for (const k of ['scene', 'action', 'pose', 'expression', 'outfit', 'background', 'lighting']) if (typeof parts[k] === 'string' && parts[k]) parts[k] = fixAge(parts[k]);
  sceneText = fixAge(sceneText);
  const outfitTextFinal = fixAge(outfitText);
  if (ageRemoved) notes.push('Altersangabe aus der Szene entfernt (Profilalter gilt)');

  const male = subjectOf(profile).sex === 'man';
  const comicStyle = style === 'comic' || style === 'manhwa';
  const styleText = comicStyle ? `${STYLE_TEXT[style]}, illustration, not a photo` : '';
  const peopleLine = partner
    ? `two adults in the scene: ${male ? 'the man' : 'the woman'} and ${partnerNames.length ? partnerNames[0] + ', an adult ' + (male ? 'woman' : 'man') : (male ? 'his adult female partner' : 'her adult male partner')}`
    : '';
  const navDefault = !NAVEL_RX.test(identity + ' ' + String(parts.outfit || ''));
  // chroma/z-image-turbo ignorieren negative_prompt → wichtigste Negatives positiv formulieren
  const noNegModel = model === 'chroma' || model === 'z-image-turbo';
  const aloneLine = !partner && noNegModel ? (male ? 'he is alone in the picture' : 'she is alone in the picture') : '';
  // jugendfrei: kein „bare navel“ (würde Bauchfreiheit nahelegen)
  const mirror = noNegModel ? positiveMirror({ navel: navDefault && effectiveAdult }) : '';
  // v87: Garment-Tags, die wörtlich schon im Outfit-Text stehen (z. B. „nude, no clothes“), nicht doppelt
  { const have = new Set(splitSegs(outfitTextFinal).map((x) => low(x))); for (let i = garmentTags.length - 1; i >= 0; i--) { const segs = splitSegs(garmentTags[i]); if (segs.length && segs.every((x) => have.has(low(x)))) garmentTags.splice(i, 1); } }
  const fmMax = (FORMAT[model] || FORMAT.default).maxNegative || 800;
  const formatOut = formatPrompt(model, {
    framing,
    identity,
    styleText,
    people: peopleLine,
    outfitText: outfitTextFinal,
    garmentTags,
    pose: [str(parts.pose), aloneLine, mirror].filter(Boolean).join(', '),
    action: str(parts.action),
    scene: sceneText,
    light: str(parts.lighting),
    mood: str(parts.expression),
    quality: comicStyle ? 'clean ink lines, high detail, no text, no letters, no speech bubbles' : 'high detail, sharp focus, no text, no letters',
  }, {
    // Reihenfolge = Priorität (Venice kürzt bei 800): Defaults → Solo → Garment → Brust → Rest
    negative: [
      NEG_DEFAULTS,
      navDefault ? NEG_NAVEL : '',
      !partner ? SOLO_CLAUSE : '',
      !effectiveAdult ? SFW_NEGATIVES : '',
      bits.negatives.join(', '),
      bustNeg.join(', '),
      NEG_BASE,
      NEG_ANATOMY,
      !partner ? (male ? 'extra people, second person, woman, crowd, duplicate man' : NEG_SOLO) : '',
      comicStyle ? NEG_PHOTO : '',
      'cropped head, cut off face, out of frame',
    ].filter(Boolean).join(', '),
    maxNegative: 4000,
    profile,
  });

  // v75: SFW-Negatives für nicht-adulte Profile (v83: NUR wenn effectiveAdult === false – hemmungslos bleibt ungefiltert)
  // v87: SFW-Negatives stehen jetzt früh in der Liste (oben), damit die 800-Zeichen-Kürzung sie nicht abschneidet
  let finalNegative = formatOut.negative;
  // v87: Negatives, die das positive Outfit/den Stil verbieten, entfernen (nackt ↔ nude, Comic ↔ cartoon)
  // Jugendschutz: in jugendfrei nur der Stil-Abgleich, die Nacktheits-Negatives bleiben immer stehen
  finalNegative = dropNegativeConflicts(dedupeText(finalNegative), effectiveAdult ? [outfitTextFinal, garmentTags.join(', '), styleText].join(', ') : styleText);
  finalNegative = truncateSegs(finalNegative, fmMax);
  const promptFixed = formatOut.prompt;

  // v83: Story-Ort auf die aufgelöste Szene aktualisieren (wird in KV gespeichert).
  const storyOut = story ? { ...story } : { ...story };
  if (target.location) {
    if (story && target.prevLocation && low(target.prevLocation) !== low(target.location) && !str(target.pose)) {
      storyOut.action = '';
      storyOut.pose = '';
    }
    storyOut.location = target.location;
  }

  // 10. CheckSpec
  const checkSpec = makeCheckSpec({ framing, garment, sceneText });

  return {
    prompt: promptFixed,
    negative: finalNegative,
    parts: { ...parts, story: undefined },
    story: (target.location || target.scene) ? storyOut : (story || null),
    seed: body && Number.isInteger(body.seed) ? body.seed : 1,
    model,
    quality,
    garment: garment ? { kind: garment.kind, label: garment.label } : null,
    checkSpec,
    identity,
    abgleich: dedupe(notes),
    adult: effectiveAdult,
  };
}

// Re-exports für Tests
export { buildIdentity, resolveAge, collectDefaultOutfitSegs, classifyOutfit, specFor, activeGarmentBits, FORMAT, framingFor, FRAMING };
export { makeCheckSpec };
export { dedupeText, dropSegs, CLOTHING_RX };
export { isFsk18Segment, neutralPose, SFW_NEGATIVES, sfwText } from './sfw.js';
export { storyScene, detectScene, detectStoryPose } from './scene-map.js';
export { resolveSceneTarget, fitPoseToScene } from './consistency.js';
export { reconcileIdentitySegs } from './reconcile-identity.js';
export { isCleanIdentityFragment, isGermanFragment } from './decheck.js';
