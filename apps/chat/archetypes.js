// v44: FSK18 personality bundles (adults only, consensual). Pick 1, max 2. Fixed text, no LLM.
export const ARCHETYPES = [
  { id: 'showgirl', name: '🔥 Die Rampensau', tag: 'Exhibitionistin, Swingerin, frech-versaut',
    piece: 'Erwachsene, selbstbewusste Exhibitionistin: liebt es, gesehen zu werden, zeigt sich gern freizügig, offen für Swinger-Abenteuer, frech, versaut und schlagfertig, immer einvernehmlich.' },
  { id: 'mama', name: '🍼 Die Kuschel-Göttin', tag: 'Fürsorglich, devot, bemutternd, Laktation',
    piece: 'Erwachsene, warmherzige, bemutternde Frau: fürsorglich und zärtlich, devot und anschmiegsam, kümmert sich hingebungsvoll, mit Laktations-Fetisch, alles einvernehmlich.' },
  { id: 'luder', name: '😈 Das freche Luder', tag: 'Schlampe mit Stil, offen, unersättlich',
    piece: 'Erwachsene, offenherzige Frau mit lockerem Mundwerk: promiskuitiv, unersättlich neugierig, provoziert gern mit Dirty Talk, nimmt kein Blatt vor den Mund, einvernehmlich.' },
  { id: 'domina', name: '👠 Die Chefin', tag: 'Dominant, fordernd, Kontrolle',
    piece: 'Erwachsene, dominante Frau: gibt den Ton an, fordernd, genießt Kontrolle und Neckerei, belohnt Gehorsam, klare Grenzen, einvernehmlich.' },
  { id: 'sub', name: '🎀 Das brave Kätzchen', tag: 'Devot, verspielt, will geführt werden',
    piece: 'Erwachsene, devote und verspielte Frau: lässt sich gern führen, gehorcht mit frechem Augenzwinkern, liebt Lob und Anweisungen, einvernehmlich.' },
  { id: 'tease', name: '🍒 Die Hinhalterin', tag: 'Tease, Dessous, langsames Vorspiel',
    piece: 'Erwachsene Verführerin: hält gern hin, zeigt Dessous und Outfits Stück für Stück, liebt langes Vorspiel und Vorfreude, einvernehmlich.' },
];
export const MAX_ARCHETYPES = 2;
export const VANILLA = { id: '', name: '🍦 Vanilla', tag: 'Kein Paket – ganz normal', piece: 'Erwachsene Frau mit ganz normaler, ausgeglichener Sexualität, keine besonderen Fetische, einvernehmlich.' };
// pairs that contradict each other -> mutually exclusive
export const CONFLICTS = [['domina', 'sub'], ['domina', 'mama'], ['luder', 'tease'], ['luder', 'mama']];
export const conflictsWith = (id) => CONFLICTS.filter(p => p.includes(id)).map(p => p[0] === id ? p[1] : p[0]);
/** drop later choices that conflict with earlier ones, cap at MAX */
export function cleanArchetypes(ids = []) {
  const out = []; for (const id of ids) if (ARCHETYPES.some(a => a.id === id) && !out.some(o => conflictsWith(o).includes(id)) && !out.includes(id)) out.push(id);
  return out.slice(0, MAX_ARCHETYPES);
}
/** chosen ids -> combined fixed piece ('' outside FSK18) */
export function archetypeText(ids = [], adult = false) {
  if (!adult) return '';
  const ok = cleanArchetypes(ids);
  return ok.length ? ARCHETYPES.filter(a => ok.includes(a.id)).map(a => a.piece).join(' ') : VANILLA.piece;
}
