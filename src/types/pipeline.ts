import type { PackedGraph } from "../types/PackedGraph";
import type { WorldState } from "./WorldState";

// ─── Generic pipeline primitives ──────────────────────────────────────────────

/**
 * The subset of PackedGraph fields that a pipeline stage requires as input.
 * Readonly prevents a stage from accidentally mutating its declared inputs.
 */
export type PipelineStageInput<T> = Readonly<T>;

/**
 * The subset of PackedGraph fields that a pipeline stage guarantees to have
 * populated on completion.
 */
export type PipelineStageOutput<T> = T;

/**
 * WorldState tagged with a phantom string that identifies the last completed
 * pipeline stage. The `_stage` field exists only in the type system and is
 * never present at runtime. Used to enforce stage-ordering at compile time
 * inside generateWorld.
 */
export type WorldStateAt<Stage extends string> = WorldState & { readonly _stage: Stage };

// ─── Per-stage I/O contracts (20 pipeline stages) ─────────────────────────────
// Named aliases that document each stage's data dependencies.
// "In" types use PipelineStageInput (Readonly) to express required inputs.
// "Out" types use PipelineStageOutput to express guaranteed outputs.

/** Stage 01 – Rivers.generate: computes flux and lays river networks */
export type RiversGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "features" | "vertices">>;
/** writes: rivers, cells.{r, fl} */
export type RiversGenerateOut = PipelineStageOutput<Pick<PackedGraph, "rivers">>;

/** Stage 02 – Biomes.define: assigns biome ids to cells (writes cells.biome) */
export type BiomesDefineIn = PipelineStageInput<Pick<PackedGraph, "cells">>;

/** Stage 03 – Features.defineGroups: classifies features as ocean/sea/gulf/lake/island/isle */
export type FeaturesGroupsIn = PipelineStageInput<Pick<PackedGraph, "cells" | "features">>;
/** writes: features[].group */
export type FeaturesGroupsOut = PipelineStageOutput<Pick<PackedGraph, "features">>;

/** Stage 04 – Ice.generate: places ice elements at polar / high-altitude cells */
export type IceGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells">>;
/** writes: ice */
export type IceGenerateOut = PipelineStageOutput<Pick<PackedGraph, "ice">>;

/** Stage 05 – Cultures.generate: seeds culture centres using habitability scores */
export type CulturesGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "features">>;
/** writes: cultures, cells.culture (initial assignment) */
export type CulturesGenerateOut = PipelineStageOutput<Pick<PackedGraph, "cultures">>;

/** Stage 06 – Cultures.expand: flood-fills culture territories (writes cells.culture) */
export type CulturesExpandIn = PipelineStageInput<Pick<PackedGraph, "cells" | "cultures">>;

/** Stage 07 – Burgs.generate: selects and places settlement candidates */
export type BurgsGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "cultures" | "features" | "rivers">>;
/** writes: burgs, cells.{burg, pop} */
export type BurgsGenerateOut = PipelineStageOutput<Pick<PackedGraph, "burgs">>;

/** Stage 08 – States.generate: seeds states from capital burgs and expands territories */
export type StatesGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "burgs" | "cultures">>;
/** writes: states, cells.{state, conf} */
export type StatesGenerateOut = PipelineStageOutput<Pick<PackedGraph, "states">>;

/** Stage 09 – Routes.generate: builds road and sea-route networks between burgs */
export type RoutesGenerateIn = PipelineStageInput<
  Pick<PackedGraph, "cells" | "burgs" | "states" | "rivers" | "features">
>;
/** writes: routes, cells.routes */
export type RoutesGenerateOut = PipelineStageOutput<Pick<PackedGraph, "routes">>;

/** Stage 10 – Religions.generate: seeds and expands religious territories */
export type ReligionsGenerateIn = PipelineStageInput<
  Pick<PackedGraph, "cells" | "states" | "burgs" | "cultures" | "rivers">
>;
/** writes: religions, cells.religion */
export type ReligionsGenerateOut = PipelineStageOutput<Pick<PackedGraph, "religions">>;

/** Stage 11 – Burgs.specify: enriches burgs with names, ports, harbour data, etc. */
export type BurgsSpecifyIn = PipelineStageInput<
  Pick<PackedGraph, "cells" | "burgs" | "states" | "cultures" | "religions" | "features">
>;

/** Stage 12 – States.collectStatistics: aggregates population and area stats into each state */
export type StatesCollectStatisticsIn = PipelineStageInput<Pick<PackedGraph, "cells" | "states" | "burgs">>;

/** Stage 13 – States.defineStateForms: assigns government form, expansion type, and diplomacy */
export type StatesDefineFormsIn = PipelineStageInput<Pick<PackedGraph, "states" | "cultures">>;

/** Stage 14 – Provinces.generate: subdivides states into provinces */
export type ProvincesGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "states" | "burgs" | "features">>;
/** writes: provinces, cells.province */
export type ProvincesGenerateOut = PipelineStageOutput<Pick<PackedGraph, "provinces">>;

/** Stage 15 – Provinces.getPoles: computes visual label poles for province labels */
export type ProvincesGetPolesIn = PipelineStageInput<Pick<PackedGraph, "cells" | "provinces">>;

/** Stage 16 – Rivers.specify: assigns names and mouth-cell data to rivers */
export type RiversSpecifyIn = PipelineStageInput<Pick<PackedGraph, "cells" | "rivers" | "features">>;

/** Stage 17 – Lakes.defineNames: assigns names to lake features */
export type LakesDefineNamesIn = PipelineStageInput<Pick<PackedGraph, "cells" | "features" | "cultures">>;

/** Stage 18 – Military.generate: spawns regiment units for states */
export type MilitaryGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "states" | "burgs">>;

/** Stage 19 – Markers.generate: places special point-of-interest markers */
export type MarkersGenerateIn = PipelineStageInput<
  Pick<PackedGraph, "cells" | "features" | "burgs" | "states" | "cultures" | "rivers">
>;
/** writes: markers */
export type MarkersGenerateOut = PipelineStageOutput<Pick<PackedGraph, "markers">>;

/** Stage 20 – Zones.generate: draws special-influence zones */
export type ZonesGenerateIn = PipelineStageInput<Pick<PackedGraph, "cells" | "burgs" | "states">>;
/** writes: zones */
export type ZonesGenerateOut = PipelineStageOutput<Pick<PackedGraph, "zones">>;
