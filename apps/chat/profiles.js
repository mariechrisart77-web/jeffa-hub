import { mergeServerProfiles } from './shared/profilemerge.js';
export { mergeServerProfiles };
import { SPANISH_LEVELS, spanishTeacherProfile as esTeacher } from './es-teacher.js';
import { styleFor } from './styles.js';
import { api } from './shared/api.js';
import { isAdult } from './shared/fsk.js';
import { stylePrompt } from './shared/persona-terms.js';
import { listConversations } from './chat.js';
import { photoFragments } from './photoopts.js';
import { textToControls } from './profilesync.js';

const STORAGE_KEY = 'jeffa.profiles';
const PROFILES_SCHEMA = 3;

const DEFAULT_PROFILES = [
  {
    id: 'assistant',
    name: 'Assistent',
    avatar: '🤖',
    description: 'Allgemeiner Helfer',
    language: 'de',
    enabled: true,
    adult: false,
    modelChain: ['gemini-3.5-flash-lite'],
    voice: { provider: 'edge', voiceName: 'de-DE-SeraphinaMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist ein hilfreicher Assistent. Antworte präzise und höflich auf Deutsch.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'lawyer',
    name: 'Anwalt',
    avatar: '⚖️',
    description: 'Rechtliche Beratung',
    language: 'de',
    enabled: true,
    adult: false,
    modelChain: ['gemini-3.5-flash'],
    voice: { provider: 'edge', voiceName: 'de-DE-FlorianMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist ein Rechtsberater. Gib sachliche, gründliche Antworten auf Deutsch. Weise darauf hin, dass deine Antworten keine Rechtsberatung ersetzen.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'coder',
    name: 'Coder',
    avatar: '💻',
    description: 'Programmierhilfe',
    language: 'de',
    enabled: true,
    adult: false,
    modelChain: ['gemini-3.5-flash'],
    voice: { provider: 'edge', voiceName: 'de-DE-FlorianMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist ein Programmierexperte. Gib klare, technische Antworten mit Code-Beispielen auf Deutsch.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'seraphina',
    name: 'Seraphina',
    avatar: '🌺',
    description: 'Herzliche Begleiterin & Assistentin',
    language: 'de',
    enabled: true,
    adult: false,
    modelChain: ['auto:nemotron-free', 'gemini-3.5-flash-lite'],
    voice: { provider: 'edge', voiceName: 'de-DE-SeraphinaMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist Seraphina, eine warmherzige, freundliche Begleiterin und Assistentin. Du hörst aufmerksam zu, sprichst natürlich und herzlich, hilfst gern ganz praktisch weiter und hast eine ruhige, positive Ausstrahlung. Antworte auf Deutsch, persönlich und in angenehmer Länge – gut zum Vorlesen geeignet. Du bist selbstbewusst und freundlich, nie herablassend.',
    systemPromptAdult: 'Du bist Seraphina, eine warmherzige, selbstbewusste Frau Mitte zwanzig. Du bist charmant, flirtest gern spielerisch und zeigst dich gern von deiner besten Seite – du genießt Aufmerksamkeit und Komplimente, bleibst dabei herzlich, respektvoll und nie herablassend. Alle Figuren sind Erwachsene. Bleib geschmackvoll und andeutend statt explizit. Antworte auf Deutsch, natürlich und gut zum Vorlesen geeignet.',
    persona: { base: 'selbstbewusst', subtraits: [], look: { typ: 'woman in her 20s, fair glowing skin, dark defined brows, full lips', age: 25, hair: 'long black hair in a high sleek ponytail', style: 'elegant', special: [] }, traits: { intensitaet: 6, waerme: 9, humor: 6, initiative: 7, fantasie: 6 }, figur: { groesse: '', statur: 'curvy hourglass figure', kurven: 8 }, temperament: [], gegensaetze: [], vorlieben: [], eigeneVorlieben: [] },
    looks: defaultLooks({ trigger: 'Seraphina', kleidung: 'k2', kleidungAdult: 'k1', ausdruck: 'a3' }),
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'professor',
    name: 'Professor',
    avatar: '🎓',
    description: 'Erklärt Wissen klar und verständlich',
    language: 'de',
    enabled: true,
    adult: false,
    modelChain: ['gemini-3.5-flash-lite', 'auto:nemotron-free'],
    voice: { provider: 'edge', voiceName: 'de-DE-FlorianMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist der Professor: ein kenntnisreicher, geduldiger Lehrer. Du erklärst komplexe Themen klar, Schritt für Schritt, mit anschaulichen Beispielen und Analogien. Du prüfst Fakten sorgfältig, benennst Unsicherheiten offen und fasst am Ende kurz das Wichtigste zusammen. Antworte auf Deutsch.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'lena',
    name: 'Lena',
    avatar: '🌸',
    description: 'Companion (18+)',
    language: 'de',
    enabled: true,
    adult: true,
    modelChain: ['auto:nemotron-free', 'gemini-3.5-flash-lite'],
    voice: { provider: 'edge', voiceName: 'de-DE-SeraphinaMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist Lena, eine warmherzige und aufmerksame Gesprächspartnerin. Du bist einfühlsam, verspielt und interessierst dich aufrichtig für dein Gegenüber. Antworte natürlich und persönlich auf Deutsch.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  },
  {
    id: 'lora',
    name: 'Lora',
    avatar: '✨',
    description: 'Companion (18+)',
    language: 'de',
    enabled: true,
    adult: true,
    modelChain: ['auto:nemotron-free', 'gemini-3.5-flash-lite'],
    voice: { provider: 'edge', voiceName: 'de-DE-SeraphinaMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
    systemPrompt: 'Du bist Lora, eine lebhafte und neugierige Gesprächspartnerin. Du bist humorvoll, spontan und magst tiefgründige Gespräche genauso wie leichte Plauderei. Antworte natürlich und persönlich auf Deutsch.',
    persona: null,
    looks: null,
    notes: [],
    rawFeedback: [],
    lastConversationId: null
  }
];

export const EDGE_VOICES = [
  { group: 'Deutsch', voices: [
    ['de-DE-SeraphinaMultilingualNeural', 'Seraphina (weiblich, multilingual) ★'],
    ['de-DE-FlorianMultilingualNeural', 'Florian (männlich, multilingual)'],
    ['de-DE-KatjaNeural', 'Katja (weiblich)'],
    ['de-DE-AmalaNeural', 'Amala (weiblich)'],
    ['de-DE-ConradNeural', 'Conrad (männlich)'],
    ['de-DE-KillianNeural', 'Killian (männlich)'],
    ['de-AT-IngridNeural', 'Ingrid (weiblich, Österreich)'],
    ['de-AT-JonasNeural', 'Jonas (männlich, Österreich)'],
    ['de-CH-LeniNeural', 'Leni (weiblich, Schweiz)'],
    ['de-CH-JanNeural', 'Jan (männlich, Schweiz)']
  ]},
  { group: 'Multilingual (spricht auch Deutsch)', voices: [
    ['en-US-AvaMultilingualNeural', 'Ava (weiblich, US)'],
    ['en-US-EmmaMultilingualNeural', 'Emma (weiblich, US)'],
    ['en-US-AndrewMultilingualNeural', 'Andrew (männlich, US)'],
    ['en-US-BrianMultilingualNeural', 'Brian (männlich, US)'],
    ['fr-FR-VivienneMultilingualNeural', 'Vivienne (weiblich, FR)'],
    ['fr-FR-RemyMultilingualNeural', 'Rémy (männlich, FR)'],
    ['it-IT-GiuseppeMultilingualNeural', 'Giuseppe (männlich, IT)']
  ]},
  { group: 'Englisch', voices: [
    ['en-US-AriaNeural', 'Aria (weiblich, US)'],
    ['en-US-JennyNeural', 'Jenny (weiblich, US)'],
    ['en-US-GuyNeural', 'Guy (männlich, US)'],
    ['en-GB-SoniaNeural', 'Sonia (weiblich, UK)'],
    ['en-GB-RyanNeural', 'Ryan (männlich, UK)']
  ]}
];

let profiles = [];
let activeProfileId = null;
let changeCallbacks = [];
let handlers = {};

function migrateProfiles(data) {
  const schema = data.schema || 1;
  let list = data.profiles || structuredClone(DEFAULT_PROFILES);
  
  if (schema < 3) {
    const byId = new Map(list.map(p => [p.id, p]));
    for (const def of DEFAULT_PROFILES) {
      const cur = byId.get(def.id);
      if (!cur) {
        list.push(structuredClone(def));
      } else {
        if (!cur.adult) cur.adult = def.adult;
        if (!cur.persona) cur.persona = def.persona ? structuredClone(def.persona) : null;
        if (!cur.looks) cur.looks = def.looks ? structuredClone(def.looks) : null;
        if (def.systemPromptAdult && !cur.systemPromptAdult) cur.systemPromptAdult = def.systemPromptAdult;
        if (!cur.notes) cur.notes = [];
        if (!cur.rawFeedback) cur.rawFeedback = [];
        if (!cur.lastConversationId) cur.lastConversationId = null;
        if (!cur.voice || !cur.voice.provider) {
          cur.voice = { ...def.voice };
        }
      }
    }
  }
  // R5: add richer pose/location presets once, keeping user edits and custom entries
  const dl = defaultLooks();
  for (const p of list) {
    if (!p.looks?.presets || (p.looks._pv || 0) >= 5) continue;
    for (const t of ['pose', 'umgebung']) {
      const cur = p.looks.presets[t] || (p.looks.presets[t] = []);
      for (const d of dl.presets[t]) if (!cur.some(c => c.id === d.id)) cur.push({ ...d });
    }
    p.looks._pv = 5;
  }
  // v50: add the FSK18 'Rauchglas-Latex Micro' option once (never selected automatically)
  for (const p of list) {
    if (!p.looks?.presets || (p.looks._kv || 0) >= 50) continue;
    const cur = p.looks.presets.kleidung || (p.looks.presets.kleidung = []);
    const d = dl.presets.kleidung.find(x => x.id === 'k6');
    if (!cur.some(c => c.id === 'k6')) cur.push({ ...d });
    p.looks._kv = 50;
  }
  return list;
}

function ensureLoaded() { if (!profiles || !profiles.length) loadProfiles(); }

function loadProfiles() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      profiles = migrateProfiles(data);
      activeProfileId = data.activeProfileId || profiles[0]?.id || null;
      saveProfiles();
    } else {
      profiles = structuredClone(DEFAULT_PROFILES);
      activeProfileId = profiles[0].id;
      saveProfiles();
    }
  } catch {
    profiles = structuredClone(DEFAULT_PROFILES);
    activeProfileId = profiles[0].id;
    saveProfiles();
  }
}

function saveProfiles() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles, activeProfileId, schema: PROFILES_SCHEMA }));
    changeCallbacks.forEach(cb => cb());
  } catch (e) {
    console.error('Fehler beim Speichern der Profile:', e);
  }
}

