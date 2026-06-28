/**
 * Tests for the layout solver (module/layout.mjs), DESIGN.md §7.
 * Run: node test/layout.test.mjs
 */
import assert from "node:assert/strict";
import { solveLayout, buildPairTargets } from "../module/layout.mjs";

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const dist = (p, a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);

// --- push apart when too close -------------------------------------------------
test("pushes a too-close pair out to the lower bound", () => {
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 50, y: 0 }
  ];
  const { positions } = solveLayout(nodes, { "A|B": [100, 200] });
  const d = dist(positions, "A", "B");
  assert.ok(d >= 100 - 1, `expected >= ~100, got ${d}`);
  assert.ok(d <= 110, `should settle near lower bound, got ${d}`);
});

// --- pull in when too far ------------------------------------------------------
test("pulls a too-far pair in to the upper bound", () => {
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 400, y: 0 }
  ];
  const { positions } = solveLayout(nodes, { "A|B": [100, 200] });
  const d = dist(positions, "A", "B");
  assert.ok(d <= 200 + 1, `expected <= ~200, got ${d}`);
  assert.ok(d >= 190, `should settle near upper bound, got ${d}`);
});

// --- no movement when already in band -----------------------------------------
test("leaves an in-band pair untouched", () => {
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 150, y: 0 }
  ];
  const { positions, maxError } = solveLayout(nodes, { "A|B": [100, 200] });
  assert.ok(approxPt(positions.B, { x: 150, y: 0 }), `B moved to ${JSON.stringify(positions.B)}`);
  assert.ok(maxError <= 0.5);
});

// --- pinned node never moves ---------------------------------------------------
test("pinned node stays fixed; the free one moves", () => {
  const nodes = [
    { id: "A", x: 10, y: 20, pinned: true },
    { id: "B", x: 60, y: 20 }
  ];
  const { positions } = solveLayout(nodes, { "A|B": [200, 300] });
  assert.deepEqual(positions.A, { x: 10, y: 20 });
  assert.ok(dist(positions, "A", "B") >= 199);
});

// --- multi-node consistent set settles with all pairs in band -----------------
test("three nodes settle with every pair inside its interval", () => {
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 10, y: 0 },
    { id: "C", x: 0, y: 10 }
  ];
  const intervals = {
    "A|B": [90, 110],
    "A|C": [90, 110],
    "B|C": [90, 130]
  };
  const { positions } = solveLayout(nodes, intervals, { iterations: 2000 });
  for (const [key, [lo, hi]] of Object.entries(intervals)) {
    const [a, b] = key.split("|");
    const d = dist(positions, a, b);
    assert.ok(d >= lo - 2 && d <= hi + 2, `${key} = ${d.toFixed(1)} not in [${lo},${hi}]`);
  }
});

// --- coincident nodes are separated deterministically -------------------------
test("coincident nodes get pushed apart (no NaN)", () => {
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 0, y: 0 }
  ];
  const { positions } = solveLayout(nodes, { "A|B": [50, 100] });
  const d = dist(positions, "A", "B");
  assert.ok(Number.isFinite(d) && d >= 49, `got ${d}`);
});

// --- band → pixel interval mapping --------------------------------------------
// --- buildPairTargets buckets distances into band intervals --------------------
test("buildPairTargets maps each pair via its band", () => {
  const matrix = { pairs: { "A|B": 3, "A|C": 200 } };
  const bandForDistance = (ft) => (ft <= 5 ? "close" : "far");
  const bandPx = { close: [0, 34], far: [104, Infinity] };
  const targets = buildPairTargets(matrix, bandForDistance, bandPx);
  assert.deepEqual(targets["A|B"], [0, 34]);
  assert.deepEqual(targets["A|C"], [104, Infinity]);
});

function approxPt(p, q, eps = 1.0) {
  return Math.abs(p.x - q.x) <= eps && Math.abs(p.y - q.y) <= eps;
}

let failed = 0, passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
