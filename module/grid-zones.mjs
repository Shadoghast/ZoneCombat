/**
 * Zone Combat — true-scale tiled grid-cell zones.
 *
 * Builds the set of grid cells within each band's distance threshold of the static
 * scene-centre origin, bucketed by band, each with its polygon vertices — so the zone
 * map follows the actual hex/square cell shapes (a honeycomb), not smooth rings.
 *
 * Result is cached on a key (scene/grid/origin/thresholds/unit) so it only recomputes
 * when something relevant changes — token moves reuse the cache.
 */
import { ZONE_COMBAT } from "./config.mjs";
import { bandForDistance } from "./bands.mjs";
import { getThresholds, getUnit } from "./settings.mjs";
import { originPoint } from "./integration.mjs";

const MAX_RADIUS_CELLS = 40; // safety cap on enumeration
let _cache = null;

export function invalidateZones() { _cache = null; }

function colorForBand(key) {
  return ZONE_COMBAT.bands.find(b => b.key === key)?.color ?? 0xffffff;
}

/** Polygon points (flat [x,y,...]) for the cell at `offset`, with a square fallback. */
function cellPolygon(grid, offset, center) {
  try {
    if (grid.getVertices) {
      const v = grid.getVertices(offset);
      if (v?.length) return v.flatMap(p => [p.x, p.y]);
    }
  } catch (_) { /* fall through */ }
  const w = grid.sizeX ?? grid.size ?? 100;
  const h = grid.sizeY ?? grid.size ?? 100;
  return [
    center.x - w / 2, center.y - h / 2,
    center.x + w / 2, center.y - h / 2,
    center.x + w / 2, center.y + h / 2,
    center.x - w / 2, center.y + h / 2
  ];
}

/**
 * @returns {Array<{points:number[], color:number, band:string}>|null}
 *   null when gridless (caller falls back to smooth rings).
 */
export function computeZones(scene = canvas?.scene) {
  const grid = canvas?.grid;
  if (!grid || grid.type === CONST.GRID_TYPES.GRIDLESS) return null;

  const thresholds = getThresholds();           // current unit, inner → outer (far = Infinity)
  const unit = getUnit();
  const feetPerCell = canvas.dimensions?.distance ?? 5;
  const unitPerCell = unit === "spaces" ? 1 : feetPerCell;
  const longUnit = thresholds[thresholds.length - 2] ?? 12; // last finite threshold
  const rCells = Math.min(MAX_RADIUS_CELLS, Math.ceil(longUnit / unitPerCell) + 1);

  const origin = originPoint();
  const key = [
    scene?.id, grid.type, grid.size, origin.x.toFixed(1), origin.y.toFixed(1),
    thresholds.join(","), unit
  ].join("|");
  if (_cache && _cache.key === key) return _cache.tiles;

  let o;
  try { o = grid.getOffset(origin); } catch (_) { return null; }
  const tiles = [];

  for (let di = -rCells - 1; di <= rCells + 1; di++) {
    for (let dj = -rCells - 2; dj <= rCells + 2; dj++) {
      const off = { i: o.i + di, j: o.j + dj };
      let center, spaces;
      try {
        center = grid.getCenterPoint(off);
        const m = grid.measurePath([origin, center]);
        spaces = m?.spaces;
        if (spaces == null) spaces = (m?.distance ?? Infinity) / feetPerCell;
      } catch (_) { continue; }
      if (!Number.isFinite(spaces)) continue;

      const band = bandForDistance(spaces * unitPerCell);
      if (band === "far") continue; // Far is open-ended; left as background
      tiles.push({ points: cellPolygon(grid, off, center), color: colorForBand(band), band });
    }
  }

  _cache = { key, tiles };
  return tiles;
}
