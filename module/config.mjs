/**
 * Zone Combat — static config: band definitions, per-unit thresholds, colors.
 */
export const ZONE_COMBAT = {
  id: "zone-combat",

  // WHToW bands, inner → outer; Extreme is open-ended. `color` is the fill/stroke.
  bands: [
    { key: "close",   label: "ZONECOMBAT.Band.Close",   color: 0x3c3489 },
    { key: "short",   label: "ZONECOMBAT.Band.Short",   color: 0x534ab7 },
    { key: "medium",  label: "ZONECOMBAT.Band.Medium",  color: 0x7f77dd },
    { key: "long",    label: "ZONECOMBAT.Band.Long",    color: 0xafa9ec },
    { key: "extreme", label: "ZONECOMBAT.Band.Extreme", color: 0xcecbf6 }
  ],

  // Per-unit upper thresholds (inclusive) for Close/Short/Medium/Long; Extreme is beyond.
  // `farNominal` = distance stored when Extreme is assigned with no geometry.
  units: {
    feet:   { label: "ft",     thresholds: { close: 5, short: 10, medium: 30, long: 60 }, farNominal: 90 },
    spaces: { label: "spaces", thresholds: { close: 1, short: 2,  medium: 6,  long: 12 }, farNominal: 18 },
    // Drawn-zone mode: distance is a zone-hop count. Same zone = Short, 1 hop = Medium,
    // 2 = Long, 3+ = Extreme. Close is a proximity override (arm's reach), handled separately.
    zones:  { label: "zones",  thresholds: { short: 0, medium: 1, long: 2 }, farNominal: 5 }
  },

  defaults: {
    unit: "spaces",   // default distance unit (DESIGN.md §4.2)
    farNominal: 90    // fallback only; the live value comes from the selected unit
  }
};
