# Ocean Currents: per-cell direction, speed, and water temperature

Adds an ocean current field to the map: every open-ocean `grid` cell carries a current direction, a
current speed, and a surface water temperature, computed from the existing wind belts and
sea-level temperature settings and shaped by real landmass geometry via a genuine fluid solve. This
document covers what was implemented, why it is built the way it is, and what it deliberately
leaves out.

Requested in `docs/plan/ocean-current-system-investigation.md` §4 ("future implications for a
gameplay ocean-current feature") — this is that feature. It shipped in three revisions:

1. Wind-seeded, land-clipped, no shape-awareness beyond immediate land neighbors.
2. Shape-responsive via a hand-tuned BFS relaxation/reflection/exit-funneling heuristic: headland
   bends, bay/strait damping and funneling. Explicitly *not* a CFD solve — no mass-conservation
   pressure projection, no explicit acceleration through narrow channels — and its far-field
   behavior had a hard limit: any cell more than `PIN_DISTANCE` (40) hops from land was reset to
   the raw seeded wind vector every relaxation pass, so a coastline's deflection could bend flow
   locally but could never turn into a long, coherent current running *along* a coast the way real
   boundary currents (Gulf Stream, Kuroshio) do — real currents that hit land don't dissipate
   there, they redirect and keep flowing along the shore.
3. **Current revision**: replaced the heuristic with a genuine D2Q9 Lattice Boltzmann fluid solve
   (`src/generators/fluidSolver.ts`, §2 below). Land is a real bounce-back obstacle and there is no
   far-field pin at all — every cell, however far from shore, is governed by the same
   collision+streaming+forcing rule every iteration. Because a bounce-back boundary can never
   absorb or destroy fluid, mass conservation forces a current blocked head-on by land to redirect
   tangentially and keep flowing along the coast, instead of the old heuristic's "deflect near
   shore, snap back to raw wind farther out" behavior.

This is that feature, specifically so the field is usable for sea-route travel speed (§5) and as an
enclosure/shelter signal (§6), not just a decorative wind overlay.

---

## 0. Design summary

- **New per-cell data, not a new simulation clock.** Computed once during map generation (and
  recomputed whenever heights, wind belts, or temperature settings change), the same way
  `grid.cells.temp`/`grid.cells.prec` already work. There is no tick-driven or seasonal update —
  see §5 for how this relates to the existing seasonal current *bias* that already exists
  elsewhere in the codebase.
- **Built on `grid`, not `pack`.** `pack.cells` thins out open-ocean sample points during
  `reGraph()` (`src/main.ts`), leaving oversized, irregular cells far from any coast — a known,
  documented tradeoff (`src/generators/features.ts`'s `ENCLOSURE_AREA_LIMIT_RATIO` comment).
  `grid` keeps uniform density across the whole map. `grid.cells.temp`/`.prec` already use this
  same substrate for the same reason; ocean currents follow the precedent. Anything that needs a
  value per `pack` cell looks it up via `pack.cells.g[i]`, exactly like existing `temp`/`prec`
  consumers do.
- **`grid` doubles as the fluid solver's raster.** A D2Q9 Lattice Boltzmann solve needs a regular
  lattice, and `grid.cells` already *is* one: `src/utils/graphUtils.ts`'s `placePoints()` /
  `getJitteredGrid()` lay points out in exact row-major `cellsX * cellsY` order (the same invariant
  `generatePrecipitation()`'s row/column scans already depend on), so the solver's lattice index
  `i` corresponds exactly to `grid.cells` index `i` — no separate lattice resolution or resampling
  step is needed.
- **A real fluid solve, not a heuristic — with disclosed simplifications.** Currents start out
  following the user's existing wind belts (`options.winds`, the same 6 latitude-tier prevailing
  winds `generatePrecipitation()` already uses and the WorldConfigurator globe widget already
  exposes), applied as a standing body force to a D2Q9 Lattice Boltzmann solve (§2) with land/lake
  as bounce-back obstacles. LBM recovers incompressible Navier-Stokes in the low-Mach limit — a
  genuine numerical CFD method (Chen & Doolen 1998), not a heuristic. What's still simplified, and
  disclosed as such: the solver's domain wraps periodically on both axes (a standard, well-behaved
  LBM boundary treatment, not a physics shortcut); wind itself stays the flat, user-configurable
  `options.winds` latitude belts rather than a simulated, heightmap-shaped wind field; lakes carry
  no current (unchanged from previous revisions); and Coriolis-driven gyres / thermohaline
  circulation remain out of scope.

---

## 1. Data (`src/types/Grid.ts`, `GridCells`)

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `currentAngle` | `Uint16Array` | Current direction in degrees, `0-359` (standard math convention: `0` = +X axis, increasing clockwise in screen space). `0` for land and lake cells. |
| `currentSpeed` | `Uint8Array` | Current speed, normalized `0-255`. `0` for land and lake cells. |
| `ambientCurrentSpeed` | `Uint8Array` | `currentSpeed` smoothed across nearby ocean cells (§2.2 step 5) — reflects the speed a short distance offshore rather than the near-zero no-slip value almost every shoreline cell reads in `currentSpeed` itself. `0` for land and lake cells. Used by the `"oceanCurrentsAmbient"` enclosure mode (§6). |
| `waterTemp` | `Int8Array` | Surface water temperature in °C. For ocean cells: the latitude-baseline sea temperature (`temp`) advected along the resolved current field. For land and lake cells: mirrors `temp` unchanged, so any consumer that wants "surface temperature everywhere" doesn't need to branch on cell type. |

All four are required (non-optional) fields, following the same convention `temp`/`prec` already
use: `generateGrid()` (`src/utils/graphUtils.ts`) creates the grid without them, and a cast bridges
the gap until `OceanCurrents.generate()` runs later in the same pipeline stage.

Only cells belonging to a `grid.features[...].type === "ocean"` feature get a nonzero current —
lakes are excluded (they don't carry a current, matching how the existing decorative "Sea
Currents" WebGL layer already excludes lake crossings), and so is land.

---

## 2. Algorithm (`src/generators/oceanCurrents.ts`, `OceanCurrents.generate()`)

### 2.1 The solver (`src/generators/fluidSolver.ts`)

A generic, reusable D2Q9 Lattice Boltzmann Method (LBM) engine — deterministic (no RNG), with no
knowledge of maps, heightmaps, or oceans, just lattice mechanics:

- **Obstacles via bounce-back.** Every land/lake cell is a solid node: instead of colliding, its 9
  particle-distribution values are reversed in place ("on-site" bounce-back — see Mohamad,
  *Lattice Boltzmann Method*), so whatever arrived from a direction is sent straight back the way
  it came by the streaming pass. This is the entire "land shape deflects current" mechanism — no
  separate exposure/openness BFS heuristic is needed, mass conservation does the work: water can't
  be destroyed by hitting a solid node, so a current blocked head-on has nowhere to go but
  tangential to the obstacle, which is exactly how a long, coherent current running *along* a coast
  emerges instead of dissipating at the point of impact.
- **Forcing via a standing body force + linear drag.** The latitude-tier wind (`options.winds`) is
  applied every iteration as a body force (Guo et al. 2002 forcing scheme), not a one-time seed —
  this is what lets the solve organize coherent large-scale circulation instead of only perturbing
  a fixed starting field. BGK viscosity only dissipates velocity *gradients*; a perfectly uniform,
  unobstructed, uniformly-forced region has no gradient to dissipate, so without something else to
  balance it, momentum would grow without bound instead of reaching a steady state (Newton's second
  law with no friction). `FluidSolverConstants`/`OceanCurrentConstants.DRAG_COEFFICIENT` add a
  linear drag term (subtracted from the effective force in proportion to each cell's own velocity)
  — a standard, textbook closure for wind-driven flow (linear/Rayleigh bottom friction, as in
  Stommel's classic wind-driven gyre model), not a simulation-specific hack. An unobstructed,
  uniformly-forced cell settles at `WIND_FORCE_MAGNITUDE / DRAG_COEFFICIENT` (lattice units) —
  see `OceanCurrentConstants.LATTICE_SPEED_REFERENCE`.
- **No far-field pin.** Unlike the previous heuristic's `PIN_DISTANCE` mechanism, there is no
  distance-based reset anywhere in this solve — every cell, however far from shore, runs the exact
  same collision+streaming+forcing rule every iteration. `DRAG_COEFFICIENT` is the main lever on
  how far a coastline's deflection can propagate along-shore before drag damps it back out: lower
  drag lets a boundary current persist further from its point of origin (a corner/headland) at the
  cost of needing more iterations to reach steady state. Tuned so a deflection is still clearly
  present tens of cells from where it originated, not just within a handful of cells the way the
  previous heuristic's pin effectively limited it to (see the "sustains along-shore... " test,
  §7 below).
- **Periodic boundaries.** The lattice wraps on both axes — standard, numerically well-behaved for
  LBM, avoids open inflow/outflow edge cases. The map wraps for flow-solving purposes only; this
  has no effect on anything else.
- **Numerical stability.** `FluidSolverConstants.RELAXATION_TIME` (tau, the BGK relaxation time)
  must stay above 0.5; `WIND_FORCE_MAGNITUDE`/`DRAG_COEFFICIENT` are tuned so the steady-state
  speed (0.1 lattice units) stays comfortably below the lattice speed of sound (1/√3 ≈ 0.577),
  keeping the solve in the low-Mach, near-incompressible regime the equilibrium distribution
  assumes.

### 2.2 Wiring it up (`OceanCurrents.generate()`)

1. **Obstacle field**: every non-ocean cell (land or lake, from `classifyOceanCells()`) becomes a
   solid lattice node.
2. **Forcing field**: for every ocean cell, look up its latitude tier the same way
   `generatePrecipitation()` does, and set the lattice force from `options.winds[tier]` at
   `OceanCurrentConstants.WIND_FORCE_MAGNITUDE`.
3. **Run**: `FluidSolver.run(lattice, iterations, RELAXATION_TIME, DRAG_COEFFICIENT)`, where
   `iterations` is `FluidSolverConstants.ITERATIONS_FULL_GENERATION` (1500 — a full map generation,
   Assist Mode resample, or map load, where letting a boundary current fully settle along the
   entire length of a coastline matters more than latency) or `ITERATIONS_LIVE_RECOMPUTE` (400 — a
   live in-editor recompute, heightmap Erase mode or `fmg:world-recalculate`, where responsiveness
   matters more than full convergence; the field looks slightly less settled immediately after a
   live edit than after a full generation, an acceptable trade-off for interactivity).
4. **Sample back**: the lattice's resolved `ux`/`uy` (lattice units) are scaled by
   `BASE_SPEED / LATTICE_SPEED_REFERENCE` into the app's existing `currentAngle`/`currentSpeed`
   0-255-ish scale — the same scale the previous heuristic's `BASE_SPEED`-seeded vectors already
   used, so nothing downstream (§5, §6) needs to change.
5. **Derive `ambientCurrentSpeed`** (`computeAmbientCurrentSpeed()`): `currentSpeed` reads
   near-zero on almost every cell touching land — a sheltered bay and an exposed straight
   coastline look identical there, since it's the solve's no-slip boundary layer, not a measure of
   actual shelter (see §6 for why this matters for enclosure scoring). `AMBIENT_SMOOTHING_PASSES`
   (6, loosely matching `FeatureModule.ENCLOSURE_BFS_RADIUS`) passes of Laplacian smoothing —
   each ocean cell replaced by the mean of itself and its ocean-only neighbors, land/lake blocking
   the spread — let a cell "see" the speed a short distance offshore: still low deep inside a
   genuinely enclosed pocket (whose neighbors are also slow), picked back up within a couple of
   hops on an open coast (whose neighbors are fast). Cheap — O(passes × cells), a handful of full
   sweeps over the grid, same shape as the temperature-advection loop below — rather than a
   per-cell BFS restart mirroring `calculateEnclosure()`'s own cost.

### 2.3 Advect (water temperature) — unchanged from the previous revision

`OceanCurrentConstants.TEMP_ADVECTION_PASSES` passes that pull each ocean cell's temperature
toward whichever neighbor is most "upstream" of its resolved current direction (found via dot
product between the current vector and the direction from that neighbor to this cell), blended by
`TEMP_ADVECTION_WEIGHT × (speed / BASE_SPEED)` — faster currents mix more per pass. The baseline
each cell starts from is simply `grid.cells.temp` at that cell, which for water cells already
equals the latitude-only sea-level temperature (`calculateTemperatures()` in `src/main.ts` applies
no altitude drop below the land threshold). The net effect: warm equatorial water gets carried
poleward and cold polar water gets carried equatorward along the resolved current paths, without
simulating any actual heat-transfer physics — the same "rough calculation" standard as the rest of
the climate model.

All constants live in `OceanCurrentConstants` (`src/data/constants.ts`).

---

## 3. Pipeline integration

Ocean currents are a pure, deterministic function of already-generated data (`grid.cells.h`,
`grid.cells.f`/`grid.features`, `grid.cells.c`, `grid.points`, `options.winds`,
`worldContext.mapCoordinates`, `worldContext.graphHeight`) — never randomized, never manually
edited by the user. Every place that already recomputes `calculateTemperatures()` /
`generatePrecipitation()` together now also calls `OceanCurrents.generate()`:

| Call site | Trigger | Iteration tier |
| :--- | :--- | :--- |
| `src/main.ts`, `getGenerationStages()` stage 2 | Full map generation | `"full"` (default) |
| `src/main.ts`, `fmg:world-recalculate` handler (new `currents` detail flag) | WorldConfigurator wind-belt clicks, temperature slider changes, latitude/longitude shifts, "Update world" button — all now also pass `currents: true` (`src/controllers/world-configurator.ts`'s `updateClimateData()`) | `"live"` |
| `src/controllers/heightmapEditor.ts`, both heightmap-edit recompute paths | Heightmap Erase-mode edits | `"live"` |
| `src/generators/resample.ts`, `Resampler.process()` | "Assist Mode" / resampling from another map | `"full"` (default) |
| `src/io/load.ts`, right after `Features.markupPack()` | Loading a saved `.fmg` map | `"full"` (default) |

`OceanCurrents.generate()`'s optional 5th parameter (`"full" | "live"`, default `"full"`) selects
between `FluidSolverConstants.ITERATIONS_FULL_GENERATION`/`ITERATIONS_LIVE_RECOMPUTE` (§2.2).

### Why load.ts recomputes instead of restoring from the save file

`currentAngle`/`currentSpeed`/`waterTemp` are **not** part of the positional `.fmg` save format.
Since the field is a pure deterministic function of data that *is* already restored by the time
`Features.markupPack()` runs during load, recomputing it there is guaranteed to reproduce exactly
what generation-time computed — with zero risk of the classic positional-format hazard (adding a
new column, then needing indefinite backward-compatibility handling for old saves missing it).
This mirrors how `pack.cells` topology itself is already recomputed on load (`fmg:re-graph` +
`Features.markupPack()`) rather than serialized.

---

## 4. Rendering (`toggleOceanCurrents`, WebGL only)

A new WebGL-only layer, distinct from the pre-existing **`toggleSeaCurrents`** ("Sea Currents")
layer — that older layer is purely decorative: it replays a flowing highlight along whatever
`pack.routes` sea routes already exist (see
`docs/plan/searoute-current-direction-visualization.md`) and carries no direction/speed/temperature
data of its own. `toggleOceanCurrents` ("Ocean Currents") visualizes the actual field this
document describes, independent of trade routes.

- Two visualizations, selected by `OptionsState.oceanCurrentRenderMode` (Options → Generation →
  "Ocean current rendering," applies live, no regenerate needed):
  - **`"path"` (default)**: `buildOceanCurrentPaths()` (`src/renderers/webgl/adapters/deckDataAdapters.ts`)
    emits one short `DeckPath` line segment per open-ocean grid cell: oriented along
    `currentAngle`, length and width scaled by `currentSpeed`, colored by `waterTemp` on a
    cold-blue → warm-red scale (`OceanCurrentConstants.RENDER_TEMP_MIN/MAX` — a tighter,
    ocean-appropriate range than the general `-50..50` air-temperature scale `toggleTemperature`
    uses). Skips any cell reading exactly 0 speed (nothing to draw for a zero-length segment) — a
    calm patch is visually indistinguishable from a gap in this mode.
  - **`"intensity"`**: `buildOceanCurrentIntensityPolygons()` (same file) fills every open-ocean
    grid cell's polygon by `currentSpeed` alone (`d3.interpolateBlues`, pale = calm, dark =
    strong), with **no** speed-based skip — full, gapless coverage, so a calm region reads as a
    clearly bounded shape rather than an absence of arrows. Added specifically because the "path"
    mode's per-cell skip made it hard to visually confirm exactly where the resolved field reads
    calm vs. rough (e.g. distinguishing a genuinely damped dead-end from a rendering gap).
- Rendered via a bespoke block in `buildDeckLayers.ts` (same shape as the existing
  `toggleSeaCurrents` block) rather than through the generic `WEBGL_PATH_LAYERS` list, because that
  list's paths are styled from live SVG dash/paint extraction (`webglStyleExtractors.ts`) for
  layers with a real SVG counterpart (roads, borders, routes...); this layer's color is entirely
  data-driven and has no SVG layer to extract from — same reasoning `toggleSeaCurrents` already
  follows.
- No SVG-mode implementation. Outside `webglHybrid` render mode, `toggleOceanCurrents`
  (`src/controllers/layers.ts`) only flips the stored toggle state, same as `toggleSeaCurrents`
  already does.
- Not pickable (no tooltip yet) — a possible follow-up, not implemented here.

---

## 5. Sea-route travel speed: real per-cell data supersedes the seasonal bias

`src/utils/seasonUtils.ts` has `getCurrentDirection(month): 1 | -1`, a **single global scalar** —
one sign for the whole map, flipping by calendar month — that both fleet and merchant sea-leg travel
speed used to rely on exclusively (`docs/simulation/seasons.md` §1). Both consumers now prefer the
real per-cell field from this document when it's available, and only fall back to that coarse
seasonal sign when it isn't (a saved-map fixture predating this field, a unit test exercising the
seasonal path in isolation, or a route leg whose points carry no cell id):

- **`src/generators/regimentMovement.ts`, `getCurrentCostMultiplier()`** (called from
  `advanceAlongPath()` for fleet-type regiments): reads `worldContext.grid.cells.currentAngle`/
  `currentSpeed` at the marching edge's starting cell (via `pack.cells.g`, the standard grid-cell
  lookup `temp`/`prec` consumers already use), projects the current vector onto the edge's actual
  travel direction, and interpolates between `CURRENT_FAVORABLE_MULTIPLIER` (fully with the
  current) and `CURRENT_UNFAVORABLE_MULTIPLIER` (fully against it) by that alignment — a smooth
  360° read instead of a binary east/west sign. A fleet sailing north-south, or diagonally with/
  against a local current, is now rewarded or penalized correctly; the old code treated any
  non-east-west edge as unaffected.
- **`src/extensions/economy/generators/caravanMovement.ts`, `getSeaConditionMultiplier()`** (called
  from `caravans.ts`'s `bakeCaravanTravelLegs()`): same alignment-projection logic, sampling the
  current at the sea leg's starting route point (`TradeRoutePoint`'s optional cell-id element,
  resolved to a grid cell the same way). The existing opt-in gate is unchanged — `strength`
  (`CaravanMovementSettings.seaCurrentStrength`, default 0) still has to be nonzero for *either*
  data source to have any effect; what changed is which data source drives the swing once opted in.

Both functions keep their old seasonal-only code path intact (unreachable when real data is present
and `speed > 0`) rather than deleting it, so a saved map generated before this field existed still
gets a sensible coarse east/west effect until it's next regenerated or resaved. Nothing in this
implementation changes `getCurrentDirection()` itself — it's still the single source of truth for
that fallback and for any other consumer that wants the coarse global signal on purpose.

Not wired here: `src/generators/routes-generator.ts`'s `getWaterPathCost()`/
`getAugmentedWaterPathCost()`, which choose sea-route *geometry* (topology/pathfinding), not travel
*speed* — currents biasing which route gets charted in the first place (e.g. preferring a longer
leg that rides a strong current) is a distinct, separately-scoped follow-up.

---

## 6. Enclosure: `pack.cells.enclosure` can now be derived from resolved current speed

`src/generators/features.ts` already computed `pack.cells.enclosure` (a 0-100 "how landlocked/calm
is this water cell" score — harbor/mooring/shipbuilding suitability), consumed by
`riverNavigationGraph.ts` (sheltered-water threshold for river-mouth navigation). Its original
implementation, `calculateEnclosure()`, is a fixed 6-hop BFS blocked-neighbor-ratio heuristic on
`pack` cells, capped to a small radius, so it only sees local shoreline shape, not how far the
resolved fluid solve (§2) actually finds a cell to be sheltered or exposed.

`coastalHabitatAssignment.ts` (sandy/rocky/tidal-flat classification) deliberately does **not**
read `pack.cells.enclosure` — it reads `grid.cells.ambientCurrentSpeed` directly as a "current
exposure" signal instead. `pack.cells.enclosure` is a user-configurable display value
(`enclosureCalculationMode` below) that defaults to a mode which saturates near 100 for almost
every coastal cell; classifying coastal habitat against it made nearly all mild-slope coastline
read as "enclosed" and get swallowed into `tidalFlat` before `sandyBeach` was ever considered,
regardless of what the user has the enclosure display set to. See the doc comment atop
`coastalHabitatAssignment.ts` for the full redesign (current exposure, offshore depth-drop/fjord
detection, and longshore-drift sediment diffusion along the coast).

`Options → Generation → "Enclosure calculation"` (`useOptionsState`'s
`enclosureCalculationMode: "oceanCurrents" | "oceanCurrentsAmbient" | "radius"`, default
`"oceanCurrents"`) now lets `pack.cells.enclosure` for ocean-connected water instead read the
*resolved* current speed this document describes — `FeatureModule.applyOceanCurrentEnclosure()`:

- Both current-based modes share the same scoring formula and only differ in which `grid.cells`
  array they read `speed` from: for every `pack` water cell belonging to an `"ocean"`-type
  feature, look up `speed` via `<array>[pack.cells.g[cellId]]` (the same `pack`→`grid` lookup §5
  uses) and score `enclosure = round((1 - min(speed / BASE_SPEED, 1)) * 100)`.
  - `"oceanCurrents"` reads `grid.cells.currentSpeed` — the speed at the cell's own position. A
    cell near its unobstructed steady-state speed (open water, nothing nearby to bounce flow off
    of) reads as fully open (0). But almost every cell touching land reads near-zero speed
    regardless of whether that shore is a genuinely sheltered bay or an exposed open coastline —
    the LBM solve's no-slip boundary layer, not a difference in real shelter — so this mode
    saturates most coastal water toward 100 and gives little spread for siting decisions right at
    the shoreline (e.g. harbor placement).
  - `"oceanCurrentsAmbient"` reads `grid.cells.ambientCurrentSpeed` instead — `currentSpeed`
    smoothed across nearby ocean cells (§2.2 step 5), so a coastal cell reflects the speed a short
    distance offshore rather than the boundary-layer value at the shore itself. This is what
    actually distinguishes a genuinely enclosed bay (still slow a few hops out — its neighbors are
    also slow) from an exposed coastline (picks up real open-water speed within a couple of hops)
    — the mode intended for shoreline siting decisions. Both modes are a closer physical match for
    "how calm/sheltered is this water for mooring/shipbuilding" than the legacy heuristic; this
    one additionally avoids the boundary-layer saturation problem above.
- Lake cells are overridden to a flat, fully enclosed 100 under either current-based mode — not
  derived from current data (`OceanCurrentsModule` never models lake current at all;
  `classifyOceanCells()` excludes lakes, so both `currentSpeed` and `ambientCurrentSpeed` are
  always 0 there), but not left on `calculateEnclosure()`'s shore-distance BFS-ratio score either.
  That radius heuristic has a real blind spot for lakes: "no land found within
  `ENCLOSURE_BFS_RADIUS` (6) hops" is a reasonable "this is genuinely open ocean" signal for ocean
  cells (the open sea really does keep extending past any fixed radius), but a lake has no such
  legitimate open-water endpoint at all — it's fully surrounded by land by definition. A lake's
  interior more than 6 hops from its own shore used to read as if it were open ocean (enclosure
  near 0), which only gets *worse* the bigger the lake is — the opposite of "landlocked,
  current-free water is uniformly calm." Since there's no current physics for a lake cell's
  distance from shore to be a proxy for in the first place, a flat 100 for every lake cell (not
  just ones beyond the BFS radius) is the physically-motivated score under either current-based
  mode. `calculateEnclosure()`'s own shore-distance BFS-ratio score is deliberately left
  completely unmodified for lakes under `"radius"` mode, including this blind spot — that mode's
  entire purpose is to stay the exact legacy heuristic, a genuine point of comparison against both
  current-based modes' improvement, not to be silently patched for all three modes at once.
- No-ops under `"radius"` mode, or if the relevant array (`currentSpeed`/`ambientCurrentSpeed`)
  hasn't been populated yet.

`Features.recalculateEnclosure()` reruns `calculateEnclosure()` from scratch and then re-applies
the overlay, so switching the mode live (via the `react-change-enclosure-calculation` event,
`src/controllers/options.ts`) restores the legacy values cleanly instead of leaving a stale
current-derived result in place after switching back to `"radius"`.

**Pipeline order matters here**: `Features.markupPack()` (which sets the `calculateEnclosure()`
baseline) runs in generation stage 1, before `OceanCurrents.generate()` (stage 2) has any current
data to read. `main.ts` therefore calls `Features.applyOceanCurrentEnclosure()` immediately after
`OceanCurrents.generate()` in stage 2 — before `Rivers.generate()`, `Biomes.define()`, and
`Features.defineGroups()`, all of which are downstream `pack.cells.enclosure` consumers. The same
call is repeated in the `fmg:world-recalculate` event handler when `currents` is recalculated.

`pack.cells.enclosure` is not the only consumer of this document's data — §5 covers sea-route
travel speed (fleet regiments and merchant caravans), which reads `grid.cells.currentAngle`/
`currentSpeed` directly and is unaffected by which enclosure mode is selected.

---

## 7. Testing

`src/generators/oceanCurrents.test.ts` builds small hand-authored `grid` fixtures (following the
`frontierFortsGenerator.test.ts` pattern of mutating the shared `worldContext` singleton directly)
and checks:

Fixtures now build genuine `cellsX * cellsY` raster grids (row-major, matching production
`grid.cells` layout — §2.1), not the arbitrary point/neighbor-list graphs earlier revisions used,
since the LBM solver needs a real raster to operate on. Checks:

1. Land and lake cells get zero current and `waterTemp` mirroring `temp`.
2. An unobstructed field gives every ocean cell a positive speed close to the seeded wind
   direction.
3. Cells directly adjacent to a coastline end up with lower speed than cells deep in open water,
   several cells from any land in every direction — a no-slip boundary-layer effect at the solid
   wall, a genuine consequence of the bounce-back boundary condition rather than a hand-tuned
   damping heuristic.
4. Temperature advects toward the upstream cell along the resolved current direction.
5. **Sustains along-shore (tangential) flow across the length of a coastline**: with a straight
   18-cell coastal segment and wind blowing mostly into it, the along-shore velocity component
   sampled at several points spread across the segment's length stays within a bounded fraction of
   the strongest sampled point — it does not collapse toward zero a few cells from where the
   deflection originates, unlike the previous heuristic's `PIN_DISTANCE`-limited falloff. This is
   the test that directly encodes the "current turns and keeps flowing along the coast, not just
   near the point of impact" requirement (§0, §2.1).
6. Identical inputs produce identical output (no hidden randomness).

An "ambientCurrentSpeed (harbor-siting enclosure signal)" describe block covers §2.2 step 5: land
and lake cells stay at zero, same as `currentSpeed`; a coastal cell's `ambientCurrentSpeed` reads
higher than its raw `currentSpeed` and closer to nearby open-water speed (the boundary-layer
bypass working); and, using a dead-end 1-cell-wide inlet fixture (land confined to a corner block
so most of the map stays genuinely open — a fully enclosing land band around the whole domain
would itself read as one large sheltered basin under periodic boundaries and defeat the test),
`ambientCurrentSpeed` is higher at the inlet's mouth (one hop from open water) than at its dead end
several hops deeper in — the core "distinguishes a genuinely enclosed pocket from an exposed
coastline" property §6 relies on.

`src/generators/fluidSolver.test.ts` tests the generic solver in isolation, independent of any
ocean/map concept: a uniformly-forced open lattice converges to a steady velocity matching the
`force / drag` prediction (and, in a companion test, keeps accelerating instead of settling when
`drag` is omitted, demonstrating why the drag term is needed at all — §2.1); steady velocity scales
up with a larger driving force; an obstacle node never receives a velocity (skipped by collision
entirely); a wall with a single gap redirects upstream flow laterally toward the gap instead of
just damping it head-on (the same "blocked flow goes tangential" mechanism §2.1 relies on, tested
at the solver level); identical inputs are deterministic; and `run(lattice, 1, tau)` matches a
single `step()` call exactly.

`src/generators/features.test.ts` covers §6's `applyOceanCurrentEnclosure()`/
`recalculateEnclosure()` against a small hand-built `pack`+`grid` fixture: for `"oceanCurrents"`
mode, open/fast current reads as low enclosure, calm current reads as high enclosure, lake cells
are always overridden to 100 regardless of current data or the radius baseline, land cells stay at
0, the method no-ops under `"radius"` mode or missing `currentSpeed`, and `recalculateEnclosure()`
restores the plain radius baseline when switching back from `"oceanCurrents"`. A parallel
`"oceanCurrentsAmbient"` mode block confirms the same shape of coverage but sourced from
`ambientCurrentSpeed` instead — including a test that sets `currentSpeed` and `ambientCurrentSpeed`
to opposite extremes to prove the mode actually switches which array it reads, not just that it
produces *a* plausible-looking score — and a dedicated no-op test for `ambientCurrentSpeed` missing
while `currentSpeed` is populated (the two arrays' presence is checked independently). A separate
"lake enclosure by mode" block uses
a longer chain fixture (a lake cell farther from its own shore than `ENCLOSURE_BFS_RADIUS`) to
verify the two modes genuinely diverge: `"radius"` mode still reads that deep-interior cell as if
it were open water (the unmodified legacy heuristic, kept as a real point of comparison), while
`"oceanCurrents"` mode reads it — and every other lake cell, including ones right next to the
shore — as fully enclosed.

`src/generators/regimentMovement.test.ts`'s "advanceAlongPath seasonal ocean currents" describe
block additionally checks that a strong real per-cell current overrides the seasonal fallback (an
eastbound fleet still speeds up in a west-favoring month when the local current is strong and
eastward) and that traveling against a strong local current covers less distance than traveling
with it, for the same time budget.

`src/extensions/economy/generators/caravanMovement.test.ts` checks `getSeaConditionMultiplier()`
directly: the opt-in `strength` gate still works with real data present, a fully-following current
gives the maximum favorable swing, a fully-opposing current gives the maximum unfavorable swing, a
purely perpendicular current has no effect, real data overrides a disagreeing seasonal month, and
the function falls back to the seasonal bias both when no sample is given and when the sample is
calm (`speed: 0`).

### Performance

`fluidSolver.step()` originally allocated 9 fresh `Float32Array`s per iteration for streaming — at
production grid sizes this GC pressure dominated the runtime. It now double-buffers into a
persistent scratch buffer (keyed by lattice identity, swapped by reference each iteration) instead,
and the collision loop's equilibrium/forcing math uses precomputed reciprocals instead of per-cell
divisions. Measured on a synthetic 180×140 (25,200-cell) lattice with a landmass obstacle — the
same order of magnitude as `grid.cells` at the default "10K cells" setting:

| Iterations | Elapsed |
| :--- | :--- |
| 400 (`ITERATIONS_LIVE_RECOMPUTE`) | ~0.7s |
| 1500 (`ITERATIONS_FULL_GENERATION`) | ~2.0s |

This runs once per `OceanCurrents.generate()` call (§3's call-site table), not per frame. The
"full" tier's ~2s is a real addition to full map generation time and should be re-measured against
`docs/analytics/webgl-layer-benchmark-latest.json`-style profiling on the actual generation
pipeline (not just this synthetic lattice) if generation time becomes a concern at the largest grid
setting (~32,500 cells); `ITERATIONS_FULL_GENERATION`/`ITERATIONS_LIVE_RECOMPUTE` and the lattice
resolution are the levers to reduce it further.
