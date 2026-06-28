/**
 * Tests for the drawn-zone graph core (module/zone-graph.mjs).
 * Run: node test/zone-graph.test.mjs
 */
import assert from "node:assert/strict";
import {
  pointInRings, minRingDistance, polygonsAdjacent,
  buildAutoEdges, applyOverrides, buildGraph, hopDistance, edgeKey, toggleLink
} from "../module/zone-graph.mjs";

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A square [x,y]..[x+s,y+s] as a flat ring.
const square = (x, y, s) => [x, y, x + s, y, x + s, y + s, x, y + s];

test("pointInRings: inside vs outside a square", () => {
  const rings = [square(0, 0, 100)];
  assert.equal(pointInRings(50, 50, rings), true);
  assert.equal(pointInRings(150, 50, rings), false);
});

test("minRingDistance: touching squares = 0, gapped = gap", () => {
  const a = [square(0, 0, 100)];
  const b = [square(100, 0, 100)]; // shares the x=100 edge
  assert.equal(minRingDistance(a, b), 0);
  const c = [square(150, 0, 100)]; // 50 gap from a
  assert.ok(Math.abs(minRingDistance(a, c) - 50) < 1e-6);
});

test("polygonsAdjacent honours the threshold and overlap", () => {
  const a = [square(0, 0, 100)];
  const near = [square(110, 0, 100)];   // 10 gap
  const far = [square(200, 0, 100)];    // 100 gap
  assert.equal(polygonsAdjacent(a, near, 15), true);
  assert.equal(polygonsAdjacent(a, far, 15), false);
  const overlapping = [square(50, 50, 100)];
  assert.equal(polygonsAdjacent(a, overlapping, 0), true); // overlap → adjacent
});

test("buildAutoEdges links a row of touching zones", () => {
  const zones = [
    { id: "A", rings: [square(0, 0, 100)] },
    { id: "B", rings: [square(100, 0, 100)] },
    { id: "C", rings: [square(200, 0, 100)] }
  ];
  const edges = buildAutoEdges(zones, 1);
  const keys = new Set(edges.map(([a, b]) => edgeKey(a, b)));
  assert.ok(keys.has(edgeKey("A", "B")));
  assert.ok(keys.has(edgeKey("B", "C")));
  assert.ok(!keys.has(edgeKey("A", "C"))); // not touching
});

test("applyOverrides adds and removes links", () => {
  const auto = [["A", "B"], ["B", "C"]];
  const merged = applyOverrides(auto, [["A", "C"]], [["B", "C"]]);
  const keys = new Set(merged.map(([a, b]) => edgeKey(a, b)));
  assert.ok(keys.has(edgeKey("A", "B")));
  assert.ok(keys.has(edgeKey("A", "C")));   // added
  assert.ok(!keys.has(edgeKey("B", "C")));  // removed
});

test("hopDistance: chain distances, same zone, unreachable", () => {
  const g = buildGraph(["A", "B", "C", "D", "X"],
    [["A", "B"], ["B", "C"], ["C", "D"]]);
  assert.equal(hopDistance(g, "A", "A"), 0);
  assert.equal(hopDistance(g, "A", "B"), 1);
  assert.equal(hopDistance(g, "A", "C"), 2);
  assert.equal(hopDistance(g, "A", "D"), 3);
  assert.equal(hopDistance(g, "A", "X"), Infinity); // disconnected
  assert.equal(hopDistance(g, "A", null), Infinity);
});

test("hopDistance takes the shorter path when a loop exists", () => {
  // A-B-C-D and a shortcut A-D
  const g = buildGraph(["A", "B", "C", "D"],
    [["A", "B"], ["B", "C"], ["C", "D"], ["A", "D"]]);
  assert.equal(hopDistance(g, "A", "D"), 1);
  assert.equal(hopDistance(g, "A", "C"), 2);
});

test("toggleLink removes an auto edge, then restores it", () => {
  const auto = [["A", "B"]];
  let links = toggleLink(auto, { added: [], removed: [] }, "A", "B");
  assert.equal(links.removed.length, 1);            // auto link turned off
  assert.equal(links.added.length, 0);
  // and the final graph no longer has it
  let edges = applyOverrides(auto, links.added, links.removed);
  assert.equal(edges.length, 0);
  // toggle again → restored
  links = toggleLink(auto, links, "A", "B");
  edges = applyOverrides(auto, links.added, links.removed);
  assert.equal(edges.length, 1);
});

test("toggleLink adds a non-auto edge, then removes it", () => {
  const auto = [["A", "B"]];
  let links = toggleLink(auto, { added: [], removed: [] }, "C", "D");
  assert.equal(links.added.length, 1);
  let edges = applyOverrides(auto, links.added, links.removed);
  assert.equal(new Set(edges.map(([a, b]) => edgeKey(a, b))).has(edgeKey("C", "D")), true);
  links = toggleLink(auto, links, "C", "D");
  assert.equal(links.added.length, 0);
});

let failed = 0, passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${err.message}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
