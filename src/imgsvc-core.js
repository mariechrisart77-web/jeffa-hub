// Pure prompt logic for the server image service.
// One server-side prompt path: layers -> story -> composer (LLM or rule) -> deterministic assembly -> seed -> route.
// No weight syntax anywhere (Venice ignores "(x:1.3)"). No identity in the composer input. Default solo.

export const ANGLES = ['low angle, looking up', 'high angle, looking down', 'over-shoulder POV', 'close-up, shallow depth of field', 'mirror reflection, side view', 'wide shot'];
export const STYLE = {
  real: 'photorealistic, natural light, sharp focus',
  comic: 'western comic book art style, bold ink outlines, flat vibrant colors',
  manhwa: 'Korean manhwa webtoon style, clean digital line art, soft cel shading, vibrant colors',
  story: 'photorealistic photo, cinematic',
};
export const NEG_SINGLE = 'bad anatomy, extra limbs, deformed hands, watermark, text, letters, logo, signature, lowres, blur, jpeg artifacts';
export const NEG_COMIC = 'text, letters, words, speech bubbles, captions, watermark, logo, signature, deformed hands';
const NEG_ADULT_REAL = 'cartoon, 3d render, cgi, doll, plastic skin, airbrushed, stiff posed portrait';
export const NEG_SOLO = 'extra people, second person, man, crowd';
const PEOPLE = /\b(two|three|zwei|drei|beide|both|women|frauen|man|men|guy|friend|friends|partner|boyfriend|girlfriend|husband|wife|couple|crowd|people|together with|with (him|her|them)|mann|männer|freund|freundin|freunde|leute|zusammen mit|mit ihm|mit ihr|paar)\b/i;
const PEOPLE_TOKEN = /\b(man|men|guy|guys|male|boyfriend|girlfriend|husband|wife|friend|friends|partner|couple|crowd|people|another woman|second (woman|person|man)|other (women|people|persons)|he|him|his|they|them|them both|both of them|two women|three women|two people|mann|männer|freund|freundin|freunde|leute|zusammen mit|mit ihm|mit ihr|paar)\b/gi;

const CLOTHES = /\b(dress|kleid\w*|bikini|swimsuit|badeanzug|lingerie|dessous|shirt|t-shirt|bluse|blouse|jeans|hose|pants|skirt|rock|rocks|jacke|jacket|coat|mantel|pullover|sweater|hoodie|uniform|kostüm|costume|towel|handtuch|bademantel|robe|pyjama|nightgown|nachthemd|wears?|wearing|trägt|angezogen|outfit|latex|leder|leather|stockings|strümpfe|heels)\b/i;
const PLACES = /\b(pool|beach|strand|bed|bett|bedroom|schlafzimmer|kitchen|küche|bath\w*|bad|badewanne|dusche|shower|office|büro|car|auto|street|straße|park|garden|garten|forest|wald|restaurant|bar|club|hotel|room|zimmer|sofa|couch|balcony|balkon|terrace|terrasse|sauna|gym|lake|see|sea|meer|city|stadt|wohnzimmer|living room|stairs|treppe|garage|parkplatz|parking|church|kirche|train|zug|plane|flugzeug|boat|boot|yacht|desert|wüste|mountain|berg|snow|schnee|outdoor|draußen|drinnen|indoors)\b/i;
const POSES = /\b(sitting|sitzt|sits|sit|sitzen|lying|liegt|lies|liegen|standing|steht|stands|kneeling|kniet|walking|läuft|geht|dancing|tanzt|swimming|schwimmt|leaning|lehnt|bending|bückt|running|rennt|laughing|hugging|umarmt|kissing|küsst|edge|rand)\b/i;
const WET = /\b(wet|nass\w*|soaked|soaking|damp|dripping|tropfnass|durchnässt|klatschnass)\b/i;
const TORN = /\b(torn|ripped|zerrissen|zerrissen\w*|aufgerissen|torn open)\b/i;
const DRY = /\b(dry|trocken|abtrocknen|abgetrocknet|dried|drying off|toweling off|rub(?:s|bing)? (?:her|dry)|frotte?|frottier\w*)\b/i;
const CHANGE = /\b(changed? (?:her )?(?:clothes|outfit)|changes? clothes|umgezogen|umziehen|zieht sich um|new outfit|fresh outfit|dressed again|angezogen wieder)\b/i;
const NUDE = /\b(nude|naked|nackt|topless|oben ohne|undressed|ausgezogen|entkleidet)\b/i;

