import { Env } from '../../src/env';
import { requireRole } from '../../src/auth';
import { BUDGET_OPTIONS, DEFAULT_BUDGET, ampel, summarize } from '../../src/costs.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  await requireRole(context, 'read');

  const now = new Date();
  const monthStart = now.toISOString().slice(0, 7) + '-01';

  let rows: Array<{ day: string; provider: string; cost_usd: number }> = [];
  if (context.env.DB) {
    const res = await context.env.DB.prepare(
      'SELECT day, provider, cost_usd FROM usage_daily WHERE day >= ? ORDER BY day DESC'
    )
      .bind(monthStart)
      .all<{ day: string; provider: string; cost_usd: number }>();
    rows = res.results || [];
  }

  let budget = DEFAULT_BUDGET;
  if (context.env.KV) {
    const stored = await context.env.KV.get('costs:budget');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (BUDGET_OPTIONS.includes(parsed)) budget = parsed;
    }
  }

  const summary = summarize(rows, now);
  const ampelColor = ampel(summary.month, budget);

  let gpuState = { on: false };
  if (context.env.KV) {
    const st = await context.env.KV.get('gpu:state');
    if (st) {
      try {
        gpuState = JSON.parse(st);
      } catch {}
    }
  }

  return new Response(
    JSON.stringify({
      budget,
      options: BUDGET_OPTIONS,
      ...summary,
      ampel: ampelColor,
      gpu: {
        providers: [
          { id: 'modal', label: 'Modal (Haupt)' },
          { id: 'runpod', label: 'RunPod (Backup)' },
          { id: 'aws', label: 'AWS (optional)' },
        ],
        configured: false,
        state: gpuState,
      },
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, 'admin');

  const body = (await context.request.json().catch(() => ({}))) as { budget?: number };
  const budget = body.budget;

  if (!budget || !BUDGET_OPTIONS.includes(budget)) {
    return new Response(
      JSON.stringify({ error: { code: 'invalid_input', message: 'Budget muss einer der erlaubten Werte sein' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!context.env.KV) {
    return new Response(
      JSON.stringify({ error: { code: 'kv_not_configured', message: 'KV nicht konfiguriert' } }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  await context.env.KV.put('costs:budget', String(budget));

  return new Response(JSON.stringify({ ok: true, budget }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
