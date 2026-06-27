/**
 * Zone Combat — band ↔ distance bucketing (DESIGN.md §6.2).
 * The matrix stores scalar distances (in the selected unit); the band is always
 * *derived* from a distance. Thresholds come from the current unit (settings).
 */
import { getThresholds, getFarNominal } from "./settings.mjs";
import { ZONE_COMBAT } from "./config.mjs";

/** Bands paired with their (unit-aware, possibly GM-tuned) upper thresholds, inner → outer. */
export function resolvedBands() {
  const thresholds = getThresholds();
  return ZONE_COMBAT.bands.map((b, i) => ({ ...b, max: thresholds[i] }));
}

/** Return the band key for a scalar distance (in the current unit). */
export function bandForDistance(value, bands = resolvedBands()) {
  for (const b of bands) if (value <= b.max) return b.key;
  return bands.at(-1).key;
}

/**
 * Inclusive distance interval [min, max] for a band key.
 * Far returns [min, Infinity] — upper-unbounded (DESIGN.md §6.4).
 */
export function bandInterval(key, bands = resolvedBands()) {
  const i = bands.findIndex(b => b.key === key);
  if (i < 0) return [0, Infinity];
  const min = i === 0 ? 0 : bands[i - 1].max;
  return [min, bands[i].max];
}

/**
 * Representative scalar to store when a band is assigned abstractly (DESIGN.md §6.2).
 * "Nearest in-band value to the prior distance" to minimise churn; Far preserves the
 * prior distance when it is already beyond the boundary, else falls back to the nominal.
 */
export function representativeDistance(key, prior, farNominal = getFarNominal()) {
  const [min, max] = bandInterval(key);
  if (key === "far") return prior > min ? prior : farNominal;
  const p = Number.isFinite(prior) ? prior : (min + max) / 2;
  return Math.min(Math.max(p, min), max);
}
