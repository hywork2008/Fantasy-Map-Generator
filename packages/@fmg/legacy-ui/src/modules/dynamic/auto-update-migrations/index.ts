"use strict";

import * as d3 from "d3";
import type { Grid, PackedGraph } from "@fmg/types";
import { Opisometer, Planimeter, Ruler } from "../../ui/measurers";
import { States } from "@fmg/states";
import { unfog } from "../../ui/editors";
import { findClosestCell } from "#utils/graphUtils";
import { drawRoutes, drawTexture, drawZones, layerIsOn } from "../../ui/layers";
import { burgIconsRenderer } from "#renderers/draw-burg-icons";
import { burgLabelsRenderer } from "#renderers/draw-burg-labels";
import { featuresRenderer } from "#renderers/draw-features";
import { heightmapRenderer } from "#renderers/draw-heightmap";
import { iceRenderer } from "#renderers/draw-ice";
import { markersRenderer } from "#renderers/draw-markers";
import { militaryRenderer } from "#renderers/draw-military";
import { scaleBarRenderer as drawScaleBar, scaleBarResize as fitScaleBar } from "#renderers/draw-scalebar";
import { compareVersions } from "../../../versioning";
import type { AutoUpdateMigrationContext } from "./types";
import { migrateToV1_0_0 } from "./v1-0-0";
import { migrateToV1_1_0 } from "./v1-1-0";
import { migrateToV1_11_0 } from "./v1-11-0";
import { migrateToV1_21_0 } from "./v1-21-0";
import { migrateToV1_22_0 } from "./v1-22-0";
import { migrateToV1_3_0 } from "./v1-3-0";
import { migrateToV1_4_0 } from "./v1-4-0";
import { migrateToV1_5_0 } from "./v1-5-0";
import { migrateToV1_6_0 } from "./v1-6-0";
import { migrateToV1_61_0 } from "./v1-61-0";
import { migrateToV1_62_0 } from "./v1-62-0";
import { migrateToV1_63_0 } from "./v1-63-0";
import { migrateToV1_64_0 } from "./v1-64-0";
import { migrateToV1_65_0 } from "./v1-65-0";
import { migrateToV1_652_0 } from "./v1-652-0";
import { migrateToV1_7_0 } from "./v1-7-0";
import { migrateToV1_72_0 } from "./v1-72-0";
import { migrateToV1_73_0 } from "./v1-73-0";
import { migrateToV1_84_0 } from "./v1-84-0";
import { migrateToV1_85_0 } from "./v1-85-0";
import { migrateToV1_86_0 } from "./v1-86-0";
import { migrateToV1_88_0 } from "./v1-88-0";
import { migrateToV1_91_0 } from "./v1-91-0";
import { migrateToV1_92_0 } from "./v1-92-0";
import { migrateToV1_94_0 } from "./v1-94-0";
import { migrateToV1_95_0 } from "./v1-95-0";
import { migrateToV1_96_0 } from "./v1-96-0";
import { migrateToV1_98_0 } from "./v1-98-0";
import { migrateToV1_99_0 } from "./v1-99-0";
import { migrateToV1_100_0 } from "./v1-100-0";
import { migrateToV1_104_0 } from "./v1-104-0";
import { migrateToV1_105_0 } from "./v1-105-0";
import { migrateToV1_106_0 } from "./v1-106-0";
import { migrateToV1_107_0 } from "./v1-107-0";
import { migrateToV1_108_0 } from "./v1-108-0";
import { migrateToV1_109_0 } from "./v1-109-0";
import { migrateToV1_111_0 } from "./v1-111-0";
import { migrateToV1_113_0 } from "./v1-113-0";

import { autoUpdateFmgApi } from "../../runtime/auto-update-fmg-api";

export function runAutoUpdateMigrationPipeline(mapVersion: string, context: AutoUpdateMigrationContext): void {

  const { pack, grid } = context;
  const { Features, Cultures, Burgs, Markers, Provinces, Religions, Zones, Names, Military, Rivers } = context.api as any;
  const isOlderThan = tagVersion => compareVersions(mapVersion, tagVersion).isOlder;

  if (isOlderThan("1.0.0")) migrateToV1_0_0(context);
  if (isOlderThan("1.1.0")) migrateToV1_1_0(context);
  if (isOlderThan("1.3.0")) migrateToV1_3_0(context);
  if (isOlderThan("1.4.0")) migrateToV1_4_0(context);
  if (isOlderThan("1.5.0")) migrateToV1_5_0(context);
  if (isOlderThan("1.6.0")) migrateToV1_6_0(context);
  if (isOlderThan("1.7.0")) migrateToV1_7_0(context);
  if (isOlderThan("1.11.0")) migrateToV1_11_0(context);
  if (isOlderThan("1.21.0")) migrateToV1_21_0(context);
  if (isOlderThan("1.22.0")) migrateToV1_22_0(context);
  if (isOlderThan("1.61.0")) migrateToV1_61_0(context);
  if (isOlderThan("1.62.0")) migrateToV1_62_0(context);
  if (isOlderThan("1.63.0")) migrateToV1_63_0(context);
  if (isOlderThan("1.64.0")) migrateToV1_64_0(context);
  if (isOlderThan("1.65.0")) migrateToV1_65_0(context);
  if (isOlderThan("1.72.0")) migrateToV1_72_0(context);
  if (isOlderThan("1.73.0")) migrateToV1_73_0(context);
  if (isOlderThan("1.84.0")) migrateToV1_84_0(context);
  if (isOlderThan("1.85.0")) migrateToV1_85_0(context);
  if (isOlderThan("1.86.0")) migrateToV1_86_0(context);
  if (isOlderThan("1.88.0")) migrateToV1_88_0(context);
  if (isOlderThan("1.91.0")) migrateToV1_91_0(context);
  if (isOlderThan("1.92.0")) migrateToV1_92_0(context);
  if (isOlderThan("1.94.0")) migrateToV1_94_0(context);
  if (isOlderThan("1.95.0")) migrateToV1_95_0(context);
  if (isOlderThan("1.96.0")) migrateToV1_96_0(context);
  if (isOlderThan("1.98.0")) migrateToV1_98_0(context);
  if (isOlderThan("1.99.0")) migrateToV1_99_0(context);
  if (isOlderThan("1.100.0")) migrateToV1_100_0(context);
  if (isOlderThan("1.104.0")) migrateToV1_104_0(context);
  if (isOlderThan("1.105.0")) migrateToV1_105_0(context);
  if (isOlderThan("1.106.0")) migrateToV1_106_0(context);
  if (isOlderThan("1.107.0")) migrateToV1_107_0(context);
  if (isOlderThan("1.108.0")) migrateToV1_108_0(context);
  if (isOlderThan("1.109.0")) migrateToV1_109_0(context);
  if (isOlderThan("1.111.0")) migrateToV1_111_0(context);
  if (isOlderThan("1.113.0")) migrateToV1_113_0(context);
  if (isOlderThan("1.652.0")) migrateToV1_652_0(context); // TODO > 1.122.3. It's too huge.
}

const findPackCell = (packData: PackedGraph, x: number, y: number, radius?: number) =>
  findClosestCell(x, y, radius ?? Infinity, packData) as number;
const getZonesLayer = () => d3.select("#zones");


