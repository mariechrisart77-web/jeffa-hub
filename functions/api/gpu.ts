import { Env } from '../../src/env';
import { requireRole } from '../../src/auth';
import { BUDGET_OPTIONS, DEFAULT_BUDGET, budgetAllowsGpu, summarize } from '../../src/costs.js';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  await requireRole(context, 'admin');

  const body = (await context.request.json().catch(() => ({}))) as { action: 'start' | 'stop'; provider: string };

  if (body.action !== 'start' && body.action !== 'stop') {
    return new Response(
      JSON.stringify({ error: { code: 'invalid_input', message: 'action muss start oder stop sein' } }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  if (body.action === 'start') {
    // Budget check
    const now = new Date();
    const monthStart = now.toISOString().slice(0, 7) + '-01';
    let rows: Array<{ day: string; provider: string; cost_usd: number }> = [];
    if (context.env.DB) {
      const res = await context.env.DB.prepare(
        'SELECT day, provider, cost_usd FROM usage_daily WHERE day >= ?'
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
    const check = budgetAllowsGpu({ monthSpent: summary.month, budget });

    if (!check.ok) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'budget',
            message: check.reason || 'Monats-Budget erreicht – GPU-Server gesperrt',
          },
        }),
        { status: 402, headers: { 'content-type': 'application/json' } }
      );
    }

    // No provider configured yet
    return new Response(
      JSON.stringify({
        error: {
          code: 'not_configured',
          message: 'nicht eingerichtet',
        },
      }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  if (body.action === 'stop') {
    if (context.env.KV) {
      await context.env.KV.put('gpu:state', JSON.stringify({ on: false }));
    }
    return new Response(JSON.stringify({ ok: true, state: 'stopped' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ ok: false }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};
