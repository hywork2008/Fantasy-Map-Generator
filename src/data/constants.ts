/**
 * @file constants.ts
 * @description Named constants to replace magic numbers scattered across modules and renderers.
 *
 * Organization:
 *   - HeightThreshold  : terrain height boundaries (water/land/highland/mountain)
 *   - TemperatureThreshold : climate temperature thresholds
 *   - OceanCurrentConstants : ocean current generation parameters
 *   - FluidSolverConstants : generic D2Q9 Lattice Boltzmann solver tuning parameters
 *   - RiverConstants   : river generation parameters
 *   - BiomeConstants   : biome classification thresholds
 *   - FeatureSizeRatio : ocean/sea/continent/island minimum size ratios
 *   - HeightmapConstants : heightmap algorithm parameters
 *   - VolcanoConstants : volcano tagging (heightmap generation ↔ biome assignment)
 *   - TemperatureRenderer : draw-temperature renderer constants
 */

// ---------------------------------------------------------------------------
// Terrain height thresholds
// ---------------------------------------------------------------------------

/** Terrain height boundaries used throughout the generator and renderers. */
export const HeightThreshold = {
  /** Height value at and above which a cell is considered land (< 20 = water). */
  WATER_MAX_HEIGHT: 20,

  /** Minimum possible height value (inclusive). */
  HEIGHT_MIN: 0,

  /** Maximum possible height value (inclusive). */
  HEIGHT_MAX: 100,

  /** Upper bound for hill height before retry in addHill / addPit loops. */
  HILL_MAX_HEIGHT: 90,

  /** Minimum height for the river downcut (erosion) check; lowlands are skipped. */
  SHALLOW_WATER_MIN: 35,

  /** Minimum height for Highland culture bonus (no penalty). */
  HIGHLAND_MIN: 62,

  /** Minimum height for mountain crossing penalty. */
  MOUNTAIN_MIN: 67,

  /** Minimum height for hill crossing penalty. */
  HILL_MIN: 44,

  /** Minimum height for a lake to be considered "lava" type. */
  LAVA_LAKE_HEIGHT: 60
} as const;

// ---------------------------------------------------------------------------
// Temperature thresholds
// ---------------------------------------------------------------------------

/** Climate-related temperature cutoff values (°C). */
export const TemperatureThreshold = {
  /** Water temperature at or below which icebergs can form. */
  ICEBERG_MAX_TEMP: 0,

  /** Land temperature at or below which glaciers form. */
  GLACIER_MAX_TEMP: -8,

  /** Lake temperature below which the lake is classified as "frozen". */
  FROZEN_LAKE_TEMP: -3,

  /** Temperature below which cells are classified as permafrost (glacier biome). */
  PERMAFROST_TEMP: -5,

  /** Temperature at or above which hot desert biome is possible. */
  HOT_DESERT_TEMP: 25,

  /** Temperature at or below which wetland biome is impossible (too cold). */
  WETLAND_COLD_LIMIT: -2
} as const;

// ---------------------------------------------------------------------------
// Ocean current generation constants
// ---------------------------------------------------------------------------

/**
 * Parameters for `OceanCurrents.generate()` (`src/generators/oceanCurrents.ts`): a real D2Q9
 * Lattice Boltzmann fluid solve (`src/generators/fluidSolver.ts`), driven by the latitude-tier
 * prevailing winds (`options.winds`) as a standing body force and land/lake cells as bounce-back
 * obstacles, plus latitude-baseline water temperature advected along the resolved current field.
 * See `docs/simulation/ocean-currents.md`.
 */
