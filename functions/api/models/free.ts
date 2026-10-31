import { withKeys } from "../../../src/keys";
import { Env } from "../../../src/env";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const context = { ...ctx, env: await withKeys(ctx.env) };
  const key = context.env.OPENROUTER_API_KEY;
  // Modell-Liste ist öffentlich; Key nur optional mitsenden

  const cacheKey = "openrouter:free-models-full";
  if (context.env.KV) {
    const cached = await context.env.KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ models: [] }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const data: any = await res.json();
    const models = (data.data || [])
      .filter((m: any) => {
        const id = typeof m?.id === "string" ? m.id : "";
        if (!id.includes(":free") || /safety|guard|embed|rerank|moderation/i.test(id)) return false;
        const input = m?.architecture?.input_modalities;
        const output = m?.architecture?.output_modalities;
        if (Array.isArray(input) && !input.includes("text")) return false;
        if (Array.isArray(output) && !output.includes("text")) return false;
        return true;
      })
      .map((m: any) => m.id as string);
    const rank = (id: string) => {
      const nemotron = /nvidia\/nemotron/i.test(id) ? 0 : 1;
      const reasoning = /reason|r1|thinking/i.test(id) ? 1 : 0;
      const sizeMatch = id.match(/(?:^|[^0-9])(\d+(?:\.\d+)?)b/i);
      const size = sizeMatch ? Number(sizeMatch[1]) : 999;
      return nemotron * 10000 + reasoning * 1000 + size;
    };
    const nemotronFirst = [...models].sort((a, b) => rank(a) - rank(b));
    const result = JSON.stringify({ models: nemotronFirst });
    if (context.env.KV) await context.env.KV.put(cacheKey, result, { expirationTtl: 3600 });
    return new Response(result, {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response(JSON.stringify({ models: [] }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
