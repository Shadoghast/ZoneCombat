/**
 * Zone Combat — Foundry Scene Region glue for DRAWN-ZONE mode.
 * Reads Scene Regions as zones, builds the adjacency graph (auto-detect + GM overrides),
 * locates which zone a token is in, and produces per-zone highlight data (band + colour)
 * relative to the active token's zone. The graph math itself lives in zone-graph.mjs.
 */
import { ZONE_COMBAT } from "./config.mjs";
import {
  buildAutoEdges, applyOverrides, buildGraph, hopDistance, pointInRings, toggleLink
} from "./zone-graph.mjs";

const NS = ZONE_COMBAT.id;
let _cache = null;

export function invalidateGraph() { _cache = null; }

function colorForBand(key) {
  return ZONE_COMBAT.bands.find(b => b.key === key)?.color ?? 0xffffff;
}

/**
 * Map a zone-hop count to a WHToW band. Close is NOT here — it is a proximity override
 * (arm's reach) handled separately. Same zone (0) = Short, 1 = Medium, 2 = Long, 3+ = Extreme.
 */
export function bandForHops(hops) {
  if (!Number.isFinite(hops)) return "extreme";
  if (hops <= 0) return "short";
  if (hops === 1) return "medium";
  if (hops === 2) return "long";
  return "extreme";
}

function rectRing(s) {
  const x = s.x ?? 0, y = s.y ?? 0, w = s.width ?? 0, h = s.height ?? 0;
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

function ellipseRing(s, steps = 24) {
  const cx = s.x ?? 0, cy = s.y ?? 0;
  const rx = s.radiusX ?? s.radius ?? 0, ry = s.radiusY ?? s.radius ?? 0;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  return pts;
}

/** Extract boundary ring(s) for a region, defensively across the v13/v14 API. */
function extractRings(region) {
  try {
    const polys = region.object?.polygons;
    if (Array.isArray(polys) && polys.length) {
      const rings = polys
        .map(p => (p?.points ? p.points.slice() : (Array.isArray(p) ? p.slice() : null)))
        .filter(r => r && r.length >= 6);
      if (rings.length) return rings;
    }
  } catch (_) { /* fall through */ }

  const rings = [];
  try {
    for (const s of region.shapes ?? []) {
      if (s.type === "polygon" && s.points?.length >= 6) rings.push(s.points.slice());
      else if (s.type === "rectangle") rings.push(rectRing(s));
      else if (s.type === "ellipse" || s.type === "circle") rings.push(ellipseRing(s));
    }
  } catch (_) { /* ignore */ }
  return rings;
}

/** All Scene Regions as zones (excluding any flagged zone-combat.exclude). */
export function getZones(scene = canvas?.scene) {
  const out = [];
  for (const region of scene?.regions ?? []) {
    try { if (region.getFlag?.(NS, "exclude")) continue; } catch (_) { /* ignore */ }
    const rings = extractRings(region);
    if (rings.length) out.push({ id: region.id, name: region.name ?? "", rings });
  }
  return out;
}

function tokenCenter(token) {
  return token?.center ?? { x: token?.x ?? 0, y: token?.y ?? 0 };
}

/** Id of the zone containing a token's centre, or null. */
export function tokenZoneId(token, zones) {
  const c = tokenCenter(token);
  for (const z of zones) if (pointInRings(c.x, c.y, z.rings)) return z.id;
  return null;
}

/** Id of the zone containing a raw world point, or null. */
export function pointZoneId(point, zones) {
  for (const z of zones) if (pointInRings(point.x, point.y, z.rings)) return z.id;
  return null;
}

/** Toggle the GM adjacency override between two zones and persist it. GM only. */
export async function toggleZoneLink(scene, aId, bId) {
  if (!scene || !game.user?.isGM || aId === bId) return;
  const zones = getZones(scene);
  const auto = buildAutoEdges(zones, (canvas?.grid?.size ?? 100) * 1.1);
  let links = { added: [], removed: [] };
  try { links = scene.getFlag?.(NS, "zoneLinks") ?? links; } catch (_) { /* ignore */ }
  const next = toggleLink(auto, links, aId, bId);
  invalidateGraph();
  await scene.setFlag(NS, "zoneLinks", next);
}

/** Zones + adjacency graph for the scene, cached until regions/links change. */
export function sceneGraph(scene = canvas?.scene) {
  const zones = getZones(scene);
  const grid = canvas?.grid?.size ?? 100;
  let ov = { added: [], removed: [] };
  try { ov = scene?.getFlag?.(NS, "zoneLinks") ?? ov; } catch (_) { /* ignore */ }

  const key = [
    scene?.id, grid,
    zones.map(z => `${z.id}:${z.rings.reduce((n, r) => n + r.length, 0)}`).join(","),
    JSON.stringify(ov)
  ].join("|");
  if (_cache && _cache.key === key) return _cache.val;

  const auto = buildAutoEdges(zones, grid * 1.1);
  const edges = applyOverrides(auto, ov.added ?? [], ov.removed ?? []);
  const val = { zones, graph: buildGraph(zones.map(z => z.id), edges) };
  _cache = { key, val };
  return val;
}

/** Per-zone highlight data (band + colour) relative to the active token's zone. */
export function zoneHighlights(scene, activeToken) {
  const { zones, graph } = sceneGraph(scene);
  const activeZoneId = activeToken ? tokenZoneId(activeToken, zones) : null;
  return zones.map(z => {
    const hops = hopDistance(graph, activeZoneId, z.id);
    const band = bandForHops(hops);
    return { id: z.id, name: z.name, rings: z.rings, hops, band, color: colorForBand(band), active: z.id === activeZoneId };
  });
}

/** Centroid of a zone's vertices (for label placement). */
export function ringsCentroid(rings) {
  let sx = 0, sy = 0, n = 0;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { sx += r[i]; sy += r[i + 1]; n++; }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}
