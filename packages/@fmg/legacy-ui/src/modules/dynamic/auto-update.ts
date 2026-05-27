"use strict";

import type { Grid, PackedGraph } from "@fmg/types";
import { createDefaultRuler } from "../ui/measurers";
import { States } from "@fmg/states";
import { autoUpdateFmgApi } from "../runtime/auto-update-fmg-api";
import { getLegacyGrid, getLegacyPack } from "../runtime/legacy-runtime";
import { layerIsOn } from "../ui/layers";
import { runAutoUpdateMigrationPipeline } from "./auto-update-migrations";
import { runAutoUpdatePostV110Migrations } from "./auto-update-migrations/v1-11-0-plus";

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

  runAutoUpdateMigrationPipeline(mapVersion, {
    pack,
    api: {
      Religions,
      Features,
      Zones,
      Markers,
      Provinces,
      States
    },
    helpers: {
      layerIsOn,
      createDefaultRuler
    }
  });

  runAutoUpdatePostV110Migrations(mapVersion, context);
}
