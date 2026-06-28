/**
 * Zone Combat — canvas overlay layer. Bands mode: true-scale tiled grid cells around the
 * cell-snapped scene centre (gridless → circles). Zones mode: regions coloured by hop band.
 * Fills/borders go in the PRIMARY group beneath token sprites; labels + markers stay on
 * this interface layer above them.
 */
import { ZONE_COMBAT } from "./config.mjs";
import { getFillAlpha, getThresholds, getBoundaryWidth, getBoundaryColor, getMode, getArmReach } from "./settings.mjs";
import { getFocalTokenId, getEditedEdges } from "./turn.mjs";
import { getMatrix } from "./store.mjs";
import { originPoint, pixelsPerUnit, cellSize } from "./integration.mjs";
import { computeZones } from "./grid-zones.mjs";
import { zoneHighlights, ringsCentroid, getZones, pointZoneId, toggleZoneLink, sceneGraph } from "./regions.mjs";

const LINK_COLOR = 0x33ccff;    // adjacency-graph edges in the link editor
const SELECT_COLOR = 0xffff00;  // selected-zone outline in the link editor

const PENDING_COLOR = 0xffb000;  // provisional edit marker (DESIGN.md §6.8)
const DEAD_COLOR = 0x888888;     // inert dead-anchor marker (DESIGN.md §8.3)
const ENGAGED_COLOR = 0xd61f1f;  // WHToW "Close" / arm's-reach engagement marker
const BORDER_COLOR = 0xf3f1ff;  // crisp ring border (gridless fallback)
const BORDER_ALPHA = 0.9;

// CanvasLayer namespaced under foundry.canvas.layers in v13+; fall back defensively.
const CanvasLayerBase = foundry?.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;

export class ZoneCombatLayer extends CanvasLayerBase {
  /** @type {PIXI.Graphics|null} */ shells = null;
  /** @type {PIXI.Container|null} */ labels = null;
  /** @type {PIXI.Graphics|null} */ marks = null;
  _enabled = true;