export const OceanCurrentConstants = {
  /** Reference current speed (0-255 scale): the output value a lattice velocity of `LATTICE_SPEED_REFERENCE` maps to. */
  BASE_SPEED: 160,

  /**
   * Body-force magnitude (lattice units) applied every LBM iteration, representing wind stress on
   * the ocean surface. Kept small relative to the lattice speed of sound (1/√3 ≈ 0.577) so the
   * resolved flow stays in the low-Mach, near-incompressible regime the equilibrium distribution
   * assumes — too large a force here introduces compressibility artifacts and can destabilize the
   * BGK collision. Paired with `DRAG_COEFFICIENT` below so the steady-state speed
   * (`WIND_FORCE_MAGNITUDE / DRAG_COEFFICIENT`) stays a comfortable, empirically-verified-stable
   * 0.1 lattice units.
   */
  WIND_FORCE_MAGNITUDE: 0.0003,

  /**
   * Linear drag coefficient (see `fluidSolver.ts`'s module doc comment) representing bottom/
   * interfacial friction. Without it, a spatially uniform wind over open, unobstructed water has
   * no velocity gradient for BGK viscosity to dissipate and would accelerate without bound instead
   * of reaching a steady speed. At steady state an unobstructed cell settles at
   * `WIND_FORCE_MAGNITUDE / DRAG_COEFFICIENT` (lattice units) — see `LATTICE_SPEED_REFERENCE`.
   * Also the main lever on how far a coastline's deflection propagates along-shore before drag
   * damps it out: lower drag lets a boundary current persist further from its point of origin
   * (a corner/headland) at the cost of needing more iterations to reach steady state — empirically
   * tuned (see `docs/simulation/ocean-currents.md`) so a deflection is still clearly present, not
   * just noise, tens of cells from where it originated, rather than fading out within a handful of
   * cells the way the previous heuristic's `PIN_DISTANCE` mechanism effectively did.
   */
  DRAG_COEFFICIENT: 0.003,

  /**
   * Lattice velocity magnitude (lattice units) that maps to `BASE_SPEED` on the app's 0-255 output
   * scale — the conversion factor between the solver's internal units and `currentSpeed`. Set to
   * `WIND_FORCE_MAGNITUDE / DRAG_COEFFICIENT`, the theoretical steady-state speed of an
   * unobstructed, uniformly-forced open-water cell, so open ocean with nothing to deflect off
   * reads close to `BASE_SPEED` rather than saturating or bottoming out the 0-255 range.
   */
  LATTICE_SPEED_REFERENCE: 0.1,

  /** Passes used to advect latitude-baseline sea temperature along the resolved current field. */
  TEMP_ADVECTION_PASSES: 4,

  /** Blend weight toward the upstream cell's temperature at full current speed, per pass. */
  TEMP_ADVECTION_WEIGHT: 0.35,

  /** Water-temperature color scale bounds (°C) used by the WebGL current vector renderer. */
  RENDER_TEMP_MIN: -2,
  RENDER_TEMP_MAX: 30,

  /**
   * Passes used to derive `grid.cells.ambientCurrentSpeed` from `currentSpeed` by repeated
   * neighbor-averaging (through ocean cells only, land/lake blocks the spread — see
   * `OceanCurrentsModule.computeAmbientCurrentSpeed()`). `currentSpeed` itself reads near-zero
   * on almost every cell touching land, regardless of whether that shore is a sheltered bay or
   * an exposed open coastline — a structural no-slip boundary-layer effect of the LBM solve, not
   * a meaningful difference in shelter. Averaging each cell toward its ocean-neighbor mean, a
   * few passes deep, lets a cell "see" how fast the water gets a short distance offshore: still
   * slow in a genuinely enclosed bay, picking up real open-water speed within a couple of hops on
   * an exposed coast. Chosen to loosely match `FeatureModule.ENCLOSURE_BFS_RADIUS` (6) — the
   * legacy heuristic's hop reach — while staying a cheap O(passes × cells) sweep over the whole
   * grid rather than a per-cell BFS restart (see `docs/simulation/ocean-currents.md`).
   */
  AMBIENT_SMOOTHING_PASSES: 6
} as const;

/**
 * Tuning parameters for the generic D2Q9 Lattice Boltzmann solver (`src/generators/fluidSolver.ts`).
 * Not specific to ocean currents — any future caller of the solver (e.g. a heightmap-driven wind
 * field, if ever picked back up) shares these.
 */
