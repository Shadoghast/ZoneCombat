/**
 * Zone Combat — end-of-turn commit pipeline (DESIGN.md §6.3–6.5, §7).
 *
 * Ties the two engines together: repair the relational matrix (feet), map each pair's
 * band to its schematic pixel interval, then solve token positions. Pure and
 * Foundry-independent (callers inject `nodes`, `radii`, and `bandForDistance`), so the
 * whole pipeline is unit-testable in isolation.
 */
import { repair } from "./propagation.mjs";
import { solveLayout, buildPairTargets, bandPixelIntervals } from "./layout.mjs";

/**
 * @param {object} matrix  relational matrix ({ pairs, ... })
 * @param {object} opts
 * @param {string|null} opts.pinnedRowTokenId  outgoing active token (its row is pinned)
 * @param {string[]} [opts.editedEdges]         pair keys edited this turn
 * @param {Array<{id:string,x:number,y:number,pinned?:boolean}>} opts.nodes
 * @param {number[]} opts.radii                 cumulative schematic radii (px)
 * @param {(feet:number)=>string} opts.bandForDistance  feet → band-key bucketer
 * @param {number} [opts.farLowerBound]
 * @param {object} [opts.layoutOpts]            forwarded to solveLayout
 * @returns {{matrix:object, changes:Array, converged:boolean, positions:object, layoutError:number}}
 */
export function planCommit(matrix, {
  pinnedRowTokenId = null,
  editedEdges = [],
  nodes = [],
  radii = [],
  bandForDistance,
  farLowerBound,
  layoutOpts
} = {}) {
  const tokenIds = nodes.map(n => n.id);

  // 1. Repair the feet matrix to triangle consistency (DESIGN.md §6.4).
  const repaired = repair(matrix, { pinnedRowTokenId, editedEdges, tokenIds, farLowerBound });

  // 2. Map each pair's band to its schematic pixel interval (DESIGN.md §7).
  const bandPx = bandPixelIntervals(radii);
  const targets = buildPairTargets(repaired.matrix, bandForDistance, bandPx);

  // 3. Solve best-fit token positions inside their drawn rings.
  const layout = solveLayout(nodes, targets, layoutOpts);

  return {
    matrix: repaired.matrix,
    changes: repaired.changes,
    converged: repaired.converged,
    positions: layout.positions,
    layoutError: layout.maxError
  };
}
