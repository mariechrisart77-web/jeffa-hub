// v36: reference image -> short English look description (face, hair, body only), via Gemini vision, cached per reference in KV.
import type { Env } from "./env";
import { getKey } from "./keys";
const SYS = "Describe ONLY the person's physical appearance for an image prompt, in English, max 45 words, comma-separated keywords: apparent age range (adult), face shape, eye colour, skin tone, hair colour, hairstyle and length, body type/figure, height impression. Do NOT mention clothing, accessories, sunglasses, pose, background, location, lighting or nudity. Answer only with the keywords.";
async function hash(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join(""); }
export function sniffMime(b64: string) { return b64.startsWith("/9j/") ? "image/jpeg" : b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("UklGR") ? "image/webp" : "image/jpeg"; }
export async function refLook(env: Env, b64: string, figur: boolean): Promise<string> {
  if (!b64) return "";
  const k = `reflook:v1:${await hash(b64.slice(0, 4000) + b64.length)}`;
  let look: string | null = null; try { look = env.KV ? await env.KV.get(k) : null; } catch {}
  if (look == null) {
    try {
      const key = await getKey(env, "gemini"); if (!key) return "";
      for (const model of [env.DEFAULT_MODEL || "gemini-3.5-flash-lite", "gemini-2.5-flash"]) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ inline_data: { mime_type: sniffMime(b64), data: b64 } }, { text: "Describe her appearance." }] }], generationConfig: { maxOutputTokens: 120, temperature: 0.2 } }) });
        const d: any = await r.json().catch(() => ({}));
        const t = String((d.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("")).replace(/\s+/g, " ").trim();
        if (r.ok && t.length > 15 && !/^(i can|i'm sorry|sorry)/i.test(t)) { look = t.replace(/\b(sunglasses|glasses|bikini|topless|nude|naked|beach|sea|rock)\b[^,]*,?/gi, "").slice(0, 400); break; }
        console.error("reflook", model, r.status);
      }
      if (look && env.KV) await env.KV.put(k, look).catch(() => {});
    } catch (e) { console.error("reflook failed", e); }
  }
  if (!look) return "";
  if (figur) return look;
  // face mode: drop body-type keywords
  return look.split(",").filter(x => !/\b(body|figure|build|curv|slim|petite|athletic|height|tall|short)\b/i.test(x)).join(",").trim();
}
