// v78: Server-Profile (mit _adminRev), die lokal fehlen, übernehmen – vorhandene nie überschreiben
export function mergeServerProfiles(local, serverList) {
  const out = Array.isArray(local) ? local.slice() : [];
  const ids = new Set(out.map(p => p?.id).filter(Boolean));
  let added = 0;
  for (const sp of Array.isArray(serverList) ? serverList : []) {
    const id = sp?.id;
    if (!id || !sp._adminRev || ids.has(id)) continue;
    out.push(structuredClone(sp)); ids.add(id); added++;
  }
  return { profiles: out, added };
}
