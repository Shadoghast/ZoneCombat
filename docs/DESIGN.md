# Zone Combat — Design Spec

> Status: **Draft** · Target: **Foundry VTT v14+** · Module: `ZoneCombat`
> This document captures design decisions for the Zone Combat module. It is a living spec; sections marked **OPEN** are not yet decided.

## 1. Concept

Zone Combat replaces measured, grid-by-grid movement with **abstract range bands**. Instead of asking "how many feet is it to the goblin," play asks "what band is the goblin in — Close, Near, Medium, Long, or Far?" This is the narrative / theater-of-the-mind range model (Fate, Fellowship, Cypher-style), made first-class inside Foundry while still drawing a structured overlay on the canvas.

### Relative, not absolute

Range is **relative and egocentric**. There are no fixed "zone" places on the map ("the courtyard"). Instead, for a given **focal token**, every other token falls into a band based on its true distance from that focal token. The same pair of tokens can be "Near" from one frame of reference and "Long" from another.

The underlying true distance (in feet / grid units) is always retained as data and is the **source of truth for mechanics**. The on-canvas overlay is a schematic read of that data, not a measurement tool.

## 2. The Range Bands

Five bands, defined by upper distance thresholds (defaults shown). Each band is "up to and including" its threshold.

| Band       | Default threshold | Meaning                          |
|------------|-------------------|----------------------------------|
| **Close**  | ≤ 5 ft            | Immediate melee / within reach   |
| **Near**   | ≤ 10 ft           | A step away; short melee/reach    |
| **Medium** | ≤ 30 ft           | Across the room; thrown/short ranged |
| **Long**   | ≤ 60 ft           | Down the hall; standard ranged    |
| **Far**    | > 60 ft           | Everything beyond Long            |

History: an earlier draft used six bands (Close 5 / Near 10 / Medium 30 / Long 60 / Very Long 90 / Far 90+). **Very Long and Far were merged** into a single **Far** band (> 60 ft) to reduce the number of compressed outer shells.

## 3. Canvas Rendering — Schematic Shells

Each focal token is surrounded by **concentric range shells**, one per band. The shells are deliberately **schematic, not to scale**: the inner bands (Close / Near / Medium) — where most tactical decisions happen — are drawn large, and the outer bands (Long / Far) are compressed into thin rings. This keeps the overlay legible and prevents the long-range bands from blanketing the entire canvas on large scenes.

### Shape follows the grid

The shell geometry matches the scene's grid type:

- **Gridless / circular grid** → concentric **circles**.
- **Square grid** → concentric **square rings** (king-move / Chebyshev distance — a cell, the block around it, the block around that).
- **Hex grid** → concentric **hex rings** (center hex, ring of 6, ring of 12, …).

Because the drawing is schematic, band membership for mechanics is computed from the **true grid distance**, never from rendered pixel radius.

### Rendering target & mechanism

The shells are drawn **directly on the scene canvas** as an overlay around the focal token — **not** in a separate popup/diagram window. The abstract bands and the literal map share one surface, which is what makes the canvas-sync model (§7) coherent.

- **Module, not system.** Zone Combat is a Foundry **module** that augments whatever game system the world runs; it does not define actors/items. It must not assume system-specific data.
- **Mechanism (v14+):** register a dedicated **`CanvasLayer`** (PIXI container) into `CONFIG.Canvas.layers` during `init`, and render the shells as **`PIXI.Graphics`** within it. The layer sits above grid/tiles as an interface overlay, anchored at the focal token's center.
- **Redraw triggers:** controlled/active-token change, `updateToken` (move/position), `canvasReady`/`canvasInit`, scene grid-type change, and any settings change to band thresholds or visual proportions (§4).
- **Geometry source:** shell shape from the scene's grid type (§3 circle/square/hex); shell radii from the per-band visual proportions (§4.1); band cutoffs from the distance thresholds (§4.2).
- **Layout coupling:** token (x,y) placement is owned by the layout solver (§7); this layer only *draws* shells and reads positions — it does not move tokens itself.

### OPEN — Rendering questions

- **Whose shells render, and when?** Options: only the currently selected/active token, drawn on demand; or every combatant simultaneously. (Leaning: focal token on demand, to avoid overlap clutter.)
- **Overlay vs. mechanics coupling.** Is the overlay purely a visual aid, or does the same geometry drive auto-labeling of range between tokens? (Leaning: overlay is the visual read; mechanics read true distance and auto-label the band.)

## 4. GM-Tunable Settings

