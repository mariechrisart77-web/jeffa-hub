// Per-character photo settings (port of Nachtfalter "Fotos von <Figur>"). Stored in profile.photo; never touches the user's own preset texts.
// Precedence: a chosen value (not "Frei"/"Passend zur Szene") overrides the scene writer for that aspect; "Frei" leaves it to the scene.
import { isAdult } from './shared/fsk.js';
import { sceneMenu, scenePrompt, TIMES_OF_DAY, timeOfDayKey } from './shared/scenes.js';

/** v71: Mikro-Tags für lustify-v8/SDXL – werden bei Micro-Bikini-Outfits angehängt (nur adult) */
const MICRO_TAGS = 'tiny string micro bikini, minuscule triangles barely the size of a nipple, sideboob, underboob, thong string bottom';
const SHARP_TAGS = 'cameltoe, labia outline visible through the tight fabric, glossy latex sheen, crisp fabric detail';
const MICRO_RX = /\b(micro\s*bikini|microscopic|string\s+bikini|tiny\s+bikini|minuscule\s+triangles|underboob)\b/i;

// option: [id, label, prompt, adultOnly?, negative]; groups: [groupLabel, options[]]
// v78: Streichliste (Christian) – sport/jogging/sommer/shorts/strick/jeanspulli/office/cocktail/abendkleid/hemd entfernt; christianlook -> LEGACY_PROMPTS.
const OUTFIT = [
  ['', [['', 'Passend zur Szene (Standard)', '']]],
  ['👟 Sportlich', [
    ['yogaset', 'Sport-BH & Yoga-Shorts (18+)', 'sports bra and short tight yoga shorts, toned athletic look', 1],
  ]],
  ['☀️ Sommer & Strand', [
    ['badeanzug', 'Eleganter Badeanzug', 'elegant high-cut one-piece swimsuit'],
    // v78: EIN Eintrag für Christians Look / Referenz-Look / Rauchgrauer Latex-Micro (Wicked-Weasel-Text)
    ['bikini', 'Grauer Latex-Micro-Bikini (Christians Look)', 'Wicked Weasel style micro string bikini in ultra-thin glossy smoke-grey tinted translucent latex (0.05 mm), sheer like smoked glass, not crystal clear, clinging tightly like a second skin with no gaps, two small triangle cups barely covering the areolas with thin dark piping edges and thin dark string halter ties, nipples visible as darker shapes through the sheer latex, strong sideboob and underboob, tie-side string bottom with knotted side ties, tiny V-front stretched taut, labia outline and cameltoe visible through the thin sheer latex, wet-look glossy reflections, oiled glossy skin', 1, 'metallic, silver, chrome, mirror finish, foil, opaque, stiff fabric, loose fabric, padded cups, large bikini, wide triangles, full coverage, one-piece, swimsuit, bodysuit, long sleeves, cropped head, cut off face, out of frame'],
  ]],
  ['🧶 Zuhause & Gemütlich', [
    ['bademantel', 'Seidener Morgenmantel', 'loosely tied silk robe'],
  ]],
  ['🖤 Dessous (18+)', [
    ['lingerie', 'Elegantes Dessous-Set', 'elegant matching lace lingerie set, delicate embroidery', 1],
    ['body', 'Spitzen-Body', 'black lace bodysuit, fine floral lace pattern', 1],
    ['negligee', 'Transparentes Negligé', 'sheer flowing silk negligee', 1],
    ['strapse', 'Strapsgürtel & Strümpfe', 'garter belt with sheer stockings and matching lingerie', 1],
    ['netz', 'Netz-Bodystocking', 'black fishnet bodystocking', 1],
  ]],
  ['⛓️ Latex & Leder (18+)', [
    ['latex', 'Rauchgrauer Latex-Look', 'tight smoky grey semi-sheer latex outfit tracing every contour, glossy latex, shiny surface with light reflections', 1],
    ['catsuit', 'Latex-Catsuit', 'full-length glossy black latex catsuit, mirror-like shine', 1],
    ['harness', 'Leder-Harness-Top', 'black leather harness top with straps and silver rings', 1],
  ]],
  ['💧 Verspielt (18+)', [
    ['hemdoffen', 'Offenes Herrenhemd', 'oversized men\'s shirt worn open, nothing else visible underneath', 1],
    ['handtuch', 'Nur ein Handtuch', 'wrapped only in a white bath towel, damp hair', 1],
    ['nassshirt', 'Nasses weißes T-Shirt', 'wet clinging white T-shirt', 1],
    ['kimono', 'Locker offener Kimono', 'silk kimono loosely open, sash untied', 1],
  ]],
  ['Ohne', [['nackt', 'Ohne Kleidung', 'nude', 1]]],
];
// v78: christianlook ist jetzt der Katalog-Eintrag 'bikini' (LEGACY_IDS); weitere Legacy-Prompts hier.
export const LEGACY_PROMPTS = {
};
// v78: Lese-Migration alter gespeicherter ids -> Ersatz-ID oder '' (= automatisch/Passend). Profile werden nie umgeschrieben.
export const LEGACY_IDS = {
  hemd: 'hemdoffen', christianlook: 'bikini', sport: '', jogging: '', sommer: '', shorts: '', strick: '', jeanspulli: '', office: '', cocktail: '', abendkleid: '',
  // LIGHT/MOOD: keine echten Dubletten gefunden (tag≠fenster, vertraeumt/geheimnisvoll eigenständig) – unverändert
};
const resolveId = (k, id) => {
  if (!id || String(id).startsWith('my:')) return id || '';
  const had = find(k, id, true);
  if (had) return id;
  const leg = LEGACY_IDS[id];
  if (leg === undefined) return id; // unbekannt: unverändert weiterreichen (find liefert dann '')
  return leg && find(k, leg, true) ? leg : '';
};
const POSE = [
  ['', [['', 'Frei (aus der Szene) – Standard', '']]],
  ['Klassiker (Referenz-Look)', [
    ['profil', 'Seitenprofil, ein Arm hinter dem Kopf, leichtes Hohlkreuz', 'side view to camera, one arm behind head, back slightly arched'],
    ['kniend', 'Kniend auf dem Bett, Hände auf den Oberschenkeln, Blick nach oben', 'kneeling on bed, hands on thighs, looking up into the camera'],
    ['schulter', 'Blick über die Schulter, Hüfte raus, Gegenlicht', 'looking over the shoulder, hip pushed out, latex gleaming in backlight'],
    ['liegend', 'Auf dem Rücken liegend, Arme über dem Kopf, Kamera von oben', 'lying on her back, arms stretched above head, camera from above'],
    ['wand', 'An die Wand gelehnt, ein Knie angewinkelt', 'leaning against a wall, one knee bent, thumb hooked in bikini string'],
    ['pool', 'Steigt nass aus dem Pool, Wassertropfen auf der Haut', 'climbing wet out of the pool, water droplets on skin'],
  ]],
  ['Lässig', [
    ['barhocker', 'Auf dem Barhocker, Beine übereinandergeschlagen', 'sitting on a bar stool, legs crossed, leaning slightly forward'],
    ['fensterbank', 'Auf der Fensterbank, Knie angezogen', 'sitting on a wide windowsill, knees drawn up, looking outside'],
    ['strecken', 'Räkelt sich verschlafen im Morgenlicht', 'stretching lazily in bed in the morning, arms above head'],
    ['laufen', 'Läuft auf die Kamera zu, lächelt', 'walking toward the camera, confident stride, smiling'],
  ]],
  ['Offen (18+)', [
    ['o_haube', 'Motorhaube, Beine gespreizt', 'sitting sideways on the hood of a car, legs spread, leaning back on her hands, confident grin', 1],
    ['o_bett', 'Bettkante, Beine gespreizt, nach hinten gestützt', 'sitting on the edge of the bed, legs spread, leaning back on both hands, relaxed and inviting', 1],
    ['o_liege', 'Liege, Beine geöffnet, Arme über Kopf', 'lying on a sun lounger, legs casually apart, arms stretched above her head, sunbathing, carefree', 1],
  ]],
];
// v70: Körperdetails / Accessoires (nur 18+), werden an den Kleidungs-Block angehängt
const KOERPER = [
  ['', [['', 'Keine', '']]],
  ['Piercings (18+)', [
    ['piercings1', 'Piercings: Brustwarzen-Stege + Christina', 'straight barbell nipple piercings with small silver balls on both nipples, clearly visible as distinct bumps through the thin fabric, plus a christina piercing with silver ball at the top of the pubic mound, visible above the bikini bottom edge', 1],
  ]],
];
// v85 (19): Umgebungen kommen aus der zentralen Liste ./shared/scenes.js (gleiche Liste wie die Bild-App).
const SCENE = [
  ['', [['', 'Frei (aus der Geschichte)', '']]],
  ...sceneMenu(true).map(([g, list]) => [g, list.map((x) => x.adult ? [x.id, x.label, scenePrompt(x), 1] : [x.id, x.label, scenePrompt(x)])]),
];
// v85 (19): Tageszeit – '' = automatisch aus dem Chat erkannt; sonst überschreibt sie die Story-Tageszeit und das Licht.
export const TIME_CATALOG = [
  ['', [['', 'Automatisch (aus dem Chat)', '']]],
  ['Tageszeit', TIMES_OF_DAY.map((t) => [t.id, t.label, t.key])],
];
const LIGHT = [
  ['', [['', 'Frei (aus der Szene)', '']]],
  ['Licht', [
    ['golden', 'Goldene Stunde', 'warm golden hour light'],
    ['neon', 'Neonlicht', 'colorful neon light, pink and blue reflections'],
    ['kerzen', 'Kerzenlicht', 'warm candlelight, soft shadows'],
    ['blitz', 'Blitz bei Nacht', 'direct camera flash at night, dark background'],
    ['fenster', 'Weiches Fensterlicht', 'soft natural window light'],
    ['tag', 'Helles Tageslicht', 'bright natural daylight'],
  ]],
];
const FRAME = [
  ['', [['', 'Zufällig – meist Halbtotale / ganze Szene (Standard)', '']]],
  ['Ausschnitt', [
    ['halb', 'Halbtotale – ganze Szene', 'medium-wide shot showing the whole scene'],
    ['nah', 'Nahaufnahme', 'close-up shot'],
    ['ganz', 'Ganzer Körper', 'full body shot'],
    ['pov', 'POV (aus seiner Sicht)', 'POV shot from the viewer\'s perspective'],
    ['spiegel', 'Spiegel-Selfie', 'mirror selfie, phone visible'],
    ['unten', 'Von unten (Froschperspektive)', 'low angle shot'],
    ['totale', 'Totale – weite Umgebung', 'wide establishing shot, small figure in a large environment'],
    ['oben', 'Von oben (Vogelperspektive)', 'high angle bird\'s-eye view shot'],
  ]],
];
const MOOD = [
  ['', [['', 'Frei (aus der Szene)', '']]],
  ['Stimmung', [
    ['verspielt', 'Verspielt', 'playful teasing mood'],
    ['selbstbewusst', 'Selbstbewusst', 'confident self-assured mood'],
    ['vertraeumt', 'Verträumt', 'dreamy relaxed mood'],
    ['geheimnisvoll', 'Geheimnisvoll', 'mysterious moody atmosphere'],
  ]],
];
// v42 (AP6): render style, fixed English prompt piece, '' = style from the Stil setting
const RENDER = [
  ['', [['', 'Passend zum Stil (Standard)', '']]],
  ['Bildstil', [
    ['foto', 'Foto (realistisch)', 'photorealistic photo, natural skin texture'],
    ['kino', 'Kino-Standbild', 'cinematic film still, anamorphic lens, color graded'],
    ['polaroid', 'Polaroid', 'vintage polaroid photo, faded colors, white frame'],
    ['noir', 'Film-Noir', 'black and white film noir, hard shadows, high contrast'],
    ['anime', 'Anime', 'anime illustration, clean line art, cel shading'],
    ['manhwa', 'Manhwa', 'korean manhwa illustration, soft digital coloring'],
    ['comic', 'Western-Comic', 'western comic book art, bold ink outlines, halftone'],
    ['aquarell', 'Aquarell', 'watercolor painting, soft washes, paper texture'],
  ]],
];
// fixed environment -> default clothing / default pose when those stay "Frei" (Nachtfalter behaviour)
const SCENE_DEFAULTS = { betonwand: { outfit: 'bikini', pose: 'wand' }, parkplatz: { outfit: 'nackt', pose: 'schulter', time: 'nacht' }, poolnacht: { outfit: 'nackt', pose: 'pool', time: 'nacht' }, yoga: { outfit: 'bikini', pose: 'profil', time: 'tag' } };
// v78: Szenen-Tageszeit (optional): profile.photo.time -> an out.scene angehängt; ohne time/Default byte-identisch.
export const SCENE_TIME = { morgen: 'early morning, soft light', tag: 'daylight', abend: 'evening, warm dim light', nacht: 'night, artificial light' };
// v71: Pose-Intensität (nur adult) – '' = Standard, dezent/offen/stark (stark = exhibitionistisch)
const INTENSITY = [
  ['', [['', 'Standard – aus der Szene', ''], ['dezent', 'Dezent', ''], ['offen', 'Offen – selbstbewusst & einladend (18+)', '', 1], ['stark', 'Stark exhibitionistisch – zeigt sich offen (18+)', '', 1]]],
];
export const CATALOG = { outfit: OUTFIT, koerper: KOERPER, pose: POSE, intensity: INTENSITY, scene: SCENE, light: LIGHT, frame: FRAME, mood: MOOD, render: RENDER };
export const RATES = { selten: 0.15, mittel: 0.33, oft: 0.6 };
export const QUALITY = { spar: { model: '', cost: 0.01 }, mittel: { model: 'qwen-image-2-1-turbo', cost: 0.02 }, qualitaet: { model: 'qwen-image-3', cost: 0.04 } };