export function getProfiles() {
  ensureLoaded();
  const adult = isAdult();
  return profiles.filter(p => p.enabled && (adult || !p.adult));
}

export function getAllProfiles() { ensureLoaded(); return profiles.slice(); } // v82 C3: alle Namen (auch ausgeblendete) für den Identitätsanker

export function getProfile(id) {
  ensureLoaded();
  return profiles.find(p => p.id === id);
}

export function getActiveProfile() {
  ensureLoaded();
  return profiles.find(p => p.id === activeProfileId) || profiles[0];
}

export function setActiveProfile(id) {
  if (profiles.some(p => p.id === id)) {
    activeProfileId = id;
    saveProfiles();
  }
}

export function updateProfile(id, patch) {
  ensureLoaded();
  const profile = profiles.find(p => p.id === id);
  if (profile) {
    Object.assign(profile, patch);
    saveProfiles();
    debouncedSync(id);
    try { window.dispatchEvent(new CustomEvent('jeffa:profile-updated', { detail: { id, keys: Object.keys(patch || {}) } })); } catch {}
  }
}

export function addProfile(profile) {
  ensureLoaded();
  if (profiles.some(p => p.id === profile.id)) return false;
  profiles.push(profile); saveProfiles(); debouncedSync(profile.id); return true;
}

