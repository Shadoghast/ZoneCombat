/**
 * Zone Combat — best-fit layout solver (DESIGN.md §7).
 *
 * STUB. The full solver places tokens on the canvas to best-fit the band matrix:
 *   - error term is ZERO while a pair's canvas distance is inside its band interval,
 *     and penalises only out-of-band distances (slack → no jitter);
 *   - dead-anchor tokens (§8.3) are position-pinned;
 *   - approximate by design, since the matrix need not be 2D-embeddable (§6.4 caveat);
 *   - candidate methods: stress-majorization / classical MDS or force-directed relaxation.
 *
 * For the v0.1 skeleton this is a no-op: tokens keep their current positions.
 *
 * @param {object} matrix  the relational matrix
 * @param {Array<{id:string,x:number,y:number,pinned?:boolean}>} tokens
 * @returns {Array<{id:string,x:number,y:number}>} target positions
 */
export function solveLayout(matrix, tokens) {
  // TODO(layout): implement best-fit embedding per DESIGN.md §7.
  return tokens.map(t => ({ id: t.id, x: t.x, y: t.y }));
}
