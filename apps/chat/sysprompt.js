// v82 C3: Systemprompt-Bausteine für Cast, Identität und Kappung (rein, Node-testbar).

function nameOf(profile, getProfile) {
  if (!profile) return '';
  if (profile.name) return String(profile.name);
  if (typeof getProfile === 'function') { const p = getProfile(profile.id); if (p && p.name) return String(p.name); }
  return '';
}

function isFigure(profile) {
  if (!profile) return false;
  return !!(profile.persona || profile.teacher || profile.geschichte);
}

export function castLine(profile, castIds, getProfile) {
  if (!profile || !isFigure(profile)) return '';
  const ids = Array.isArray(castIds) ? castIds : [];
  const names = ids
    .filter((id) => id && id !== profile.id)
    .map((id) => (typeof getProfile === 'function' ? getProfile(id)?.name : ''))
    .filter(Boolean);
  if (!names.length) return '';
  return `\n\nIn Geschichten können außerdem diese ANDEREN Figuren vorkommen (das bist nicht du): ${names.join(', ')}.`;
}

export function otherProfileNames(profile, allProfiles) {
  const self = profile ? String(profile.name || profile.id || '') : '';
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(allProfiles) ? allProfiles : []) {
    if (!p || !p.name) continue;
    const n = String(p.name).slice(0, 40);
    if (!n || n === self || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 12) break;
  }
  return out;
}

export function identityAnchor(profile, otherNames) {
  const name = profile && (profile.name || profile.id) ? String(profile.name || profile.id) : 'die KI';
  const desc = profile && profile.description ? String(profile.description).replace(/\s+/g, ' ').trim() : '';
  const others = (Array.isArray(otherNames) ? otherNames : []).filter(Boolean);
  const otherTxt = others.length ? `${others.join(', ')} sind andere Figuren dieser App, nicht du – übernimm nie deren Namen, Rolle oder Erinnerungen.` : '';
  const body = `[Identität: Du bist ${name}${desc ? ' – ' + desc : ''}. Bleib immer ${name}. ${otherTxt}]`;
  return `\n\n${body.replace(/ +/g, ' ')}`;
}

export function capSystem(system, max = 4000) {
  const s = String(system ?? '');
  if (s.length <= max) return s;
  const head = Math.min(1600, Math.max(0, max - 10));
  const tailLen = Math.max(0, max - head - 3);
  return s.slice(0, head) + '\n…\n' + s.slice(-tailLen);
}
