/**
 * Zone Combat — best-fit layout solver (DESIGN.md §7).
 *
 * Places tokens on the canvas so each pair's on-canvas distance falls inside that
 * pair's target pixel interval. The targets are the SCHEMATIC shell radii (weight-based
 * rings, §4.1) mapped to a band → [innerRadius, outerRadius] pixel range — so a token in
 * the "Near" band lands inside the drawn Near ring, not at its true distance in feet.
 *
 * Key properties (DESIGN.md §7):
 *  - Zero force while a pair's distance is inside its band interval (slack → no jitter).
 *  - Pinned nodes (focal token + dead anchors, §8.3) are held fixed.
 *  - Approximate by design: the matrix need not be 2D-embeddable, so the solver
 *    minimises out-of-band error rather than guaranteeing a perfect layout.
 *
 * The core `solveLayout` is pure (positions + intervals in, positions out) and
 * Foundry-independent, so it can be unit-tested in isolation.
 */
import { ZONE_COMBAT } from "./config.mjs";
import { pairKey } from "./store.mjs";

const EPS = 1e-6;

/**
 * @param {Array<{id:string,x:number,y:number,pinned?:boolean}>} nodes
 * @param {Object<string,[number,number]>} intervals  pairKey → [loPx, hiPx] target range
 * @param {object} [opts]
 * @param {number} [opts.iterations=600]
 * @param {number} [opts.step=0.1]      relaxation rate (0..1)
 * @param {number} [opts.tol=0.5]       px tolerance for "in band" / convergence
 * @returns {{positions:Object<string,{x:number,y:number}>, maxError:number, iterations:number}}
 */
export function solveLayout(nodes, intervals, { iterations = 600, step = 0.1, tol = 0.5 } = {}) {
  const pos = {};
  const pinned = {};
  for (const n of nodes) { pos[n.id] = { x: n.x, y: n.y }; pinned[n.id] = !!n.pinned; }

  const pairs = Object.keys(intervals).map(key => {
    const [a, b] = key.split("|");
    return { key, a, b, lo: intervals[key][0], hi: intervals[key][1] };
  }).filter(p => pos[p.a] && pos[p.b]);

  let maxError = 0;
  let used = 0;
  for (let iter = 0; iter < iterations; iter++) {
    used = iter + 1;
    const disp = {};
    for (const id in pos) disp[id] = { x: 0, y: 0 };
    maxError = 0;

    for (const { a, b, lo, hi } of pairs) {
      const pa = pos[a], pb = pos[b];
      let dx = pb.x - pa.x, dy = pb.y - pa.y;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) {
        // Coincident: nudge apart deterministically so the unit vector is defined.
        const h = (hashId(a) - hashId(b)) || 1;
        dx = (h % 7) - 3 || 1; dy = (h % 5) - 2 || 1;
        dist = Math.hypot(dx, dy);
      }
      const target = Math.min(Math.max(dist, lo), hi); // nearest in-band distance
      const err = Math.abs(dist - target);
      if (err > maxError) maxError = err;
      if (err <= EPS) continue;

      const ux = dx / dist, uy = dy / dist;
      const delta = target - dist;          // +ve: push apart; -ve: pull together
      const half = (delta / 2) * step;
      disp[a].x -= ux * half; disp[a].y -= uy * half;
      disp[b].x += ux * half; disp[b].y += uy * half;
    }

    let moved = 0;
    for (const id in pos) {
      if (pinned[id]) continue;
      pos[id].x += disp[id].x; pos[id].y += disp[id].y;
      moved = Math.max(moved, Math.hypot(disp[id].x, disp[id].y));
    }
    if (maxError <= tol || moved <= EPS) break;
  }

  return { positions: pos, maxError, iterations: used };
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

/**
 * Map the cumulative schematic shell radii (px) to per-band [inner, outer] intervals.
 * @param {number[]} radii  cumulative outer radius per band, inner → outer
 * @returns {Object<string,[number,number]>} bandKey → [innerPx, outerPx]
 */
export function bandPixelIntervals(radii) {
  const out = {};
  ZONE_COMBAT.bands.forEach((b, i) => {
    const inner = i === 0 ? 0 : radii[i - 1];
    const outer = i === radii.length - 1 ? Infinity : radii[i]; // Far ring is open-ended
    out[b.key] = [inner, outer];
  });
  return out;
}

/**
 * Build per-pair pixel target intervals from the matrix, by bucketing each pair's
 * distance to a band and mapping that band to its schematic pixel interval.
 * @param {object} matrix
 * @param {(feet:number)=>string} bandForDistance  distance→band-key bucketer
 * @param {Object<string,[number,number]>} bandPx   band-key → [innerPx, outerPx]
 * @returns {Object<string,[number,number]>}
 */
export function buildPairTargets(matrix, bandForDistance, bandPx) {
  const targets = {};
  for (const [key, feet] of Object.entries(matrix.pairs ?? {})) {
    const band = bandForDistance(feet);
    targets[key] = bandPx[band] ?? [0, Infinity];
  }
  return targets;
}

export { pairKey };
