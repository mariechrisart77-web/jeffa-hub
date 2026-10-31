import { ProviderError } from "../src/providers";
import { BudgetError } from "../src/budget";
import { RateLimitError } from "../src/ratelimit";
import { AuthError } from "../src/auth";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export const onRequest: PagesFunction = async (context) => {
  try {
    const res = await context.next();
    const isApi = context.request.url.includes("/api/");
    const isHtml = !isApi && (context.request.headers.get('accept')?.includes('text/html') || context.request.url.endsWith('.html') || !context.request.url.includes('.'));

    if (isApi || isHtml) {
      const headers = new Headers(res.headers);
      headers.set("x-content-type-options", "nosniff");
      headers.set("referrer-policy", "strict-origin-when-cross-origin");

      if (isApi) {
        headers.delete("x-frame-options");
      } else if (isHtml) {
        headers.set("content-security-policy", "frame-ancestors 'self' https://jeffa-hub.pages.dev");
      }

      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  } catch (e) {
    if (e instanceof AuthError) {
      return jsonError(e.status, e.code, e.message);
    }
    if (e instanceof ProviderError) {
      return jsonError(e.status, e.code, e.message);
    }
    if (e instanceof BudgetError) {
      return jsonError(429, "budget_exceeded", e.message);
    }
    if (e instanceof RateLimitError) {
      return jsonError(429, "rate_limited", e.message);
    }
    console.error("Unhandled error:", e);
    const detail = String((e as any)?.message || e || "").replace(/\s+/g, " ").slice(0, 160);
    const where = (() => { try { return new URL(context.request.url).pathname; } catch { return ""; } })();
    return jsonError(500, "internal_error", `Interner Serverfehler${where ? " bei " + where : ""}${detail ? ": " + detail : ""}`);
  }
};

function jsonError(status: number, code: string, message: string): Response {
  const body: ErrorResponse = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