export const FluidSolverConstants = {
  /**
   * BGK single relaxation time (tau). Must stay strictly above 0.5 — the collision operator is
   * unconditionally unstable at or below that (it corresponds to zero viscosity). Values further
   * above 0.5 trade some flow "sharpness" for stability headroom; this is the conventional choice
   * for a driven, dissipative flow rather than a value tuned for a specific Reynolds number.
   */
  RELAXATION_TIME: 0.7,

  /**
   * Iterations run for a full map-generation solve (Generate, Assist Mode resample, map load),
   * where solve quality — specifically, giving a boundary current enough steps to propagate along
   * the *entire* length of a coastline rather than just deflecting near the point of impact —
   * matters more than latency. Empirically, 1500 iterations is where the ocean-current solve's
   * steady state stops changing further at `DRAG_COEFFICIENT`'s timescale (see
   * `docs/simulation/ocean-currents.md`).
   */
  ITERATIONS_FULL_GENERATION: 1500,

  /**
   * Iterations run for a live in-editor recompute (heightmap Erase mode, `fmg:world-recalculate`),
   * where responsiveness matters more than full convergence. Lower than
   * `ITERATIONS_FULL_GENERATION`; the field will look slightly less settled immediately after a
   * live edit than after a full generation, which is an acceptable trade-off for interactivity.
   */
  ITERATIONS_LIVE_RECOMPUTE: 400
} as const;

// ---------------------------------------------------------------------------
// River generation constants
// ---------------------------------------------------------------------------

/** Parameters governing river formation and geometry. */
export const RiverConstants = {
  /** Minimum accumulated flux required for a cell to become a river source. */
  MIN_FLUX_TO_FORM_RIVER: 30,

  /** Minimum number of cells a river must span to be retained in the dataset. */
  MIN_RIVER_CELLS: 3,

  /**
   * Threshold (as a fraction of all rivers sorted by length) below which a
   * river is considered "small" for type labelling purposes.
   */
  SMALL_RIVER_LENGTH_PERCENTILE: 0.15,

  /** Maximum height reduction per step during river downcutting (erosion). */
  MAX_DOWNCUT: 5
} as const;

// ---------------------------------------------------------------------------
// Biome constants
// ---------------------------------------------------------------------------

