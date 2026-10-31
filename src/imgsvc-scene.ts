import { Env } from './env';
import { withKeys } from './keys';
import { complete } from './providers';

export const SCENE_SYSTEM = "You write a vivid scene description for an AI image generator, ported from Nachtfalter. Describe the CURRENT moment of the role-play chat (latest messages) as one photo. Call the main character only \"the woman\". Do NOT describe her face, hair, age, ethnicity or body shape (added separately). Describe only: setting (exact place, vehicles with make/colour), pose, action, visible piercings/tattoos/jewellery, other people (each by gender and look as described; the chat partner only if physically present in this moment), clothing, lighting, mood, and a camera angle. Stay faithful to the chat: do not invent, add or tone down anything. All persons are adults (18+). No dialogue, no feelings, no story summary; concrete visual nouns. Always write in English, even when the chat is German. Keep size and state words exactly (tiny, micro, minimal, see-through, wet, soaked, torn) and show them visibly. English prose, max 110 words. Output only the description.";

export async function writeSceneInfo(env: Env, adult: boolean, character: string, ctxText: string, fixed: string): Promise<{ scene: string; model: string; error: string }> {
  const key = await withKeys(env);
  const model = env.DEFAULT_MODEL || 'gemini-3.5-flash-lite';
  const models = adult ? ['venice-uncensored-1-2'] : [model]; // v38: FSK18 never falls back to Gemini (softens); empty -> raw scene text

  const user = `Main character: ${String(character || '').slice(0, 80)}\n\nChat (latest last):\n${String(ctxText || '').slice(-3000)}${fixed ? `\n\n[Fixed by the user, keep exactly: ${String(fixed).slice(0, 400)}]` : ''}`;

  for (const m of models) {
    try {
      const res = await complete(key, { model: m, maxTokens: 220, private: true, system: SCENE_SYSTEM, messages: [{ role: 'user', content: user }] });
      const scene = String(res.reply || '').replace(/```\w*|```/g, '').replace(/\s+/g, ' ').trim().slice(0, 900);
      if (scene && !/^(i can'?t|i cannot|sorry|ich kann)/i.test(scene)) return { scene, model: m, error: '' };
    } catch (e) {
      console.error('writeScene failed', m, e);
    }
  }
  return { scene: '', model: models[0] || model, error: 'all_models_failed' };
}

export async function writeScene(env: Env, adult: boolean, character: string, ctxText: string, fixed: string): Promise<string> {
  const info = await writeSceneInfo(env, adult, character, ctxText, fixed);
  return info.scene;
}
