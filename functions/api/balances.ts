import { Env } from "../../src/env";
import { requireRole } from "../../src/auth";
import { getKey } from "../../src/keys";

interface BalanceResult {
  ok: boolean;
  balanceUsd?: number;
  usedUsd?: number;
  limitUsd?: number;
  note?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");

  const cacheKey = "balances:cached";
  if (context.env.KV) {
    const cached = await context.env.KV.get(cacheKey);
    if (cached) {
      return new Response(cached, { headers: { "content-type": "application/json; charset=utf-8" } });
    }
  }

  const results: Record<string, BalanceResult> = {};

  results.openrouter = await checkOpenRouter(context.env);
  results.vnaipro = await checkVNAIPro(context.env);
  results.venice = await checkVenice(context.env);
  results.gemini = { ok: true, note: "Kein Guthaben-API – eigene Zählung" };
  results.hf = { ok: true, note: "Kein Guthaben-API – eigene Zählung" };
  results.xai = { ok: true, note: "Kein Guthaben-API – eigene Zählung" };

  const response = JSON.stringify(results);
  if (context.env.KV) {
    await context.env.KV.put(cacheKey, response, { expirationTtl: 300 });
  }

  return new Response(response, { headers: { "content-type": "application/json; charset=utf-8" } });
};

async function checkOpenRouter(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "openrouter");
  if (!key) return { ok: false, note: "Kein API-Key" };

  try {
    const [keyRes, creditsRes] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
      fetch("https://openrouter.ai/api/v1/credits", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
    ]);

    let usedUsd: number | undefined;
    let limitUsd: number | undefined;

    if (keyRes.ok) {
      const keyData: any = await keyRes.json();
      usedUsd = keyData.data?.usage;
      limitUsd = keyData.data?.limit;
    }

    let balanceUsd: number | undefined;
    if (creditsRes.ok) {
      const creditsData: any = await creditsRes.json();
      const total = creditsData.data?.total_credits;
      const used = creditsData.data?.total_usage;
      if (typeof total === "number" && typeof used === "number") {
        balanceUsd = total - used;
      }
    }

    return { ok: true, balanceUsd, usedUsd, limitUsd };
  } catch {
    return { ok: false, note: "API-Fehler" };
  }
}

async function checkVNAIPro(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "vnaipro");
  if (!key) return { ok: false, note: "Kein API-Key" };

  const base = env.VNAIPRO_API_KEY?.startsWith("http") ? env.VNAIPRO_API_KEY.replace(/\/+$/, "") : "https://apikey.vnaipro.app";

  try {
    const res = await fetch(`${base}/v1/dashboard/billing/usage`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, note: "API-Fehler" };

    const data: any = await res.json();
    const usedCents = data.total_usage;
    if (typeof usedCents === "number") {
      return { ok: true, usedUsd: usedCents / 100 };
    }
    return { ok: true };
  } catch {
    return { ok: false, note: "API-Fehler" };
  }
}

async function checkVenice(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "venice");
  if (!key) return { ok: false, note: "Kein API-Key" };

  try {
    const res = await fetch("https://api.venice.ai/api/v1/api_keys/rate_limits", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, note: "API-Fehler" };

    const data: any = await res.json();
    const balances = data.data?.balances;
    if (balances) {
      const usd = balances.USD || balances.DIEM;
      if (typeof usd === "number") {
        return { ok: true, balanceUsd: usd };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, note: "API-Fehler" };
  }
}
