"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import { unfog } from "../../ui/editors";
import * as d3 from "d3";

export function migrateToV1_11_0({ pack, dom }: AutoUpdateMigrationContext): void {
  const svg = dom?.svg ?? d3.select("svg");
  const terrs = dom?.terrs ?? d3.select("#terrs");
  const oceanLayers = dom?.oceanLayers ?? d3.select("#oceanLayers");
  const gridOverlay = dom?.gridOverlay ?? d3.select("#gridOverlay");
  const terrain = dom?.terrain ?? d3.select("#terrain");

  // v1.11 added new attributes
  terrs.attr("scheme", "bright").attr("terracing", 0).attr("skip", 5).attr("relax", 0).attr("curve", 0);
  svg.select("#oceanic > *").attr("id", "oceanicPattern");
  oceanLayers.attr("layers", "-6,-3,-1");
  gridOverlay.attr("type", "pointyHex").attr("size", 10);

  // v1.11 added cultures heirarchy tree
  if (pack.cultures[1] && !pack.cultures[1].code) {
    pack.cultures
      .filter(c => c.i)
      .forEach(c => {
        c.origin = 0;
        c.code = c.name.slice(0, 2);
      });
  }

  // v1.11 had an issue with fogging being displayed on load
  unfog();

  // v1.2 added new terrain attributes
  if (!terrain.attr("set")) terrain.attr("set", "simple");
  if (!terrain.attr("size")) terrain.attr("size", 1);
  if (!terrain.attr("density")) terrain.attr("density", 0.4);
}
