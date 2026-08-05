# Ocean Currents: per-cell direction, speed, and water temperature

Adds a rough, stylized ocean current field to the map: every open-ocean `grid` cell carries a
current direction, a current speed, and a surface water temperature, computed from the existing
wind belts and sea-level temperature settings and deflected around landmasses. This document
covers what was implemented, why it is built the way it is, and what it deliberately leaves out.

Requested in `docs/plan/ocean-current-system-investigation.md` §4 ("future implications for a
gameplay ocean-current feature") — this is that feature.

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
  the first-order, stylized version: currents start out following the user's existing wind belts
  (`options.winds`, the same 6 latitude-tier prevailing winds `generatePrecipitation()` already
  uses and the WorldConfigurator globe widget already exposes), then get deflected around land and
  smoothed. This is deliberately the same level of abstraction the existing wind/precipitation
  model already uses — it is not meant to be more "realistic" than its neighbors.

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

Three passes over the ocean cells of `state.grid`, all pure/deterministic (no RNG):

### 2.1 Seed

Every ocean cell's initial vector is its latitude's prevailing wind (`options.winds[tier]`,
tiered the same way `generatePrecipitation()` computes `windTier`), at a fixed base speed
(`OceanCurrentConstants.BASE_SPEED`). This is the Ekman-transport-style approximation: surface
currents start out following the wind that blows over them.

### 2.2 Relax (land deflection + smoothing)

`OceanCurrentConstants.SMOOTHING_PASSES` Jacobi relaxation passes. Each pass, every ocean cell's
vector becomes a weighted blend of:

- its own current vector (`SELF_WEIGHT`),
- its ocean neighbors' vectors (plain average, one part each), and
- itself again, minus whatever component of its vector points into any *land* neighbor
  (`DEFLECT_WEIGHT` — the cancelled component is computed via the dot product between the vector
  and the direction toward that land neighbor's cell center).

This is a "no flow through solid boundaries, blend with open neighbors otherwise" boundary
condition — a simplified potential-flow-style approximation. Repeating it for several passes lets
the deflection propagate a few cells inland from the coast, instead of stopping dead at the first
blocked cell.

**What this can and can't produce.** Because the reflection step only *removes* a vector's
land-directed component — it never *invents* a new perpendicular component from nothing — a
current cannot spontaneously start turning around a headland in a region where the wind field is
perfectly uniform and already has zero component in every direction but the blocked one (see the
unit test `"damps current speed for cells directly blocked by land..."` for the property this
guarantees instead: coastal cells lose speed relative to open-ocean cells, rather than developing
a clean 90° bend). Real bends and gyre-like structures emerge where they matter — at the scale of
a full map — because the wind belts themselves already differ by latitude tier (trade winds vs.
westerlies), which seeds real rotational shear into the field before land deflection ever touches
it. A synthetic, single-tier test grid has no such shear, so it can't demonstrate that behavior;
a generated map, with its multiple wind tiers, does.

### 2.3 Advect (water temperature)

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

## 5. Relationship to the existing seasonal current bias

`src/utils/seasonUtils.ts` already has `getCurrentDirection(month): 1 | -1`, consumed by
`src/extensions/economy/generators/caravanMovement.ts` and `src/generators/regimentMovement.ts` to
apply a coarse seasonal east/west travel-speed bonus/penalty on sea legs (see
`docs/simulation/seasons.md` §1). That function is a **single global scalar** — one sign for the
whole map, flipping by calendar month — completely independent of the per-cell field this document
describes. Nothing in this implementation changes `getCurrentDirection()` or its two consumers.

Wiring actual per-cell current data into travel-cost calculations (so a ship moving with vs.
against the local current at its specific location, rather than a single map-wide east/west
season-based sign, is rewarded or penalized) is a natural next step but is **not implemented
here** — it would touch `routes-generator.ts`'s `getWaterPathCost()`, `caravanMovement.ts`, and
`regimentMovement.ts`, each with its own tests, and was out of scope for adding the data itself.

---

## 6. Testing

`src/generators/oceanCurrents.test.ts` builds small hand-authored `grid` fixtures (following the
`frontierFortsGenerator.test.ts` pattern of mutating the shared `worldContext` singleton directly)
and checks:

1. Land and lake cells get zero current and `waterTemp` mirroring `temp`.
2. An unobstructed field gives every ocean cell a positive speed close to the seeded wind
   direction.
3. Cells directly blocked by land end up with lower speed than cells several ring-hops from any
   coast (the property §2.2 explains this algorithm can actually guarantee).
4. Temperature advects toward the upstream cell along the resolved current direction.
5. Identical inputs produce identical output (no hidden randomness).

Verified end-to-end in a live browser session (`webglHybrid` mode): a generated map populated
`currentAngle`/`currentSpeed`/`waterTemp` for every open-ocean grid cell (speeds averaging below
`BASE_SPEED`, confirming deflection/damping is doing something; water temperatures spanning a
plausible range from a generated map's poles to its equator), and the "Ocean Currents" layer
toggled on/off from both `window.fmg.actions.toggleLayer()` and the real Layers-panel button with
zero console errors.
