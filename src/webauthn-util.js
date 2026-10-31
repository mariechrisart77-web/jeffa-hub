// v84b: reine Helfer für WebAuthn (rpId-Wahl, Credential-Index-Merge) – Node-testbar.

export function rpIdFor(hostname, envRpId) {
  if (envRpId && typeof envRpId === 'string') return envRpId;
  const host = String(hostname || '').toLowerCase();
  if (!host) return host;
  if (host === 'jeffa-hub.pages.dev' || host.endsWith('.jeffa-hub.pages.dev')) return 'jeffa-hub.pages.dev';
  return host;
}

export function mergeCredIds(indexIds, listedIds) {
  const out = [];
  const seen = new Set();
  for (const arr of [indexIds, listedIds]) {
    if (!Array.isArray(arr)) continue;
    for (const id of arr) {
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
