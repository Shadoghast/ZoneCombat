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
import { getFocalTokenId, getEditedEdges } from "./turn.mjs";
import { schematicRadii } from "./geometry.mjs";
import { getMatrix } from "./store.mjs";

// Per-zone fill opacity. Each zone is drawn as a single ring (annulus), so fills do
// NOT stack — keeps the focal token and nearby tokens clearly visible.
const FILL_ALPHA = 0.14;
// Provisional / pending edit marker (DESIGN.md §6.8).
const PENDING_COLOR = 0xffb000;
// Dead / inert-anchor marker (DESIGN.md §8.3).
const DEAD_COLOR = 0x888888;

// CanvasLayer namespaced under foundry.canvas.layers in v13+; fall back defensively.
const CanvasLayerBase = foundry?.canvas?.layers?.CanvasLayer ?? globalThis.CanvasLayer;

// Crisp boundary line drawn between rings so adjacent zones — especially the dark
// inner ones whose fills are similar — read as clearly separated creases.
const BORDER_COLOR = 0xf3f1ff;
const BORDER_ALPHA = 0.9;

export class ZoneCombatLayer extends CanvasLayerBase {
  /** @type {PIXI.Graphics|null} */
  shells = null;

  /** @type {PIXI.Container|null} */
  labels = null;

  /** Overlay visibility toggle (scene control + client setting). */
  _enabled = true;

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions ?? {}, { name: "zoneCombat" });
  }

  /** @override */
  async _draw(options) {
    await super._draw?.(options);
    this.shells = this.addChild(new PIXI.Graphics());
    this.labels = this.addChild(new PIXI.Container()); // drawn above the shells
    this._enabled = this._readEnabled();
    this.requestRedraw();
  }

  /** @override */
  async _tearDown(options) {
    this.removeChildren().forEach(c => c.destroy({ children: true }));
    this.shells = null;
    this.labels = null;
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
    this._clearLabels();
    if (!this._enabled) return;

    const token = this._focalToken();
    if (!token) return;

    const center = token.center;
    const bands = ZONE_COMBAT.bands;
    const radii = this._schematicRadii();
    const gridType = canvas.grid?.type ?? CONST.GRID_TYPES.GRIDLESS;

    // Pass 1 — each zone as a single ring (annulus), so fills never stack and the
    // tokens sitting in/near the centre stay clearly visible (no opacity build-up).
    for (let i = 0; i < bands.length; i++) {
      const inner = i === 0 ? 0 : radii[i - 1];
      g.lineStyle(0);
      g.beginFill(bands[i].color, FILL_ALPHA);
      this._drawShape(g, center, radii[i], gridType);
      if (inner > 0) {
        g.beginHole();
        this._drawShape(g, center, inner, gridType);
        g.endHole();
      }
      g.endFill();
    }

    // Pass 2 — crisp boundary lines on top of every ring edge, so the creases between
    // zones (especially the innermost) are clearly visible regardless of fill colour.
    for (let i = bands.length - 1; i >= 0; i--) {
      g.lineStyle(2, BORDER_COLOR, BORDER_ALPHA);
      this._drawShape(g, center, radii[i], gridType);
    }

    // Labels — one per zone, placed within each band's annulus.
    this._drawLabels(center, bands, radii);

    // Provisional markers around tokens edited this turn (DESIGN.md §6.8).
    this._drawPending(getFocalTokenId());

    // Grey ring around inert dead anchors (DESIGN.md §8.3).
    this._drawDeadAnchors();
  }

  /** Grey-ring each token flagged as a dead/inert anchor in the matrix. */
  _drawDeadAnchors() {
    const dead = getMatrix(canvas.scene).deadAnchors ?? [];
    if (!dead.length) return;
    const g = this.shells;
    for (const id of dead) {
      const t = canvas.tokens?.get(id);
      if (!t) continue;
      const r = Math.max(t.w ?? 0, t.h ?? 0) / 2 + 4;
      g.lineStyle(3, DEAD_COLOR, 0.9);
      g.drawCircle(t.center.x, t.center.y, r);
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
    const g = this.shells;
    for (const id of ids) {
      const t = canvas.tokens?.get(id);
      if (!t) continue;
      const r = Math.max(t.w ?? 0, t.h ?? 0) / 2 + 6;
      g.lineStyle(2, PENDING_COLOR, 0.95);
      g.drawCircle(t.center.x, t.center.y, r);
    }
  }

  /** Normalised cumulative radii (px) from per-band visual weights (DESIGN.md §4.1). */
  _schematicRadii() {
    const maxRadius = (canvas.dimensions?.size ?? 100) * 8; // base schematic extent
    return schematicRadii(getVisualWeights(), maxRadius);
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

  _clearLabels() {
    if (this.labels) this.labels.removeChildren().forEach(c => c.destroy());
  }

  /** Draw a text label for each zone, stacked upward within each band's annulus. */
  _drawLabels(center, bands, radii) {
    if (!this.labels) return;
    const size = canvas.dimensions?.size ?? 100;
    const fontSize = Math.max(12, Math.round(size * 0.22));
    const style = {
      fontFamily: "Signika, sans-serif",
      fontSize,
      fill: 0xffffff,
      stroke: 0x111111,
      strokeThickness: Math.max(2, Math.round(fontSize / 5)),
      align: "center"
    };
    for (let i = 0; i < bands.length; i++) {
      const inner = i === 0 ? 0 : radii[i - 1];
      const mid = (inner + radii[i]) / 2;
      const text = game.i18n?.localize?.(bands[i].label) ?? bands[i].key;
      const t = new PIXI.Text(text, style);
      t.anchor.set(0.5);
      t.position.set(center.x, center.y - mid); // stacked along the top axis
      this.labels.addChild(t);
    }
  }
}
