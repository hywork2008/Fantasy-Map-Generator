# Ocean Currents: per-cell direction, speed, and water temperature

Adds a rough, stylized ocean current field to the map: every open-ocean `grid` cell carries a
current direction, a current speed, and a surface water temperature, computed from the existing
wind belts and sea-level temperature settings, deflected around landmasses, and damped/funneled by
how enclosed each cell's local coastline is. This document covers what was implemented, why it is
built the way it is, and what it deliberately leaves out.

Requested in `docs/plan/ocean-current-system-investigation.md` §4 ("future implications for a
gameplay ocean-current feature") — this is that feature. It shipped in two revisions:

1. Wind-seeded, land-clipped, no shape-awareness beyond immediate land neighbors.
2. Genuinely shape-responsive (§2 below): headland bends, bay/strait damping and funneling, and —
   critically — bending that reaches far enough into a real strait/bay to actually be visible on a
   generated map, not just in a hand-authored unit test a few cells wide. On a real map, revision 1
   read as "wind bands with a thin coastal fringe": its land-reflection step only ever touched a
   handful of cells nearest the coast, so anything more than ~6 cells offshore was pure,
   undeflected wind — indistinguishable from having no land-awareness at all at map scale. §2.3
   explains the fix (a much larger, wind-anchored influence zone) and why it was needed.

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
- **A rough approximation, not a physical simulation.** Real ocean circulation involves Ekman
  transport, Coriolis-driven gyres, and thermohaline circulation. This implementation models only
  a first-order, stylized version: currents start out following the user's existing wind belts
  (`options.winds`, the same 6 latitude-tier prevailing winds `generatePrecipitation()` already
  uses and the WorldConfigurator globe widget already exposes), then get deflected, damped, and
  funneled by local coastline shape (§2). It is not a CFD solve — there is no mass-conservation
  pressure projection and no explicit acceleration through narrow channels — but it does now react
  to *this map's* coastline, not only to latitude and wind, which is what makes it meaningful input
  for sea-route speed and enclosure/shelter purposes rather than a purely decorative overlay.

---

## 1. Data (`src/types/Grid.ts`, `GridCells`)

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `currentAngle` | `Uint16Array` | Current direction in degrees, `0-359` (standard math convention: `0` = +X axis, increasing clockwise in screen space). `0` for land and lake cells. |
| `currentSpeed` | `Uint8Array` | Current speed, normalized `0-255`. `0` for land and lake cells. |
| `waterTemp` | `Int8Array` | Surface water temperature in °C. For ocean cells: the latitude-baseline sea temperature (`temp`) advected along the resolved current field. For land and lake cells: mirrors `temp` unchanged, so any consumer that wants "surface temperature everywhere" doesn't need to branch on cell type. |

All three are required (non-optional) fields, following the same convention `temp`/`prec` already
use: `generateGrid()` (`src/utils/graphUtils.ts`) creates the grid without them, and a cast bridges
the gap until `OceanCurrents.generate()` runs later in the same pipeline stage.

Only cells belonging to a `grid.features[...].type === "ocean"` feature get a nonzero current —
lakes are excluded (they don't carry a current, matching how the existing decorative "Sea
Currents" WebGL layer already excludes lake crossings), and so is land.

---

## 2. Algorithm (`src/generators/oceanCurrents.ts`, `OceanCurrents.generate()`)

Four passes over the ocean cells of `state.grid`, all pure/deterministic (no RNG):

### 2.1 Seed

Every ocean cell's initial vector is its latitude's prevailing wind (`options.winds[tier]`,
tiered the same way `generatePrecipitation()` computes `windTier`), at a fixed base speed
(`OceanCurrentConstants.BASE_SPEED`). This is the Ekman-transport-style approximation: surface
currents start out following the wind that blows over them.

### 2.2 Exposure (`computeOpenness()`)

Before relaxing the vector field, every ocean cell gets an **openness** score in `0..1`: 1 = open
ocean, 0 = a fully enclosed dead end. This uses the exact same BFS blocked-neighbor-ratio technique
as `FeatureModule.calculateEnclosure()` (`src/generators/features.ts`, which produces
`pack.cells.enclosure`), run here on `grid.cells` instead of `pack.cells` so it can drive the
relaxation and damping steps below: for every ocean cell, flood-fill outward through ocean-only
neighbors up to `OceanCurrentConstants.EXPOSURE_BFS_RADIUS` hops, and track what fraction of
neighbor lookups hit land. A narrow bay or strait runs out of open water to expand into quickly, so
most lookups hit land and openness stays low; open ocean keeps discovering new water cells, so it
stays close to 1.

This is deliberately the same family of computation as `pack.cells.enclosure`, not a reuse of that
exact array — `pack.cells.enclosure` is computed later in the pipeline (`Features.markupPack()`,
after `reGraph()`), while ocean currents run on `grid` earlier and need their own grid-resolution
copy. The two numbers should agree qualitatively (both score the same physical shelteredness) but
are not required to match exactly cell-for-cell, since `grid` and `pack` sample the coastline at
different resolutions.

### 2.3 Relax (land deflection, exit-funneling, and smoothing)

`OceanCurrentConstants.SMOOTHING_PASSES` Jacobi relaxation passes, split by
`OceanCurrentConstants.PIN_DISTANCE` (hop distance to the nearest land/lake cell, from a single
O(n) multi-source BFS, `computeLandDistance()`) into two regions:

- **Pinned far field** (`landDistance >= PIN_DISTANCE`): every pass, the cell is hard-reset to its
  seeded wind vector — a "free stream" boundary condition, the same role the far-field value plays
  in a real potential-flow solve. Without this, a large open ocean has nothing stable to relax
  toward: a Jacobi scheme with no anchor just averages itself toward whatever its boundary
  conditions are, and if every cell is free to drift, deflection from one coastline can eventually
  bleed all the way across an ocean to an unrelated coast on the far side, or the whole field can
  decay toward a directionless remainder in a fully enclosed sea (see the corridor→bay funneling
  scenario in §2.3's funneling paragraph below, which needs a pinned reference at the open end to
  have something real to funnel from).
- **Near-shore influence zone** (`landDistance < PIN_DISTANCE`): the cell actually relaxes, blending:
  - its own current vector (`SELF_WEIGHT` — deliberately small; see below),
  - its ocean neighbors' vectors (plain average, one part each), and
  - a **mirror reflection** off every *land* neighbor its vector currently points into
    (`DEFLECT_WEIGHT` — `v - 2·DEFLECT_WEIGHT·(v·n)·n`, where `n` is the unit direction toward that
    land neighbor's cell center, applied only when `v·n > 0`). When a cell has several land
    neighbors reflecting at once, their reflected vectors are *averaged*, not summed, before being
    folded into the blend — mirror reflection preserves a vector's magnitude exactly, so averaging
    keeps every term in the blend at the same scale as the field already has; summing multiple
    simultaneous reflections would repeatedly re-inject that magnitude and let the field diverge
    over many passes (this was a real bug during development: cells boxed in by several land
    neighbors blew up to the 0-255 clamp ceiling before the fix).

Reflection, not a plain clip (`v - (v·n)n`), is the key difference from the first version of this
algorithm: a clip only *removes* the land-directed component, so a current can never develop a new
perpendicular component from nothing — a uniform wind hitting a coastline dead-on just loses speed
in place. A full mirror bounce *injects* a perpendicular component (the same way a ball bouncing off
an angled wall turns), so wind striking an off-axis headland now visibly curves along the exposed
side instead of only stalling (unit test `"bends around a land corner..."`, §7 below). A current
still cannot spontaneously turn around a *symmetric* dead-on obstacle (e.g. wind blowing straight
into a coastline with mirror-symmetric land on both sides) — that has no real-world analogue either;
a ball bounced straight into a flat wall bounces straight back, it doesn't pick a side.

**Why `SELF_WEIGHT` had to come down from the first version's 1.5 to 0.5, and `SMOOTHING_PASSES`
had to go up from 6 to 60.** A large self-weight anchors every cell close to its own seeded wind
value pass after pass, so reflection/funneling could only ever nudge it a little before its own
inertia pulled it back — bending never had room to accumulate across several cells, which is exactly
why the first version read as pure wind bands beyond the immediate coastline on a real generated
map (see the "two revisions" note at the top of this document). A smaller self-weight lets the
neighbor average actually dominate, so a headland's bend can propagate outward pass by pass (unit
test `"propagates a headland's bend well beyond a single cell..."`, §7 below, shows this reaching
~10 hops and fading back out by ~20). That propagation needs enough passes to physically reach that
far — plain neighbor-averaging spreads roughly one cell of real influence per pass — hence
`SMOOTHING_PASSES` scaling with `PIN_DISTANCE`.

After reflection, an **exit-funneling** step handles cells whose openness is below
`FUNNEL_OPENNESS_THRESHOLD`: their vector is blended, at a weight scaled by `FUNNEL_STRENGTH × (1 -
openness)`, toward the direction of whichever ocean neighbor has the highest openness — i.e. toward
the bay or strait's actual way out. The blend target's *magnitude* comes from the cell's own
incoming vector for this pass (`Math.hypot(vx[i], vy[i])`), not from the post-reflection result:
several land-neighbor reflections in a tight pocket can cancel each other into a near-zero
remainder, and blending toward a near-zero target just stays near zero regardless of blend weight —
using the incoming magnitude instead gives funneling something real to redirect. This is what makes
a generated bay's current visibly aim toward its mouth rather than sit at a stalled, undefined
angle or (worse) round down to a `Uint8Array` speed of exactly 0 (both were real symptoms hit during
development before this fix).

### 2.4 Damp (exposure-based speed floor)

After relaxation, every ocean cell's speed is scaled by `lerp(EXPOSURE_MIN_SPEED_FACTOR, 1,
openness)` — open ocean (openness 1) is unaffected, a fully enclosed cell (openness 0) is damped to
`EXPOSURE_MIN_SPEED_FACTOR` of its relaxed speed. Direction is left untouched; only magnitude
shrinks, so a dead-end bay reads as calm water rather than a discontinuity in the field. This is the
step that makes `currentSpeed` a legitimate, standalone "how sheltered is this water" signal (§0),
and is applied before advection (§2.5) so sluggish enclosed cells also mix heat more slowly,
consistent with their reduced flow.

### 2.5 Advect (water temperature)

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

| Call site | Trigger |
| :--- | :--- |
| `src/main.ts`, `getGenerationStages()` stage 2 | Full map generation |
| `src/main.ts`, `fmg:world-recalculate` handler (new `currents` detail flag) | WorldConfigurator wind-belt clicks, temperature slider changes, latitude/longitude shifts, "Update world" button — all now also pass `currents: true` (`src/controllers/world-configurator.ts`'s `updateClimateData()`) |
| `src/controllers/heightmapEditor.ts`, both heightmap-edit recompute paths | Heightmap Erase-mode edits |
| `src/generators/resample.ts`, `Resampler.process()` | "Assist Mode" / resampling from another map |
| `src/io/load.ts`, right after `Features.markupPack()` | Loading a saved `.fmg` map |

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

- `buildOceanCurrentPaths()` (`src/renderers/webgl/adapters/deckDataAdapters.ts`) emits one short
  `DeckPath` line segment per open-ocean grid cell: oriented along `currentAngle`, length and width
  scaled by `currentSpeed`, colored by `waterTemp` on a cold-blue → warm-red scale
  (`OceanCurrentConstants.RENDER_TEMP_MIN/MAX` — a tighter, ocean-appropriate range than the
  general `-50..50` air-temperature scale `toggleTemperature` uses, so ocean-to-ocean differences
  stay visible).
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
`coastalHabitatAssignment.ts` (settlement suitability) and `riverNavigationGraph.ts`
(sheltered-water threshold for river-mouth navigation). Its original implementation,
`calculateEnclosure()`, is a fixed 6-hop BFS blocked-neighbor-ratio heuristic on `pack` cells —
the same technique as §2.2's `computeOpenness()`, but on the sparser, irregular `pack` graph and
capped to a small radius, so it only sees local shoreline shape, not how far a current actually
carries into a bay or strait.

`Options → Generation → "Enclosure calculation"` (`useOptionsState`'s
`enclosureCalculationMode: "oceanCurrents" | "radius"`, default `"oceanCurrents"`) now lets
`pack.cells.enclosure` for ocean-connected water instead read the *resolved* current speed this
document describes — `FeatureModule.applyOceanCurrentEnclosure()`:

- For every `pack` water cell belonging to an `"ocean"`-type feature, look up its current speed via
  `grid.cells.currentSpeed[pack.cells.g[cellId]]` (the same `pack`→`grid` lookup §5 uses) and score
  `enclosure = round((1 - min(speed / BASE_SPEED, 1)) * 100)`: a cell pinned to the undamped seeded
  wind (§2.3's far-field boundary, `landDistance >= PIN_DISTANCE`) reads as fully open (0); a cell
  damped to near-zero by low openness/heavy reflection cancellation (§2.3-2.4) reads as fully
  enclosed (100). Because current speed already reflects headland deflection and exit-funneling
  propagated across many relaxation passes (§2.3), this reaches far deeper into a real map's wide
  straits and bays than the 6-hop radius heuristic ever could.
- Lake cells are left on `calculateEnclosure()`'s score unconditionally — `OceanCurrentsModule`
  does not model lakes (`classifyOceanCells()` excludes them; `currentSpeed` is always 0 there), so
  there is no current-derived signal to prefer, and a lake's interior really is uniformly calm
  regardless of shape.
- No-ops if `grid.cells.currentSpeed` hasn't been populated yet or the user selected `"radius"`.

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

1. Land and lake cells get zero current and `waterTemp` mirroring `temp`.
2. An unobstructed field gives every ocean cell a positive speed close to the seeded wind
   direction.
3. Cells directly blocked by land end up with lower speed than cells several ring-hops from any
   coast.
4. A current striking an off-axis land corner measurably bends away from the raw seeded wind angle
   (§2.3's reflection), not just loses speed in place.
5. That same bend propagates well past the corner's immediate neighbor — measurable ~10 hops away,
   faded back out by ~20 — demonstrating the pinned-far-field/influence-zone split (§2.3) actually
   lets bending accumulate over distance instead of stopping after a handful of cells.
6. A cell enclosed by land on most sides, reachable only through a narrow multi-cell fjord, ends up
   with speed well below (`< 50%` of) a cell at the far end of a run of open water long enough to
   include genuinely pinned (`landDistance >= PIN_DISTANCE`) cells (§2.2's exposure feeding §2.4's
   damping, driven by a real free-stream reference rather than a fixture too small to have one).
7. Temperature advects toward the upstream cell along the resolved current direction.
8. Identical inputs produce identical output (no hidden randomness).

`src/generators/features.test.ts` covers §6's `applyOceanCurrentEnclosure()`/
`recalculateEnclosure()` against a small hand-built `pack`+`grid` fixture: open/fast current reads
as low enclosure, calm current reads as high enclosure, lake cells stay on the radius score even
when their mapped grid cell has current data, land cells stay at 0, both methods no-op under
`"radius"` mode or missing `currentSpeed`, and `recalculateEnclosure()` restores the plain radius
baseline when switching back from `"oceanCurrents"`.

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

Verified end-to-end in a live browser session (`webglHybrid` mode) after the revision-2 fix: on a
generated map with 7,089 open-ocean grid cells, `OceanCurrents.generate()` took ~57ms (`TIME`
console profiling) — negligible next to `generateEconomy`'s multi-second cost in the same pipeline
run — and resolved speeds averaging 80.5 (down from an unfixed-revision-1-era 132.5 on a comparable
map, i.e. genuinely more of the field is now damped by nearby coastline rather than sitting near
`BASE_SPEED`), ranging 0-158, with roughly half of all open-ocean cells reading below 80 — a much
larger damped fraction than revision 1's ~12%, consistent with bending/damping now reaching well
past the immediate coastline instead of stopping after ~6 cells. The "Ocean Currents" layer toggled
on/off from both `window.fmg.actions.toggleLayer()` and the real Layers-panel button with zero new
console errors (the session's only console errors were pre-existing, unrelated economy-extension
market-shortage logs).
