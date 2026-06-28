/**
 * Zone Combat — matrix store (DESIGN.md §6.1, §6.7).
 * The single gateway to the relational state, persisted as a per-scene flag.
 * One scalar distance per UNORDERED token pair (symmetry enforced by the sorted key).
 */
import { ZONE_COMBAT } from "./config.mjs";

const NS = ZONE_COMBAT.id;
const KEY = "matrix";

/** Canonical key for an unordered pair: the two token ids sorted and joined. */
export function pairKey(a, b) {
  return [a, b].sort().join("|");
}

/** Read the matrix flag, returning a fresh empty matrix when none exists. */
export function getMatrix(scene = canvas?.scene) {
  const stored = scene?.getFlag?.(NS, KEY);
  return stored ?? emptyMatrix();
}

export function emptyMatrix() {
  return {
    version: 1,
    nominalFar: ZONE_COMBAT.defaults.farNominal,
    pairs: {},        // "idA|idB" -> scalar feet
    deadAnchors: [],  // inert-anchor token ids (DESIGN.md §8.3)
    log: []           // per-turn change entries (DESIGN.md §6.5)
  };
}

export async function setMatrix(scene, data) {
  return scene?.setFlag?.(NS, KEY, data);
}

/** Remove every trace of a token from the matrix (DESIGN.md §8.2). */
export function pruneToken(matrix, id) {
  for (const k of Object.keys(matrix.pairs)) {
    if (k.split("|").includes(id)) delete matrix.pairs[k];
  }
  matrix.deadAnchors = (matrix.deadAnchors ?? []).filter(x => x !== id);
  return matrix;
}

/** Mark / clear a token as an inert anchor (DESIGN.md §8.3). */
export function setDeadAnchor(matrix, id, isDead) {
  const set = new Set(matrix.deadAnchors ?? []);
  if (isDead) set.add(id); else set.delete(id);
  matrix.deadAnchors = [...set];
  return matrix;
}
