/**
 * Zone Combat — GM-tunable settings (DESIGN.md §4).
 * Distance unit (feet/spaces), per-band visual weight, per-band threshold override,
 * the Far nominal, the static-map arrange toggle, and the chat change-log toggle.
 */
import { ZONE_COMBAT } from "./config.mjs";

const NS = ZONE_COMBAT.id;

export function registerSettings() {
  game.settings.register(NS, "overlayEnabled", {
    name: "ZONECOMBAT.Settings.OverlayEnabled",
    scope: "client", config: true, type: Boolean, default: true
  });

  // Distance unit: feet or grid spaces (DESIGN.md §4.2).
  game.settings.register(NS, "unit", {
    name: "ZONECOMBAT.Settings.Unit",
    hint: "ZONECOMBAT.Settings.UnitHint",
    scope: "world", config: true, type: String,
    choices: { feet: "ZONECOMBAT.Unit.feet", spaces: "ZONECOMBAT.Unit.spaces" },
    default: ZONE_COMBAT.defaults.unit
  });

  for (const b of ZONE_COMBAT.bands) {
    game.settings.register(NS, `weight.${b.key}`, {
      name: `ZONECOMBAT.Settings.Weight.${b.key}`,
      scope: "world", config: true, type: Number, default: b.weight
    });
    if (b.key !== "far") {
      // 0 = use the selected unit's default threshold; a positive value overrides it
      // (interpreted in the currently selected unit).
      game.settings.register(NS, `threshold.${b.key}`, {
        name: `ZONECOMBAT.Settings.Threshold.${b.key}`,
        scope: "world", config: true, type: Number, default: 0
      });
    }
  }

  // 0 = use the selected unit's Far nominal.
  game.settings.register(NS, "farNominal", {
    name: "ZONECOMBAT.Settings.FarNominal",
    scope: "world", config: true, type: Number, default: 0
  });

  // Static zone map: arrange tokens into the rings (active token to scene centre) when a
  // turn begins (DESIGN.md §3 static map, §7). On by default — this is the core behavior.
  game.settings.register(NS, "applyLayout", {
    name: "ZONECOMBAT.Settings.ApplyLayout",
    hint: "ZONECOMBAT.Settings.ApplyLayoutHint",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Whisper a summary of propagated band changes to GMs at end of turn (§6.5).
  game.settings.register(NS, "logChanges", {
    name: "ZONECOMBAT.Settings.LogChanges",
    hint: "ZONECOMBAT.Settings.LogChangesHint",
    scope: "world", config: true, type: Boolean, default: true
  });
}

/** Selected distance unit key ("feet" | "spaces"). */
export function getUnit() {
  const u = safeGet("unit");
  return u && ZONE_COMBAT.units[u] ? u : ZONE_COMBAT.defaults.unit;
}

function unitConfig() {
  return ZONE_COMBAT.units[getUnit()] ?? ZONE_COMBAT.units.feet;
}

/** Display label for the current unit ("ft" | "spaces"). */
export function getUnitLabel() {
  return unitConfig().label;
}

/** Per-band visual weights, inner → outer (DESIGN.md §4.1). */
export function getVisualWeights() {
  return ZONE_COMBAT.bands.map(b => {
    const v = safeGet(`weight.${b.key}`);
    return Number.isFinite(v) ? v : b.weight;
  });
}

/**
 * Per-band upper thresholds in the CURRENT unit, inner → outer; Far is Infinity.
 * A positive per-band override wins; otherwise the selected unit's default is used.
 */
export function getThresholds() {
  const u = unitConfig().thresholds;
  return ZONE_COMBAT.bands.map(b => {
    if (b.key === "far") return Infinity;
    const override = safeGet(`threshold.${b.key}`);
    return Number.isFinite(override) && override > 0 ? override : u[b.key];
  });
}

/** Far nominal distance in the current unit. */
export function getFarNominal() {
  const o = safeGet("farNominal");
  return Number.isFinite(o) && o > 0 ? o : unitConfig().farNominal;
}

/** game.settings may not be ready in every context; guard defensively. */
function safeGet(key) {
  try { return game.settings.get(NS, key); }
  catch { return undefined; }
}
