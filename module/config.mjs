/**
 * Zone Combat — static configuration.
 * Band definitions, per-unit distance thresholds, default visual weights, colors.
 * See docs/DESIGN.md §2 (bands), §4 (GM-tunable settings).
 */
export const ZONE_COMBAT = {
  id: "zone-combat",

  /**
   * Bands ordered inner → outer. The last band (Far) is open-ended.
   * `weight` is the default schematic visual proportion (DESIGN.md §4.1):
   * inner bands drawn large, outer bands compressed.
   * `color` is the shell fill/stroke (violet ramp, light outer → dark inner).
   * Distance thresholds are NOT here — they live per-unit in `units` below.
   */
  bands: [
    { key: "close",  label: "ZONECOMBAT.Band.Close",  weight: 3, color: 0x3c3489 },
    { key: "near",   label: "ZONECOMBAT.Band.Near",   weight: 4, color: 0x534ab7 },
    { key: "medium", label: "ZONECOMBAT.Band.Medium", weight: 3, color: 0x7f77dd },
    { key: "long",   label: "ZONECOMBAT.Band.Long",   weight: 2, color: 0xafa9ec },
    { key: "far",    label: "ZONECOMBAT.Band.Far",    weight: 2, color: 0xcecbf6 }
  ],

  /**
   * Per-unit upper thresholds (inclusive) for Close/Near/Medium/Long; Far is everything
   * beyond Long. `farNominal` is the distance stored when Far is assigned abstractly
   * with no real geometry (DESIGN.md §6.2). Distances are measured in the selected unit.
   */
  units: {
    feet:   { label: "ft",     thresholds: { close: 5, near: 10, medium: 30, long: 60 }, farNominal: 90 },
    spaces: { label: "spaces", thresholds: { close: 1, near: 2,  medium: 6,  long: 12 }, farNominal: 18 }
  },

  defaults: {
    unit: "spaces",   // default distance unit (DESIGN.md §4.2)
    farNominal: 90    // fallback only; the live value comes from the selected unit
  }
};
