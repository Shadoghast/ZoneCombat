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
import { summarizeChanges } from "./changelog.mjs";
import { solveLayout, buildPairTargets, bandPixelIntervals } from "./layout.mjs";

const MAX_LOG = 200;

// True while we are moving tokens to solved positions, so the drag handler can ignore
// the resulting updateToken events instead of treating them as user edits.
let _applyingLayout = false;
export function isApplyingLayout() { return _applyingLayout; }

export function cellSize() {
  return canvas?.dimensions?.size ?? 100;
}

/** Fixed anchor for the static zone map: the centre of the scene rectangle (§3, static map). */
export function sceneCenter() {
  const d = canvas?.dimensions;
  if (!d) return { x: 0, y: 0 };
  if (d.sceneX != null && d.sceneWidth != null) {
    return { x: d.sceneX + d.sceneWidth / 2, y: d.sceneY + d.sceneHeight / 2 };
  }
  return { x: (d.width ?? 0) / 2, y: (d.height ?? 0) / 2 };
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

  postChangeLog(scene, plan.changes);
  return plan;
}

/**
 * Arrange tokens into the STATIC zone map (§3 static map): pin the active token at the
 * scene centre and place everyone else into their rings around it, then move the tokens.
 * The map itself does not move — the tokens move into it.
 */
export async function arrangeForFocal(scene, focalId) {
  if (!scene || !focalId || !game.user?.isGM) return;
  if (!safeGet("applyLayout")) return;

  const origin = sceneCenter();
  const matrix = store.getMatrix(scene);
  const dead = new Set(matrix.deadAnchors ?? []);

  const nodes = sceneTokens(scene).map(td => {
    if (td.id === focalId) return { id: td.id, x: origin.x, y: origin.y, pinned: true };
    const c = tokenCenter(td);
    return { id: td.id, x: c.x, y: c.y, pinned: dead.has(td.id) };
  });

  const targets = buildPairTargets(matrix, bandForDistance, bandPixelIntervals(computeRadii()));
  const { positions } = solveLayout(nodes, targets);
  await applyPositions(scene, positions);
}

/** Whisper a summary of band-level changes to GMs (DESIGN.md §6.5). */
function postChangeLog(scene, changes) {
  if (!safeGet("logChanges")) return;
  const nameOf = (id) => scene.tokens.get(id)?.name ?? id;
  const lines = summarizeChanges(changes, bandForDistance, { nameOf });
  if (!lines.length) return;
  const content = `<strong>Zone Combat — range changes</strong><ul>${
    lines.map(l => `<li>${l}</li>`).join("")
  }</ul>`;
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  ChatMessage.create({ content, whisper: gmIds });
}

/** Mark or clear a token as an inert dead anchor (DESIGN.md §8.3). GM only. */
export async function setTokenDead(scene, tokenId, isDead) {
  if (!scene || !tokenId || !game.user?.isGM) return;
  const matrix = store.setDeadAnchor(store.getMatrix(scene), tokenId, !!isDead);
  await store.setMatrix(scene, matrix);
  canvas?.zoneCombat?.requestRedraw?.();
}

/** Is this token currently a dead anchor? */
export function isDeadAnchor(scene, tokenId) {
  return (store.getMatrix(scene).deadAnchors ?? []).includes(tokenId);
}

async function applyPositions(scene, positions) {
  const updates = [];
  for (const [id, p] of Object.entries(positions)) {
    const t = canvas.tokens?.get(id);
    const w = t?.w ?? cellSize();
    const h = t?.h ?? cellSize();
    const cur = t?.center ?? { x: p.x, y: p.y };
    if (Math.hypot(cur.x - p.x, cur.y - p.y) < 1) continue; // already there → don't move
    updates.push({ _id: id, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) });
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
