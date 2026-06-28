/**
 * Zone Combat — per-scene background dimming.
 * Adds a "Zone background opacity" slider to the Scene config (stored as a scene flag)
 * and applies it to the scene's background image so the zone tiles read clearly.
 */
const NS = "zone-combat";
const KEY = "bgOpacity";

/** Background opacity for a scene (0..1); 1 = unchanged. */
export function getBgOpacity(scene = canvas?.scene) {
  const n = Number(scene?.getFlag?.(NS, KEY));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

/** Apply the configured opacity to the live scene background mesh. */
export function applyBackgroundOpacity(scene = canvas?.scene) {
  if (!scene || scene !== canvas?.scene) return;
  const bg = canvas?.primary?.background;
  if (!bg) return;
  try { bg.alpha = getBgOpacity(scene); } catch (_) { /* ignore */ }
}

/**
 * Inject the slider into the Scene config form (Foundry v13/v14 ApplicationV2).
 * The render hook can fire before the tab parts exist, so we de-dupe by *removing* any
 * prior injection and re-inserting against the fully-rendered DOM (`app.element`) — that
 * way the final placement is always correct, next to the Background Image field.
 */
export function injectSceneConfig(app, html) {
  const scene = app?.document ?? app?.object;
  const root = app?.element ?? html?.[0] ?? html;
  if (!scene || !root?.querySelector) return;

  // Remove any earlier (possibly mis-placed) injection so we can re-place cleanly.
  root.querySelector(`[name="flags.${NS}.${KEY}"]`)?.closest(".form-group")?.remove();
  root.querySelector(`[name="flags.${NS}.mode"]`)?.closest(".form-group")?.remove();

  // Anchor: the Background Image field (<file-picker name="background.src">) in Basics.
  const bgGroup = root.querySelector('[name="background.src"]')?.closest(".form-group");
  if (!bgGroup?.parentNode) return; // basics part not rendered yet; a later render catches it

  // Mode selector: range bands vs drawn zones (Scene Regions).
  const mode = scene.getFlag?.(NS, "mode") === "zones" ? "zones" : "bands";
  const modeGroup = document.createElement("div");
  modeGroup.className = "form-group";
  modeGroup.innerHTML = `
    <label>Zone Combat Mode</label>
    <div class="form-fields">
      <select name="flags.${NS}.mode">
        <option value="bands" ${mode === "bands" ? "selected" : ""}>Range bands (concentric)</option>
        <option value="zones" ${mode === "zones" ? "selected" : ""}>Drawn zones (Scene Regions)</option>
      </select>
    </div>
    <p class="hint">Zone Combat — how distance works on this scene.</p>`;

  // Background opacity slider.
  const v = getBgOpacity(scene);
  const group = document.createElement("div");
  group.className = "form-group";
  group.innerHTML = `
    <label>Zone Background Opacity</label>
    <div class="form-fields">
      <input type="range" name="flags.${NS}.${KEY}" data-dtype="Number"
             min="0" max="1" step="0.05" value="${v}">
      <span class="range-value" style="min-width:3ch;text-align:right;">${v}</span>
    </div>
    <p class="hint">Zone Combat — dim the scene background image so the zone tiles show clearly.</p>`;

  const input = group.querySelector("input");
  const readout = group.querySelector(".range-value");
  input?.addEventListener("input", () => { if (readout) readout.textContent = input.value; });

  bgGroup.parentNode.insertBefore(modeGroup, bgGroup.nextSibling);
  modeGroup.parentNode.insertBefore(group, modeGroup.nextSibling);
  app.setPosition?.({ height: "auto" });
}
