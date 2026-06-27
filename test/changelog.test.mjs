/**
 * Tests for change-log formatting (module/changelog.mjs), DESIGN.md §6.5.
 * Run: node test/changelog.test.mjs
 */
import assert from "node:assert/strict";
import { summarizeChanges, bandTransition } from "../module/changelog.mjs";

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const bandForDistance = (ft) =>
  ft <= 5 ? "close" : ft <= 10 ? "near" : ft <= 30 ? "medium" : ft <= 60 ? "long" : "far";

test("bandTransition reports from/to bands", () => {
  const t = bandTransition(4, 23, bandForDistance);
  assert.deepEqual(t, { from: "close", to: "medium" });
});

test("summarizeChanges keeps only band-crossing edits", () => {
  const changes = [
    { pair: "A|B", from: 4, to: 23 },   // close → medium  (kept)
    { pair: "A|C", from: 12, to: 14 },  // medium → medium (dropped)
    { pair: "B|C", from: 8, to: 70 }    // near → far      (kept)
  ];
  const lines = summarizeChanges(changes, bandForDistance);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "A ↔ B: Close → Medium");
  assert.equal(lines[1], "B ↔ C: Near → Far");
});

test("summarizeChanges uses nameOf and labelOf hooks", () => {
  const changes = [{ pair: "t1|t2", from: 4, to: 23 }];
  const names = { t1: "Goblin", t2: "Orc" };
  const lines = summarizeChanges(changes, bandForDistance, {
    nameOf: (id) => names[id] ?? id,
    labelOf: (k) => k.toUpperCase()
  });
  assert.equal(lines[0], "Goblin ↔ Orc: CLOSE → MEDIUM");
});

test("empty / undefined changes → no lines", () => {
  assert.deepEqual(summarizeChanges([], bandForDistance), []);
  assert.deepEqual(summarizeChanges(undefined, bandForDistance), []);
});

let failed = 0, passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
