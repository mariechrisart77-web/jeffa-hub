// Pure helpers for syncing own styles. Never edits a style's label/prompt; merge = union by id.
export function cleanStyles(list) {
  if (!Array.isArray(list)) return null;
  const out = [], seen = new Set();
  for (const s of list.slice(0, 100)) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    const o = { id: s.id, label: String(s.label ?? '').slice(0, 200), prompt: String(s.prompt ?? '').slice(0, 4000) };
    if (typeof s.desc === 'string') o.desc = s.desc.slice(0, 1000);
    if (Array.isArray(s.poses)) o.poses = s.poses.slice(0, 30).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: String(p.id).slice(0, 64), label: String(p.label ?? '').slice(0, 200), prompt: String(p.prompt ?? '').slice(0, 1000) }));
    out.push(o);
  }
  return out;
}
// local wins on same id (this device's text is never replaced); server-only entries are added
export function mergeStyles(local, server) {
  const L = Array.isArray(local) ? local : [], ids = new Set(L.map((s) => s && s.id));
  return [...L, ...(Array.isArray(server) ? server : []).filter((s) => s && !ids.has(s.id))];
}
