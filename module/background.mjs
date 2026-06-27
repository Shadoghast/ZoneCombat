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

/** Inject the slider into the Scene config form (works for jQuery or HTMLElement). */
export function injectSceneConfig(app, html) {
  const scene = app?.document ?? app?.object;
  if (!scene) return;
  const root = html?.[0] ?? html;
  if (!root?.querySelector) return;
  if (root.querySelector(`[name="flags.${NS}.${KEY}"]`)) return; // already injected

  const v = getBgOpacity(scene);
  const group = document.createElement("div");
  group.classList.add("form-group");
  group.innerHTML = `
    <label>Zone background opacity</label>
    <div class="form-fields">
      <input type="range" name="flags.${NS}.${KEY}" data-dtype="Number"
             min="0" max="1" step="0.05" value="${v}">
      <span class="range-value">${v}</span>
    </div>
    <p class="notes">Zone Combat — dim the scene background image so zone tiles show clearly.</p>`;

  // Keep the little value readout in sync as the slider moves.
  const input = group.querySelector("input");
  const readout = group.querySelector(".range-value");
  input?.addEventListener("input", () => { if (readout) readout.textContent = input.value; });

  const anchor =
    root.querySelector('[name="background.src"]')?.closest(".form-group") ??
    root.querySelector('[name="img"]')?.closest(".form-group");
  if (anchor?.parentNode) anchor.parentNode.insertBefore(group, anchor.nextSibling);
  else (root.querySelector("form") ?? root).appendChild(group);

  app.setPosition?.({ height: "auto" });
}
