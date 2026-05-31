"use strict";

import type { AutoUpdateMigrationContext as MigrationCtx } from "./types";
import * as d3 from "d3";

export function migrateToV1_5_0({ pack, grid, dom, api, helpers }: MigrationCtx): void {
  const { Cultures, Burgs } = api as any;
  // not need to store default styles from v 1.5
  localStorage.removeItem("styleClean");
  localStorage.removeItem("styleGloom");
  localStorage.removeItem("styleAncient");
  localStorage.removeItem("styleMonochrome");

  // v1.5 cultures has shield attribute
  pack.cultures.forEach(culture => {
    if (culture.removed) return;
    culture.shield = Cultures.getRandomShield();
  });

  // v1.5 added burg type value
  pack.burgs.forEach(burg => {
    if (!burg.i || burg.removed) return;
    burg.type = Burgs.getType(burg.cell, burg.port);
  });

  // v1.5 added emblems
  const defs = dom?.defs ?? d3.select("#defs");
  const viewbox = dom?.viewbox ?? d3.select("#viewbox");
  defs.append("g").attr("id", "defs-emblems");
  let emblems = dom?.emblems ?? d3.select("#emblems");
  if (!emblems.size()) emblems = viewbox.insert("g", "#population").attr("id", "emblems").style("display", "none");
  emblems.append("g").attr("id", "burgEmblems");
  emblems.append("g").attr("id", "provinceEmblems");
  emblems.append("g").attr("id", "stateEmblems");
  // trigger emblems renderer and toggle via injected helpers
  helpers?.drawEmblems?.();
  helpers?.toggleEmblems?.();

  // v1.5 changed releif icons data
  const terrain = dom?.terrain ?? d3.select("#terrain");
  terrain.selectAll("use").each(function () {
    const type = this.getAttribute("data-type") || this.getAttribute("xlink:href");
    this.removeAttribute("xlink:href");
    this.removeAttribute("data-type");
    this.removeAttribute("data-size");
    this.setAttribute("href", type);
  });
}
