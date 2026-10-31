import { Env, floatVar } from "./env";
import { clientKey } from "./ratelimit";

const memoryBudget = new Map<string, { spent: number; resetAt: number }>();

export async function checkBudget(env: Env, rawIp: string, cost: number): Promise<void> {
  // Global daily cap across all visitors (protects the keys on a public site).
  await checkOne(env, "global", cost, floatVar(env.BUDGET_GLOBAL_DAILY_USD, 3));
  await checkOne(env, clientKey(rawIp), cost, floatVar(env.BUDGET_DAILY_USD, 1));
}

async function checkOne(env: Env, ip: string, cost: number, limit: number): Promise<void> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const key = `budget:${today}:${ip}`;

  if (env.DB) {
    try {
      const row = await env.DB.prepare("SELECT spent FROM budget_spend WHERE day_ip = ?").bind(key).first<{ spent: number }>();
      const spent = row?.spent ?? 0;
      if (spent + cost > limit) throw new BudgetError();
      if (cost > 0) {
        await env.DB.prepare("INSERT INTO budget_spend (day_ip, spent) VALUES (?, ?) ON CONFLICT(day_ip) DO UPDATE SET spent = spent + excluded.spent").bind(key, cost).run();
      }
      return;
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      console.warn("budget d1 failed:", (e as Error).message);
    }
  }
  if (env.KV) {
    const val = await env.KV.get(key);
    const spent = val ? parseFloat(val) : 0;
    if (spent + cost > limit) throw new BudgetError();
    await env.KV.put(key, String(spent + cost), { expirationTtl: 86400 });
  } else {
    const midnight = new Date(today + "T23:59:59Z").getTime();
    let entry = memoryBudget.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { spent: 0, resetAt: midnight };
      memoryBudget.set(key, entry);
    }
    if (entry.spent + cost > limit) throw new BudgetError();
    entry.spent += cost;
  }
}

export class BudgetError extends Error {
  constructor() {
    super("Tagesbudget überschritten");
    this.name = "BudgetError";
  }
}