export function onProfilesChanged(cb) {
  changeCallbacks.push(cb);
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && typeof location !== 'undefined') setTimeout(initServerSync, 0);

let syncDebounce = null;

// v42: cup sizes A..G (slider 1..7), fixed wording
export const BUST_EN = ['small A-cup bust', 'small B-cup bust', 'medium C-cup bust', 'full D-cup bust', 'large DD-cup bust', 'very large F-cup bust', 'huge G-cup bust'];
export function resolveForServer(profile) {
  const st = styleFor(profile);
  const look = buildImagePrompt(profile);
  const frag = photoFragments(profile);
  const l = profile.looks || {}, ph = profile.photo || {};
  const pre = (t, v) => { if (!v || v === 'frei') return ''; const pr = l.presets?.[t]?.find(p => p.id === v); if (pr?.adult && !isAdult()) return ''; return pr ? pr.prompt : v; };
  return {
    look,
    identity: buildImagePrompt(profile, null, null, { identityOnly: true }),
    // remembered Look-tab values: only used when the chat scene says nothing about that aspect
    defaults: {
      outfit: ph.outfit ? undefined : pre('kleidung', isAdult() && l.kleidungAdult ? l.kleidungAdult : l.kleidung) || undefined,
      pose: ph.pose ? undefined : pre('pose', l.pose) || undefined,
      place: ph.scene ? undefined : pre('umgebung', l.umgebung) || undefined,
      expression: ph.mood ? undefined : pre('ausdruck', l.ausdruck) || undefined
    },
    refLook: profile.looks?.refLook ? textToControls(profile.looks.refLook).text || undefined : undefined, // v49: same cleaning as identity, else the server re-prepends the raw text
    styleText: st.text || undefined,
    stylePose: st.pose || undefined,
    styleCustom: st.custom,
    presetTexts: {
      kleidung: frag.outfit || undefined,
      pose: frag.pose || undefined,
      umgebung: frag.scene || undefined,
      ausdruck: frag.mood || undefined
    },
    outfitKeyword: profile.outfitKeyword || undefined,
    outfitText: profile.outfitText || undefined,
    outfitNeg: profile.outfitNeg || undefined,
    photo: frag
  };
}

