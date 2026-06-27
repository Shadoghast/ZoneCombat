/**
 * Zone Combat — static configuration.
 * Band definitions, default distance thresholds, default visual weights, colors.
 * See docs/DESIGN.md §2 (bands), §4 (GM-tunable settings).
 */
export const ZONE_COMBAT = {
  id: "zone-combat",

  /**
   * Bands ordered inner → outer. `maxFeet` is the upper distance threshold
   * (inclusive); the last band (Far) is open-ended (Infinity).
   * `weight` is the default schematic visual proportion (DESIGN.md §4.1):
   * inner bands drawn large, outer bands compressed.
   * `color` is the shell fill/stroke (violet ramp, light outer → dark inner).
   */
  bands: [
    { key: "close",  label: "ZONECOMBAT.Band.Close",  maxFeet: 5,        weight: 3, color: 0x3c3489 },
    { key: "near",   label: "ZONECOMBAT.Band.Near",   maxFeet: 10,       weight: 4, color: 0x534ab7 },
    { key: "medium", label: "ZONECOMBAT.Band.Medium", maxFeet: 30,       weight: 3, color: 0x7f77dd },
    { key: "long",   label: "ZONECOMBAT.Band.Long",   maxFeet: 60,       weight: 2, color: 0xafa9ec },
    { key: "far",    label: "ZONECOMBAT.Band.Far",    maxFeet: Infinity, weight: 2, color: 0xcecbf6 }
  ],

  defaults: {
    // Nominal distance stored when Far is assigned with no real geometry (DESIGN.md §6.2).
    farNominalFeet: 90
  }
};