/** Biome classification thresholds for moisture, temperature, and height. */
export const BiomeConstants = {
  /** Minimum land height used in biome moisture calculation. Same as WATER_MAX_HEIGHT. */
  MIN_LAND_HEIGHT: 20,

  /** Maximum moisture level for hot desert biome (when no river is present). */
  HOT_DESERT_MOISTURE: 8,

  /** Moisture level above which a near-coast cell becomes wetland. */
  WETLAND_COAST_MOISTURE: 40,

  /** Maximum height for a near-coast wetland cell. */
  WETLAND_COAST_HEIGHT: 25,

  /** Moisture level above which an inland cell can become wetland. */
  WETLAND_INLAND_MOISTURE: 24,

  /** Minimum height for an inland wetland cell. */
  WETLAND_INLAND_HEIGHT_MIN: 24,

  /** Maximum height for an inland wetland cell. */
  WETLAND_INLAND_HEIGHT_MAX: 60,

  // ── Phase 3 assignment thresholds (playtest-tunable) ──────────────────────

  /** Absolute cold floor for perennial snow/ice regardless of elevation. */
  GLACIER_ABS_TEMP: -8,

  /** High peaks can hold perennial snow when summer-mean proxy is this cold. */
  GLACIER_HIGH_PEAK_TEMP: -1,

  /** Minimum height for high-peak perennial ice when temp is low. */
  GLACIER_HIGH_PEAK_HEIGHT: 78,

  /** Extreme height: perennial ice even with mildly cold summers. */
  GLACIER_EXTREME_HEIGHT: 88,

  /** Base height of the treeline at 0°C; rises with warmer temperatures. */
  TREELINE_BASE_HEIGHT: 52,

  /** Degrees °C → height units added to treeline. */
  TREELINE_TEMP_SCALE: 0.9,

  /** Minimum height for montane forest (below treeline). */
  MONTANE_MIN_HEIGHT: 48,

  /** Mangrove: minimum temperature (°C). */
  MANGROVE_MIN_TEMP: 20,

  /** Mangrove: minimum moisture. */
  MANGROVE_MIN_MOISTURE: 22,

  /** Mangrove: maximum land height. */
  MANGROVE_MAX_HEIGHT: 26,

  /** Flooded forest: minimum river flux. */
  FLOODED_FOREST_MIN_FLUX: 40,

  /** Flooded forest: minimum moisture. */
  FLOODED_FOREST_MIN_MOISTURE: 20,

  /** Flooded forest: minimum temperature. */
  FLOODED_FOREST_MIN_TEMP: 8,

  /** Cloud forest: minimum height, tropical moisture. */
  CLOUD_FOREST_MIN_HEIGHT: 50,

  /** Cloud forest: minimum temperature (still warm). */
  CLOUD_FOREST_MIN_TEMP: 14,

  /** Cloud forest: minimum moisture. */
  CLOUD_FOREST_MIN_MOISTURE: 28,

  /** Mediterranean: temperature band. */
  MED_MIN_TEMP: 12,
  MED_MAX_TEMP: 24,

  /** Mediterranean: moisture band (summer-dry proxy). */
  MED_MIN_MOISTURE: 8,
  MED_MAX_MOISTURE: 18,

  /** Temperate coniferous: temperature band. */
  TEMP_CONIFER_MIN_TEMP: 0,
  TEMP_CONIFER_MAX_TEMP: 12,

  /** Temperate coniferous: minimum moisture. */
  TEMP_CONIFER_MIN_MOISTURE: 14,

  /** Xeric shrubland: moisture / temp bands between desert and grassland. */
  XERIC_MAX_MOISTURE: 14,
  XERIC_MIN_MOISTURE: 7,
  XERIC_MIN_TEMP: 8,
  XERIC_MAX_TEMP: 30,

  /** Heath / moorland: cool open wetland-edge. */
  HEATH_MAX_TEMP: 12,
  HEATH_MIN_TEMP: 0,
  HEATH_MIN_MOISTURE: 16,
  HEATH_MAX_HEIGHT: 45,

  /** Great forest candidate: temperate moist lowland/hill band. */
  GREAT_FOREST_MIN_TEMP: 4,
  GREAT_FOREST_MAX_TEMP: 16,
  GREAT_FOREST_MIN_MOISTURE: 14,
  GREAT_FOREST_MAX_HEIGHT: 55,

  /** Target sandy beach share of coastline length for the global profile. */
  SANDY_BEACH_TARGET_MIN: 0.25,
  SANDY_BEACH_TARGET_MAX: 0.35,

  /** Nearshore: maximum water depth proxy (height below sea) for habitat. */
  NEARSHORE_MAX_DEPTH_PROXY: 8,

  /**
   * Coastal habitat classification (`coastalHabitatAssignment.ts`): current/wave exposure
   * (0-100, from `grid.cells.ambientCurrentSpeed`) below which a coastline is treated as
   * stagnant — a `tidalFlat` candidate rather than `sandyBeach`, and at/above which there's
   * enough current action to sort sediment into sand or scour bare rock if steep and
   * sediment-starved.
   */
  COASTAL_EXPOSURE_CALM_THRESHOLD: 15,

  /**
   * Coastal habitat: offshore depth-drop (`waterDepthTrend()`, a `HeightThreshold`-based proxy
   * comparing mean depth one hop vs. two hops offshore) above which a coastline is treated as
   * fjord-like regardless of how mild its land-side slope looks — beaches don't form where the
   * seabed drops away sharply just offshore.
   */
  COASTAL_FJORD_DEPTH_DROP: 10,

  /**
   * Coastal habitat: number of neighbor-averaging passes used to spread river-mouth sediment
   * along the coastline (`diffuseSediment()`, a longshore-drift proxy), so cells near but not
   * exactly at a river mouth get partial sediment credit. Shorter reach than ocean current's own
   * `OceanCurrentConstants.AMBIENT_SMOOTHING_PASSES` (6) — a sediment plume shouldn't spread a
   * whole coastline's length, just a short stretch either side of the mouth.
   */
  COASTAL_SEDIMENT_DIFFUSION_PASSES: 3,

  /**
   * Coastal habitat: minimum diffused sediment supply that lets a calm, mild-slope segment
   * become `sandyBeach` even without enough current exposure on its own — a sheltered, sedimented
   * cove is still a beach, not a scoured rock.
   */
  COASTAL_SEDIMENT_SANDY_MIN: 0.3,

  /**
   * Coastal habitat: diffused sediment supply above which a very flat, stagnant segment is
   * treated as `tidalFlat` (mud/estuary) rather than `sandyBeach` — too much fine sediment
   * relative to the near-zero current means nothing sorts it into clean sand, so it settles as
   * mud instead.
   */
  COASTAL_SEDIMENT_TIDAL_MIN: 1.5,

  // ── Phase 5: cold steppe, tropical dry forest, boreal peatland ────────────

  /** Cold steppe: temperature band (°C). */
  COLD_STEPPE_MIN_TEMP: -2,
  COLD_STEPPE_MAX_TEMP: 12,

  /** Cold steppe: moisture band (drier than moist grassland, wetter than desert). */
  COLD_STEPPE_MIN_MOISTURE: 8,
  COLD_STEPPE_MAX_MOISTURE: 16,

  /** Cold steppe: maximum height (peaks go montane/alpine). */
  COLD_STEPPE_MAX_HEIGHT: 55,

  /** Tropical dry forest: minimum temperature (°C). */
  TROPICAL_DRY_MIN_TEMP: 18,

  /** Tropical dry forest: moisture between savanna-dry and seasonal-forest-wet. */
  TROPICAL_DRY_MIN_MOISTURE: 12,
  TROPICAL_DRY_MAX_MOISTURE: 22,

  /** Tropical dry forest: maximum height before montane/cloud rules win. */
  TROPICAL_DRY_MAX_HEIGHT: 50,

  /** Boreal peatland: maximum temperature (°C). */
  BOREAL_PEAT_MAX_TEMP: 6,

  /** Boreal peatland: minimum moisture (or wetland-like wetness). */
  BOREAL_PEAT_MIN_MOISTURE: 20,

  /** Boreal peatland: maximum height (flat poorly drained ground). */
  BOREAL_PEAT_MAX_HEIGHT: 45
} as const;

