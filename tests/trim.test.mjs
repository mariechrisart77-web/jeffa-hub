import { test } from "node:test";
import assert from "node:assert";
import { trimHistory } from "../src/shared/trim.js";

test("trimHistory behält alle Nachrichten wenn unter Limit", () => {
  const msgs = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ];
  const result = trimHistory(msgs, 5);
  assert.strictEqual(result.length, 2);
});

test("trimHistory trimmt auf letzte N", () => {
  const msgs = [
    { role: "user", content: "1" },
    { role: "assistant", content: "2" },
    { role: "user", content: "3" },
    { role: "assistant", content: "4" },
    { role: "user", content: "5" },
  ];
  const result = trimHistory(msgs, 3);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].content, "3");
  assert.strictEqual(result[2].content, "5");
});
