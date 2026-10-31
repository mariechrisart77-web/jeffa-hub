import { Env } from "../../src/env";
import { requireRole } from "../../src/auth";
import { getKey } from "../../src/keys";
import { parseOpenRouter, parseVenice, parseVnaipro, parseRunware, NO_BALANCE_API } from "../../src/balance-parse";

interface BalanceResult {
  ok: boolean;
  available: boolean;
  balanceUsd?: number;
  usedUsd?: number;
  limitUsd?: number;
  unit?: string;
  currency?: string;
  note?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, "read");

  const cacheKey = "balances:v84";
  if (context.env.KV) {
    const cached = await context.env.KV.get(cacheKey);
    if (cached) {
      return new Response(cached, { headers: { "content-type": "application/json; charset=utf-8" } });
    }
  }

  const results: Record<string, BalanceResult> = {};

  const [openrouter, vnaipro, venice, runware] = await Promise.all([
    checkOpenRouter(context.env),
    checkVNAIPro(context.env),
    checkVenice(context.env),
    checkRunware(context.env),
  ]);
  results.openrouter = openrouter;
  results.vnaipro = vnaipro;
  results.venice = venice;
  results.runware = runware;
  for (const p of NO_BALANCE_API) results[p] = { ok: true, available: false, note: "Guthaben nicht abrufbar" };

  const response = JSON.stringify(results);
  if (context.env.KV) {
    await context.env.KV.put(cacheKey, response, { expirationTtl: 300 });
  }

  return new Response(response, { headers: { "content-type": "application/json; charset=utf-8" } });
};

const NO_KEY: BalanceResult = { ok: false, available: false, note: "Kein API-Key" };
const FETCH_FAIL: BalanceResult = { ok: false, available: false, note: "Guthaben nicht abrufbar" };
const PARSE_FAIL: BalanceResult = { ok: false, available: false, note: "Guthaben nicht abrufbar" };

async function checkOpenRouter(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "openrouter");
  if (!key) return NO_KEY;

  try {
    const [keyRes, creditsRes] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
      fetch("https://openrouter.ai/api/v1/credits", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
    ]);
    const keyJson: any = keyRes.ok ? await keyRes.json().catch(() => null) : null;
    const creditsJson: any = creditsRes.ok ? await creditsRes.json().catch(() => null) : null;
    const parsed = parseOpenRouter(keyJson, creditsJson);
    return { ok: true, available: true, ...parsed };
  } catch {
    return FETCH_FAIL;
  }
}

async function checkVNAIPro(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "vnaipro");
  if (!key) return NO_KEY;

  const base = env.VNAIPRO_API_KEY?.startsWith("http") ? env.VNAIPRO_API_KEY.replace(/\/+$/, "") : "https://apikey.vnaipro.app";

  try {
    const [subRes, usageRes] = await Promise.all([
      fetch(`${base}/v1/dashboard/billing/subscription`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
      fetch(`${base}/v1/dashboard/billing/usage`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) }),
    ]);
    const subJson: any = subRes.ok ? await subRes.json().catch(() => null) : null;
    const usageJson: any = usageRes.ok ? await usageRes.json().catch(() => null) : null;
    const parsed = parseVnaipro(subJson, usageJson);
    if (!parsed) return PARSE_FAIL;
    return { ok: true, available: true, ...parsed };
  } catch {
    return FETCH_FAIL;
  }
}

async function checkVenice(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "venice");
  if (!key) return NO_KEY;

  try {
    const res = await fetch("https://api.venice.ai/api/v1/api_keys/rate_limits", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    const json: any = res.ok ? await res.json().catch(() => null) : null;
    const parsed = parseVenice(json);
    if (!parsed) return PARSE_FAIL;
    return { ok: true, available: true, ...parsed };
  } catch {
    return FETCH_FAIL;
  }
}

async function checkRunware(env: Env): Promise<BalanceResult> {
  const key = await getKey(env, "runware");
  if (!key) return NO_KEY;

  try {
    const res = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify([{ taskType: "accountManagement", taskUUID: crypto.randomUUID(), operation: "getDetails" }]),
      signal: AbortSignal.timeout(6000),
    });
    const json: any = res.ok ? await res.json().catch(() => null) : null;
    const parsed = parseRunware(json);
    if (!parsed) return PARSE_FAIL;
    return { ok: true, available: true, ...parsed };
  } catch {
    return FETCH_FAIL;
  }
}
