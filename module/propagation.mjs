/**
 * Zone Combat — triangle-inequality constraint repair (DESIGN.md §6.4).
 *
 * The relational matrix stores one scalar distance per unordered pair. After an edit,
 * some off-center pairs may violate the triangle inequality. `repair` restores
 * consistency by clamping the *free* (non-pinned) edges into the feasible interval
 * implied by the other two edges of each triple, iterating to a fixpoint.
 *
 * Pinning (DESIGN.md §6.3/§6.4): the active token's whole row is pinned, plus any
 * edges explicitly edited this turn. Pinned edges are never modified.
 *
 * Far handling (DESIGN.md §6.4): an edge in the Far band has a lower bound (the Far
 * threshold) but an *unbounded upper* (∞), so a Far pairing imposes a minimum
 * separation on others but never an upper cap. Its stored scalar is for layout only.
 *
 * Pure and Foundry-independent so it can be unit-tested in isolation.
 */
import { pairKey } from "./store.mjs";

const EPS = 1e-6;

/**
 * Fallback Long/Far boundary used only when a caller does not pass `farLowerBound`.
 * Live callers (integration) pass the unit-aware Long threshold explicitly.
 */
function defaultFarLowerBound() {
  return 60;
}

/** Distinct token ids referenced by the matrix's pair keys. */
export function collectTokenIds(matrix) {
  const ids = new Set();
  for (const key of Object.keys(matrix.pairs ?? {})) {
    for (const id of key.split("|")) ids.add(id);
  }
  return [...ids];
}

/**
 * Repair the matrix to triangle-inequality consistency.
 *
 * @param {object} matrix                     { pairs: { "a|b": feet, ... }, ... }
 * @param {object} [opts]
 * @param {string|null} [opts.pinnedRowTokenId] active/focal token; its whole row is pinned
 * @param {string[]} [opts.editedEdges]        additional pinned pair keys (edited this turn)
 * @param {string[]|null} [opts.tokenIds]      override the token set (else derived from pairs)
 * @param {number} [opts.farLowerBound]        Far band lower bound (default = Long threshold)
 * @param {number} [opts.maxSweeps]            iteration cap (defensive, DESIGN.md §6.4)
 * @returns {{matrix: object, changes: Array<{pair:string,from:number,to:number}>, converged: boolean}}
 */
export function repair(matrix, {
  pinnedRowTokenId = null,
  editedEdges = [],
  tokenIds = null,
  farLowerBound = defaultFarLowerBound(),
  maxSweeps = 10000
} = {}) {
  const ids = tokenIds ?? collectTokenIds(matrix);
  const original = { ...(matrix.pairs ?? {}) };
  const d = { ...original };

  // Build the pinned-edge set: the active token's whole row + explicit edits.
  const pinned = new Set(editedEdges);
  if (pinnedRowTokenId) {
    for (const id of ids) {
      if (id !== pinnedRowTokenId) pinned.add(pairKey(pinnedRowTokenId, id));
    }
  }

  // Pre-compute the triples (id combinations) whose three edges all exist.
  const triples = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let k = j + 1; k < ids.length; k++) {
        const kx = pairKey(ids[i], ids[j]);
        const ky = pairKey(ids[i], ids[k]);
        const kz = pairKey(ids[j], ids[k]);
        if (kx in d && ky in d && kz in d) triples.push([kx, ky, kz]);
      }
    }
  }

  const isFar = (v) => v > farLowerBound + EPS;
  const upper = (v) => (isFar(v) ? Infinity : v);
  const lower = (v) => (isFar(v) ? farLowerBound : v);

  // Feasible interval for one edge given the other two edges' current values.
  const feasible = (p, q) => {
    const hi = upper(p) + upper(q);
    const lo = Math.max(0, lower(p) - upper(q), lower(q) - upper(p));
    return [lo, hi];
  };

  let converged = false;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let changed = false;
    for (const [kx, ky, kz] of triples) {
      // For each free edge, clamp into the interval set by the other two (Gauss-Seidel).
      changed = clampEdge(kx, ky, kz) || changed;
      changed = clampEdge(ky, kx, kz) || changed;
      changed = clampEdge(kz, kx, ky) || changed;
    }
    if (!changed) { converged = true; break; }
  }

  function clampEdge(target, a, b) {
    if (pinned.has(target)) return false;
    const [lo, hi] = feasible(d[a], d[b]);
    const cur = d[target];
    let next = cur;
    if (cur < lo - EPS) next = lo;
    else if (cur > hi + EPS) next = hi;
    if (Number.isFinite(next) && Math.abs(next - cur) > EPS) {
      d[target] = next;
      return true;
    }
    return false;
  }

  // Diff against the original to produce the change log (DESIGN.md §6.5).
  const changes = [];
  for (const key of Object.keys(d)) {
    if (Math.abs(d[key] - original[key]) > EPS) {
      changes.push({ pair: key, from: original[key], to: d[key] });
    }
  }

  return { matrix: { ...matrix, pairs: d }, changes, converged };
}
