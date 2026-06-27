/**
 * Zone Combat — change-log formatting (DESIGN.md §6.5).
 * Pure helpers that turn the repair's scalar changes into human-readable band
 * transitions. Foundry-independent so it can be unit-tested.
 */

/** The band transition implied by a distance change. */
export function bandTransition(fromFeet, toFeet, bandForDistance) {
  return { from: bandForDistance(fromFeet), to: bandForDistance(toFeet) };
}

/**
 * Summarise repair changes as readable lines, keeping only edits that crossed a
 * band boundary (a pure-distance nudge within the same band is not interesting).
 *
 * @param {Array<{pair:string,from:number,to:number}>} changes
 * @param {(feet:number)=>string} bandForDistance
 * @param {object} [opts]
 * @param {(id:string)=>string} [opts.nameOf]    token id → display name
 * @param {(bandKey:string)=>string} [opts.labelOf] band key → display label
 * @returns {string[]}
 */
export function summarizeChanges(changes, bandForDistance, { nameOf = (id) => id, labelOf = cap } = {}) {
  const lines = [];
  for (const c of changes ?? []) {
    const [a, b] = c.pair.split("|");
    const { from, to } = bandTransition(c.from, c.to, bandForDistance);
    if (from === to) continue; // band unchanged → skip
    lines.push(`${nameOf(a)} ↔ ${nameOf(b)}: ${labelOf(from)} → ${labelOf(to)}`);
  }
  return lines;
}

function cap(s) {
  return typeof s === "string" && s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
