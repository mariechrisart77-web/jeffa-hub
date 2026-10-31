import { withKeys } from "../../src/keys";
import { Env } from "../../src/env";
import { checkRateLimit } from "../../src/ratelimit";

interface VideoBody {
  prompt: string;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const context = { ...ctx, env: await withKeys(ctx.env) };
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  const body: VideoBody = await context.request.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== "string" || prompt.length > 500) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "prompt erforderlich, max 500 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!context.env.HF_TOKEN) {
    return new Response(JSON.stringify({ error: { code: "not_configured", message: "Videogenerierung nicht konfiguriert (HF_TOKEN fehlt)" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const provider = context.env.HF_VIDEO_PROVIDER || "fal-ai/fal-ai/wan/v2.2-5b/text-to-video";
    const url = provider.startsWith("http") ? provider : `https://router.huggingface.co/${provider}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.env.HF_TOKEN}`,
        "content-type": "application/json",
        "x-use-cache": "false",
      },
      body: JSON.stringify({ prompt }),
    });
    if (res.status === 402 || res.status === 403) {
      return new Response(JSON.stringify({
        available: false,
        error: { code: "payment_required", message: "Video-Generierung benötigt HF-Guthaben (Inference Providers)" },
      }), {
        status: 402,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (!res.ok) {
      throw new Error(`HF API ${res.status}`);
    }
    // fal-ai (sync endpoint) answers with JSON { video: { url } }.
    const data: any = await res.json().catch(() => null);
    const videoUrl = data?.video?.url;
    if (!videoUrl) throw new Error("Keine Video-URL in der Antwort");
    return new Response(JSON.stringify({ available: true, url: videoUrl }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { code: "generation_failed", message: (e as Error).message } }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