Both of the following are GM-editable, **per band**. They are independent: the visual knob never affects mechanics; the distance knob does.

### 4.1 Visual proportion (presentation only)

How much screen space each band's shell occupies in the schematic — the inner-vs-outer weighting. Changing this never changes who can hit whom.

- **Scope:** per-scene, with a **world-level default**. (A cramped dungeon and an open field want different weightings; the GM sets a default once and overrides per scene as needed.)
- **OPEN — control model:** per-band weight sliders (e.g. Close = 3, Near = 2, … normalized to fit the canvas) vs. named preset layouts ("Brawl," "Skirmish," "Open field") shipped with the module. (Proposed: per-band weights, with a few presets as starting points.)

### 4.2 Distance thresholds (mechanical)

The feet cutoffs that decide which band two tokens fall into (the 5 / 10 / 30 / 60 defaults in §2). Different rulesets define melee/short/long differently, so these are exposed — treated as the more advanced knob.

- **Scope:** per-scene with a world-level default (mirrors visual proportion). *(Confirm scope.)*

## 5. Open Questions (broader model)

- **Movement between bands.** How does a token change its band relative to a target — a discrete "move one band closer/farther" action, or derived from normal token movement on the canvas?
- **Per-pair vs. shared formation.** Is range tracked independently per pair of tokens (A is Near to B but Long from C), or is there a single shared formation line everyone sits on relative to one frame of reference? (Range-band definitions in §2 imply per-pair / egocentric.)
- **What "Far" allows mechanically** — line of sight, ranged attacks with penalties, no interaction, etc.
- **Combat tracker integration** — does the module surface band info in the tracker, and to what degree is this v1 scope?
- **Zone effects** (difficult terrain, hazards) — likely out of v1 scope; noted for later.

## 6. Relative-Distance Bookkeeping & Propagation

This is the core engine. Decided model: **propagated consistency** — the system keeps the whole web of relationships self-consistent when any token moves, rather than trusting the GM (purely relational) or simulating full 2D positions (true-position).

### 6.1 Source of truth: a symmetric distance matrix

Range is **symmetric**: if A is Near to B, then B is Near to A. So we do **not** store a separate table per token. We store **one value per unordered pair** `{X,Y}`. Each token's "table of relative distances" is just a *view* (row) into this shared matrix. Writing `{A,B}` updates A's view and B's view at once — that is what "recorded for both tokens" means, structurally, with no second write to keep in sync.

To make propagation well-defined and lossless, the stored value is **not** the coarse band label but a **scalar representative distance** `d{X,Y}` in feet. The band is *derived*: `band(d) = bucket(d)`.

For N tokens the matrix has N(N−1)/2 scalar entries.

### 6.2 Band ↔ distance intervals

| Band   | Interval (ft) | Representative when newly assigned |
|--------|---------------|------------------------------------|
| Close  | [0, 5]        | nearest in-band value to prior `d` |
| Near   | (5, 10]       | nearest in-band value to prior `d` |
| Medium | (10, 30]      | nearest in-band value to prior `d` |
| Long   | (30, 60]      | nearest in-band value to prior `d` |
| Far    | (60, ∞)       | **preserve true distance** when known (geometry/canvas); else a GM-configurable **nominal** (default ~90 ft) |

"Nearest in-band value to prior `d`" minimizes churn: a one-band drag nudges the scalar just across the boundary rather than jumping to a midpoint, which keeps propagation cascades small. (These intervals track the GM-tunable thresholds from §4.2 — if the GM changes thresholds, the buckets change with them.)

### 6.3 Turn flow (recenter)

When token **A** becomes active:

1. A is drawn at the center of the diagram.
2. For every other token X, X is rendered into the shell `band(d{A,X})`, read from the matrix.
3. The GM/players drag tokens between shells. A drag of X into band `b` means: set `d{A,X}` to the representative for `b` (§6.2), then run propagation (§6.4).

A's row `{A,*}` is the **authoritative placement for this turn** — those are deliberate GM intent and are *pinned* during propagation.

### 6.4 Propagation (constraint repair)

Bands only constrain geometry up to the **triangle inequality**. For any three tokens X, Y, Z the true distances must satisfy:

```
| d{X,Y} − d{X,Z} |  ≤  d{Y,Z}  ≤  d{X,Y} + d{X,Z}
```

When a move changes `d{A,B}`, edges incident to B (`d{B,C}`, `d{B,D}`, …) may fall outside the feasible window implied by the pinned A-row. Repair algorithm:

