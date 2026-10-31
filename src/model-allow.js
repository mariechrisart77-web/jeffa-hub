// v85a: reine Allowlist-/URL-Helfer für Server (Node-testbar, keine Netzaufrufe).
// WICHTIG: nur Modell-IDs/URLs – niemals Schlüssel.

const MODEL_RX = /^[a-z0-9\-_.\/:@]+$/i;
const PREFIX_RX = /^(venice-|venice:|gemini-|groq:|mistral:|grok-)/;
const FREE_SUFFIX_RX = /:free$/;

/** Akzeptiert nur Modell-IDs, die über eigene Keys laufen (Venice/Gemini/Groq/Mistral/Grok) oder :free. */
export function validComposerModel(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.length > 80 || !MODEL_RX.test(s)) return '';
  if (PREFIX_RX.test(s) || FREE_SUFFIX_RX.test(s)) return s;
  return '';
}

/** Upstream-URL-Bau (v85a): grok (xAI) wie die anderen eigenen Provider ohne eigenen Pfad-Präfix.
 *  Für alle anderen Provider exakt wie bisher. */
export function upstreamUrl(providerId, root, path) {
  const id = String(providerId || '');
  if (id === 'venice' || id === 'groq' || id === 'mistral' || id === 'grok') return `${root}/${path}`;
  return `${root}/${id}/${path}`;
}
