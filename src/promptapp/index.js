import { subjectOf } from './identity.js';
// v74 Prompt-App: EIN reiner Prompt-Plan. `buildPromptPlan` liefert prompt/negative/parts/story/seed/checkSpec/identity.
// Kein I/O, keine Seiteneffekte. Routing, Seeds (Policy), Storage bleiben in imgsvc-plan.js / imgsvc-image.ts.
import { buildIdentity, collectDefaultOutfitSegs, resolveAge, FSK18_ID_RX, CLOTHING_RX } from './identity.js';
import { classifyOutfit, specFor, activeGarmentBits, renderOutfitPhrase } from './garments.js';
import { FORMAT, framingFor, formatPrompt, FRAMING } from './format.js';
import { makeCheckSpec } from './check-spec.js';
import { dedupe, dedupeText, dropSegs, low, splitSegs, tidy } from './util.js';
import { isExplicitAdult, isFsk18Segment, neutralPose, SFW_NEGATIVES, sfwText } from './sfw.js';
import { storyScene, detectStoryPose, detectScene } from './scene-map.js';

const AGE_MSG_DE = 'Profil muss eindeutig erwachsen sein (21+)';

/** Basis-Negatives: Anatomie + Solo (Basislinie der Pipeline seit v68) */
const NEG_BASE = 'bad anatomy, extra limbs, deformed hands, watermark, text, letters, logo, signature, lowres, blur, jpeg artifacts';
const NEG_ANATOMY = 'extra hands, extra arms, extra legs, extra fingers, missing fingers, fused fingers, three hands';
const NEG_SOLO = 'extra people, second person, man, crowd';

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
 * 21+/FSK18-Guard: der Request muss `adult === true` senden UND das Profil darf nicht ausdrücklich
 * nicht-18+ sein (`adult|fsk|fsk18 === false`). Profile ohne Flag gelten als offen – der Nutzer
 * entscheidet über die Anfrage/Presets, das Bare-Profil wird nicht herabgestuft.
 * `ph` wird IN-PLACE bereinigt (Aufrufer erwartet Änderungen am selben Objekt).
 */
export function guardAdult({ profile = {}, adult = false, ph = {}, notes = [] } = {}) {
  const explicitNotAdult = profile.adult === false || profile.fsk === false || profile.fsk18 === false;
  const effectiveAdult = !!adult && !explicitNotAdult;
  if (!effectiveAdult) {
    for (const k of ['intensity', 'koerper']) {
      if (hasOwn(ph, k) && String(ph[k] || '').trim()) {
        notes.push(`FSK18-Preset „${k}“ ignoriert (Profil nicht 18+)`);
        delete ph[k];
      }
    }
    if (hasOwn(ph, 'outfit') && /\b(latex|lingerie|nude|nackt|micro\s*-?\s*bikini|topless|bikini|bodysuit|sideboob|underboob|cup bust)\b/i.test(String(ph.outfit))) {
      notes.push('Kleidungs-Preset auf SFW reduziert (Profil nicht 18+)');
      notes.push('FSK18-Details aus der Auswahl für dieses Bild entfernt (Profil nicht 18+)');
      ph.outfit = 'casual summer outfit';
    }
  }
  return { effectiveAdult, ph, notes };
}

/** Fachwerk: Dropdown → Story → Story-State → Profil-Default. Liefert parts + deutsche Notes. */
export function reconcile({ profile = {}, resolved = {}, photoOverride = {}, parts = {}, story = null } = {}) {
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
  const ddScene = hasOwn(ph, 'scene') ? str(ph.scene) : '';
  if (ddScene) {
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

/** Entfernt FSK18-Segmente aus Identität und Parts (nicht-18+-Pfad) – v75: verschärft via SFW-Filter */
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
    notes.push(`FSK18-Details aus dem Profil für dieses Bild entfernt (Profil nicht 18+): ${dedupe(hit).slice(0, 4).join(' / ')}`);
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
      notes.push(`Pose auf SFW-Variante ersetzt („${fallback}“) – Profil nicht 18+`);
    }
    out.pose = fallback;
  }
  // Outfit: bei FSK18-Kleidung → casual summer outfit
  if (!out.outfit || !String(out.outfit).trim()) out.outfit = 'casual summer outfit';
  if (dropped.length) {
    notes.push(`FSK18-Inhalte für dieses Bild entfernt (Profil nicht 18+): ${dropped.join(', ')}`);
  }
  return out;
}

/**
 * Hauptfunktion. Rückgabe (abwärtskompatibel zu buildImagePlan):
 *  { prompt, negative, parts, story, seed, model, checkSpec, identity, abgleich, garment, quality }
 */
