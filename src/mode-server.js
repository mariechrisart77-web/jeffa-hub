// Server-side mode enforcement. Pure JS, no imports – used by functions/api/chat.ts and src/imgsvc-image.ts.

export const SFW_RULE = 'Antworte jugendfrei: keine sexuellen oder expliziten Inhalte, keine erotischen Beschreibungen, keine Nacktheit. Bleib respektvoll und altersgerecht.';

export function applyModeToSystem(system, mode) {
  const base = typeof system === 'string' ? system : '';
  if (mode !== 'jugendfrei') return base; // fehlender Modus = altes Verhalten (andere Aufrufer)
  return base ? `${base}\n\n${SFW_RULE}` : SFW_RULE;
}

// Only downgrades when an explicit mode is sent; a missing mode keeps legacy behaviour.
export function enforceImageMode(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.mode === undefined || body.mode === null) return body;
  if (body.mode !== 'hemmungslos') return { ...body, adult: false };
  return body;
}
