import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ampel, forecast, summarize, budgetAllowsGpu, gpuIdleShouldStop, groupOf, BUDGET_OPTIONS } from '../src/costs.js';
const rd = (f) => readFileSync(f, 'utf8');

test('ampel thresholds', () => {
  assert.equal(ampel(9.98, 20), 'green');
  assert.equal(ampel(10, 20), 'yellow');
  assert.equal(ampel(16, 20), 'red');
  assert.equal(ampel(20, 20), 'stop');
});
test('forecast extrapolates month', () => {
  assert.equal(Math.round(forecast(10, new Date('2026-11-10T12:00:00Z'))), 30);
});
test('summarize: current month only + grouping', () => {
  const rows = [
    { day: '2026-10-30', provider: 'venice', cost_usd: 1 },
    { day: '2026-10-30', provider: 'venice-image', cost_usd: 0.5 },
    { day: '2026-10-02', provider: 'openrouter', cost_usd: 2 },
    { day: '2026-09-30', provider: 'venice', cost_usd: 100 },
    { day: '2026-10-29', provider: 'gpu-modal', cost_usd: 3 },
  ];
  const s = summarize(rows, new Date('2026-10-30T10:00:00Z'));
  assert.equal(s.today, 1.5);
  assert.equal(s.month, 6.5);
  assert.equal(s.byProvider.Venice.month, 1.5);
  assert.equal(s.byProvider['GPU-Server'].month, 3);
  assert.equal(groupOf('google-ai-studio'), 'Gemini');
});
test('budgetAllowsGpu blocks at 100%', () => {
  assert.equal(budgetAllowsGpu({ monthSpent: 19.99, budget: 20 }).ok, true);
  const r = budgetAllowsGpu({ monthSpent: 20, budget: 20 });
  assert.equal(r.ok, false); assert.match(r.reason, /Budget/);
});
test('gpu auto-off after 30 min idle', () => {
  const now = Date.now();
  assert.equal(gpuIdleShouldStop(now - 29 * 60000, now), false);
  assert.equal(gpuIdleShouldStop(now - 31 * 60000, now), true);
});
test('budget options dropdown 5..100', () => assert.deepEqual(BUDGET_OPTIONS, [5, 10, 20, 30, 50, 100]));
test('providers: groq/mistral adapters before openRouter, no gateway', () => {
  const p = rd('src/providers.ts');
  assert.ok(p.includes('api.groq.com') && p.includes('api.mistral.ai'));
  const line = p.match(/export const PROVIDERS[^\n]+/)[0];
  assert.ok(line.indexOf('groq') < line.indexOf('openRouter') && line.indexOf('mistral') < line.indexOf('openRouter'));
  assert.ok(rd('src/keys.ts').includes("'runware'"));
  for (const f of ['apps/hub/tresor.js', 'apps/waechter/waechter.js', 'functions/api/status.ts', 'src/tools.ts']) assert.ok(rd(f).includes('groq') && rd(f).includes('runware'), f);
});
test('cost UI is lazy, dropdown only', () => {
  const s = rd('apps/hub/settings.js');
  assert.ok(s.includes("import('./costs-ui.js')"));
  assert.ok(!/^import .*costs-ui/m.test(s));
  const c = rd('apps/hub/costs-ui.js');
  assert.ok(c.includes('<select id="costs-budget"'));
  assert.ok(!/type="number"/.test(c) && !/<input/.test(c));
  assert.ok(c.includes('nicht eingerichtet') && c.includes('/api/gpu'));
});
test('gpu start goes through budgetAllowsGpu, image costs logged', () => {
  assert.ok(rd('functions/api/gpu.ts').includes('budgetAllowsGpu('));
  assert.ok(rd('src/bild/image-handler.ts').includes('"venice-image"'));
  assert.ok(rd('src/imgsvc-image.ts').includes('"venice-image"'));
});