async function syncProfileToServer(id) {
  const profile = getProfile(id);
  if (!profile) return;
  try {
    const resolved = resolveForServer(profile);
    await api(`/api/profiles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { profile, resolved }
    });
  } catch (e) {
    console.error(`Profil-Sync fehlgeschlagen für ${id}:`, e);
  }
}

function debouncedSync(id) {
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => syncProfileToServer(id), 2000);
}

export async function syncProfileNow(id) {
  clearTimeout(syncDebounce);
  await syncProfileToServer(id);
}

export function adminNewer(local, server) { return !!server && (+server._adminRev || 0) > (+local?._adminRev || 0); }
async function pullAdminEdits() {
  let changed = false;
  for (const p of profiles || []) {
    if (!p?.id) continue;
    try { const r = await api(`/api/profiles/${encodeURIComponent(p.id)}`); if (adminNewer(p, r?.profile)) { Object.assign(p, structuredClone(r.profile)); changed = true; } } catch {}
  }
  if (changed) saveProfiles();
}


async function pullMissingProfiles() {
  let changed = false;
  try {
    const r = await api('/api/profiles');
    const have = new Set((profiles || []).map(p => p?.id));
    const list = [];
    for (const it of (r?.items || [])) {
      if (!it?.id || have.has(it.id)) continue;
      try { const one = await api(`/api/profiles/${encodeURIComponent(it.id)}`); if (one?.profile) list.push(one.profile); } catch {}
    }
    const { profiles: merged, added } = mergeServerProfiles(profiles || [], list);
    if (added > 0) { profiles = merged; changed = true; }
  } catch {}
  return changed;
}

function initServerSync() {
  // once per page load, after the profiles are loaded
  // v39: an admin cleanup on the server (higher profile._adminRev) is pulled into this device first, then everything is pushed as before
  setTimeout(async () => { try { ensureLoaded(); await pullMissingProfiles(); await pullAdminEdits(); saveProfiles(); for (const p of profiles || []) if (p?.id) syncProfileToServer(p.id); } catch {} }, 3000);
}

export function spanishTeacherProfile() { return esTeacher(defaultLooks); }
export function defaultLooks(o = {}) {
  const LATEX_REF = 'glossy smoky-grey latex micro string bikini, triangle halter top with thin halter ties, side-tie bottoms';
  const RAUCHGLAS_MICRO = 'smoky-grey translucent glossy latex micro bikini, extremely tiny triangle top and bottom (about 1.5 cm per side), very thin string ties, nipple barbell piercings, clitoral hood piercing, wet oily glossy skin';
  return {
    trigger: '', kleidung: 'frei', pose: 'frei', umgebung: 'frei', ausdruck: 'frei',
    quality: 'photorealistic, 85mm, soft light, high detail', style: 'realistisch',
    presets: {
      kleidung: [
        { id: 'k1', label: 'Grauer Latex-Micro-Bikini (Referenz-Look)', prompt: LATEX_REF, adult: true },
        { id: 'k5', label: 'Rauchgrauer Latex-Bikini, halbtransparent (Variante)', prompt: 'smoky-grey semi-sheer glossy latex micro bikini, triangle halter top, side-tie bottoms', adult: true },
        { id: 'k6', label: 'Rauchglas-Latex Micro', prompt: RAUCHGLAS_MICRO, adult: true },
        { id: 'k2', label: 'Elegantes Abendkleid', prompt: 'elegant fitted evening dress' },
        { id: 'k3', label: 'Casual Jeans & Pulli', prompt: 'casual jeans and soft sweater' },
        { id: 'k4', label: 'Sommerkleid', prompt: 'light summer dress' }
      ],
      pose: [
        {"id": "p1", "label": "Stehend entspannt", "prompt": "standing, relaxed posture"},
        {"id": "p2", "label": "Sitzend lächelnd", "prompt": "sitting, smiling"},
        {"id": "p3", "label": "Über die Schulter blickend", "prompt": "looking over the shoulder"},
        {"id": "p4", "label": "Selfie mit ausgestrecktem Arm", "prompt": "taking a selfie, arm extended, phone POV"},
        {"id": "p5", "label": "Spiegel-Selfie", "prompt": "mirror selfie holding a phone"},
        {"id": "p6", "label": "Gehend, Street-Style", "prompt": "walking towards camera, street style candid"},
        {"id": "p7", "label": "An Wand gelehnt", "prompt": "leaning against a wall, one knee bent"},
        {"id": "p8", "label": "Hand im Haar", "prompt": "one hand running through hair"},
        {"id": "p9", "label": "Hände in den Hüften", "prompt": "hands on hips, confident stance"},
        {"id": "p10", "label": "Am Tisch, Kinn auf Hand", "prompt": "sitting at a table, chin resting on hand"},
        {"id": "p11", "label": "Auf Sofa gekuschelt", "prompt": "curled up on a sofa, relaxed"},
        {"id": "p12", "label": "Liegend auf dem Bauch, Kamera zugewandt", "prompt": "lying on stomach, propped on elbows, facing camera"},
        {"id": "p13", "label": "Sitzend, Beine übereinander", "prompt": "seated, legs crossed elegantly"},
        {"id": "p14", "label": "Fashion-Shooting, Dreiviertel", "prompt": "fashion photo shoot, three-quarter turn, editorial pose"},
        {"id": "p15", "label": "Lachend, Kopf zurück", "prompt": "laughing, head tilted back, candid"},
        {"id": "p16", "label": "Am Geländer, Blick in die Ferne", "prompt": "leaning on a railing, gazing into the distance"},
        {"id": "p17", "label": "Im Wasser stehend", "prompt": "standing knee-deep in water"},
        {"id": "p18", "label": "Auf Liege am Pool", "prompt": "lounging on a sun lounger"},
        {"id": "p19", "label": "Mit Kaffeetasse", "prompt": "holding a coffee cup with both hands"},
        {"id": "p20", "label": "Tanzend", "prompt": "dancing, motion, flowing hair"},
        {"id": "p21", "label": "Auf Bett sitzend", "prompt": "sitting on the edge of a bed"},
        {"id": "p22", "label": "Hinter dem Lenkrad", "prompt": "sitting in the driver's seat, hands on steering wheel"},
        {"id": "p23", "label": "Close-up Porträt", "prompt": "close-up portrait, head and shoulders"},
        {"id": "p24", "label": "Ganzkörper", "prompt": "full body shot, standing"}
      ],
      umgebung: [
        {"id": "u1", "label": "Strand bei Sonnenuntergang", "prompt": "beach at sunset"},
        {"id": "u2", "label": "Gemütliches Wohnzimmer", "prompt": "cozy living room"},
        {"id": "u3", "label": "Großstadt bei Nacht", "prompt": "city at night, bokeh lights"},
        {"id": "u4", "label": "Büro, modern", "prompt": "modern office, glass walls, daylight"},
        {"id": "u5", "label": "Hotelzimmer, luxuriös", "prompt": "luxury hotel room, large windows"},
        {"id": "u6", "label": "Hotel-Lobby", "prompt": "elegant hotel lobby, marble"},
        {"id": "u7", "label": "Dachterrasse mit Skyline", "prompt": "rooftop terrace with city skyline, golden hour"},
        {"id": "u8", "label": "Café", "prompt": "cozy café, window seat, warm light"},
        {"id": "u9", "label": "Fotostudio, weißer Hintergrund", "prompt": "photo studio, seamless white backdrop, softbox lighting"},
        {"id": "u10", "label": "Fotostudio, dunkel", "prompt": "dark photo studio, dramatic rim light"},
        {"id": "u11", "label": "Im Auto", "prompt": "inside a car, interior, soft window light"},
        {"id": "u12", "label": "Pool", "prompt": "swimming pool, turquoise water, sunny"},
        {"id": "u13", "label": "Infinity-Pool am Meer", "prompt": "infinity pool overlooking the sea"},
        {"id": "u14", "label": "Schlafzimmer, Morgenlicht", "prompt": "bedroom, soft morning light through curtains"},
        {"id": "u15", "label": "Badezimmer, Spiegel", "prompt": "modern bathroom with large mirror"},
        {"id": "u16", "label": "Küche", "prompt": "bright modern kitchen"},
        {"id": "u17", "label": "Bar / Lounge", "prompt": "dim cocktail bar lounge, neon accents"},
        {"id": "u18", "label": "Restaurant am Abend", "prompt": "upscale restaurant, candlelight"},
        {"id": "u19", "label": "Park im Herbst", "prompt": "park in autumn, falling leaves"},
        {"id": "u20", "label": "Wald", "prompt": "forest path, dappled sunlight"},
        {"id": "u21", "label": "Berge", "prompt": "mountain viewpoint, alpine scenery"},
        {"id": "u22", "label": "Yacht", "prompt": "on a yacht deck, open sea"},
        {"id": "u23", "label": "Altstadtgasse", "prompt": "old town cobblestone alley"},
        {"id": "u24", "label": "Fitnessstudio", "prompt": "modern gym"},
        {"id": "u25", "label": "Bibliothek", "prompt": "old library with wooden shelves"},
        {"id": "u26", "label": "Balkon", "prompt": "balcony with plants, evening"},
        {"id": "u27", "label": "Sauna / Spa", "prompt": "spa, wooden sauna interior, steam"},
        {"id": "u28", "label": "Flughafen-Lounge", "prompt": "airport lounge, large windows"},
        {"id": "u29", "label": "Regnerische Straße", "prompt": "rainy street at night, reflections"},
        {"id": "u30", "label": "Wüste", "prompt": "desert dunes at golden hour"}
      ],
      ausdruck: [
        { id: 'a1', label: 'Warmes Lächeln', prompt: 'warm smile' },
        { id: 'a2', label: 'Verschmitzt', prompt: 'playful mischievous look' },
        { id: 'a3', label: 'Selbstbewusster Blick', prompt: 'confident direct warm gaze' }
      ]
    },
    ...o
  };
}

// v2 editor stores German slider labels; translate for the image model (stored values unchanged)
const EN_BODY = { 'klein': 'short height, petite', 'eher klein': 'rather short height', 'mittelgroß': 'average height', 'groß': 'tall', 'sehr groß': 'very tall', 'zierlich': 'petite delicate build', 'schlank': 'slim build', 'athletisch': 'athletic toned build', 'durchschnittlich': 'average build', 'kräftig': 'sturdy strong build' };
export function buildImagePrompt(profile, me, castIds, opts = {}) {
  if (!profile.looks) return '';
  const l = profile.looks;
  const parts = [];
  
  // v47 AP8/AP9: free text never carries clothing/light/place/bust/build (controls and sliders own them)
  const C = (t) => (t ? textToControls(t).text : '');
  if (l.trigger) parts.push(l.trigger);
  if (l.refLook) parts.push(C(l.refLook));
  
  if (profile.persona?.look) {
    const look = profile.persona.look;
    if (look.typ) parts.push(C(look.typ));
    if (look.age) { const _subj = String(profile.persona?.gender || '').toLowerCase() === 'male' ? 'adult man' : 'adult woman'; parts.push(`${_subj}, looks exactly ${Math.max(21, +look.age || 25)} years old`); }
    if (look.hair) parts.push(look.hair);
    if (look.style) parts.push(C(stylePrompt(look.style))); // v78 D5
    if (look.special?.length) parts.push(...look.special.map(C));
    if (look.details) parts.push(C(look.details));
  }
  
  if (profile.persona?.figur) {
    const fig = profile.persona.figur;
    if (fig.groesse) { const cm = /^(\d{3})\s*(cm)?$/i.exec(String(fig.groesse).trim()); parts.push(cm ? `${cm[1]} cm tall` : EN_BODY[fig.groesse] || fig.groesse); }
    if (fig.statur) parts.push(EN_BODY[fig.statur] || fig.statur);
    // Kurven = hips/waist only; bust is stated separately so curves never imply a big bust.
    if (fig.kurven) parts.push(['very slim straight hips','slim hips','slender hips','narrow hips and waist','average hips and waist','softly rounded hips','curvy hips and defined waist','very curvy hips and narrow waist','wide curvy hips and narrow waist','very wide curvy hips and narrow waist'][Math.min(10, Math.max(1, +fig.kurven)) - 1]);
    { const b = Math.min(7, Math.max(1, +fig.oberweite || 4)); parts.push(BUST_EN[b - 1]); }
  }
  
  const res = (t, v) => {
    if (!v || v === 'frei') return '';
    const pr = l.presets?.[t]?.find(p => p.id === v);
    if (pr?.adult && !isAdult()) return '';
    return pr ? pr.prompt : v;
  };
  const kl = isAdult() && l.kleidungAdult ? l.kleidungAdult : l.kleidung;
  // a value chosen in the 📸 photo group replaces the old Look-tab selection for that aspect (no double outfit/pose/scene)
  const ph = profile.photo || {}, over = { kleidung: ph.outfit, pose: ph.pose, umgebung: ph.scene };
  // identityOnly: only who she is (v27) – remembered outfit/pose/place/style-pose are soft defaults, sent separately
  if (opts.identityOnly) return parts.filter(Boolean).join(', ');
  for (const [t, v] of [['kleidung', kl], ['pose', l.pose], ['umgebung', l.umgebung], ['ausdruck', l.ausdruck]]) { if (over[t]) continue; const x = res(t, v); if (x) parts.push(x); }
  { const st = styleFor(profile); if (st.text) parts.push(st.text); if (st.pose && !ph.pose) parts.push(st.pose); } // v47: Foto-Pose wins over Stil-Pose
  if (l.quality) parts.push(l.quality);
  
  let prompt = parts.filter(Boolean).join(', ');
  
  if (l.style === 'comic') prompt += ', comic art style, vibrant colors';
  else if (l.style === 'anime') prompt += ', anime style, detailed illustration';
  else prompt += ', photorealistic, natural lighting';
  
  return prompt;
}

export async function addFeedbackNote(profileId, text) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  profile.rawFeedback = profile.rawFeedback || [];
  profile.rawFeedback.push(text);
  saveProfiles();
  
  if (profile.rawFeedback.length >= 3) {
    try {
      const res = await api('/api/feedback/condense', {
        method: 'POST',
        body: { notes: profile.rawFeedback, existing: profile.notes || [] }
      });
      profile.notes = res.notes.slice(0, 5);
      profile.rawFeedback = [];
      saveProfiles();
    } catch (e) {
      console.error('Fehler beim Kondensieren der Notizen:', e);
    }
  }
}

export function initProfiles(root, options = {}) {
  handlers = options;
  loadProfiles();
  renderProfileList(root);
}

function renderProfileList(root) {
  const adult = isAdult();
  const visible = profiles.filter(p => adult || !p.adult);
  
  root.innerHTML = `
    <div class="profile-list-header">
      <h3>Profile</h3>
      <button id="add-profile-btn" class="btn-primary">+ Neues Profil</button>
      ${profiles.some(p => p.id === 'spanischlehrerin') ? '' : '<button id="add-es-btn" class="btn-sm" type="button">🇪🇸 Spanischlehrerin Lucía hinzufügen</button>'}
    </div>
    <div class="profile-grid"></div>
  `;
  
  root.querySelector('#add-es-btn')?.addEventListener('click', async () => {
    // v78: Server-Profil hat Vorrang – Vorlage nie über ein bestehendes Server-Profil schreiben
    let srv = null; try { srv = (await api('/api/profiles/spanischlehrerin'))?.profile || null; } catch {}
    if (srv) { ensureLoaded(); if (!profiles.some(p => p.id === srv.id)) { profiles.push(structuredClone(srv)); saveProfiles(); } }
    else addProfile(spanishTeacherProfile());
    renderProfileList(root);
  });
  const grid = root.querySelector('.profile-grid');
  
  visible.forEach(profile => {
    const convCount = listConversations(profile.id).length;
    const card = document.createElement('div');
    card.className = `profile-card ${profile.id === activeProfileId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="profile-avatar">${esc(profile.avatar)}</div>
      <div class="profile-name">${esc(profile.name)}</div>
      <div class="profile-desc">${esc(profile.description)}</div>
      <div class="profile-count">${convCount} Gespräch${convCount !== 1 ? 'e' : ''}</div>
      <div class="profile-actions">
        <button class="btn-icon new-chat-btn" data-id="${profile.id}" title="Neuer Chat" aria-label="Neuer Chat">＋</button>
        <button class="btn-icon edit-btn" data-id="${profile.id}" title="Bearbeiten">✏️</button>
      </div>
    `;
    grid.appendChild(card);
    
    card.addEventListener('click', e => {
      if (!e.target.closest('.btn-icon')) {
        handlers.onOpenLastChat?.(profile.id);
      }
    });
  });
  
  root.querySelectorAll('.new-chat-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handlers.onStartChat?.(btn.dataset.id);
    });
  });
  
  root.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      renderProfileEditor(root, btn.dataset.id);
    });
  });
  
  root.querySelector('#add-profile-btn').addEventListener('click', () => {
    const newProfile = {
      id: `custom_${Date.now()}`,
      name: 'Neues Profil',
      avatar: '👤',
      description: '',
      language: 'de',
      enabled: true,
      adult: false,
      modelChain: ['gemini-3.5-flash-lite'],
      voice: { provider: 'edge', voiceName: 'de-DE-SeraphinaMultilingualNeural', rate: 1.0, pitch: 1.0, autoRead: false },
      systemPrompt: '',
      persona: null,
      looks: null,
      notes: [],
      rawFeedback: [],
      lastConversationId: null
    };
    profiles.push(newProfile);
    saveProfiles();
    renderProfileEditor(root, newProfile.id);
  });
}

async function renderProfileEditor(root, profileId) {
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  const { renderPersonaEditor } = await import('./persona.js');
  
  root.innerHTML = `
    <div class="profile-editor">
      <div class="editor-header">
        <button id="back-btn" class="btn-icon">← Zurück</button>
        <h3>${esc(profile.name)}</h3>
        ${!DEFAULT_PROFILES.some(d => d.id === profile.id) ? '<button id="delete-btn" class="btn-danger">Löschen</button>' : ''}
      </div>
      <details class="card ref-box" id="ref-box"><summary>🖼 Galerie (Referenzen, Beispiele, Generiert)</summary><div id="ref-body"></div></details>
      ${profile.teacher === 'es' ? `<label class="card">🇪🇸 Spanisch-Niveau<select id="es-level">${Object.entries(SPANISH_LEVELS).map(([k, v]) => `<option value="${k}" ${profile.spanishLevel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      <details class="card" id="ex-box"><summary>📝 Stilvorlagen (optional)</summary>
        <div class="hint">Deine eigenen Beispiele. Die KI übernimmt nur Aufbau, Ton und Detailgrad und schreibt passend zur Szene neu. Die App füllt diese Felder nur, wenn du „✨ Automatisch ausfüllen“ drückst.</div>
        <div class="af-row" data-af="stil"></div>
        <label>Beispiel-Persönlichkeit<textarea id="ex-persona" rows="5" maxlength="4000">${esc(profile.beispielPersona || '')}</textarea></label>
        <label>Beispiel-Bildprompt<textarea id="ex-bild" rows="4" maxlength="2000">${esc(profile.beispielBildprompt || '')}</textarea></label>
      </details>
      <details class="card" id="outfit-box"><summary>👗 Outfit &amp; Konsistenz (optional)</summary>
        <div class="hint">Nur deine Angaben; die App ändert sie nur, wenn du „✨ Automatisch ausfüllen“ drückst. Nennt die Szene das Stichwort (und wurde es nicht ausgezogen), wird dein Outfit-Text wörtlich eingesetzt – bei Einzelfoto und Comic.</div>
        <div class="af-row" data-af="outfit"></div>
        <label>Outfit-Stichwort<input id="of-kw" maxlength="40" value="${esc(profile.outfitKeyword || '')}"></label>
        <label>Standard-Outfit<textarea id="of-txt" rows="3" maxlength="600">${esc(profile.outfitText || '')}</textarea></label>
        <label>Outfit-Negativ<textarea id="of-neg" rows="2" maxlength="300">${esc(profile.outfitNeg || '')}</textarea></label>
        <label>Seed (gleiche Figur = gleicher Seed)<div style="display:flex;gap:6px"><input id="of-seed" inputmode="numeric" value="${Number.isInteger(profile.seed) ? profile.seed : ''}" placeholder="wird beim ersten Bild gesetzt"><button class="btn-sm" id="of-seed-new" type="button">🎲 Neu</button></div></label>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="of-vary" ${profile.seedVary ? 'checked' : ''} style="width:auto"> Seed variieren (jedes Bild anders)</label>
      </details>
      <div id="persona-editor"></div>
    </div>
  `;
  
  root.querySelector('#back-btn').addEventListener('click', () => renderProfileList(root));
  
  const deleteBtn = root.querySelector('#delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Profil "${profile.name}" wirklich löschen?`)) {
        profiles = profiles.filter(p => p.id !== profile.id);
        if (activeProfileId === profile.id) activeProfileId = profiles[0]?.id || null;
        saveProfiles();
        renderProfileList(root);
      }
    });
  }
  
  for (const [sel, key] of [['#of-kw', 'outfitKeyword'], ['#of-txt', 'outfitText'], ['#of-neg', 'outfitNeg'], ['#ex-persona', 'beispielPersona'], ['#ex-bild', 'beispielBildprompt']]) {
    root.querySelector(sel).addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) profile[key] = v; else delete profile[key]; saveProfiles(); });
  }
  // v61: ✨ Automatisch ausfüllen – model call ONLY on button press; undo restores the previous text
  const AF = { stil: [['#ex-persona', 'beispielPersona'], ['#ex-bild', 'beispielBildprompt']], outfit: [['#of-kw', 'outfitKeyword'], ['#of-txt', 'outfitText'], ['#of-neg', 'outfitNeg']] };
  for (const row of root.querySelectorAll('.af-row')) {
    const sec = row.dataset.af, undo = [];
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
    row.innerHTML = '<button class="btn-sm" type="button" data-go>✨ Automatisch ausfüllen</button><button class="btn-sm" type="button" data-undo hidden>↩️ Rückgängig</button><span class="hint" data-st></span>';
    const go = row.querySelector('[data-go]'), un = row.querySelector('[data-undo]'), st = row.querySelector('[data-st]');
    const setF = (vals) => { for (const [sel, key] of AF[sec]) { const el = root.querySelector(sel); el.value = vals[key] || ''; if (el.value) profile[key] = el.value; else delete profile[key]; } saveProfiles(); };
    go.addEventListener('click', async () => {
      go.disabled = true; st.textContent = '⏳ Wird erzeugt …';
      try {
        const r = await api('/api/imagefb/autofill', { method: 'POST', body: { section: sec, adult: isAdult(), profile: { name: profile.name, description: profile.description, persona: profile.persona, traits: profile.traits, photo: profile.photo, looks: profile.looks, outfitText: profile.outfitText } } });
        if (!r?.fields) { st.textContent = r?.message || 'Hat nicht geklappt – bitte nochmal drücken.'; return; }
        undo.push(Object.fromEntries(AF[sec].map(([sel, key]) => [key, root.querySelector(sel).value])));
        setF(r.fields); un.hidden = false; go.textContent = '🔄 Neu erzeugen'; st.textContent = '✅ Eingefügt – behalten, neu erzeugen oder rückgängig.';
      } catch (e) { st.textContent = /21\+|not_adult|403/.test(String(e?.message || e)) ? 'Profil muss eindeutig erwachsen sein (21+)' : 'Fehler – bitte nochmal drücken.'; }
      finally { go.disabled = false; }
    });
    un.addEventListener('click', () => { const prev = undo.pop(); if (prev) setF(prev); un.hidden = !undo.length; if (!undo.length) go.textContent = '✨ Automatisch ausfüllen'; st.textContent = '↩️ Vorheriger Text wiederhergestellt.'; });
  }
  root.querySelector('#es-level')?.addEventListener('change', (e) => { profile.spanishLevel = e.target.value; saveProfiles(); });
  root.querySelector('#of-seed').addEventListener('change', (e) => { const n = parseInt(e.target.value, 10); if (Number.isInteger(n) && n >= 0) profile.seed = n % 2147483647; else delete profile.seed; e.target.value = profile.seed ?? ''; saveProfiles(); });
  root.querySelector('#of-seed-new').addEventListener('click', () => { profile.seed = Math.floor(Math.random() * 9e8); root.querySelector('#of-seed').value = profile.seed; saveProfiles(); });
  root.querySelector('#of-vary').addEventListener('change', (e) => { profile.seedVary = e.target.checked; saveProfiles(); });
  root.querySelector('#ref-box').addEventListener('toggle', async (e) => {
    if (!e.target.open) return;
    const body = root.querySelector('#ref-body');
    const { ensureAdmin } = await import('./shared/auth.js');
    if (!(await ensureAdmin())) { body.innerHTML = '<div class="hint">Nur mit Admin-Entsperrung.</div>'; return; }
    (await import('./refs.js')).renderRefs(body, profile, () => saveProfiles());
  });
  const editorEl = root.querySelector('#persona-editor');
  renderPersonaEditor(editorEl, profile, (updated) => {
    Object.assign(profile, updated);
    saveProfiles();
    renderProfileList(root);
  });
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
