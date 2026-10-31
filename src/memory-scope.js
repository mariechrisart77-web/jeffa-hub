// v82 C3: Gedächtnis-Scope und Profil-Filter (rein, Node-testbar).

/**
 * @typedef {{ id?: number|string, scope?: string, fact?: string }} MemoryLike
 * @typedef {{ profileId?: string, profileName?: string, otherNames?: string[] }} ScopeCtx
 */

/**
 * Prüft, ob einer der Namen als ganzes Wort im Text vorkommt (Unicode, case-insensitiv).
 * @param {string} text
 * @param {string[]} names
 * @returns {boolean}
 */
export function mentionsName(text, names) {
  const t = String(text ?? '');
  if (!t) return false;
  for (const raw of Array.isArray(names) ? names : []) {
    const n = String(raw || '').trim();
    if (n.length < 2) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let re;
    try { re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu'); } catch { re = new RegExp(`\\b${esc}\\b`, 'i'); }
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * Entscheidet den Scope eines Fakts.
 * @param {string} requestedScope
 * @param {string} fact
 * @param {ScopeCtx} ctx
 * @returns {string}
 */
export function scopeForFact(requestedScope, fact, ctx) {
  const c = ctx || {};
  const f = String(fact ?? '');
  if (!c.profileId) return 'user';
  if (requestedScope === 'profile') return `p:${c.profileId}`;
  const own = c.profileName ? [c.profileName] : [];
  const others = Array.isArray(c.otherNames) ? c.otherNames : [];
  if (mentionsName(f, own) || mentionsName(f, others)) return `p:${c.profileId}`;
  if (/\b(KI|Assistent(in)?|Bot)\b/i.test(f) || /nennt mich|heißt du/i.test(f)) return `p:${c.profileId}`;
  return 'user';
}

/**
 * Entfernt fremde/vergiftete Gedächtnis-Einträge für ein Profil.
 * @param {MemoryLike[]} memories
 * @param {{ profileId?: string, otherNames?: string[] }} ctx
 * @returns {MemoryLike[]}
 */
export function filterForProfile(memories, ctx) {
  const c = ctx || {};
  const others = Array.isArray(c.otherNames) ? c.otherNames : [];
  const ownScope = c.profileId ? `p:${c.profileId}` : null;
  return (Array.isArray(memories) ? memories : []).filter((m) => {
    if (!m) return false;
    const scope = String(m.scope || 'user');
    if (scope === 'user') return !(others.length && mentionsName(String(m.fact || ''), others));
    if (scope.startsWith('p:')) return scope === ownScope;
    return true;
  });
}
