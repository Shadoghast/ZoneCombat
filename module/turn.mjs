/**
 * Zone Combat — turn recenter & batched commit (DESIGN.md §6.3, §6.8).
 *
 * Skeleton: tracks the focal token (active combatant, falling back to the controlled
 * token in the canvas layer). The batched end-of-turn repair/commit will hang off the
 * combat-advance path here once propagation/layout land.
 */
let _focalTokenId = null;

/** The token the diagram is currently centered on, if any. */
export function getFocalTokenId() {
  return _focalTokenId;
}

export function setFocalToken(id) {
  _focalTokenId = id ?? null;
  canvas?.zoneCombat?.requestRedraw?.();
}

/** When the active combatant changes, recenter on its token (DESIGN.md §6.3). */
export function onUpdateCombat(combat, changed) {
  // `turn`/`round` changing implies a new active combatant.
  if (!("turn" in (changed ?? {}) || "round" in (changed ?? {}))) return;
  const tokenId = combat?.combatant?.tokenId ?? null;
  setFocalToken(tokenId);
  // TODO(turn): run batched end-of-turn repair (§6.4) + re-layout (§7) for the
  // outgoing turn before recentering, and surface propagated changes (§6.5).
}
