/**
 * Tests for the propagation engine (module/propagation.mjs), DESIGN.md §6.4.
 * Run: node test/propagation.test.mjs
 */
import assert from "node:assert/strict";
import { repair, collectTokenIds } from "../module/propagation.mjs";

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const approx = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

// --- §6.4 the spec example: clamp the off-center edge up to the feasible minimum ---
test("clamps free edge up to feasible lower bound (spec example)", () => {
  const m = { pairs: { "A|B": 31, "A|C": 8, "B|C": 4 } };
  const { matrix, changes } = repair(m, { pinnedRowTokenId: "A" });
  // |31 - 8| = 23, so B|C must be at least 23.
  assert.ok(approx(matrix.pairs["B|C"], 23), `B|C=${matrix.pairs["B|C"]}`);
  // Pinned row A is untouched.
  assert.equal(matrix.pairs["A|B"], 31);
  assert.equal(matrix.pairs["A|C"], 8);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].pair, "B|C");
});

// --- Far imposes a LOWER bound (minimum separation) but NO upper cap ---
test("Far edge imposes a lower bound on the off-center edge", () => {
  const m = { pairs: { "A|B": 70, "A|C": 8, "B|C": 4 } }; // A|B is Far (>60)
  const { matrix } = repair(m, { pinnedRowTokenId: "A" });
  // lower = max(0, 60 - 8) = 52.
  assert.ok(approx(matrix.pairs["B|C"], 52), `B|C=${matrix.pairs["B|C"]}`);
});

test("Far edges impose NO upper cap (large separations survive)", () => {
  const m = { pairs: { "A|B": 70, "A|C": 70, "B|C": 200 } };
  const { matrix, changes } = repair(m, { pinnedRowTokenId: "A" });
  assert.equal(matrix.pairs["B|C"], 200);
  assert.equal(changes.length, 0);
});

// --- no-op when the triple is already consistent ---
test("no change when already feasible", () => {
  const m = { pairs: { "A|B": 8, "A|C": 8, "B|C": 10 } };
  const { matrix, changes } = repair(m, { pinnedRowTokenId: "A" });
  assert.equal(matrix.pairs["B|C"], 10);
  assert.equal(changes.length, 0);
});

// --- pinned edges are never modified, even if left inconsistent ---
test("explicitly edited (pinned) edge is never changed", () => {
  const m = { pairs: { "A|B": 31, "A|C": 8, "B|C": 4 } };
  const { matrix, changes } = repair(m, { pinnedRowTokenId: "A", editedEdges: ["B|C"] });
  assert.equal(matrix.pairs["B|C"], 4); // pinned, stays inconsistent by request
  assert.equal(changes.length, 0);
});

// --- token id discovery ---
test("collectTokenIds finds all ids", () => {
  const ids = collectTokenIds({ pairs: { "A|B": 1, "A|C": 2, "B|C": 3 } }).sort();
  assert.deepEqual(ids, ["A", "B", "C"]);
});

// --- multi-token stability: clamps both new edges, leaves the consistent one ---
test("four tokens: moving B far clamps B-C and B-D, leaves C-D", () => {
  const m = { pairs: {
    "A|B": 31, "A|C": 8, "A|D": 8,
    "B|C": 4, "B|D": 4, "C|D": 4
  } };
  const { matrix, converged } = repair(m, { pinnedRowTokenId: "A" });
  assert.ok(converged, "should converge");
  assert.ok(approx(matrix.pairs["B|C"], 23), `B|C=${matrix.pairs["B|C"]}`);
  assert.ok(approx(matrix.pairs["B|D"], 23), `B|D=${matrix.pairs["B|D"]}`);
  assert.ok(approx(matrix.pairs["C|D"], 4), `C|D=${matrix.pairs["C|D"]}`);
});

// --- cascade through a Far edge: D far from A forces B-D and C-D apart ---
test("cascade: D Far from A pushes B-D and C-D to the minimum separation", () => {
  const m = { pairs: {
    "A|B": 8, "A|C": 8, "A|D": 70,
    "B|C": 4, "B|D": 4, "C|D": 4
  } };
  const { matrix, converged } = repair(m, { pinnedRowTokenId: "A" });
  assert.ok(converged, "should converge");
  assert.ok(approx(matrix.pairs["B|C"], 4), `B|C=${matrix.pairs["B|C"]}`);
  assert.ok(approx(matrix.pairs["B|D"], 52), `B|D=${matrix.pairs["B|D"]}`);
  assert.ok(approx(matrix.pairs["C|D"], 52), `C|D=${matrix.pairs["C|D"]}`);
});

// --- result is symmetric/canonical and terminates ---
test("terminates (converged) on a fully clustered start", () => {
  const m = { pairs: {
    "A|B": 5, "A|C": 5, "B|C": 5
  } };
  const { converged } = repair(m, { pinnedRowTokenId: "A" });
  assert.ok(converged);
});

// --- run ---
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
