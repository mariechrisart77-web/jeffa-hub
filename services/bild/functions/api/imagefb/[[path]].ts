import { Env } from "../../../../../src/env";
import { withKeys } from "../../../../../src/keys";
import { handleImageFb } from "../../../../../src/bild/imagefb-handler";

// Without provider keys the service answers 503 not_configured, so the hub proxy falls back to its local copy (same code).
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const env = await withKeys(ctx.env);
  if (!env.VENICE_API_KEY) return new Response(JSON.stringify({ error: { code: "not_configured", message: "Bild-Dienst: Provider-Schlüssel fehlen" } }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
  return handleImageFb(ctx);
};
