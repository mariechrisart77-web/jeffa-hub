import { imageContext } from './shared/img-context.js';
import { chatMode, effectiveAdult } from './shared/mode.js';
// Image client: sends the chat context to the server-side prompt path (no prompt building here).
/** v74: Prompt-Vorschau ohne Generierung/Charge (nur `preview:true`). Gleicher Body wie generateImageInChat. */
export function buildPreviewBody(deps, opts = {}) {
  const { currentConv, getProfile, getActiveProfile, uid, getImageStyle, getImageOpt, isAdult, photoOnce, photoFragments } = deps;
  const conv = currentConv(); if (!conv) return null;
  const style = getImageStyle(), quality = getImageOpt('imageQuality', 'single');
  const clean = (t) => String(t || '').replace(/[#*_`>"„“]/g, '');
  const profP = getProfile(conv.profileId) || getActiveProfile();
  const sc = clean(opts.scene != null ? opts.scene : (opts.prompt != null ? opts.prompt : '')).slice(0, 400);
  const once = profP && photoOnce.get(profP.id);
  const adult = effectiveAdult(conv, profP);
  const frag = profP ? photoFragments(once ? { ...profP, photo: once } : profP, adult) : {};
  const msgs = imageContext(conv.messages);
  return {
    profile: profP?.id,
    conversationId: conv.id || undefined,
    style, adult, mode: chatMode(conv, profP),
    quality: quality && quality !== 'single' ? quality : undefined,
    seedMode: opts.seedMode || (opts.seed != null ? 'same' : undefined),
    seed: Number.isInteger(opts.seed) ? opts.seed : (opts.seedMode === 'same' && Number.isInteger(conv.lastSeed) ? conv.lastSeed : undefined),
    camera: opts.camera || undefined,
    photoOverride: once ? frag : undefined,
    autoCheck: typeof opts.autoCheck === 'boolean' ? opts.autoCheck : undefined,
    context: { messages: msgs, scene: sc || undefined, camera: opts.camera || undefined },
    preview: true,
  };
}

export async function generateImageInChat(deps, opts = {}) {
  const {
    api, currentConv, getProfile, getActiveProfile, uid, renderMessages, saveConversation,
    getImageStyle, getImageOpt, isAdult, syncProfileNow, photoOnce, photoFragments, toast,
    buildImagePrompt,
  } = deps;
  const conv = currentConv(); if (!conv) return;
  const style = getImageStyle(), quality = getImageOpt('imageQuality', 'single');
  const ph = { id: uid(), role: 'assistant', content: style === 'comicpage' ? '🎨 Comic-Seite wird gemalt…' : '🎨 Bild wird gemalt…', generated: true, ts: Date.now(), status: 'streaming' };
  conv.messages.push(ph); renderMessages();
  const clean = (t) => String(t || '').replace(/[#*_`>"„“]/g, '');
  const profP = getProfile(conv.profileId) || getActiveProfile();
  const sc = clean(opts.scene != null ? opts.scene : (opts.prompt != null ? opts.prompt : '')).slice(0, 400);
  const once = profP && photoOnce.get(profP.id); if (once) photoOnce.delete(profP.id);
  const adult = effectiveAdult(conv, profP);
  const frag = profP ? photoFragments(once ? { ...profP, photo: once } : profP, adult) : {};
  const msgs = imageContext(conv.messages);
  const body = {
    profile: profP?.id,
    conversationId: conv.id || undefined,
    style,
    adult,
    mode: chatMode(conv, profP),
    quality: quality && quality !== 'single' ? quality : undefined,
    seedMode: opts.seedMode || (opts.seed != null ? 'same' : undefined),
    seed: Number.isInteger(opts.seed) ? opts.seed : (opts.seedMode === 'same' && Number.isInteger(conv.lastSeed) ? conv.lastSeed : undefined),
    camera: opts.camera || undefined,
    photoOverride: once ? frag : undefined,
    autoCheck: typeof opts.autoCheck === 'boolean' ? opts.autoCheck : undefined,
    context: { messages: msgs, scene: sc || undefined, camera: opts.camera || undefined },
  };
  try {
    if (profP) await syncProfileNow(profP.id);
    const r = await api('/api/image', { method: 'POST', body });
    const url = r?.dataUrl || '';
    if (!url) throw new Error('Kein Bild');
    ph.gen = { person: opts.person || buildImagePrompt(profP, null, []), scene: sc, seed: r.seed, angle: opts.camera || '', prompt: r.prompt, negative: r.negative, server: true, model: r.model || '', cost: r.cost, llmScene: r.scene || '', sceneError: r.sceneError || '', composer: r.composer, abgleich: Array.isArray(r.abgleich) ? r.abgleich : [] };
    if (Array.isArray(r.abgleich) && r.abgleich.length) {
      toast?.('Abgleich: ' + r.abgleich[0]);
      ph.notes = r.abgleich.map((w) => 'Abgleich: ' + w);
    }
    ph.content = ''; ph.imageUrl = url; ph.status = 'done'; ph.model = r.model || '';
    if (r.cost) ph.usage = { in: 0, out: 0, cost: r.cost, img: true };
    conv.lastSeed = r.seed;
    saveConversation(conv); renderMessages(); return;
  } catch (e) {
    if (e?.code === 'venice_no_credit' || /Guthaben|Insufficient/i.test(e?.message || '')) {
      ph.content = '⚠️ Venice-Guthaben leer – bitte auf venice.ai aufladen'; ph.status = 'done'; saveConversation(conv); renderMessages(); return;
    }
    if (e?.code === 'prompt_admin_only') {
      ph.content = '⚠️ Freie Prompts sind nur für Admins erlaubt'; ph.status = 'error'; saveConversation(conv); renderMessages(); return;
    }
    if (e?.code === 'not_adult') {
      toast?.('Profil muss eindeutig erwachsen sein (18+)'); ph.status = 'error'; ph.content = '⚠️ Profil muss eindeutig erwachsen sein (18+)'; saveConversation(conv); renderMessages(); return;
    }
    ph.content = `⚠️ Bild fehlgeschlagen: ${e.message}`; ph.status = 'error'; saveConversation(conv); renderMessages();
  }
}