// ---------------------------------------------------------------------------
// Feature size ratios
// ---------------------------------------------------------------------------

/**
 * Size ratios (expressed as fractions of the total grid cell count) that
 * determine whether a water/land feature qualifies as ocean/sea/gulf or
 * continent/island/isle.
 */
export const FeatureSizeRatio = {
  /** Minimum cell fraction for a water body to be classified as "ocean". */
  OCEAN_MIN: 1 / 25,

  /** Minimum cell fraction for a water body to be classified as "sea" (vs. gulf). */
  SEA_MIN: 1 / 1000,

  /** Minimum cell fraction for a land mass to be classified as "continent". */
  CONTINENT_MIN: 1 / 10,

  /** Minimum cell fraction for a land mass to be classified as "island" (vs. isle). */
  ISLAND_MIN: 1 / 1000
} as const;

// ---------------------------------------------------------------------------
// Heightmap algorithm constants
// ---------------------------------------------------------------------------

/** Tuning values for the procedural heightmap generation algorithms. */
export const HeightmapConstants = {
  /** Maximum number of placement retries in addHill / addPit / addTrough loops. */
  PLACEMENT_ITER_LIMIT: 50,

  /** Minimum multiplier for per-cell random jitter in hill/blob spreading. */
  JITTER_MIN: 0.9,

  /** Range of per-cell random jitter (actual value = JITTER_MIN + rand * JITTER_RANGE). */
  JITTER_RANGE: 0.2,

  /**
   * Every Nth cell along a mountain ridge receives a "prominence" arm.
   * Lower values create more arms; higher values create sparser, cleaner ridges.
   */
  PROMINENCE_INTERVAL: 6,

  /**
   * Vertical offset applied when checking whether a lake shore has an outlet.
   * Keeps the stored lake height slightly below the lowest shoreline cell.
   */
  LAKE_ELEVATION_DELTA: 0.1,

  /**
   * Small height increment added to cells while resolving depressions.
   * Tiny values prevent abrupt step artefacts on the heightmap.
   */
  DEPRESSION_FILL_STEP: 0.1,

  /**
   * Height increment added to a lake's surface height when it is too low to
   * overflow its shoreline during depression resolution.
   */
  LAKE_HEIGHT_INCREMENT: 0.2,

  /**
   * Image pixel-brightness threshold used when loading a pre-created heightmap.
   * Pixels with brightness < this value are treated as shallow ocean (0–20 range);
   * pixels above it are remapped via a power curve to the land range (20–100).
   */
  IMAGE_WATER_THRESHOLD: 0.2,

  /**
   * Deepest ocean distance-field value written during grid markup.
   * Must be negative; cells further from land are assigned values down to this limit.
   */
  DEEP_WATER_LIMIT: -10
} as const;

// ---------------------------------------------------------------------------
// Volcano tagging constants (heightmap generation ↔ biome assignment)
// ---------------------------------------------------------------------------

/**
 * Shared between HeightmapModule (src/generators/heightmap-generator.ts, where a volcano is
 * first tagged) and biomeAssignment.ts (where the tag becomes a biome) so both sides agree on
 * what "this is a volcano" and "this is the crater core" mean.
 */
