/**
 * Zone Combat — entry point.
 * Relative range-band combat for Foundry VTT v14+.
 * See docs/DESIGN.md for the full model.
 */
import { ZONE_COMBAT } from "./module/config.mjs";
import { registerSettings } from "./module/settings.mjs";
import { ZoneCombatLayer } from "./module/canvas-layer.mjs";
import * as turn from "./module/turn.mjs";
import * as store from "./module/store.mjs";
import * as integration from "./module/integration.mjs";
import * as drag from "./module/drag.mjs";

// Expose a small public API for debugging / future use.
globalThis.zoneCombat = { config: ZONE_COMBAT, ZoneCombatLayer, turn, store };

Hooks.once("init", () => {
  console.log("Zone Combat | init");

  CONFIG.ZONE_COMBAT = ZONE_COMBAT;
  registerSettings();

  // Register the overlay as a dedicated interface canvas layer (DESIGN.md §3).
  CONFIG.Canvas.layers.zoneCombat = {
    group: "interface",
    layerClass: ZoneCombatLayer
  };
});

Hooks.once("ready", () => {
  console.log("Zone Combat | ready");
});

// --- Redraw triggers (DESIGN.md §3 "Redraw triggers") -----------------------
const REDRAW_HOOKS = ["controlToken", "canvasReady", "updateToken", "createToken", "deleteToken"];
for (const hook of REDRAW_HOOKS) {
  Hooks.on(hook, () => canvas?.zoneCombat?.requestRedraw?.());
}

// Token deletion also prunes the matrix (DESIGN.md §8.2).
Hooks.on("deleteToken", async (tokenDoc) => {
  const scene = tokenDoc?.parent;
  if (!scene || !game.user.isGM) return;
  const matrix = store.pruneToken(store.getMatrix(scene), tokenDoc.id);
  await store.setMatrix(scene, matrix);
});

// Geometry-seed the matrix when tokens are added or a scene becomes active (§8.1).
Hooks.on("createToken", (tokenDoc) => integration.seedMissingPairs(tokenDoc?.parent));
Hooks.on("canvasReady", () => integration.seedMissingPairs(canvas?.scene));

// Interpret a user drag as a relational edit (DESIGN.md §7 bidirectional).
Hooks.on("updateToken", (doc, change, options, userId) => drag.onTokenMoved(doc, change, options, userId));

// Defeated <-> revived toggles the token's inert dead-anchor state (DESIGN.md §8.3).
Hooks.on("updateCombatant", (combatant, change) => {
  if (!("defeated" in (change ?? {}))) return;
  const scene = game.scenes?.get(combatant.sceneId) ?? canvas?.scene;
  integration.setTokenDead(scene, combatant.tokenId, change.defeated);
});

// Turn recenter (DESIGN.md §6.3): the active combatant becomes the focal token.
Hooks.on("updateCombat", (combat, changed) => turn.onUpdateCombat(combat, changed));

// Scene control toggle for the overlay (skeleton; defensive across v13/v14 shapes).
Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "zone-combat-toggle",
    title: "ZONECOMBAT.Control.Toggle",
    icon: "fas fa-bullseye",
    toggle: true,
    active: true,
    onClick: (active) => canvas?.zoneCombat?.setEnabled?.(active)
  };
  try {
    const tokenControls = Array.isArray(controls)
      ? controls.find(c => c.name === "token")
      : controls?.token ?? Object.values(controls ?? {}).find(c => c?.name === "token");
    if (!tokenControls) return;
    if (Array.isArray(tokenControls.tools)) tokenControls.tools.push(tool);
    else if (tokenControls.tools) tokenControls.tools[tool.name] = tool;
  } catch (err) {
    console.warn("Zone Combat | could not add scene control", err);
  }
});
