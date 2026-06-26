/**
 * Zone Combat — band ↔ distance bucketing (DESIGN.md §6.2).
 * The matrix stores scalar distances; the band is always *derived* from a distance.
 */
import { ZONE_COMBAT } from "./config.mjs";
import { getThresholds } from "./settings.mjs";

/** Bands paired with their (possibly GM-tuned) upper thresholds, inner → outer. */
export function resolvedBands() {
  const thresholds = getThresholds();
  return ZONE_COMBAT.bands.map((b, i) => ({ ...b, maxFeet: thresholds[i] }));
}

/** Return the band key for a scalar distance in feet. */
export function bandForDistance(feet, bands = resolvedBands()) {
  for (const b of bands) if (feet <= b.maxFeet) return b.key;
  return bands.at(-1).key;
}

/**
 * Inclusive distance interval [min, max] for a band key.
 * Far returns [min, Infinity] — upper-unbounded (DESIGN.md §6.4).
 */
export function bandInterval(key, bands = resolvedBands()) {
  const i = bands.findIndex(b => b.key === key);
  if (i < 0) return [0, Infinity];
  const min = i === 0 ? 0 : bands[i - 1].maxFeet;
  return [min, bands[i].maxFeet];
}

/**
 * Representative scalar to store when a band is assigned abstractly (DESIGN.md §6.2).
 * "Nearest in-band value to the prior distance" to minimise churn; Far preserves the
 * prior distance when it is already beyond the boundary, else falls back to the nominal.
 */
export function representativeDistance(key, priorFeet, farNominal = ZONE_COMBAT.defaults.farNominalFeet) {
  const [min, max] = bandInterval(key);
  if (key === "far") return priorFeet > min ? priorFeet : farNominal;
  const prior = Number.isFinite(priorFeet) ? priorFeet : (min + max) / 2;
  return Math.min(Math.max(prior, min), max);
}
