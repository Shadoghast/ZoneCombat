/**
 * Zone Combat — Foundry integration glue (DESIGN.md §6.3–6.5, §8.1).
 * Bridges the pure engines to the live scene: matrix seeding, the end-of-turn commit,
 * node gathering, distance measurement, and (optionally) moving tokens to solved spots.
 */
import { ZONE_COMBAT } from "./config.mjs";
import * as store from "./store.mjs";
import { schematicRadii } from "./geometry.mjs";
import { getVisualWeights, getThresholds } from "./settings.mjs";
import { bandForDistance } from "./bands.mjs";
import { planCommit } from "./commit.mjs";

const MAX_LOG = 200;

// True while we are moving tokens to solved positions, so the drag handler can ignore
// the resulting updateToken events instead of treating them as user edits.
let _applyingLayout = false;
export function isApplyingLayout() { return _applyingLayout; }

export function cellSize() {
  return canvas?.dimensions?.size ?? 100;
}

export function computeRadii() {
  return schematicRadii(getVisualWeights(), cellSize() * 8);
}

/** Long/Far boundary in feet = largest finite threshold. */
export function farLowerBound() {
  const finite = getThresholds().filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : 60;
}

function tokenCenter(td) {
  const t = canvas.tokens?.get(td.id);
  if (t?.center) return t.center;
  const w = (td.width ?? 1) * cellSize();
  const h = (td.height ?? 1) * cellSize();
  return { x: td.x + w / 2, y: td.y + h / 2 };
}

/** True distance in scene units (feet) between two token documents. */
export function measureFeet(aDoc, bDoc) {
  const a = tokenCenter(aDoc), b = tokenCenter(bDoc);
  try {
    if (canvas.grid?.measurePath) return canvas.grid.measurePath([a, b]).distance;
    if (canvas.grid?.measureDistance) return canvas.grid.measureDistance(a, b);
  } catch (_) { /* fall through to pixel estimate */ }
  const px = Math.hypot(a.x - b.x, a.y - b.y);
  return (px / cellSize()) * (canvas.dimensions?.distance ?? 5);
}

function sceneTokens(scene) {
  return scene?.tokens?.contents ?? [];
}

/** Geometry-seed any missing pairs for the scene's tokens (DESIGN.md §8.1). GM only. */
export async function seedMissingPairs(scene = canvas?.scene) {
  if (!scene || !game.user?.isGM) return;
  const tokens = sceneTokens(scene);
  if (tokens.length < 2) return;
  const matrix = store.getMatrix(scene);
  let changed = false;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const key = store.pairKey(tokens[i].id, tokens[j].id);
      if (!(key in matrix.pairs)) {
        matrix.pairs[key] = measureFeet(tokens[i], tokens[j]);
        changed = true;
      }
    }
  }
  if (changed) await store.setMatrix(scene, matrix);
}

function gatherNodes(scene, focalId) {
  const dead = new Set(store.getMatrix(scene).deadAnchors ?? []);
  return sceneTokens(scene).map(td => {
    const c = tokenCenter(td);
    return { id: td.id, x: c.x, y: c.y, pinned: dead.has(td.id) || td.id === focalId };
  });
}

function appendLog(log = [], changes, focalId) {
  if (!changes?.length) return log;
  const entry = { t: Date.now(), focal: focalId, changes };
  return [...log, entry].slice(-MAX_LOG);
}

/**
 * Commit the outgoing turn: repair the matrix (pinning the outgoing focal row),
 * persist it with a change-log entry, and — if enabled — move tokens to the solved
 * positions. (DESIGN.md §6.3–6.5, §7)
 */
export async function commitTurn(scene, outgoingFocalId, editedEdges = []) {
  if (!scene || !game.user?.isGM) return null;
  const matrix = store.getMatrix(scene);
  const nodes = gatherNodes(scene, outgoingFocalId);
  const plan = planCommit(matrix, {
    pinnedRowTokenId: outgoingFocalId,
    editedEdges,
    nodes,
    radii: computeRadii(),
    bandForDistance,
    farLowerBound: farLowerBound()
  });

  await store.setMatrix(scene, {
    ...plan.matrix,
    log: appendLog(matrix.log, plan.changes, outgoingFocalId)
  });

  if (safeGet("applyLayout")) await applyPositions(scene, plan.positions, nodes);
  return plan;
}

async function applyPositions(scene, positions, nodes) {
  const updates = [];
  for (const n of nodes) {
    if (n.pinned) continue;
    const p = positions[n.id];
    if (!p) continue;
    const t = canvas.tokens?.get(n.id);
    const w = t?.w ?? cellSize();
    const h = t?.h ?? cellSize();
    updates.push({ _id: n.id, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) });
  }
  if (!updates.length) return;
  _applyingLayout = true;
  try { await scene.updateEmbeddedDocuments("Token", updates); }
  finally { _applyingLayout = false; }
}

function safeGet(key) {
  try { return game.settings.get(ZONE_COMBAT.id, key); }
  catch { return undefined; }
}
