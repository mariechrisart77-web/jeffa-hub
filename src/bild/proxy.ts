import { Env } from "../env";
import { shouldFallback } from "./fallback.js"; // 503 not_configured -> local fallback

type LocalHandler = (ctx: EventContext<Env, any, any>) => Promise<Response>;

export async function proxyOrLocal(
  ctx: EventContext<Env, any, any>,
  local: LocalHandler
): Promise<Response> {
  const { env, request } = ctx;
  const url = new URL(request.url);

  if (!env.BILD_URL) {
    const h = new Headers();
    h.set("x-bild-source", "local");
    const resp = await local(ctx);
    const headers = new Headers(resp.headers);
    headers.set("x-bild-source", "local");
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  }

  const bodyText = request.method !== "GET" && request.method !== "HEAD" ? await request.text() : "";
  const timeout = parseInt(env.BILD_TIMEOUT_MS || "75000", 10);

  try {
    const headers = new Headers();
    const auth = request.headers.get("authorization");
    if (auth) headers.set("authorization", auth);
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    const priv = request.headers.get("x-jeffa-private");
    if (priv) headers.set("x-jeffa-private", priv);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-forwarded-for", ip);

    const controller = new AbortController();
    const signal = AbortSignal.timeout(timeout);
    signal.addEventListener("abort", () => controller.abort());

    const serviceUrl = `${env.BILD_URL}${url.pathname}${url.search}`;
    const resp = await fetch(serviceUrl, {
      method: request.method,
      headers,
      body: bodyText || undefined,
      signal: controller.signal,
    });

    const respBody = await resp.text();

    if (shouldFallback(resp.status, respBody)) {
      const newReq = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: bodyText || undefined,
      });
      const fallbackResp = await local({ ...ctx, request: newReq as any });
      const fallbackHeaders = new Headers(fallbackResp.headers);
      fallbackHeaders.set("x-bild-source", "local");
      return new Response(fallbackResp.body, {
        status: fallbackResp.status,
        statusText: fallbackResp.statusText,
        headers: fallbackHeaders,
      });
    }

    const outHeaders = new Headers(resp.headers);
    outHeaders.set("x-bild-source", "service");
    return new Response(respBody, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
  } catch (e: any) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return new Response(
        JSON.stringify({
          error: {
            code: "bild_timeout",
            message: "Bild-Dienst antwortet nicht (Zeitüberschreitung). Der Chat läuft normal weiter – bitte später erneut versuchen.",
          },
        }),
        { status: 504, headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }

    const newReq = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyText || undefined,
    });
    const fallbackResp = await local({ ...ctx, request: newReq as any });
    const fallbackHeaders = new Headers(fallbackResp.headers);
    fallbackHeaders.set("x-bild-source", "local");
    return new Response(fallbackResp.body, {
      status: fallbackResp.status,
      statusText: fallbackResp.statusText,
      headers: fallbackHeaders,
    });
  }
}

export { shouldFallback };
