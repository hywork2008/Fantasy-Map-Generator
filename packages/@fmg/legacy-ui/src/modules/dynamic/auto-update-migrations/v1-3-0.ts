"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import { States } from "@fmg/states";
import * as d3 from "d3";

export function migrateToV1_3_0(context: AutoUpdateMigrationContext): void {
  const { pack, grid, dom, api, helpers, options, rand, P, nameBases } = context as any;

  // v1.3 added global options object
  const oldOptions = options ?? (typeof window !== "undefined" ? (window as any).options : undefined);
  const winds = Array.isArray(oldOptions) ? oldOptions.slice() : Array.isArray(oldOptions?.winds) ? oldOptions.winds.slice() : [];
  const year = typeof rand === "function" ? rand(100, 2000) : Math.floor(100 + Math.random() * 1900);
  const chooseBaseIndex = () => {
    const useOne = typeof P === "function" ? P(0.7) : Math.random() < 0.7;
    if (useOne) return 1;
    const nb = nameBases && nameBases.length ? nameBases.length : 1;
    return typeof rand === "function" ? rand(nb) : Math.floor(Math.random() * nb);
  };
  const era = (api as any).Names.getBaseShort(chooseBaseIndex()) + " Era";
  const eraShort = era[0] + "E";
  const military = (api as any).Military?.getDefaultOptions ? (api as any).Military.getDefaultOptions() : {};
  const newOptions = { winds, year, era, eraShort, military };

  // Replace or mutate the legacy options reference so downstream code sees new structure.
  if (oldOptions && typeof oldOptions === "object" && !Array.isArray(oldOptions)) {
    Object.assign(oldOptions, newOptions);
  } else if (typeof window !== "undefined") {
    (window as any).options = newOptions;
    (context as any).options = newOptions;
  } else {
    (context as any).options = newOptions;
  }

  // v1.3 added campaigns data for all states
  States.generateCampaigns();

  // v1.3 added militry layer
  const viewbox = dom?.viewbox ?? d3.select("#viewbox");
  let armies = dom?.armies ?? d3.select("#armies");

  if (!armies.size()) armies = viewbox.insert("g", "#icons").attr("id", "armies");
  armies
    .attr("opacity", 1)
    .attr("fill-opacity", 1)
    .attr("font-size", 6)
    .attr("box-size", 3)
    .attr("stroke", "#000")
    .attr("stroke-width", 0.3);
  helpers?.turnButtonOn?.("toggleMilitary");
  (api as any).Military.generate();
}