1. **Pin** the active-token row `{A,*}` and the just-edited edge. These never move.
2. **Worklist** of triples to check, seeded with every triple containing the moved token B.
3. For a triple with two pinned edges and one free edge, the free edge `d{Y,Z}` must lie in `[ |d{X,Y} − d{X,Z}|, d{X,Y} + d{X,Z} ]`. If it's outside, **clamp it to the nearest endpoint** (minimal change), and enqueue every triple that shares the changed edge.
   - **Far edges are upper-unbounded.** A pinned edge in the **Far** band contributes a lower bound of 60 ft but an **infinite upper bound** to the triangle math, so a Far pairing never wrongly tightens another edge via the `+` side of the inequality. (Its stored scalar — §6.2 — is for layout only, not for capping.)
4. Repeat to fixpoint. Because Far is unbounded above, a feasible band always exists, so there is **no hard-contradiction state** — propagation always terminates with a consistent matrix.
5. Cap iterations defensively; if the cap is hit, stop and warn the GM rather than loop.

> **Caveat — embeddability.** Triangle inequality is *necessary* but, for 4+ tokens, not *sufficient* for a real 2D layout. So a propagation-consistent matrix may still not correspond to any literal map positions. We enforce triple-wise consistency, not planarity. Because we **keep the canvas in sync** (§7), literal token positions are produced by a **best-fit layout solver** rather than assumed to exist exactly — the matrix remains authoritative and the canvas is its closest approximation.

### 6.5 Change logging

Every committed move records, to a per-turn log:

- the **explicit** edit (`{A,X}` band before → after), attributed to active token A and moved token X; and
- every **propagated** edit (`{Y,Z}` before → after) that the repair pass produced.

Propagated edits are surfaced to the GM (notification / highlight) so silent off-center changes are visible. Because edits are stored on the unordered pair, each logged change is inherently attributed to *both* endpoints.

### 6.6 Pin scope and timing — DECIDED

- **Pin scope: whole active-token row.** During repair, every edge in the active token's row `{A,*}` is pinned — all placements made relative to the active token this turn are authoritative and never move. Only off-center pairs (between the *other* tokens) flex to restore consistency. This is predictable for the GM ("what you arrange around the active token stays put") and is well-defined under end-of-turn batching, where many edges have been edited and "the single edited edge" would be ambiguous.
- **Timing: batched at end of turn.** Moves accumulate freely during the active token's turn; the board may be temporarily inconsistent mid-turn. The constraint-repair pass (§6.4) runs **once when the turn ends**, then logs all resulting changes (§6.5). Seed the worklist with every triple touched by any edge edited during the turn.

### 6.7 Persistence & storage (Foundry v14+)

Decided: the matrix and its companion state live in a **scene flag** (`scene.flags["zone-combat"]`), **persistent per scene** — it survives reloads, persists across encounters (so zones work in non-combat scenes too), and travels with scene export/import. It is cleared only explicitly.

Shape of the flag (illustrative):

```jsonc
{
  "version": 1,
  "nominalFar": 90,            // GM-configurable Far nominal (§6.2)
  "pairs": {                   // one entry per UNORDERED pair (symmetry, §6.1)
    "tokIdA|tokIdB": 8.0,      // key = the two token ids, sorted; value = scalar feet
    "tokIdA|tokIdC": 42.0
  },
  "deadAnchors": ["tokIdD"],   // inert-anchor tokens (§8.3), layout-pinned
  "log": [ /* per-turn change entries (§6.5) */ ]
}
```

- **Pair key** = the two token ids sorted and joined, guaranteeing a single canonical entry per pair.
- **Pruning** on token deletion (§8.2) removes every `pairs` entry containing that id and any `deadAnchors` reference.
- Visual proportions and distance thresholds (§4) follow their own scene/world setting scope; only the live relational state lives in this flag.

### 6.8 Mid-turn provisional display

Decided: because repair is batched to end-of-turn, the board shows a **provisional state** during a turn, and that state is visually marked rather than silent or live-previewed.

- Tokens/shells **edited during the current turn** render in a **pending** style (e.g. dashed outline or subtle desaturation) until the turn ends.
- On turn end, repair (§6.4) runs and the resulting **propagated changes briefly highlight**, reusing the change-surfacing from §6.5.
- No non-destructive live re-run of repair per move — that would defeat batching.
- The pending styling is owned by the canvas layer (§3 rendering) and driven by the per-turn edit set.

## 7. Canvas ↔ Matrix Sync

