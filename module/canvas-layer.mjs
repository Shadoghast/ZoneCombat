/**
 * Zone Combat — canvas overlay layer (DESIGN.md §3).
 *
 * Draws the STATIC zone map anchored at the (cell-snapped) scene centre. On gridded
 * scenes the zones are TRUE-SCALE tiled grid cells (a honeycomb of hexes / blocks of
 * squares) following the actual cell shapes; on gridless scenes it falls back to smooth
 * concentric circles at true scale.
 *
 * Zone fills + cell borders live in the PRIMARY group, BENEATH the token sprites; labels
 * and edit/anchor markers stay on this (interface) layer, ABOVE tokens.
 */
import { ZONE_COMBAT } from "./config.mjs";
import { getFillAlpha, getThresholds, getBoundaryWidth, getBoundaryColor, getMode } from "./settings.mjs";
import { getFocalTokenId, getEditedEdges } from "./turn.mjs";
import { getMatrix } from "./store.mjs";
import { originPoint, pixelsPerUnit, cellSize } from "./integration.mjs";
import { computeZones } from "./grid-zones.mjs";
import { zoneHighlights, ringsCentroid } from "./regions.mjs";

const PENDING_COLOR = 0xffb000; // provisional edit marker (DESIGN.md §6.8)
const DEAD_COLOR = 0x888888;    // inert dead-anchor marker (DESIGN.md §8.3)
const BORDER_COLOR = 0xf3f1ff;  // crisp ring border (gridless fallback)
const BORDER_ALPHA = 0.9;

// CanvasLayer namespaced under foundry.canvas.layers in v13+; fall back defensively.
const CanvasLayerBase = foundry?.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;

export class ZoneCombatLayer extends CanvasLayerBase {
  /** @type {PIXI.Graphics|null} */ shells = null;
  /** @type {PIXI.Container|null} */ labels = null;
  /** @type {PIXI.Graphics|null} */ marks = null;
  _enabled = true;

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
