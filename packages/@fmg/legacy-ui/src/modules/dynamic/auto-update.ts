"use strict";

import type { Grid, PackedGraph } from "@fmg/types";
import { createDefaultRuler } from "../ui/measurers";
import { States } from "@fmg/states";
import { autoUpdateFmgApi } from "../runtime/auto-update-fmg-api";
import { getLegacyGrid, getLegacyPack } from "../runtime/legacy-runtime";
import { layerIsOn, drawZones, turnButtonOn, turnButtonOff, toggleEmblems } from "../ui/layers";
import { shiftCompass } from "../ui/style";
import { emblemsRenderer as drawEmblems } from "#renderers/draw-emblems";
import { runAutoUpdateMigrationPipeline } from "./auto-update-migrations";
import * as d3 from "d3";
import { Names } from "@fmg/core/modules/names-generator";
import { Military } from "@fmg/core/modules/military-generator";
import { Rivers } from "@fmg/rivers";
import { markersRenderer } from "#renderers/draw-markers";
import { featuresRenderer } from "#renderers/draw-features";
import { burgIconsRenderer } from "#renderers/draw-burg-icons";
import { burgLabelsRenderer } from "#renderers/draw-burg-labels";
import { iceRenderer } from "#renderers/draw-ice";
import { militaryRenderer } from "#renderers/draw-military";
import { findClosestCell } from "@fmg/shared";

const { Religions, Features, Cultures, Zones, Burgs, Markers, Provinces } = autoUpdateFmgApi;

export type AutoUpdateContext = {
  pack: PackedGraph;
  grid: Grid;
};

export const getAutoUpdateContext = (): AutoUpdateContext => ({
  pack: getLegacyPack<PackedGraph>(),
  grid: getLegacyGrid<Grid>()
});

// update old map file to the current version
export function resolveVersionConflicts(mapVersion, context: AutoUpdateContext = getAutoUpdateContext()) {
  const { pack } = context;

  // merge contexts so the single pipeline can run both pre- and post-1.11 migrations
  const dom = (typeof document !== "undefined")
    ? {
        viewbox: d3.select("#viewbox"),
        rivers: d3.select("#rivers"),
        lakes: d3.select("#lakes"),
        labels: d3.select("#labels"),
        coastline: d3.select("#coastline"),
        defs: d3.select("#defs"),
        compass: d3.select("#compass"),
        pointsInput: document.getElementById("pointsInput"),
        heightExponentInput: document.getElementById("heightExponentInput"),
        zones: d3.select("#zones"),
        markersGroup: d3.select("#markers")
      }
    : {};

  const fullContext = {
    pack,
    grid: context.grid,
    biomesData: (typeof window !== "undefined") ? ((window as any).biomesData) : undefined,
    dom,
    api: {
      Religions,
      Features,
      // expose core services which migrations may rely on
      Cultures,
      Burgs,
      Zones,
      Markers,
      Provinces,
      Names,
      Military,
      Rivers,
      States
    },
    helpers: {
      layerIsOn,
      createDefaultRuler,
      // expose renderers so migrations can trigger redraws
      markersRenderer,
      featuresRenderer,
      militaryRenderer,
      burgIconsRenderer,
      burgLabelsRenderer,
      iceRenderer,
      drawZones,
      turnButtonOn,
      turnButtonOff,
      drawEmblems,
      toggleEmblems,
      shiftCompass,
      // pack-bound helper to find nearest cell
      findPackCell: (x: number, y: number, radius?: number) => findClosestCell(x, y, radius, pack)
    }
  };

  runAutoUpdateMigrationPipeline(mapVersion, fullContext as any);
}