Decided: **band moves keep the actual canvas token in sync.** The relationship is one-directional in authority but bidirectional in interaction:

- **Authority:** the band matrix (§6.1) is the single source of truth. The canvas (x,y) of each token is a **derived rendering**, not independent state.
- **Deriving positions:** after the end-of-turn repair pass (§6.4), a **layout solver** repositions tokens to best-fit the matrix. Candidate methods: stress-majorization / classical MDS or a force-directed relaxation.
- **Slack inside bands:** the solver's error term is **zero while a pair's canvas distance lies anywhere inside its band interval**, and only penalizes distances that fall outside. This gives the layout freedom, avoids jitter, and keeps tokens from sliding around when nothing meaningful changed.
- **Approximate by design:** because the matrix need not be 2D-embeddable (§6.4 caveat), the solver minimizes total band-violation rather than guaranteeing a perfect layout. If a token cannot be placed within its exact band, mechanics still use the matrix; an optional visual hint can mark the imperfect placement.
- **Bidirectional interaction (decided):** dragging a token directly on the canvas is an **edit**, not just a view change — matching native Foundry drag behavior. Two cases, one code path ("set distances → repair"):
  - **Drop inside the focal token's shells** → snaps to that band (the relational, turn-scoped move; sets `d{focal, dragged}`).
  - **Free-drag elsewhere** → re-derives the dragged token's whole row from its new real distances to every token (geometric, like a re-seed), then repair runs with the established matrix authoritative.
  - So the GM can work in either the shell diagram or the literal map, and the other view follows.
- **Timing:** re-layout runs with the batched end-of-turn repair, so mid-turn the canvas may be provisional (ties into the mid-turn display question in §6.7).

## 8. Token Insertion & Removal

### 8.1 Insertion — geometry seed, then repair

When a new token **N** is dropped onto a scene that already has tokens:

1. **Seed N's row from the drop geometry.** Compute N's true distance to every existing token from current canvas coordinates and bucket each into a band → a representative scalar (§6.2). This fills all N−1 new edges in one shot, and they are mutually self-consistent because they radiate from a single real point. Because the canvas is kept in sync (§7), existing tokens' positions already reflect the matrix, so this seed is reliable mid-combat, not only at setup.
2. **Repair the new triples.** Run the constraint pass (§6.4) over every triple `{N, X, Y}`. The **established matrix is authoritative** — existing X↔Y edges are pinned; only N's freshly seeded edges are clamped where a triple is violated. (Adding N can only affect edges incident to N, so no existing pair can break.)
3. **Re-layout** (§7) to seat N and absorb any clamps.
4. **GM override.** The GM may recenter on N (or any token) and adjust N's bands by hand afterward.
5. **Log** all of N's new edges as creation entries, attributed to both endpoints.

### 8.2 Hard removal (deleted from the scene)

Deleting a token T from the canvas **drops T's row/column** from the matrix. Removing a vertex can never introduce a triangle-inequality violation among the remaining tokens, so no repair is needed; a re-layout (§7) reseats the survivors. Notes:

- Any **unbatched edits** from the current turn that involve T are discarded with it.
- If T was the **active/focal** token, the turn hands off per §8.4.
- T's row is gone for good. If that actor reappears later, it is treated as a brand-new **insertion** (§8.1), re-seeded from geometry.

### 8.3 Death / incapacitation (stays on the board)

A dead or downed token usually remains on the scene (a corpse is still a physical reference — cover, a body to stand over, something line of sight runs past). Death is therefore **not** a matrix removal. The token becomes an **inert anchor**:

- **Stays in the matrix** as a valid range reference; its existing edges are retained.
- **Out of turn rotation** — a dead token never becomes the active/focal token, so the diagram is never recentered on it.
- **Never initiates a move,** but other (living) tokens may still change distance *to* it. Because range is symmetric and relational, an ally closing on the corpse updates `{corpse, ally}` — the corpse "didn't move," the ally did.
- **Layout pin:** the solver (§7) **pins the dead token's canvas position**. A corpse does not drift; it becomes a fixed anchor the living arrange themselves around.
- **Rendering:** shown in the shells with a dead/greyed style.
- **Revival is free:** clearing the dead flag returns it to rotation. Its row was retained, so there is nothing to re-seed — important for downed-but-stabilized PCs who get healed.
- **Source of the "dead" state:** keyed off the actor's defeated/HP status or a Foundry condition (implementation detail; deferred).
- A GM may still *explicitly* hard-remove a corpse (§8.2) when it should leave the relational map entirely (e.g. it disintegrates).