  // Drawn-zone link editor state.
  _linkEdit = false;
  _selZone = null;
  /** @type {PIXI.Graphics|null} */ linkCapture = null;

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions ?? {}, { name: "zoneCombat" });
  }

  /** @override */
  async _draw(options) {
    await super._draw?.(options);

    // Zone fills + cell borders go in PRIMARY, beneath token sprites.
    this.shells = new PIXI.Graphics();
    this.shells.eventMode = "none";
    this.shells.elevation = 0;
    this.shells.sort = -9999;
    const host = canvas.primary ?? this;
    host.addChild(this.shells);
    if ("sortableChildren" in host) host.sortableChildren = true;
    host.sortDirty = true;

    // Labels + markers stay on this (interface) layer, above tokens.
    this.labels = this.addChild(new PIXI.Container());
    this.marks = this.addChild(new PIXI.Graphics());

    this._enabled = this._readEnabled();
    this.requestRedraw();
  }

  /** @override */
  async _tearDown(options) {
    if (this.shells) {
      this.shells.parent?.removeChild(this.shells);
      this.shells.destroy();
      this.shells = null;
    }
    this.setLinkEdit(false);
    this.removeChildren().forEach(c => c.destroy({ children: true }));
    this.labels = null;
    this.marks = null;
    await super._tearDown?.(options);
  }

  setEnabled(enabled) {
    this._enabled = !!enabled;
    this.requestRedraw();
  }

  requestRedraw() {
    if (this.shells) this._redraw();
  }

  _readEnabled() {
    try { return game.settings.get(ZONE_COMBAT.id, "overlayEnabled"); }
    catch { return true; }
  }

  _redraw() {
    const g = this.shells;
    if (!g) return;
    g.clear();
    this.marks?.clear();
    this._clearLabels();
    if (!this._enabled) return;

    // Drawn-zone mode: colour the Scene Regions by hop-distance instead of drawing shells.
    if (getMode(canvas.scene) === "zones") {
      this._drawZonesMode(g, getFillAlpha(), getBoundaryWidth(), getBoundaryColor());
      this._drawPending(getFocalTokenId());
      this._drawDeadAnchors();
      return;
    }

    const center = originPoint();
    const bands = ZONE_COMBAT.bands;
    const fillAlpha = getFillAlpha();
    const ppu = pixelsPerUnit();
    const thresholds = getThresholds();

    // Outer radius per band (px); Far gets a nominal ring just beyond Long for its label.
    const outerR = thresholds.map((v, i) =>
      Number.isFinite(v) ? v * ppu : (thresholds[i - 1] * ppu + 2 * cellSize()));

    const boundaryWidth = getBoundaryWidth();
    const boundaryColor = getBoundaryColor();
    const gridType = canvas.grid?.type ?? CONST.GRID_TYPES.GRIDLESS;
    const zones = gridType !== CONST.GRID_TYPES.GRIDLESS ? computeZones(canvas.scene) : null;

    if (zones && zones.tiles.length) {
      // True-scale tiled grid cells (honeycomb): fills + faint interior hex lines.
      for (const t of zones.tiles) {
        g.lineStyle(1, t.color, Math.min(1, fillAlpha + 0.2));
        g.beginFill(t.color, fillAlpha);
        g.drawPolygon(t.points);
        g.endFill();
      }
      // Bold zone boundaries: edges where the band changes or the zone ends.
      g.lineStyle(boundaryWidth, boundaryColor, BORDER_ALPHA);
      for (const [x1, y1, x2, y2] of zones.boundaries) {
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
    } else {
      // Gridless fallback: smooth concentric rings (Close..Long) at true scale.
      for (let i = 0; i < bands.length; i++) {
        if (!Number.isFinite(thresholds[i])) continue; // skip Far
        const inner = i === 0 ? 0 : outerR[i - 1];
        g.lineStyle(0);
        g.beginFill(bands[i].color, fillAlpha);
        g.drawCircle(center.x, center.y, outerR[i]);
        if (inner > 0) { g.beginHole(); g.drawCircle(center.x, center.y, inner); g.endHole(); }
        g.endFill();
      }
      for (let i = 0; i < bands.length; i++) {
        if (!Number.isFinite(thresholds[i])) continue;
        g.lineStyle(boundaryWidth, boundaryColor, BORDER_ALPHA);
        g.drawCircle(center.x, center.y, outerR[i]);
      }
    }

    this._drawLabels(center, bands, outerR);
    this._drawPending(getFocalTokenId());
    this._drawDeadAnchors();
  }

  /** Drawn-zone mode: fill each Scene Region by its band relative to the active token's zone. */
  _drawZonesMode(g, fillAlpha, boundaryWidth, boundaryColor) {
    const id = getFocalTokenId();
    const active = (id && canvas.tokens?.get(id)) || canvas.tokens?.controlled?.[0] || null;
    const highlights = zoneHighlights(canvas.scene, active);

    for (const z of highlights) {
      g.lineStyle(0);
      g.beginFill(z.color, fillAlpha);
      for (const ring of z.rings) g.drawPolygon(ring);
      g.endFill();
    }
    for (const z of highlights) {
      g.lineStyle(boundaryWidth, boundaryColor, BORDER_ALPHA);
      for (const ring of z.rings) g.drawPolygon(ring);
    }

    if (!this.labels) return;
    const size = cellSize();
    const fontSize = Math.max(12, Math.round(size * 0.22));
    const style = {
      fontFamily: "Signika, sans-serif", fontSize, fill: 0xffffff,
      stroke: 0x111111, strokeThickness: Math.max(2, Math.round(fontSize / 5)), align: "center"
    };
    for (const z of highlights) {
      const c = ringsCentroid(z.rings);
      const key = ZONE_COMBAT.bands.find(b => b.key === z.band)?.label ?? z.band;
      const text = game.i18n?.localize?.(key) ?? z.band;
      const t = new PIXI.Text(text, style);
      t.anchor.set(0.5);
      t.position.set(c.x, c.y);
      this.labels.addChild(t);
    }

    // WHToW "Close": ring tokens within arm's reach of the active token (proximity
    // override — works even across an adjacent zone edge).
    this._drawCloseEngaged(active);

    // Link editor overlay (adjacency graph + selected zone), when active.
    this._drawLinkEditor();
  }

  /** Toggle the zone-link editor: capture clicks to pick two zones and toggle their link. */
  setLinkEdit(on) {
    this._linkEdit = !!on;
    this._selZone = null;
    if (on && !this.linkCapture) {
      const cap = new PIXI.Graphics();
      cap.eventMode = "static";
      cap.cursor = "crosshair";
      const d = canvas.dimensions;
      cap.hitArea = new PIXI.Rectangle(0, 0, d?.width ?? 0, d?.height ?? 0);
      cap.on("pointerdown", (e) => this._onLinkClick(e));
      this.linkCapture = this.addChild(cap);
    } else if (!on && this.linkCapture) {
      this.linkCapture.removeAllListeners?.();
      this.linkCapture.parent?.removeChild(this.linkCapture);
      this.linkCapture.destroy();
      this.linkCapture = null;
    }
    this.requestRedraw();
  }

  _onLinkClick(event) {
    const orig = event?.data?.originalEvent ?? event?.nativeEvent;
    if (orig && orig.button !== 0) return; // left-click only
    const pt = canvas.mousePosition;
    if (!pt) return;
    const id = pointZoneId(pt, getZones(canvas.scene));
    if (!id) { this._selZone = null; this.requestRedraw(); return; }
    if (!this._selZone) this._selZone = id;
    else if (this._selZone === id) this._selZone = null;
    else {
      const a = this._selZone;
      this._selZone = null;
      toggleZoneLink(canvas.scene, a, id); // async setFlag → updateScene → redraw
    }
    this.requestRedraw();
  }

  /** Draw the adjacency graph (centroid edges) and the selected zone while editing. */
  _drawLinkEditor() {
    if (!this._linkEdit || !this.marks) return;
    const g = this.marks;
    const { zones, graph } = sceneGraph(canvas.scene);
    const centroids = new Map(zones.map(z => [z.id, ringsCentroid(z.rings)]));

    g.lineStyle(3, LINK_COLOR, 0.9);
    const drawn = new Set();
    for (const [id, neighbours] of graph) {
      const c1 = centroids.get(id);
      if (!c1) continue;
      for (const n of neighbours) {
        const k = id < n ? `${id}|${n}` : `${n}|${id}`;
        if (drawn.has(k)) continue;
        drawn.add(k);
        const c2 = centroids.get(n);
        if (!c2) continue;
        g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y);
      }
    }
    for (const c of centroids.values()) {
      g.lineStyle(0); g.beginFill(LINK_COLOR, 1); g.drawCircle(c.x, c.y, 7); g.endFill();
    }
    if (this._selZone) {
      const z = zones.find(z => z.id === this._selZone);
      if (z) { g.lineStyle(5, SELECT_COLOR, 1); for (const ring of z.rings) g.drawPolygon(ring); }
    }
  }

  /** Mark tokens within arm's reach (Close / engaged) of the active token. */
  _drawCloseEngaged(active) {
    const g = this.marks;
    if (!active?.center || !g) return;
    const reach = getArmReach();
    const cell = cellSize();
    const dead = new Set(getMatrix(canvas.scene).deadAnchors ?? []);
    for (const t of canvas.tokens?.placeables ?? []) {
      if (t === active || !t.center || dead.has(t.id)) continue;
      const spaces = Math.hypot(active.center.x - t.center.x, active.center.y - t.center.y) / cell;
      if (spaces <= reach + 1e-6) {
        const r = Math.max(t.w ?? 0, t.h ?? 0) / 2 + 6;
        g.lineStyle(3, ENGAGED_COLOR, 1);
        g.drawCircle(t.center.x, t.center.y, r);
      }
    }
  }

  _clearLabels() {
    if (this.labels) this.labels.removeChildren().forEach(c => c.destroy());
  }

  /** Draw a label for each zone, stacked upward within each band's annulus. */
  _drawLabels(center, bands, outerR) {
    if (!this.labels) return;
    const size = cellSize();
    const fontSize = Math.max(12, Math.round(size * 0.22));
    const style = {
      fontFamily: "Signika, sans-serif", fontSize, fill: 0xffffff,
      stroke: 0x111111, strokeThickness: Math.max(2, Math.round(fontSize / 5)), align: "center"
    };
    for (let i = 0; i < bands.length; i++) {
      const inner = i === 0 ? 0 : outerR[i - 1];
      const mid = (inner + outerR[i]) / 2;
      const text = game.i18n?.localize?.(bands[i].label) ?? bands[i].key;
      const t = new PIXI.Text(text, style);
      t.anchor.set(0.5);
      t.position.set(center.x, center.y - mid);
      this.labels.addChild(t);
    }
  }

  /** Ring each token whose relationship was edited this turn but not yet committed. */
  _drawPending(focalId) {
    const edited = getEditedEdges();
    if (!edited.length) return;
    const ids = new Set();
    for (const key of edited) {
      for (const id of key.split("|")) if (id !== focalId) ids.add(id);
    }
    const g = this.marks;
    if (!g) return;
    for (const id of ids) {
      const t = canvas.tokens?.get(id);
      if (!t) continue;
      const r = Math.max(t.w ?? 0, t.h ?? 0) / 2 + 6;
      g.lineStyle(2, PENDING_COLOR, 0.95);
      g.drawCircle(t.center.x, t.center.y, r);
    }
  }

  /** Grey-ring each token flagged as a dead/inert anchor in the matrix. */
  _drawDeadAnchors() {
    const dead = getMatrix(canvas.scene).deadAnchors ?? [];
    if (!dead.length) return;
    const g = this.marks;
    if (!g) return;
    for (const id of dead) {
      const t = canvas.tokens?.get(id);
      if (!t) continue;
      const r = Math.max(t.w ?? 0, t.h ?? 0) / 2 + 4;
      g.lineStyle(3, DEAD_COLOR, 0.9);
      g.drawCircle(t.center.x, t.center.y, r);
    }
  }
}