// identity words that a chat scene must not override once a slot is locked
export const CONFLICT_WORDS = {
  hair: ['blonde', 'blond', 'brunette', 'brünett', 'brünette', 'black hair', 'schwarze haare', 'schwarzhaarig', 'red hair', 'rote haare', 'rothaarig', 'redhead', 'ginger', 'grey hair', 'gray hair', 'silver hair', 'graue haare', 'silberne haare'],
  eyes: ['blue eyes', 'green eyes', 'brown eyes', 'hazel eyes', 'grey eyes', 'blaue augen', 'grüne augen', 'braune augen', 'graue augen'],
  age: [/\b\d{2}[- ]?(years?[- ]old|jahre alt|jährige?)\b/gi],
  figure: ['petite', 'zierlich', 'curvy', 'kurvig', 'slim', 'schlank', 'chubby', 'mollig'],
  height: ['tall', 'groß', 'short', 'klein'],
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (w) => w instanceof RegExp ? new RegExp(w.source, w.flags) : new RegExp('(^|[^\\p{L}])' + esc(w) + '(?=$|[^\\p{L}])', 'giu');
const MINOR_RX = /\b(fast\s+)?kindlich\w*|\bjugendlich\w*|\bchild\w*|\bkid\w*|\bteen\w*|\bminderjährig\w*|\bschoolgirl\w*|\bschulmädchen\w*|\bloli\w*|\bunderage\w*/gi;
const VIBE = [[/lebhaft|lively|energ/i, 'lively animated body language, mid-gesture'], [/neugierig|curious/i, 'curious glance, head slightly tilted'], [/humorvoll|witzig|funny|humor/i, 'amused grin, laughing eyes'], [/spontan|spontaneous/i, 'candid spontaneous pose, caught mid-movement'], [/verspielt|playful/i, 'playful teasing pose'], [/warm/i, 'warm inviting smile'], [/aufmerksam|attentive/i, 'attentive direct eye contact with the camera'], [/verständnisvoll|sanft|gentle/i, 'soft gentle expression'], [/selbstbewusst|confident|dominant/i, 'confident upright posture, chin raised'], [/frech|cheeky|keck/i, 'cheeky smirk'], [/schüchtern|shy/i, 'shy glance, slightly averted eyes'], [/leidenschaft|passion/i, 'intense smouldering gaze'], [/ruhig|calm/i, 'relaxed calm posture'], [/temperament|wild/i, 'wild energetic pose, tousled hair']];
export function vibeCues(traits) { const t = String(traits || ''); return VIBE.filter(([rx]) => rx.test(t)).map(([, c]) => c).slice(0, 5).join(', '); }
export function outfitEmphasis(outfit) { const o = String(outfit || '').trim(); if (!o) return ''; const wet = /\bwet\b|nass|soaked|damp/i.test(o) ? ' The clothes are visibly soaked and dripping wet, with dark damp patches, the fabric clinging tightly, water droplets on fabric and skin.' : ''; return `She is wearing ${o}.${wet}`; }
export function minorRisk(profile, resolved) { const age = +(profile?.persona?.look?.age ?? profile?.look?.age ?? 0); if (age && age < 18) return true; const txt = [resolved?.identity, resolved?.look, profile?.persona?.look?.style, profile?.persona?.look?.details, profile?.description].map((x) => String(x || '')).join(' '); MINOR_RX.lastIndex = 0; const hit = MINOR_RX.test(txt) || /looks about (1[0-7])\b|\b(1[0-7])\s*(jahre|years? old)/i.test(txt); MINOR_RX.lastIndex = 0; return hit; }
export function addCues(prompt, L, traits) { let p = String(prompt || '').replace(/,?\s*no text, no letters\s*$/i, ''); const oe = outfitEmphasis(L.outfit), v = vibeCues(traits); if (oe) p = oe + ' ' + p; if (v) p += ', personality shown: ' + v; return (p + ', no text, no letters').slice(0, 2400); }
export function scrubYouth(t) { return String(t || '').replace(MINOR_RX, '').replace(/looks about (1[0-7])\b/gi, '').replace(/looks exactly (1[0-7]) years old/gi, '').replace(/\b(1[0-7])\s*(-?\s*)(jährig\w*|jahre\w*|years?[ -]old)/gi, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/,\s*,+/g, ',').trim(); }
export function dedupeSeg(t) { const seen = new Set(), out = []; for (const seg of String(t || '').replace(MINOR_RX, '').split(/\s*,\s*/)) { const k = seg.trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push(seg.trim()); } return out.join(', '); }
const clean = (t, n) => String(t || '').replace(/[#*_`>"„“]/g, '').slice(0, n);
const cleanComma = (t) => String(t || '').replace(/,\s*,+/g, ',').replace(/^[\s,;.]+|[\s,;.]+$/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();

export function outfitFor(r, sc) {
  const kw = String(r?.outfitKeyword || '').trim(), txt = String(r?.outfitText || '').trim();
  if (!kw || !txt) return null;
  const k = esc(kw);
  if (!new RegExp(k, 'i').test(sc)) return null;
  if (/\b(nackt|nude|naked|undress\w*|entkleid\w*|auszieh\w*|ausgezogen|zieht\w*\b.{0,40}\baus\b|takes? off|took off|taking off|removed?|removing|strips?|stripped)\b/i.test(sc)) return null;
  if (new RegExp('\\b(ohne|without|no)\\s+(\\w+\\s+)?' + k, 'i').test(sc)) return null;
  return { text: txt, neg: String(r.outfitNeg || '').trim() };
}

/** strip words of locked slots from a free text; returns {text, removed:[{slot,word}]} */
export function stripConflicts(text, locked) {
  let t = String(text || ''); const removed = [];
  for (const slot of Object.keys(locked)) {
    if (!locked[slot]) continue;
    for (const w of CONFLICT_WORDS[slot] || []) {
      const r = rx(w);
      t = t.replace(r, (m, pre) => {
        const word = w instanceof RegExp ? m : m.slice((pre || '').length);
        if (!(w instanceof RegExp) && new RegExp(esc(word), 'i').test(locked[slot].text)) return m;
        removed.push({ slot, word: word.trim() });
        return w instanceof RegExp ? '' : (pre || '');
      });
    }
  }
  return { text: t.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim(), removed };
}

const BUST_RX = /\s*\b(with\s+)?(an?\s+)?((very|extremely|super|rather|quite)\s+)?(small|tiny|medium|average|big|large|huge|enormous|massive|full|heavy|ample|perky|natural)(\s+(full|round|natural|perky|heavy))?\s+(bust|breasts|boobs|chest|brüste|oberweite)\b|\s*\bbusty\b/gi;
const CUP_RX = /\b(small|medium|full|large|very large|huge) (A|B|C|D|DD|F|G)-cup bust\b/;
const tidyC = (s) => s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/(,\s*){2,}/g, ', ').replace(/^[\s,;.]+|[\s,;]+$/g, '').replace(/\b(a) (adult)/gi, 'an $2');
export function oneBust(text, keepCup = true) {
  const t = String(text || ''), cup = t.match(CUP_RX)?.[0];
  if (!cup) return t;
  const out = tidyC(t.replace(cup, '\u0001').replace(BUST_RX, '').split('\u0001').join(keepCup ? cup : ''));
  return out;
}
export function resolveLayers({ profile = {}, resolved = {}, card = null, scene = '', context = {}, corrections = {} } = {}) {
  const ph = resolved.photo || {};
  const pl = profile.persona?.look || {}, pf = profile.persona?.figur || {};
  const cj = card?.data?.extensions?.jeffa || {}, cl = cj.look || {}, cf = cj.figur || {};
  const lockOf = (p, c) => p ? { text: String(p), source: 'profile' } : c ? { text: String(c), source: 'card' } : null;
  const locked = {
    hair: lockOf(pl.hair, cl.hair),
    eyes: lockOf(/eyes|augen/i.test(String(pl.typ || '') + ' ' + String(pl.details || '')) ? pl.typ + ' ' + (pl.details || '') : '', cl.eyes),
    age: lockOf(pl.age, cl.age),
    figure: lockOf(pf.statur, cf.statur),
    height: lockOf(pf.groesse, cf.groesse),
  };
  let identity = dedupeSeg(clean(resolved.identity != null && resolved.identity !== '' ? resolved.identity : resolved.look, 4000)).slice(0, 1200);
  if (resolved.refLook && !identity.includes(resolved.refLook)) identity = dedupeSeg(clean(resolved.refLook + ', ' + identity, 4000)).slice(0, 1200);
  const _subj = String(profile?.persona?.gender || '').toLowerCase() === 'male' ? 'adult man' : 'adult woman';
  if (!identity) identity = [cl.typ, cl.age && `${_subj}, looks exactly ${Math.max(18, +cl.age || 25)} years old`, cl.hair, cl.eyes, cl.skin, cl.style, cl.details, cf.statur, cf.groesse].filter(Boolean).join(', ');
  const cardIdentity = [];
  if (!pl.hair && cl.hair && !identity.includes(cl.hair)) cardIdentity.push(cl.hair);
  if (cl.eyes && !identity.includes(cl.eyes)) cardIdentity.push(cl.eyes);
  if (cardIdentity.length) identity = identity + ', ' + cardIdentity.join(', ');
  const hasCup = CUP_RX.test(identity);
  if (hasCup) identity = oneBust(identity);

  const msgs = (context.messages || []).filter((m) => m && m.content && !m.generated).slice(-8);
  let ctxText = msgs.map((m) => `${m.role}: ${clean(m.content, 300)}`).join('\n').slice(-2400);
  const rawScene = clean(scene || context.scene || [...msgs].reverse().find((m) => m.role === 'assistant')?.content || '', 400);
  const s1 = stripConflicts(rawScene, locked), s2 = stripConflicts(ctxText, locked);
  ctxText = s2.text;
  const conflicts = [...s1.removed, ...s2.removed].map((r) => ({ slot: r.slot, removed: r.word, kept: locked[r.slot].text, source: locked[r.slot].source }));
  const outfitRule = outfitFor(resolved, rawScene);
  const outfit = ph.outfit ? { text: ph.outfit, neg: '' } : outfitRule || (cj.outfit ? { text: String(cj.outfit), neg: '' } : null);
  const fixed = [ph.scene && 'setting: ' + ph.scene, ph.pose && 'pose: ' + ph.pose, ph.outfit && 'clothing: ' + ph.outfit, ph.light && 'lighting: ' + ph.light, ph.frame && 'framing: ' + ph.frame, ph.mood && 'mood: ' + ph.mood].filter(Boolean).join('; ');
  const d = resolved.defaults || {};
  const has = { outfit: CLOTHES.test(rawScene) || /\b(nackt|nude|naked)\b/i.test(rawScene), place: PLACES.test(rawScene), pose: POSES.test(rawScene) };
  const defaults = {
    outfit: !outfit && !has.outfit ? clean(d.outfit, 300) : '',
    place: !ph.scene && !cj.place && !has.place ? clean(d.place, 300) : '',
    pose: !ph.pose && !has.pose ? clean(d.pose, 200) : '',
    expression: !ph.mood ? clean(d.expression, 150) : '',
  };
  return {
    defaults, sceneHas: has,
    identity, outfit: outfit?.text || '', outfitNeg: outfit?.neg || '', outfitPicked: !!ph.outfit,
    pose: ph.pose || '', place: ph.scene || cj.place || '', light: ph.light || '', frame: ph.frame || '', mood: ph.mood || '', render: ph.render || '',
    expression: cj.expression || '', styleText: hasCup ? tidyC(clean(resolved.styleText, 600).replace(BUST_RX, '')) : clean(resolved.styleText, 600), stylePose: clean(resolved.stylePose, 300), styleCustom: !!resolved.styleCustom,
    scene: s1.text, context: ctxText, summary: clean(context.summary, 600), fixed,
    corrections: { positive: clean(corrections.positive, 300), negative: clean(corrections.negative, 300) },
    conflicts,
  };
}

const CLOTHES_X = /\b(nackt|nude|naked|topless|oben ohne|catsuit|bodysuit|corset|korsett|minirock|stiefel|boots)\b/i;
export const chatHasClothes = (t) => CLOTHES.test(String(t || '')) || CLOTHES_X.test(String(t || ''));
const styleNoClothes = (t) => String(t || '').split(/,\s*/).filter((x) => !CLOTHES.test(x) && !CLOTHES_X.test(x) && !/\b(semi-sheer|wet look|clinging|glossy|shiny surface)\b/i.test(x)).join(', ');
export function useScene(L, chatText) {
  if (!chatHasClothes(chatText)) return {};
  const st = L.styleText && styleNoClothes(L.styleText) !== L.styleText ? { styleText: styleNoClothes(L.styleText) } : {};
  if (!L.outfit) return st;
  // v73: explizit gewählte Kleidung (Dropdown) gilt IMMER; nur Regel-/Karten-Outfits weichen der Story
  if (L.outfitPicked) return st;
  return { ...st, outfit: '', outfitNeg: '', fixed: String(L.fixed || '').split('; ').filter((x) => !x.startsWith('clothing: ')).join('; '), outfitFromChat: true };
}

export const VARIATIONS = ['turning her head over her shoulder', 'mid-movement, caught naturally', 'leaning slightly to one side', 'looking away from the camera', 'hand touching her hair', 'glancing at the camera with a slight smile', 'arms relaxed, weight on one leg', 'seen slightly from the side', 'reaching for something nearby', 'in a relaxed candid moment'];
/** v38 kept for compatibility: the new path uses pickVariation directly and keeps the variation as camera/lens variation when the composer supplied a pose. */
export const sceneVariation = (v, llmScene) => llmScene ? String(v || '').split(', ').filter((x) => !VARIATIONS.includes(x)).join(', ') : v;
const LENSES = ['35mm lens', '50mm lens', '28mm wide lens', '85mm lens', 'eye-level camera', 'camera slightly above eye level', 'camera slightly below eye level'];
export function pickVariation(L, rnd = Math.random) {
  const out = [];
  if (!L.pose && !L.defaults?.pose) out.push(VARIATIONS[Math.floor(rnd() * VARIATIONS.length)]);
  if (!L.frame) out.push(LENSES[Math.floor(rnd() * LENSES.length)]);
  return out.join(', ');
}
export const normRefMode = (m) => (m === 'full' ? 'figur' : m);
export function effectiveRefMode(refMode, L) { return normRefMode(refMode); }
export function buildEditPrompt(scenePrompt, figur) {
  return `New photo – SCENE (follow it exactly): ${scenePrompt}. Outfit, pose, place, camera angle and lighting come ONLY from the scene, never from the reference image. IDENTITY: same person as in the reference image – preserve her exact face, facial features, eye colour and skin tone${figur ? ', and also her hairstyle, hair length, hair colour and body type / figure' : ', hairline and hair colour'}; do not change her identity. Clothing exactly as described in the scene, not from the reference image.`.slice(0, 1500);
}
const SHORT = { 'qwen-image-2-1-turbo-edit': 'qwen-edit', 'qwen-image-2-1-turbo': 'qwen-turbo', 'qwen-image-3': 'qwen-3', 'flux-2-pro': 'flux-pro', 'z-image-turbo': 'z-image', chroma: 'chroma' };
export function shortModel(model, label) { return label && /Gesicht|Figur|Qualität|Mittel/.test(label) ? `${model} · ${label}` : model; }

export function pickAngle(sc, rnd = Math.random) {
  const t = String(sc || '').toLowerCase();
  if (/mirror|spiegel|selfie/.test(t)) return ANGLES[4];
  if (/close|nah|portrait|porträt|gesicht|face|augen|eyes/.test(t)) return ANGLES[3];
  if (/beach|strand|landscape|landschaft|street|straße|city|stadt|panorama|room|zimmer|garden|garten|meer|sea/.test(t) && rnd() < 0.6) return ANGLES[5];
  if (/sitting|sitzt|lying|liegt|bett|bed|sofa|floor|boden/.test(t) && rnd() < 0.5) return ANGLES[1];
  const r = rnd();
  if (r < 0.5) return 'medium-wide shot showing the whole scene';
  if (r < 0.7) return ANGLES[5];
  return ANGLES[[0, 1, 2, 3][Math.floor(rnd() * 4)]];
}

/** comic page branch, weight-free */
function comicRulePrompt(L, style) {
  return {
    prompt: `comic book page, 3 panels stacked vertically, consistent character: ${L.outfit ? L.outfit + ', ' : ''}${L.identity}. Story: ${L.scene || L.context}. Leave empty space at the top of each panel for speech bubbles, no text, no letters, no speech bubbles drawn`,
    negative: [NEG_COMIC, L.outfitNeg].filter(Boolean).join(', '),
  };
}

/** rule prompt (no LLM) – fallback and comic page. Weight-free, fixed order: scene -> camera/pose -> outfit -> identity -> style -> quality */
export function buildRulePrompt(L, { style = 'real', adult = false, angle = '', llmScene = '', variation = '' } = {}) {
  if (style === 'comicpage') return comicRulePrompt(L, style);
  const render = L.render ? L.render : adult && (style === 'real' || style === 'story') ? 'raw candid smartphone photo, realistic natural lighting, natural skin texture with visible pores, photorealistic' : `${STYLE[style] || STYLE.real}, candid natural moment`;
  const scene = cleanComma([llmScene || L.scene, L.place || L.defaults?.place].filter(Boolean).join(', '));
  const cam = cleanComma([L.frame || angle, L.pose || L.defaults?.pose, variation, L.light, L.mood].filter(Boolean).join(', '));
  const parts = {
    scene, camera: cam, outfit: cleanComma([L.outfit || L.defaults?.outfit].filter(Boolean).join(', ')),
    identity: L.identity, expression: L.expression || L.defaults?.expression, style: L.styleText, extra: cleanComma([L.stylePose, L.corrections.positive].filter(Boolean).join(', ')),
  };
  const { prompt } = planAssemble({ scene: parts.scene, camera: parts.camera, outfit: parts.outfit, expression: parts.expression }, { ...L, render, corrections: { ...L.corrections, positive: parts.extra } }, { style, adult });
  const negative = composeNegative(L, { style, adult });
  return { prompt: prompt.slice(0, 2000), negative: negative.slice(0, 1200) };
}

/** explicit visual wording for the outfit state */
export function statefulOutfit(outfit, state) {
  const o = cleanComma(scrubYouth(String(outfit || '')));
  const s = String(state || '').toLowerCase();
  if (!o) return '';
  if (s === 'wet' || /wet/i.test(s)) return `${o}, visibly soaking wet, the fabric clinging to her skin, dark damp patches, water droplets on skin`;
  if (s === 'torn' || /torn/i.test(s)) return `${o}, torn and ripped open, frayed edges`;
  if (s === 'wet+torn' || (/wet/i.test(o) && /torn/i.test(o))) return `${o}, visibly soaking wet and torn, clinging wet fabric with rips`;
  if (s === 'nude' || /nude|naked/i.test(s)) return 'nude, no clothes';
  if (/dry/i.test(s)) return `${o}, dry`;
  return o;
}

const OUTFIT_NEG = [
  [/wet/i, 'dry clothes, dry fabric'],
  [/torn/i, 'intact clothes'],
  [/nude|naked/i, 'clothes'],
];
/** negative: generic + outfit negative + feedback negative + solo 'extra people ...' */
export function composeNegative(L = {}, { style = 'real', adult = false } = {}) {
  const out = [style === 'comicpage' ? NEG_COMIC : NEG_SINGLE];
  if (adult && style !== 'comic' && style !== 'manhwa' && style !== 'comicpage') out.push(NEG_ADULT_REAL);
  const txt = String((L && L.outfit_state) || '') + ' ' + String((L && L.outfitNeg) || '');
  for (const [r, neg] of OUTFIT_NEG) if (r.test(txt)) out.push(neg);
  if (L && L.outfitNeg) out.push(L.outfitNeg);
  if (L && L.corrections && L.corrections.negative) out.push(L.corrections.negative);
  out.push(NEG_SOLO);
  return dedupeSeg(cleanComma(out.filter(Boolean).join(', ')));
}

/** remove weight syntax entirely */
export function stripWeights(t) { return String(t || '').replace(/\(([^()]*?)\s*:\s*\d+(?:\.\d+)?\s*\)/g, '$1').replace(/\bno\s+text,\s*no\s+letters\s*$/i, 'no text, no letters').trim(); }

function normKey(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }

/* ---------------- composer ---------------- */

export const COMPOSER_SYSTEM = `You write ONE image prompt for a photorealistic photo of a single adult woman (18+) in a role-play chat.
Output: ONLY a JSON object, no prose, no code fences, this exact shape:
{"scene":"","action":"","pose":"","camera":"","lighting":"","outfit":"","outfit_state":"","background":"","expression":"","story":{"location":"","time_of_day":"","present":[],"outfit":"","outfit_state":"","action":""}}
Rules:
- English, concrete visual nouns, short comma fragments. No sentences, no dialogue, no feelings, no story summary.
- NEVER describe her identity: no hair, no eye colour, no age, no ethnicity, no skin tone, no body shape, no cup size. Identity is added separately.
- Exactly ONE person. Never add other people (no man, no friend, no couple, no crowd) unless the story state lists a present person.
- Keep state words exactly and visibly: wet, soaked, torn, see-through, minimal, micro.
- story = the updated continuous story state after this moment: location, time_of_day, present (names only, empty = alone), outfit, outfit_state (wet/dry/torn/nude/""), action.
- If the moment only continues the previous scene, repeat the previous location/outfit/outfit_state in story (do not drop them).
- All persons are adults. No text in the image.`;

/* ---------------- model table ---------------- */

export const MODEL_TABLE = {
  single: { label: 'Profil-Standard', safe: { model: 'z-image-turbo', cost: 0.01 }, adult: { model: 'chroma', cost: 0.01 } },
  auto: { label: 'Auto', safe: { model: 'z-image-turbo', cost: 0.01 }, adult: { model: 'chroma', cost: 0.01 } },
  spar: { label: 'Spar', safe: { model: 'z-image-turbo', cost: 0.01 }, adult: { model: 'chroma', cost: 0.01 } },
  mittel: { label: 'Mittel', safe: { model: 'qwen-image-2-1-turbo', cost: 0.02 }, adult: { model: 'chroma', cost: 0.01 } },
  qualitaet: { label: 'Qualität', safe: { model: 'flux-2-pro', cost: 0.03 }, adult: { model: 'chroma', cost: 0.01 } },
  mix: { label: 'Mix', safe: { model: 'z-image-turbo', cost: 0.03, mix: true }, adult: { model: 'chroma', cost: 0.01 } },
  lustify: { label: 'Lustify', safe: { model: 'lustify-v8', cost: 0.01 }, adult: { model: 'lustify-v8', cost: 0.01 } },
  hq: { label: 'HQ', safe: { model: 'flux-2-pro', cost: 0.03 }, adult: { model: 'lustify-v8', cost: 0.01, steps: 50 } },
  refine: { label: 'Nachschliff', safe: { model: 'qwen-image-2-1-pro-edit', cost: 0.05, edit: { base: 'z-image-turbo', model: 'qwen-image-2-1-pro-edit' } }, adult: { model: 'qwen-edit-uncensored', cost: 0.05, edit: { base: 'chroma', model: 'qwen-edit-uncensored' } } },
  'refine-firered': { label: 'Nachschliff FireRed', safe: { model: 'firered-image-edit', cost: 0.04, edit: { base: 'z-image-turbo', model: 'firered-image-edit' } }, adult: { model: 'firered-image-edit', cost: 0.04, edit: { base: 'chroma', model: 'firered-image-edit' } } },
  krea: { label: 'Krea Premium', safe: { model: 'krea-v2-large', cost: 0.07 }, adult: { model: 'chroma', cost: 0.01 } },
  runware: { label: 'Runware Spar', safe: { model: 'runware:100@1', cost: 0.002 }, adult: { model: 'runware:100@1', cost: 0.002 } },
};

/** v75 (e): FSK18-Kleidungsfamilie, die bei adult + ohne explizite Modellwahl chroma erzwingt */
export function fsk18Family(outfit) {
  return /\b(sheer|see-through|semi-sheer|semi sheer|micro\s*-?\s*bikini|microbikini|lingerie|latex|transparent|fishnet|g-string|gstring|bodysuit|catsuit|negligee)\b/i.test(String(outfit || ''));
}

/** route with the table; unknown values -> single */
export function routeModel({ style = 'real', adult = false, quality = 'spar', refMode = 'off', hasRef = false, explicit = true, fsk18Sheer = false } = {}) {
  const q = MODEL_TABLE[String(quality)] ? String(quality) : 'single';
  // v75 (e): adult + FSK18-Sheer/Micro + KEINE explizite Modellwahl → chroma (v74 war klar besser: Körper + Gesicht)
  if (adult && explicit === false && fsk18Sheer && q !== 'chroma') {
    return { kind: 'gen', q, model: 'chroma', cost: 0.01, label: (MODEL_TABLE[q] && MODEL_TABLE[q].label) || 'Auto', steps: undefined };
  }
  const e = MODEL_TABLE[q][adult ? 'adult' : 'safe'];
  if (!adult && (style === 'comic' || style === 'manhwa' || style === 'comicpage') && !e.edit && !e.mix) return { kind: 'gen', q, model: 'qwen-image-2-1-turbo', cost: 0.02, label: 'Comic', steps: undefined };
  if (e.edit || e.mix) return { kind: 'gen', q, model: e.model, cost: e.cost, label: MODEL_TABLE[q].label, steps: e.steps, edit: e.edit || null, mix: !!e.mix };
  return { kind: 'gen', q, model: e.model, cost: e.cost, label: MODEL_TABLE[q].label, steps: e.steps };
}
/** v87 Spar-Mix (nur adult): solo je Stufe z-image/qwen, mit Partner oder männlichem Profil chroma. */
export function sparMixModel({ adult = false, quality = '', partner = false, male = false } = {}) {
  if (!adult) return null;
  const q = String(quality || '');
  if (!['spar', 'mittel', 'qualitaet'].includes(q)) return null;
  if (partner || male) return { model: 'chroma', cost: 0.01 };
  if (q === 'spar') return { model: 'z-image-turbo', cost: 0.01 };
  if (q === 'mittel') return { model: 'qwen-image-2-1-turbo', cost: 0.02 };
  return { model: 'qwen-image-3', cost: 0.04 };
}
export function modelLabel(quality, adult = false) { const q = MODEL_TABLE[String(quality)] ? String(quality) : 'single'; return MODEL_TABLE[q][adult ? 'adult' : 'safe'].model; }

function sceneHasPose(a, b) {
  const na = normKey(a), nb = normKey(b);
  if (!na) return false;
  if (na === nb) return true;
  return nb.split(' ').every((w) => w.length > 3 && na.includes(w));
}


/** after an LLM composer: remove contradicting identity words, make sure locked values are present */
export function enforceLocked(prompt, L) {
  let p = String(prompt || '');
  const locked = {};
  for (const c of L.conflicts || []) locked[c.slot] = { text: c.kept };
  p = stripConflicts(p, locked).text;
  const missing = [L.identity, L.outfit].filter((v) => v && !p.includes(v.slice(0, 40)));
  if (missing.length) p += ', the woman: ' + missing.join(', ');
  if (!/no text/i.test(p)) p += ', no text, no letters';
  return p.slice(0, 2000);
}

export function composeInput(L, { style = 'real', angle = '', llmScene = '', variation = '' } = {}) {
  return [
    'LOCKED (must appear, override the context):',
    `identity: ${L.identity}`, L.outfit && `outfit (keep every state word like wet/torn/see-through, show it visibly): ${L.outfit}`, L.vibe && `personality (show as expression, body language, pose): ${L.vibe}`, L.fixed && `fixed by the user: ${L.fixed}`, L.styleText && `own style: ${L.styleText}`,
    `camera: ${L.frame || angle}`, `render: ${L.render || STYLE[style] || STYLE.real}`,
    L.corrections.positive && `feedback: ${L.corrections.positive}`,
    variation && `variation for this shot (use unless it contradicts the scene): ${variation}`,
    'CONTEXT (place, action and people of the scene have priority over the defaults below):', llmScene && `visual scene (written from the chat, follow it closely): ${llmScene}`, L.scene && `scene: ${L.scene}`, L.summary && `summary: ${L.summary}`, L.context,
    (L.defaults?.outfit || L.defaults?.place || L.defaults?.pose || L.defaults?.expression) && 'DEFAULTS (use only where the scene says nothing about it):',
    L.defaults?.outfit && `outfit: ${L.defaults.outfit}`, L.defaults?.place && `place: ${L.defaults.place}`, L.defaults?.pose && `pose: ${L.defaults.pose}`, L.defaults?.expression && `expression: ${L.defaults.expression}`,
  ].filter(Boolean).join('\n');
}

export function youthRisk(t) { MINOR_RX.lastIndex = 0; const hit = MINOR_RX.test(String(t || '')) || /looks about (1[0-7])\b|\b(1[0-7])\s*(-?\s*)(jährig\w*|jahre\w*|years?[ -]old)/i.test(String(t || '')); MINOR_RX.lastIndex = 0; return hit; }
export const normQuality = (q) => (Object.prototype.hasOwnProperty.call(MODEL_TABLE, String(q)) ? String(q) : 'single');
// v68: Plan/Story/Seed/Prompt-Bau liegt in imgsvc-plan.js (ein Pfad), hier re-exportiert
import { assemblePrompt as planAssemble } from './imgsvc-plan.js';
export { buildImagePlan, ruleComposer, mergeStory, storyStep, emptyStory, assemblePrompt, compactIdentity, filterPeople, peopleAllowed, parseComposerJson, composerInput, COMPOSER_JSON_SYSTEM, sceneSeed, resolveSeed, hashStr, outfitPhrase, outfitNegative, noWeights, mergeNegative, fitPrompt, composerSystemFor } from './imgsvc-plan.js';
export { specForRendered } from './promptapp/garments.js';
export { dropNegativeConflicts, stripConflictingAge } from './promptapp/util.js';
