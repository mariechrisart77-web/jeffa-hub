import { withKeys } from "../../src/keys";
import { Env } from "../../src/env";
import { checkRateLimit } from "../../src/ratelimit";
import { edgeTTS } from "../../src/edge-tts";

interface TTSBody {
  text: string;
  provider?: "browser" | "edge" | "hf";
  voiceName?: string;
  rate?: number;
  pitch?: number;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const context = { ...ctx, env: await withKeys(ctx.env) };
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: TTSBody = await context.request.json();
  const { text, provider = "edge" } = body;

  if (!text || typeof text !== "string" || text.length > 5000) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "text erforderlich, max 5000 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (provider === "browser") {
    return new Response(JSON.stringify({ error: { code: "client_only", message: "Browser-TTS nur clientseitig" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (provider === "edge") {
    try {
      const voiceName = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/.test(body.voiceName || "") ? body.voiceName! : "de-DE-SeraphinaMultilingualNeural";
      const audio = await edgeTTS(text, {
        voice: voiceName,
        rate: typeof body.rate === "number" ? body.rate / 100 : 1,
        pitch: typeof body.pitch === "number" ? 1 + body.pitch / 50 : 1,
        signal: context.request.signal,
      });
      let binary = "";
      for (const byte of audio) binary += String.fromCharCode(byte);
      return new Response(JSON.stringify({ dataUrl: `data:audio/mpeg;base64,${btoa(binary)}` }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (err) {
      console.warn("edge tts failed:", (err as Error)?.message);
      if (context.env.HF_TOKEN && context.env.HF_TTS_MODEL) {
        return generateHFTTS(context.env, text);
      }
      return new Response(JSON.stringify({ error: { code: "tts_unavailable", message: "Sprachausgabe nicht verfügbar" }, fallback: "browser" }), {
        status: 501,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  if (provider === "hf") {
    if (!context.env.HF_TOKEN || !context.env.HF_TTS_MODEL) {
      return new Response(JSON.stringify({ error: { code: "not_configured", message: "HF TTS nicht konfiguriert (HF_TOKEN oder HF_TTS_MODEL fehlt)" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    return generateHFTTS(context.env, text);
  }

  return new Response(JSON.stringify({ error: { code: "unknown_provider", message: "Unbekannter Provider" } }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
};

async function generateHFTTS(env: Env, text: string): Promise<Response> {
  if (!env.HF_TOKEN || !env.HF_TTS_MODEL) {
    return new Response(JSON.stringify({ error: { code: "not_configured", message: "HF TTS nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${env.HF_TTS_MODEL}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.HF_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ inputs: text }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HF API ${res.status}: ${txt.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return new Response(JSON.stringify({ dataUrl: `data:audio/wav;base64,${b64}` }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { code: "generation_failed", message: "HF TTS fehlgeschlagen" } }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  }

