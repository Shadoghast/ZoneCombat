/**
 * Zone Combat — drag-to-band interaction (DESIGN.md §7 bidirectional edits).
 *
 * When a token is dragged on the canvas:
 *  - dropped INSIDE the focal token's shells → snap to that band relative to the focal
 *    token (set d{focal, X} to the band's representative distance);
 *  - dropped OUTSIDE the diagram, or the dragged token IS the focal token → re-derive
 *    that token's whole row from real geometry.
 * Either way the pair(s) are marked edited so the end-of-turn commit pins them (§6.3).
 */
import * as store from "./store.mjs";
import { getFocalTokenId, markEdited } from "./turn.mjs";
import { representativeDistance, bandForDistance } from "./bands.mjs";
import { getFarNominal } from "./settings.mjs";
import { measureDistance, isApplyingLayout, originPoint, pixelsPerUnit } from "./integration.mjs";

/** Re-derive a token's whole row from true geometry (DESIGN.md §7 free-drag). */
function rederiveRow(scene, matrix, id) {
  const me = scene.tokens.get(id);
  if (!me) return;
  for (const other of scene.tokens.contents) {
    if (other.id === id) continue;
    const key = store.pairKey(id, other.id);
    matrix.pairs[key] = measureDistance(me, other);
    markEdited(key);
  }
}

/** updateToken handler: interpret a user drag as a relational edit. GM only. */
export async function onTokenMoved(tokenDoc, change, options, userId) {
  if (isApplyingLayout()) return;                       // ignore our own layout moves
  if (!("x" in (change ?? {}) || "y" in (change ?? {}))) return;
  if (!game.user?.isGM) return;
  const scene = tokenDoc?.parent;
  if (!scene || scene !== canvas?.scene) return;

  const matrix = store.getMatrix(scene);
  const id = tokenDoc.id;
  const focalId = getFocalTokenId();

  if (!focalId || id === focalId) {
    rederiveRow(scene, matrix, id);                     // focal reposition → geometric
  } else {
    const moved = canvas.tokens?.get(id);
    if (!moved) return;
    // The active token sits at the scene centre, so the band is read from the dropped
    // token's distance to that fixed centre, converted to the current unit.
    const origin = originPoint();
    const distPx = Math.hypot(origin.x - moved.center.x, origin.y - moved.center.y);
    const distUnit = distPx / pixelsPerUnit();
    const band = bandForDistance(distUnit);
    const key = store.pairKey(focalId, id);
    matrix.pairs[key] = representativeDistance(band, matrix.pairs[key], getFarNominal());
    markEdited(key);
  }

  await store.setMatrix(scene, matrix);
  canvas?.zoneCombat?.requestRedraw?.();
}
