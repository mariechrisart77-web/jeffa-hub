import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { shouldFallback } from "../src/bild/fallback.js";

test("proxy.ts contains timeout logic", () => {
  const src = readFileSync("src/bild/proxy.ts", "utf8");
  assert.ok(src.includes("timeout"), "proxy.ts should contain timeout handling");
  assert.ok(src.includes("504"), "proxy.ts should return 504 on timeout");
  assert.ok(src.includes("bild_timeout"), "proxy.ts should use bild_timeout error code");
  assert.ok(src.includes("not_configured"), "proxy.ts should check for not_configured");
});

test("services/bild/wrangler.toml is configured", () => {
  const toml = readFileSync("services/bild/wrangler.toml", "utf8");
  assert.ok(toml.includes('name = "jeffa-bild"'), "wrangler.toml should have jeffa-bild name");
  assert.ok(toml.includes("d1_databases"), "wrangler.toml should have D1 binding");
  assert.ok(toml.includes("kv_namespaces"), "wrangler.toml should have KV binding");
});

test("services/bild/functions/api/image.ts uses handleImage", () => {
  const src = readFileSync("services/bild/functions/api/image.ts", "utf8");
  assert.ok(src.includes("handleImage"), "image.ts should import handleImage");
  assert.ok(src.includes("onRequestPost"), "image.ts should export onRequestPost");
});

test("hub functions/api/image.ts imports proxyOrLocal", () => {
  const src = readFileSync("functions/api/image.ts", "utf8");
  assert.ok(src.includes("proxyOrLocal"), "hub image.ts should import proxyOrLocal");
  assert.ok(src.includes("handleImage"), "hub image.ts should import handleImage");
});

test("build.mjs mentions dist/bild", () => {
  const src = readFileSync("scripts/build.mjs", "utf8");
  assert.ok(src.includes("dist/bild"), "build.mjs should mention dist/bild");
});

test("auth.ts mentions x-bild-key", () => {
  const src = readFileSync("src/auth.ts", "utf8");
  assert.ok(src.includes("x-bild-key"), "auth.ts should check x-bild-key header");
  assert.ok(src.includes("BILD_API_KEY"), "auth.ts should check BILD_API_KEY env");
});

test("shouldFallback logic", () => {
  assert.ok(shouldFallback(503, '{"error":{"code":"not_configured"}}'), "503 + not_configured should fallback");
  assert.ok(!shouldFallback(502, '{"error":{"code":"not_configured"}}'), "502 should not fallback");
  assert.ok(!shouldFallback(503, '{"error":{"code":"other"}}'), "503 without not_configured should not fallback");
  assert.ok(!shouldFallback(503, "plain text"), "503 with non-JSON should not fallback");
});
