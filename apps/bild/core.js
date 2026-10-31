// Reine Funktionen für Bild-App (keine DOM-Abhängigkeit)

export function parseSessionHash(hash) {
  const m = hash.match(/^s=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function costOf(mode, quality, panels = 1, adult = false) {
  const baseCosts = {
    auto: 0.01,
    single: 0.01,
    spar: 0.01,
    mittel: 0.02,
    qualitaet: 0.04,
    runware: 0.002
  };
  const costPerImage = baseCosts[quality] || 0.01;
  let multiplier = 1;
  if (mode === 'comic') multiplier = panels || 2;
  else if (mode === 'stil-test') multiplier = 3;
  return costPerImage * multiplier;
}

export const FORMATS = { hoch: [768, 1024], quadrat: [1024, 1024], quer: [1024, 768] };

/** v74: Preview-Body = derselbe Body mit `preview: true`. */
export function buildPreviewBody(state) {
  return { ...buildBody(state), preview: true };
}

export function buildBody(state) {
  const { mode, profile, style, quality, seed, scene, adult, ownScene, panels, format, messages, conversationId, composerModel, mix, timeOfDay, timePhrase } = state;
  const dims = FORMATS[format] || FORMATS.hoch;

  if (profile && profile !== 'none') {
    const body = {
      profile,
      conversationId: conversationId || undefined,
      style,
      adult: adult || false,
      quality: quality === 'auto' ? undefined : quality,
      seedMode: seed === 'zufall' ? 'random' : (seed === 'last' ? 'same' : (Number.isInteger(seed) ? 'same' : undefined)),
      seed: seed === 'last' ? (state.lastSeed ?? undefined) : (Number.isInteger(seed) ? seed : undefined),
      context: {
        scene: ownScene || scene || undefined,
        messages: Array.isArray(messages) ? messages.slice(-6).map((m) => ({ role: m.role, content: String(m.content || ''), generated: !!m.generated })) : undefined
      }
    };
    if (composerModel) body.composerModel = composerModel;
    if (timeOfDay) body.timeOfDay = timeOfDay; // v85 (19): Tageszeit-Wahl (sonst automatisch aus dem Chat)
    if (mix && style !== 'comicpage') body.mix = { bg: mix.bg, fg: mix.fg };
    if (mode === 'comic') {
      body._mode = 'comic';
      body._panels = panels || 2;
      body._cameras = ['medium shot', 'close-up', 'wide shot', 'over-the-shoulder'];
    }
    return body;
  } else {
    let prompt = ownScene || scene;
    if (timePhrase) prompt += ', ' + timePhrase; // v85 (19)
    if (style && style !== 'real') {
      const styleMap = {
        anime: ' in anime style',
        comic: ' in comic style',
        manhwa: ' in manhwa style'
      };
      prompt += styleMap[style] || '';
    }
    const body = {
      prompt,
      style,
      adult: adult || false,
      model: quality === 'auto' ? 'z-image-turbo' : { spar: 'z-image-turbo', mittel: 'qwen-image-2-1-turbo', qualitaet: 'qwen-image-3' }[quality] || 'z-image-turbo',
      width: dims[0],
      height: dims[1],
      seed: seed === 'zufall' ? undefined : seed
    };
    return body;
  }
}
