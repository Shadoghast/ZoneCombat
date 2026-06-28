/**
 * Zone Combat — turn recenter & batched commit (DESIGN.md §6.3, §6.8, §8.4).
 *
 * Tracks the focal token (active combatant) and the set of edges edited during the
 * current turn. On combat advance it commits the OUTGOING turn (repair + persist +
 * optional re-layout), discards interrupted edits, then recenters on the new active
 * token.
 */
import * as integration from "./integration.mjs";
import { getMode } from "./settings.mjs";

let _focalTokenId = null;
let _editedThisTurn = new Set();

/** The token the diagram is currently centered on, if any. */
export function getFocalTokenId() {
  return _focalTokenId;
}

export function setFocalToken(id) {
  _focalTokenId = id ?? null;
  canvas?.zoneCombat?.requestRedraw?.();
}

/** Mark a pair as edited this turn (called by the drag handler). */
export function markEdited(pairKey) {
  _editedThisTurn.add(pairKey);
}

export function clearEdits() {
  _editedThisTurn = new Set();
}

export function getEditedEdges() {
  return [..._editedThisTurn];
}

/**
 * On combat advance, commit the outgoing turn then recenter (DESIGN.md §6.3).
 * Interrupted/active-token-death edits are discarded by the same clear (§8.4).
 */
export async function onUpdateCombat(combat, changed) {
  if (!("turn" in (changed ?? {}) || "round" in (changed ?? {}))) return;

  const scene = canvas?.scene;
  const zonesMode = getMode(scene) === "zones";
  const outgoing = _focalTokenId;
  if (!zonesMode && scene && game.user?.isGM && outgoing) {
    try {
      await integration.commitTurn(scene, outgoing, getEditedEdges());
    } catch (err) {
      console.error("Zone Combat | end-of-turn commit failed", err);
    }
  }
  clearEdits();

  // Never recenter the diagram on a dead/inert anchor (DESIGN.md §8.3).
  const nextId = combat?.combatant?.tokenId ?? null;
  const isDead = nextId && scene ? integration.isDeadAnchor(scene, nextId) : false;
  const focal = isDead ? null : nextId;
  setFocalToken(focal);

  // Static map (bands mode only): move the active token to centre, arrange the rest.
  if (!zonesMode && scene && game.user?.isGM && focal) {
    try { await integration.arrangeForFocal(scene, focal); }
    catch (err) { console.error("Zone Combat | arrange failed", err); }
  }
}

/** Begin-of-combat: center on the first combatant and arrange (DESIGN.md §6.3). */
export async function onCombatStart(combat) {
  const scene = canvas?.scene;
  const focal = combat?.combatant?.tokenId ?? null;
  setFocalToken(focal);
  if (getMode(scene) !== "zones" && scene && game.user?.isGM && focal) {
    try { await integration.arrangeForFocal(scene, focal); }
    catch (err) { console.error("Zone Combat | arrange failed", err); }
  }
}