const catOf = (k) => (k === 'time' ? TIME_CATALOG : CATALOG[k]);
const find = (k, id, adult) => { for (const [, opts] of catOf(k) || []) for (const o of opts) if (o[0] === id && (!o[3] || adult)) return o; return null; };
// Old Look-tab presets ("Meine Presets") live in profile.looks.presets[kleidung|pose|umgebung]; chosen in the photo group as "my:<id>".
export const MY = { outfit: 'kleidung', pose: 'pose', scene: 'umgebung' };
export const myPreset = (profile, k, id, adult = isAdult()) => {
  if (!MY[k] || !String(id || '').startsWith('my:')) return null;
  const pr = (profile?.looks?.presets?.[MY[k]] || []).find(x => x.id === String(id).slice(3));
  return pr && (!pr.adult || adult) ? pr : null;
};
// label of the legacy Look-tab selection that still applies while the photo field is "Passend/Frei"
export function legacyLabel(profile, k, adult = isAdult()) {
  const l = profile?.looks || {}; if (!MY[k]) return '';
  const v = k === 'outfit' && adult && l.kleidungAdult ? l.kleidungAdult : l[MY[k]];
  if (!v || v === 'frei') return '';
  const pr = (l.presets?.[MY[k]] || []).find(x => x.id === v);
  return pr ? ((pr.adult && !adult) ? '' : pr.label) : String(v).slice(0, 60);
}
// v78: eigene Presets, die nur Dubletten des Latex-Micro-Bikinis sind, werden auf 'bikini' abgebildet (Profil bleibt unverändert)
export const MERGED_MY_RX = /latex/i;
export const MERGED_MY_RX2 = /(micro|mikro)|bikini/i;
export function mergedMy(profile, k, id) {
  if (k !== 'outfit' || !String(id || '').startsWith('my:')) return false;
  const pr = (profile?.looks?.presets?.kleidung || []).find(x => x.id === String(id).slice(3));
  return !!pr && MERGED_MY_RX.test(pr.label || '') && MERGED_MY_RX2.test(pr.label || '');
}
export function optionsHtml(k, cur, adult = isAdult(), esc = (s) => s, profile = null) {
  const leg = profile ? legacyLabel(profile, k, adult) : '';
  const curId = mergedMy(profile, k, cur) ? 'bikini' : resolveId(k, cur || '');
  const lg = LEGACY_PROMPTS[curId];
  const legacy = k === 'outfit' && lg && lg.adult && adult
    ? `<optgroup label="Meine Presets"><option value="${esc(curId)}" selected>${esc(lg.label)}</option></optgroup>` : '';
  const html = catOf(k).map(([g, opts]) => {
    const o = opts.filter(x => !x[3] || adult).map(x => `<option value="${esc(x[0])}" ${x[0] === curId ? 'selected' : ''}>${esc(x[0] === '' && leg ? 'Wie bisher: ' + leg : x[1])}</option>`).join('');
    return !o ? '' : g ? `<optgroup label="${esc(g)}">${o}</optgroup>` : o;
  }).join('');
  const mine = MY[k] && profile ? (profile.looks?.presets?.[MY[k]] || []).filter(x => (!x.adult || adult) && !mergedMy(profile, k, 'my:' + x.id)) : [];
  return legacy + html + (mine.length ? `<optgroup label="Meine Presets">${mine.map(x => `<option value="my:${esc(x.id)}" ${'my:' + x.id === cur ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>` : '');
}
// v78: Einteiler-Verschmelzung – Second-Skin-Wörter nur einmal; Zweiteiler bekommt Abgrenzung.
const SKIN_RX = /second skin|no gaps|oiled|wet-look/i;
const TWO_PIECE_RX = /\b(bikini|top|shirt|bodysuit top)\b[^,]*\b(bottom|shorts|skirt|pants|trousers)\b|\b(top and bottom|bra and shorts|bikini)\b/i;
const TWO_PIECE = 'separate top and bottom, visible waistline';
function zweiteiler(outfit) {
  if (!TWO_PIECE_RX.test(outfit)) return outfit;
  return outfit.includes(TWO_PIECE) ? outfit : `${outfit}, ${TWO_PIECE}`;
}
export const INTENSITY_TAGS = {
  offen: 'confident open pose, inviting, playful',
  stark: 'boldly exhibitionistic, proudly showing off her body to the camera, legs spread wide, arched back, hips pushed forward, confident seductive eye contact, lively natural expression, dynamic candid moment',
};
export function intensityFragment(v, adult = isAdult()) {
  if (!adult) return '';
  const k = String(v || '').toLowerCase();
  return INTENSITY_TAGS[k] || '';
}
// -> { outfit, pose, scene, light, frame, mood, intensity } prompt fragments ('' = frei), FSK18-Werte außerhalb FSK18 ignoriert
// Zusätzlich: out.neg_<key> = Preset-Negativ (5. Katalogeintrag) und out.negative = zusammengeführt.
// Micro-Bikini-Outfits bekommen die SDXL-Mikro-Tags + Schärfe-Tags (cameltoe) angehängt – nur adult.
// Jugendfreie Foto-Richtungen (nur im Modus jugendfrei angeboten)
export const SFW_DIRECTIONS = {
  elegant: { label: 'elegant', prompt: 'elegant, tasteful outfit, refined styling, classy and fully covered' },
  locker: { label: 'locker', prompt: 'casual relaxed everyday outfit, natural and comfortable, fully covered' },
  sportlich: { label: 'sportlich', prompt: 'sporty athletic outfit, activewear, fresh and energetic, fully covered' },
};

export function photoFragments(profile, adult = isAdult()) {
  const p = profile?.photo || {}, out = {};
  const sd = SCENE_DEFAULTS[p.scene] && find('scene', p.scene, adult) ? SCENE_DEFAULTS[p.scene] : {};
  const negs = [];
  for (const k of Object.keys(CATALOG)) {
    const id = p[k] || (k === 'outfit' || k === 'pose' ? sd[k] || '' : '');
    const rid = mergedMy(profile, k, id) ? 'bikini' : resolveId(k, id);
    const lg = k === 'outfit' && LEGACY_PROMPTS[rid] && (!LEGACY_PROMPTS[rid].adult || adult) ? LEGACY_PROMPTS[rid] : null;
    const opt = lg ? [rid, lg.label, lg.prompt, lg.adult ? 1 : 0, lg.negative] : !rid || String(rid).startsWith('my:') ? null : find(k, rid, adult);
    out[k] = !rid ? '' : String(rid).startsWith('my:') ? (myPreset(profile, k, rid, adult)?.prompt || '') : (opt?.[2] || '');
    const neg = opt && typeof opt[4] === 'string' ? opt[4] : '';
    out['neg_' + k] = neg; if (neg) negs.push(neg);
  }
  if (out.koerper) out.outfit = out.outfit ? `${out.outfit}, ${out.koerper}` : out.koerper;
  const kn = knappFragment(p.knapp, adult);
  // v78: Outfit nennt Sideboob/Underboob schon (Micro-Look) → nur kompakte Verstärkung, kein doppelter Text
  const knC = kn && /sideboob/i.test(out.outfit || '') ? (Number(p.knapp) >= 10 ? 'maximally skimpy, much of the breasts exposed, nipples and clitoris not even fully covered, barely concealed' : Number(p.knapp) >= 8 ? 'maximally skimpy, much of the breasts exposed' : '') : kn;
  if (knC) out.outfit = out.outfit ? `${out.outfit}, ${knC}` : knC;
  if (adult) {
    const inten = intensityFragment(p.intensity, adult);
    if (inten) out.intensity = inten;
    if (MICRO_RX.test(out.outfit || '') && !/cameltoe/i.test(out.outfit)) out.outfit = `${out.outfit}, ${MICRO_TAGS}, ${SHARP_TAGS}`;
  }
  if (!adult && SFW_DIRECTIONS[p.direction]) { const d = SFW_DIRECTIONS[p.direction].prompt; out.outfit = out.outfit ? `${out.outfit}, ${d}` : d; }
  if (out.outfit) out.outfit = zweiteiler(out.outfit);
  const tm = SCENE_TIME[p.time] || (p.scene && SCENE_DEFAULTS[p.scene]?.time ? SCENE_TIME[SCENE_DEFAULTS[p.scene].time] : '');
  if (tm && out.scene) out.scene = `${out.scene}, ${tm}`;
  const tk = timeOfDayKey(p.time); if (tk) out.time = tk; // v85: nur gesetzt, wenn gewählt (sonst Ausgabe unverändert)
  out.negative = negs.join(', ');
  return out;
}
export { INTENSITY as INTENSITY_CATALOG };
export const KNAPP_LABELS = ['Normal (bedeckt)', 'Etwas freizügig', 'Tiefer Ausschnitt', 'Knappes Top, Dekolleté', 'Knapp, etwas Sideboob', 'Knapper Bikini, deutlich Sideboob', 'Sideboob + etwas Underboob', 'Micro-Bikini, Sideboob + Underboob', 'Winziger Micro, viel Sideboob + Underboob', 'Micro, maximal knapp, viel Sideboob und Underboob – Brustwarzen und Klitoris werden nicht mal mehr ganz verdeckt'];
// v42: "Knappheit" slider 1-10 (FSK18 only): fixed graded wording, 1 = normal coverage (adds nothing)
export const KNAPP = ['', 'slightly revealing top', 'revealing low-cut top', 'small top showing cleavage', 'small bikini top with a hint of sideboob',
  'small bikini top showing sideboob', 'small bikini top showing sideboob and a hint of underboob', 'micro bikini top showing sideboob and underboob',
  'tiny micro bikini top, a lot of sideboob and underboob visible', 'extremely tiny micro bikini top, maximally skimpy, barely covering the nipples, large amount of sideboob and underboob clearly visible, much of the breasts exposed, nipples and clitoris not even fully covered, barely concealed'];
export function knappFragment(level, adult = isAdult()) {
  const n = Math.max(1, Math.min(10, Math.round(Number(level) || 1)));
  return adult && n > 1 ? KNAPP[n - 1] : '';
}
// auto photo after a reply: null = follow global setting
export function autoPhoto(profile, rnd = Math.random()) {
  const a = profile?.photo?.auto;
  if (a === 'aus') return false; if (a === 'immer') return true;
  if (a === 'zufall') return rnd < (RATES[profile.photo.rate] || RATES.mittel);
  return null;
}
