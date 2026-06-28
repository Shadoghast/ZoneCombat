/**
 * Tests for the commit pipeline (module/commit.mjs), DESIGN.md §6.3–6.5, §7.
 * Run: node test/commit.test.mjs
 */
import assert from "node:assert/strict";
import { planCommit } from "../module/commit.mjs";
import { schematicRadii } from "../module/geometry.mjs";

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const dist = (p, a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);

// Default five-band bucketer (Close5/Near10/Medium30/Long60/Far).
const bandForDistance = (ft) =>
  ft <= 5 ? "close" : ft <= 10 ? "short" : ft <= 30 ? "medium" : ft <= 60 ? "long" : "extreme";

test("schematicRadii: cumulative, normalised to maxRadius", () => {
  const r = schematicRadii([3, 4, 3, 2, 2], 140); // sum 14
  assert.equal(r.length, 5);
  assert.ok(Math.abs(r[4] - 140) < 1e-6, `outer=${r[4]}`);
  assert.ok(r[0] < r[1] && r[1] < r[2], "monotonic");
});

test("commit repairs the matrix AND lays tokens into their rings", () => {
  // A is the focal/active token. B and C start near A and close to each other.
  // The turn's edit moved B out to Long (A|B = 31). Pin A's row.
  const matrix = { pairs: { "A|B": 31, "A|C": 8, "B|C": 4 } };
  const radii = [30, 60, 90, 110, 130]; // close/near/medium/long/far outer radii (px)
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 40, y: 0 },
    { id: "C", x: 0, y: 40 }
  ];
  const { matrix: out, positions, changes, converged } = planCommit(matrix, {
    pinnedRowTokenId: "A",
    editedEdges: ["A|B"],
    nodes,
    radii,
    bandForDistance,
    layoutOpts: { iterations: 3000 }
  });

  // Repair: B|C clamped up to |31-8| = 23 (Medium).
  assert.ok(Math.abs(out.pairs["B|C"] - 23) < 0.5, `B|C=${out.pairs["B|C"]}`);
  assert.ok(changes.some(c => c.pair === "B|C"));
  assert.ok(converged);

  // Layout: A pinned at origin; B should land in the Long ring [90,110],
  // C in the Near ring [30,60], both measured from A.
  const dAB = dist(positions, "A", "B");
  const dAC = dist(positions, "A", "C");
  assert.ok(dAB >= 88 && dAB <= 112, `A-B=${dAB.toFixed(1)} not in Long ring`);
  assert.ok(dAC >= 28 && dAC <= 62, `A-C=${dAC.toFixed(1)} not in Near ring`);
  assert.deepEqual(positions.A, { x: 0, y: 0 }); // pinned, unmoved
});

test("commit is a no-op layout when everything already fits", () => {
  // Distances already match rings: A|B near (8ft) and that's it.
  const matrix = { pairs: { "A|B": 8 } };
  const radii = [30, 60, 90, 110, 130];
  const nodes = [
    { id: "A", x: 0, y: 0, pinned: true },
    { id: "B", x: 45, y: 0 } // 45px is inside Near ring [30,60]
  ];
  const { positions, changes } = planCommit(matrix, {
    pinnedRowTokenId: "A", nodes, radii, bandForDistance
  });
  assert.equal(changes.length, 0);
  assert.ok(Math.abs(positions.B.x - 45) < 1.0 && Math.abs(positions.B.y) < 1.0);
});

let failed = 0, passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
