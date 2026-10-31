// Style presets for the Look tab: built-in (some FSK18-only) + user-defined "Eigener Stil" (stored locally per user/device).
import { isAdult } from './shared/fsk.js';
import { mergeStyles } from './shared/styles-sync.js';
const KEY = 'jeffa.styles';
export const BUILTIN_STYLES = [
  {
    id: 's_glossy_ww', adult: true, label: 'Glossy Latex / Wicked-Weasel-Bikini',
    desc: 'Volle Oberweite, betonte Seitenlinie, sehr knapper Micro-Bikini im Wicked-Weasel-Stil oder eng anliegendes graues, halbtransparentes Latex mit glänzenden Lichtreflexen.',
    prompt: 'full bust, accentuated side and under-bust line, very skimpy Wicked-Weasel-style micro bikini or tight grey semi-sheer latex outfit tracing every contour, semi-sheer, wet look, clinging, glossy latex, shiny surface with light reflections',
    poses: [
      { id: 'g1', label: 'Seitlich zur Kamera, ein Arm hinter dem Kopf, Rücken leicht durchgedrückt', prompt: 'side view to camera, one arm behind head, back slightly arched' },
      { id: 'g2', label: 'Kniend auf dem Bett, Hände an den Oberschenkeln, Blick von unten in die Kamera', prompt: 'kneeling on bed, hands on thighs, looking up into the camera' },
      { id: 'g3', label: 'Über die Schulter schauend, Hüfte ausgestellt, Latex glänzt im Gegenlicht', prompt: 'looking over the shoulder, hip pushed out, latex gleaming in backlight' },
      { id: 'g4', label: 'Auf dem Rücken liegend, Arme über dem Kopf ausgestreckt, Kamera von oben', prompt: 'lying on her back, arms stretched above head, camera from above' },
      { id: 'g5', label: 'An die Wand gelehnt, ein Knie angewinkelt, Daumen im Bikinibändchen eingehakt', prompt: 'leaning against a wall, one knee bent, thumb hooked in bikini string' },
      { id: 'g6', label: 'Nass aus dem Pool steigend, Bikini verrutscht leicht, Wassertropfen auf der Haut', prompt: 'climbing wet out of the pool, bikini slightly shifted, water droplets on skin' },
    ],
  },
];
export function getCustomStyles() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveCustomStyles(list) { localStorage.setItem(KEY, JSON.stringify(list)); pushSoon(); }
// Cross-device sync via /api/styles (D1). An explicit save replaces the server list; on load, server-only styles are added locally (local text always wins).
let pushT = null;
function pushSoon() { clearTimeout(pushT); pushT = setTimeout(() => pushStyles().catch(() => {}), 800); }
async function pushStyles() { const { api } = await import('./shared/api.js'); await api('/api/styles', { method: 'PUT', body: { items: getCustomStyles() } }); }
export async function syncCustomStyles() {
  try {
    const { api } = await import('./shared/api.js');
    const r = await api('/api/styles');
    const local = getCustomStyles(), merged = mergeStyles(local, r.items);
    if (merged.length !== local.length) localStorage.setItem(KEY, JSON.stringify(merged));
    if (merged.length !== (r.items || []).length) await pushStyles();
    return merged;
  } catch { return null; } // offline / not logged in: local list keeps working
}
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') setTimeout(() => { syncCustomStyles(); }, 2500);
export function availableStyles(profile) {
  const adult = isAdult(); // FSK18 mode only
  return [...BUILTIN_STYLES.filter(s => !s.adult || adult), ...getCustomStyles().map(s => ({ ...s, custom: true }))];
}
// -> { text, pose, custom } for the profile's selected style; custom = user entered own prompt (takes precedence over auto-compose)
export function styleFor(profile) {
  const l = profile?.looks || {}; if (!l.stylePreset) return { text: '', pose: '', custom: false };
  const s = availableStyles(profile).find(x => x.id === l.stylePreset); if (!s) return { text: '', pose: '', custom: false };
  const pose = (s.poses || []).find(p => p.id === l.stylePose)?.prompt || '';
  return { text: String(s.prompt || '').trim(), pose, custom: !!s.custom && !!String(s.prompt || '').trim(), label: s.label };
}