### 8.4 Interrupting the active token

If the active/focal token is **removed or dies mid-turn** — before the batched end-of-turn repair (§6.4) runs — that turn's **pending unbatched edits are discarded**, the token leaves rotation (removed per §8.2, or anchored per §8.3), and play **advances to the next combatant**. The repair/relayout then runs for the new active token as normal. The interrupted turn is treated as void.

## 9. Decisions Log

- Relative / egocentric range model — **decided**.
- Five bands; Very Long + Far merged into Far (> 60 ft) — **decided**.
- Schematic shells, inner bands large / outer bands compressed — **decided**.
- Shell shape follows grid type (circle / square / hex) — **decided**.
- True distance is the mechanical source of truth; overlay is schematic — **decided**.
- GM can tune both visual proportion and distance thresholds, per band — **decided**.
- Visual proportion scoped per-scene with world default — **decided**.
- Consistency model: **propagated consistency** (triangle-inequality constraint repair) — **decided**.
- Source of truth: one **scalar distance per unordered pair**; bands derived; active token's row pinned per turn — **decided**.
- Repair pins the **whole active-token row**; off-center pairs flex — **decided**.
- Constraint repair runs **batched at end of turn** — **decided**.
- Canvas kept **in sync** with the matrix via a best-fit **layout solver** (matrix authoritative; canvas derived; zero penalty inside a band) — **decided**.
- New token: **geometry-seed its row from drop distance**, then repair with the existing matrix authoritative; GM may override — **decided**.
- Token removal drops its row/column; no repair needed — **decided**.
- Death = **inert anchor**: stays in matrix, out of rotation, layout-pinned, revivable with no re-seed — **decided**.
- Active token interrupted mid-turn: **discard pending edits, advance** — **decided**.
- Shells render **on the scene canvas** via a custom `CanvasLayer` + `PIXI.Graphics` (not a popup); Zone Combat is a **module**, not a system — **decided**.
- Far stores **true distance when known, else a GM nominal (~90 ft)**; Far edges are upper-unbounded in propagation — **decided**.
- Matrix stored in a **persistent per-scene flag** (`scene.flags["zone-combat"]`), keyed by sorted token-id pairs — **decided**.
- Mid-turn state shown with **provisional styling** (pending look until commit; propagated changes highlight at turn end) — **decided**.
- Canvas drags are **bidirectional edits** (shell-drop snaps to band; free-drag re-derives from geometry), then repair — **decided**.
- Second model added: **Drawn-Zone mode** (per-scene) — see §10 — **decided**.

## 10. Drawn-Zone Mode (WFRP Old World / Fate style)

A per-scene **mode** flag (`flags.zone-combat.mode` = `bands` | `zones`) selects the distance model. In **zones** mode the concentric range-band machinery (matrix, propagation, layout, drag-editing, token auto-arrange) is **disabled**; distance is derived live from drawn zones.

- **Zones = Foundry Scene Regions.** Every region on the scene is a zone (unless flagged `zone-combat.exclude`). Region polygons are read as ring-sets.
- **Adjacency (hybrid):** two zones auto-link if their boundaries touch / are within ~1 grid cell, or overlap. GM overrides are stored in `flags.zone-combat.zoneLinks = { added:[[a,b]], removed:[[a,b]] }`. (Override-editing UI is a follow-up; auto-detect works now.)
- **Distance = zone hops.** BFS shortest path on the adjacency graph between the active token's zone and the target's zone. Same zone = 0, adjacent = 1, …; unreachable = ∞.
- **Hops → bands (WHToW naming).** Bands are **Close, Short, Medium, Long, Extreme**. Hop mapping: same zone (0) = **Short**, 1 = **Medium**, 2 = **Long**, 3+ = **Extreme**. **Close** is *not* a hop count — it is a **proximity override**: any two tokens within arm's reach (a GM setting, default 1 space) are Close, even across an adjacent zone edge (matching WHToW's "very edge of adjacent Zones"). Rendered as a red "engaged" ring on tokens within arm's reach of the active token; regions still colour by the hop band.
- **Rendering:** each region is filled by its band colour relative to the active token's zone, with the bold boundary stroke and a band-name label at the centroid. Tokens never move; players/GM position them normally and the colouring updates live.
- **Pure core** (`module/zone-graph.mjs`): polygon adjacency, override merge, BFS, point-in-rings — unit-tested. Foundry glue in `module/regions.mjs`.
- Foundry target: **v14+ only** — **decided**.