export const VolcanoConstants = {
  /**
   * Minimum rolled height for a single (`count === 1`) Hill placement to be eligible as a
   * volcanic-cone candidate. Only a genuinely singular, dominant peak reaches this in one
   * placement — templates that build mountain ranges from many smaller Hill/Range calls never
   * do (see the dedicated "Volcano" template and the few "twin dramatic peak" lines elsewhere
   * in heightmap-templates.ts).
   */
  MIN_PEAK_HEIGHT: 82,

  /**
   * Volcanic intensity (0..1, peak = 1) at and above which a cell is the barren crater/lava
   * core (`volcanicBarrens` / `lavaField`) rather than the fertile flank ring
   * (`volcanicSoil`). Not user-tunable — this is the "unmistakably a volcano" core identity;
   * only the flank ring's reach is (see options.volcanicSoilStrength).
   */
  CORE_MIN_INTENSITY: 0.75,

  /** Widest volcanicSoil ring (lowest intensity threshold admitted), at options.volcanicSoilStrength = 100. */
  SOIL_MIN_INTENSITY_AT_MAX_STRENGTH: 0.28,

  /** Narrowest volcanicSoil ring — collapses to almost nothing — at options.volcanicSoilStrength = 0. */
  SOIL_MIN_INTENSITY_AT_ZERO_STRENGTH: 0.72,

  /**
   * Cosmetic caldera notch carved into an *active* volcano's summit. Purely a height dent for
   * the contour/relief rendering — the "molten crater" read comes from the lavaField biome
   * override, not from this dip, so it deliberately stays shallow.
   */
  ACTIVE_CALDERA_DEPTH: 6,

  /**
   * Floor for an active volcano's caldera dip, expressed as a margin above
   * HeightThreshold.WATER_MAX_HEIGHT. Keeps the notch from ever accidentally sinking an active
   * (lava-filled) summit below the water line — that fate is reserved for dormant volcanoes,
   * whose summit is deliberately carved into a crater lake instead.
   */
  ACTIVE_FLOOR_MARGIN: 15,

  /**
   * Minimum height for the *fallback* volcano candidate: the map's single tallest land cell,
   * used only when no template step ever placed a qualifying single-dominant-Hill peak (see
   * MIN_PEAK_HEIGHT). Most heightmap templates build their mountains from many stacked Hill/
   * Range calls and never produce that signature, so without this fallback "Volcanism chance"
   * silently did nothing on the majority of templates — 100% would still place no volcano at
   * all, depending purely on which template the seed happened to pick.
   *
   * Deliberately just above HeightThreshold.WATER_MAX_HEIGHT (land starts at 20) rather than
   * some "dramatic mountain" cutoff: geologically, a volcano isn't defined by height — a
   * freshly-emerged vent that has barely broken the surface (a nascent seamount, a Surtsey-like
   * eruption island) is still a volcano, just one that hasn't built up its cone yet. Any land at
   * all is eligible, so "Volcanism chance" behaves the same — 100% means a volcano, 0% means
   * none — on every template, including low-relief ones like "atoll" that never place a single
   * dramatic peak. floodFillDecay's falloff naturally scales the tagged footprint down with a
   * low seed height, so a barely-emerged vent gets a correspondingly small volcanic/soil ring
   * rather than an oversized one.
   */
  FALLBACK_MIN_PEAK_HEIGHT: HeightThreshold.WATER_MAX_HEIGHT + 2
} as const;

// ---------------------------------------------------------------------------
// Temperature renderer constants
// ---------------------------------------------------------------------------

/** Constants used exclusively by the draw-temperature renderer. */
export const TemperatureRenderer = {
  /** Minimum squared distance between two isotherm labels to avoid overlap. */
  LABEL_MIN_DIST2: 100,

  /** Minimum pixel margin from SVG edges within which labels are not placed. */
  LABEL_MARGIN: 20,

  /** Minimum number of points in a chain before a bottom-center label is added. */
  LABEL_MIN_CHAIN_POINTS: 20,

  /** Chain relaxation interval: keep only every Nth vertex before rendering. */
  RELAX_INTERVAL: 4,

  /** Minimum relaxed chain length to render an isotherm path. */
  MIN_CHAIN_LENGTH: 6
} as const;