export function buildPromptPlan({ profile = {}, resolved = {}, photoOverride = {}, story = null, msgs = [], adult = false, model = 'chroma', quality = 'single', body = {} } = {}) {
  const notes = [];
  const R = resolved || {};
  const ST = story || {};

  // 1. Identität
  const idBuilt = buildIdentity({ profile, resolved: R, adult });
  for (const n of idBuilt.notes) notes.push(n);
  let identity = idBuilt.identity;
  const age = idBuilt.age;

  // 2. 21+-Block
  if (adult && !isAdultProfile(profile) && age < 21) {
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
  const rec = reconcile({ profile, resolved: R, photoOverride: ph, parts: partsIn, story: ST });
  for (const n of rec.notes) notes.push(n);
  let parts = rec.parts;

  // 6. Default-Outfit aus Profil nur wenn Dropdown und Story leer
  if (!parts.outfit) {
    const defs = collectDefaultOutfitSegs(profile, R);
    if (defs.length) { parts.outfit = defs.join(', '); rec.outfitSource = 'profile'; }
  }
  if (!parts.outfit) { parts.outfit = 'simple neutral outfit'; rec.outfitSource = 'generic'; }

  // v75: Story-Text aus ALLEN Chat-Nachrichten + Story-Location + Parts
  const storySegs = [
    str(parts.scene),
    str(parts.background),
    str(ST.location),
    ...((msgs || []).map((m) => String((m && m.content) || ''))),
  ].filter(Boolean);
  const allStoryText = storySegs.join(' ');
  const ddSceneSet = hasOwn(ph, 'scene') && str(ph.scene) !== '';
  const detected = detectScene(storySegs);
  const storyPose = detectStoryPose(storySegs);
  const storyLooksBedroom = !!detected && /bedroom/i.test(detected.scene);

  // v75 (c): Story-Pose ersetzt gespeicherte/Preset-Pose auch bei 18+, solange das Dropdown keine Pose setzt
  if (effectiveAdult && storyPose && !(hasOwn(ph, 'pose') && str(ph.pose)) && low(str(parts.pose)) !== low(storyPose)) {
    parts.pose = storyPose;
    notes.push(`Pose aus der Story übernommen („${storyPose}“)`);
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
      notes.push('FSK18-Pose auf neutralen Stand/Sitz reduziert (Profil nicht 18+)');
    }
    const stripped = stripFsk18(identity, parts, notes, { allowBed: storyLooksBedroom });
    identity = stripped.identity; parts = stripped.parts;
    parts = applySfwToParts(parts, str(parts.scene) + ' ' + str(parts.background), notes, { allowBed: storyLooksBedroom });
    if (!parts.outfit || !String(parts.outfit).trim()) parts.outfit = 'casual summer outfit';
  }

  // 8. Garment-Spec + aktive Bits (nur wenn aktiv)
  const garment = specFor(parts.outfit);
  const bits = activeGarmentBits(garment);
  const garmentTags = garment ? bits.tags.slice() : [];

  // 9. Prompt bauen
  const framing = framingFor(parts.camera || '');
  const outfitText = renderOutfitPhrase(parts.outfit, parts.outfit_state);
  // v75 (c): Story-Szene aus ALLEN Story-Texten; Dropdown-Szene gewinnt immer
  let sceneText = [str(parts.scene), str(parts.background)].filter(Boolean).join(', ');
  if (ddSceneSet) {
    // Dropdown hat die Szene gesetzt – Story-Szene wird NICHT injiziert
    sceneText = [str(parts.background), str(parts.scene)].filter(Boolean).join(', ');
  } else if (detected) {
    const storySceneText = effectiveAdult ? detected.scene : sfwText(detected.scene, '', { allowBed: storyLooksBedroom });
    if (storySceneText && !low(sceneText).includes(low(storySceneText))) {
      sceneText = storySceneText;
    }
  }
  // v75: kein "in the described scene"-Platzhalter
  if (/^in the described scene$/i.test(sceneText.trim())) sceneText = '';
  const formatOut = formatPrompt(model, {
    framing,
    identity,
    outfitText,
    garmentTags,
    pose: str(parts.pose),
    action: str(parts.action),
    scene: sceneText,
    light: str(parts.lighting),
    mood: str(parts.expression),
    quality: 'high detail, sharp focus, no text, no letters',
  }, {
    negative: [
      NEG_BASE,
      NEG_ANATOMY,
      bits.negatives.join(', '),
      subjectOf(profile).noun === 'man' ? 'extra people, second person, woman, crowd, duplicate man' : NEG_SOLO,
      'cropped head, cut off face, out of frame',
    ].filter(Boolean).join(', '),
    profile,
  });

  // v75: SFW-Negatives für nicht-adulte Profile
  const finalNegative = !effectiveAdult
    ? [formatOut.negative, SFW_NEGATIVES].filter(Boolean).join(', ')
    : formatOut.negative;

  // 10. CheckSpec
  const checkSpec = makeCheckSpec({ framing, garment, sceneText });

  return {
    prompt: formatOut.prompt,
    negative: finalNegative,
    parts: { ...parts, story: undefined },
    story: story || null,
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
export { isCleanIdentityFragment, isGermanFragment } from './decheck.js';
