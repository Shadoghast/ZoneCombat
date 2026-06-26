/**
 * Zone Combat — canvas overlay layer (DESIGN.md §3).
 *
 * A dedicated interface CanvasLayer that draws the schematic concentric range shells
 * around the focal token, shaped to the scene's grid type (circle / square / hex).
 * The shells are SCHEMATIC: radii come from per-band visual weights (§4.1), not true
 * distance. This layer only DRAWS — token placement is owned by the layout solver (§7).
 */
import { ZONE_COMBAT } from "./config.mjs";
import { getVisualWeights } from "./settings.mjs";
import { getFocalTokenId } from "./turn.mjs";

// CanvasLayer namespaced under foundry.canvas.layers in v13+; fall back defensively.
const CanvasLayerBase = foundry?.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;

export class ZoneCombatLayer extends CanvasLayerBase {
  /** @type {PIXI.Graphics|null} */
  shells = null;

  /** Overlay visibility toggle (scene control + client setting). */
  _enabled = true;

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions ?? {}, { name: "zoneCombat" });
  }

  /** @override */
  async _draw(options) {
    await super._draw?.(options);
    this.shells = this.addChild(new PIXI.Graphics());
    this._enabled = this._readEnabled();
    this.requestRedraw();
  }

  /** @override */
  async _tearDown(options) {
    this.removeChildren().forEach(c => c.destroy({ children: true }));
    this.shells = null;
    await super._tearDown?.(options);
  }

  setEnabled(enabled) {
    this._enabled = !!enabled;
    this.requestRedraw();
  }

  requestRedraw() {
    if (this.shells) this._redraw();
  }

  // --- internals ------------------------------------------------------------

  _readEnabled() {
    try { return game.settings.get(ZONE_COMBAT.id, "overlayEnabled"); }
    catch { return true; }
  }

  _focalToken() {
    const id = getFocalTokenId();
    const byTurn = id ? canvas.tokens?.get(id) : null;
    return byTurn ?? canvas.tokens?.controlled?.[0] ?? null;
  }

  _redraw() {
    const g = this.shells;
    g.clear();
    if (!this._enabled) return;

    const token = this._focalToken();
    if (!token) return;

    const center = token.center;
    const bands = ZONE_COMBAT.bands;
    const radii = this._schematicRadii();
    const gridType = canvas.grid?.type ?? CONST.GRID_TYPES.GRIDLESS;

    // Outermost first so inner bands paint on top (DESIGN.md §3).
    for (let i = bands.length - 1; i >= 0; i--) {
      g.beginFill(bands[i].color, 0.18);
      g.lineStyle(2, bands[i].color, 0.9);
      this._drawShape(g, center, radii[i], gridType);
      g.endFill();
    }
  }

  /** Normalised cumulative radii (px) from per-band visual weights (DESIGN.md §4.1). */
  _schematicRadii() {
    const weights = getVisualWeights();
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const maxRadius = (canvas.dimensions?.size ?? 100) * 8; // base schematic extent
    let acc = 0;
    return weights.map(w => { acc += w; return (acc / total) * maxRadius; });
  }

  _drawShape(g, center, radius, gridType) {
    const GT = CONST.GRID_TYPES;
    switch (gridType) {
      case GT.SQUARE:
        g.drawRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
        break;
      case GT.HEXODDR:
      case GT.HEXEVENR:
        this._drawHex(g, center, radius, /* pointyTop */ true);
        break;
      case GT.HEXODDQ:
      case GT.HEXEVENQ:
        this._drawHex(g, center, radius, /* pointyTop */ false);
        break;
      default: // GRIDLESS and anything unknown
        g.drawCircle(center.x, center.y, radius);
    }
  }

  /** Regular hexagon of circumradius `radius`. Pointy-top offsets angles by 30°. */
  _drawHex(g, center, radius, pointyTop) {
    const offset = pointyTop ? Math.PI / 6 : 0;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = offset + i * (Math.PI / 3);
      pts.push(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a));
    }
    g.drawPolygon(pts);
  }
}
