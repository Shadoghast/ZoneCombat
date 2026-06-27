/**
 * Zone Combat — pure geometry helpers shared by the canvas layer and the commit pipeline.
 * No Foundry dependencies.
 */

/**
 * Cumulative schematic shell radii (px) from per-band visual weights (DESIGN.md §4.1).
 * Inner bands large, outer compressed — normalised so the outermost ring = maxRadius.
 * @param {number[]} weights  per-band visual weights, inner → outer
 * @param {number} maxRadius  outermost ring radius in px
 * @returns {number[]} cumulative outer radius per band
 */
export function schematicRadii(weights, maxRadius) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return weights.map(w => { acc += w; return (acc / total) * maxRadius; });
}
