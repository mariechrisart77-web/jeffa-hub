import { ProviderError } from "../../../src/providers";
import { BudgetError } from "../../../src/budget";
import { RateLimitError } from "../../../src/ratelimit";
import { AuthError } from "../../../src/auth";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export const onRequest: PagesFunction = async (context) => {
  const origin = context.request.headers.get("origin") || "";
  const allowed = [
    "https://jeffa-hub.pages.dev",
    "https://jeffa-bild.pages.dev",
  ];
  const isLocalhost = origin.startsWith("http://localhost:");
  const isAllowed = allowed.includes(origin) || isLocalhost;

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": isAllowed ? origin : allowed[0],
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, x-jeffa-private, x-bild-key",
        "access-control-max-age": "86400",
      },
    });
  }

  try {
    const res = await context.next();
    const headers = new Headers(res.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    if (isAllowed) {
      headers.set("access-control-allow-origin", origin);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
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
