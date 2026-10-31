import { test } from "node:test";
import assert from "node:assert";

const BASE_URL = process.env.BASE_URL || "http://localhost:8788";

async function checkServer() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

test("E2E: /api/health", { skip: !(await checkServer()) }, async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.ok(res.ok);
  const data = await res.json();
  assert.ok(data.ok);
});

test("E2E: /api/status", { skip: !(await checkServer()) }, async () => {
  const res = await fetch(`${BASE_URL}/api/status`);
  assert.ok(res.ok);
  const data = await res.json();
  assert.ok(data.ok);
  assert.ok(data.providers);
});

test("E2E: /api/orchestrate gibt 501", { skip: !(await checkServer()) }, async () => {
  const res = await fetch(`${BASE_URL}/api/orchestrate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "test" }),
  });
  assert.strictEqual(res.status, 501);
  const data = await res.json();
  assert.strictEqual(data.error.code, "not_implemented");
});

test("E2E: /api/chat Validierung", { skip: !(await checkServer()) }, async () => {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});
