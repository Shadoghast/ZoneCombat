/**
 * Zone Combat — best-fit layout solver (pure, Foundry-independent).
 * Places tokens so each pair's on-canvas distance falls inside its target pixel interval:
 * zero force while inside the band (no jitter), pinned nodes held fixed, approximate when
 * the matrix isn't 2D-embeddable.
 */
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
 * Per-pair pixel target intervals from the matrix: bucket each pair's distance to a band,
 * then map that band to its pixel interval.
 * @param {(feet:number)=>string} bandForDistance  distance→band-key bucketer
 * @param {Object<string,[number,number]>} bandPx   band-key → [innerPx, outerPx]
 */
export function buildPairTargets(matrix, bandForDistance, bandPx) {
  const targets = {};
  for (const [key, feet] of Object.entries(matrix.pairs ?? {})) {
    targets[key] = bandPx[bandForDistance(feet)] ?? [0, Infinity];
  }
  return targets;
}
