/**
 * Zone Combat — GM-tunable settings (DESIGN.md §4).
 * Per-band visual weight and per-band distance threshold, plus the Far nominal.
 * NOTE (skeleton): registered at world scope. The spec calls for visual proportions
 * to be per-scene with a world default (§4.1); per-scene override is a later refinement.
 */
import { ZONE_COMBAT } from "./config.mjs";

const NS = ZONE_COMBAT.id;

export function registerSettings() {
  game.settings.register(NS, "overlayEnabled", {
    name: "ZONECOMBAT.Settings.OverlayEnabled",
    scope: "client", config: true, type: Boolean, default: true
  });

  for (const b of ZONE_COMBAT.bands) {
    game.settings.register(NS, `weight.${b.key}`, {
      name: `ZONECOMBAT.Settings.Weight.${b.key}`,
      scope: "world", config: true, type: Number, default: b.weight
    });
    if (Number.isFinite(b.maxFeet)) {
      game.settings.register(NS, `threshold.${b.key}`, {
        name: `ZONECOMBAT.Settings.Threshold.${b.key}`,
        scope: "world", config: true, type: Number, default: b.maxFeet
      });
    }
  }

  game.settings.register(NS, "farNominal", {
    name: "ZONECOMBAT.Settings.FarNominal",
    scope: "world", config: true, type: Number, default: ZONE_COMBAT.defaults.farNominalFeet
  });

  // When on, the end-of-turn commit moves tokens into their solved ring positions
  // (DESIGN.md §7). Off by default so the module never rearranges a map unexpectedly.
  game.settings.register(NS, "applyLayout", {
    name: "ZONECOMBAT.Settings.ApplyLayout",
    hint: "ZONECOMBAT.Settings.ApplyLayoutHint",
    scope: "world", config: true, type: Boolean, default: false
  });
}

/** Per-band visual weights, inner → outer (DESIGN.md §4.1). */
export function getVisualWeights() {
  return ZONE_COMBAT.bands.map(b => {
    const v = safeGet(`weight.${b.key}`);
    return Number.isFinite(v) ? v : b.weight;
  });
}

/** Per-band upper distance thresholds, inner → outer; Far stays Infinity (DESIGN.md §4.2). */
export function getThresholds() {
  return ZONE_COMBAT.bands.map(b => {
    if (!Number.isFinite(b.maxFeet)) return Infinity;
    const v = safeGet(`threshold.${b.key}`);
    return Number.isFinite(v) ? v : b.maxFeet;
  });
}

export function getFarNominal() {
  const v = safeGet("farNominal");
  return Number.isFinite(v) ? v : ZONE_COMBAT.defaults.farNominalFeet;
}

/** game.settings may not be ready in every context; guard defensively. */
function safeGet(key) {
  try { return game.settings.get(NS, key); }
  catch { return undefined; }
}
