import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import "./voronoi";
import { Features } from "./features";
import "./ocean-layers";
import { Biomes } from "./biomes";
import { Burgs } from "./burgs-generator";
import { Cultures } from "./cultures-generator";
import { Lakes } from "./lakes";
import { Military } from "./military-generator";
import { Provinces } from "./provinces-generator";
import { Religions } from "./religions-generator";
import { Rivers } from "./river-generator";
import { Routes } from "./routes-generator";
import { States } from "./states-generator";
import { Zones } from "./zones-generator";
import "./emblem";
import { initFonts } from "./fonts";
import { Goods } from "./goods-generator";
import { Ice } from "./ice";
import { Markers } from "./markers-generator";
import { Markets } from "./markets-generator";
import { Production } from "./production-generator";
import "./resample";

export type { BakeParams, ErosionBakeResult } from "./erosion-bake";
export { Goods, Markets, Production };

import type { WorldStateAt } from "../types/pipeline";
import type { WorldState } from "../types/WorldState";

export function initModules(): void {
  initFonts();
}

// ─── Stage runner functions ────────────────────────────────────────────────────
// Each function wraps one pipeline stage. The phantom type WorldStateAt<Stage>
// enforces that stages run in the declared order at compile time.
// At runtime the cast is a no-op — the same mutable WorldState is passed through.
//
// The double-cast (as unknown as WorldStateAt<...>) is intentional: the
// _stage phantom field exists only in the type system, so we must go through
// unknown to cross between two WorldStateAt variants.

function runRiversGenerate(
  state: WorldState,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"rivers"> {
  Rivers.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"rivers">;
}

function runBiomesDefine(state: WorldStateAt<"rivers">): WorldStateAt<"biomes"> {
  Biomes.define(state);
  return state as unknown as WorldStateAt<"biomes">;
}

function runFeaturesDefineGroups(state: WorldStateAt<"biomes">): WorldStateAt<"featureGroups"> {
  Features.defineGroups();
  return state as unknown as WorldStateAt<"featureGroups">;
}

function runIceGenerate(
  state: WorldStateAt<"featureGroups">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"ice"> {
  Ice.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"ice">;
}

function runCulturesGenerate(
  state: WorldStateAt<"ice">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"culturesSeeded"> {
  Cultures.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"culturesSeeded">;
}

function runCulturesExpand(state: WorldStateAt<"culturesSeeded">): WorldStateAt<"culturesExpanded"> {
  Cultures.expand(state);
  return state as unknown as WorldStateAt<"culturesExpanded">;
}

function runBurgsGenerate(
  state: WorldStateAt<"culturesExpanded">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"burgs"> {
  Burgs.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"burgs">;
}

function runStatesGenerate(
  state: WorldStateAt<"burgs">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"states"> {
  States.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"states">;
}

function runRoutesGenerate(
  state: WorldStateAt<"states">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"routes"> {
  Routes.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"routes">;
}

function runReligionsGenerate(
  state: WorldStateAt<"routes">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"religions"> {
  Religions.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"religions">;
}

function runBurgsSpecify(
  state: WorldStateAt<"religions">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"burgsDetailed"> {
  Burgs.specify(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"burgsDetailed">;
}

function runStatesCollectStatistics(state: WorldStateAt<"burgsDetailed">): WorldStateAt<"stateStats"> {
  States.collectStatistics(state);
  return state as unknown as WorldStateAt<"stateStats">;
}

function runStatesDefineStateForms(state: WorldStateAt<"stateStats">): WorldStateAt<"stateForms"> {
  States.defineStateForms(state);
  return state as unknown as WorldStateAt<"stateForms">;
}

function runProvincesGenerate(
  state: WorldStateAt<"stateForms">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"provinces"> {
  Provinces.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"provinces">;
}

function runProvincesGetPoles(state: WorldStateAt<"provinces">): WorldStateAt<"provincePoles"> {
  Provinces.getPoles(state);
  return state as unknown as WorldStateAt<"provincePoles">;
}

function runRiversSpecify(
  state: WorldStateAt<"provincePoles">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"riversDetailed"> {
  Rivers.specify(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"riversDetailed">;
}

function runLakesDefineNames(state: WorldStateAt<"riversDetailed">): WorldStateAt<"lakeNames"> {
  Lakes.defineNames(state);
  return state as unknown as WorldStateAt<"lakeNames">;
}

function runMilitaryGenerate(
  state: WorldStateAt<"lakeNames">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"military"> {
  Military.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"military">;
}

function runMarkersGenerate(
  state: WorldStateAt<"military">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): WorldStateAt<"markers"> {
  Markers.generate(worldContext, viewContext, appServices, state);
  return state as unknown as WorldStateAt<"markers">;
}

function runZonesGenerate(
  state: WorldStateAt<"markers">,
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices
): void {
  Zones.generate(worldContext, viewContext, appServices, state);
}

/**
 * Run the full world-generation pipeline in dependency order.
 * Each step mutates state.pack in place.
 * The WorldStateAt<Stage> phantom types enforce that stages run in the
 * declared order — reordering calls produces a compile-time error.
 */
export function generateWorld(
  worldContext: WorldContext,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  state: WorldState
): void {
  const s01 = runRiversGenerate(state, worldContext, viewContext, appServices);
  const s02 = runBiomesDefine(s01);
  const s03 = runFeaturesDefineGroups(s02);
  const s04 = runIceGenerate(s03, worldContext, viewContext, appServices);
  const s05 = runCulturesGenerate(s04, worldContext, viewContext, appServices);
  const s06 = runCulturesExpand(s05);
  const s07 = runBurgsGenerate(s06, worldContext, viewContext, appServices);
  const s08 = runStatesGenerate(s07, worldContext, viewContext, appServices);
  const s09 = runRoutesGenerate(s08, worldContext, viewContext, appServices);
  const s10 = runReligionsGenerate(s09, worldContext, viewContext, appServices);
  const s11 = runBurgsSpecify(s10, worldContext, viewContext, appServices);
  const s12 = runStatesCollectStatistics(s11);
  const s13 = runStatesDefineStateForms(s12);
  const s14 = runProvincesGenerate(s13, worldContext, viewContext, appServices);
  const s15 = runProvincesGetPoles(s14);
  const s16 = runRiversSpecify(s15, worldContext, viewContext, appServices);
  const s17 = runLakesDefineNames(s16);
  const s18 = runMilitaryGenerate(s17, worldContext, viewContext, appServices);
  const s19 = runMarkersGenerate(s18, worldContext, viewContext, appServices);
  runZonesGenerate(s19, worldContext, viewContext, appServices);
}
