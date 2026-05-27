import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_0_0({ api, helpers }: AutoUpdateMigrationContext): void {
  const { Religions, Zones, Markers, Provinces, States } = api;

  // v1.0 added a new religions layer
  relig = viewbox.insert("g", "#terrain").attr("id", "relig");
  Religions.generate();

  // v1.0 added a legend box
  legend = svg.append("g").attr("id", "legend");
  legend
    .attr("font-family", "Almendra SC")
    .attr("font-size", 13)
    .attr("data-size", 13)
    .attr("data-x", 99)
    .attr("data-y", 93)
    .attr("stroke-width", 2.5)
    .attr("stroke", "#812929")
    .attr("stroke-dasharray", "0 4 10 4")
    .attr("stroke-linecap", "round");

  // v1.0 separated drawBorders fron drawStates()
  stateBorders = borders.append("g").attr("id", "stateBorders");
  provinceBorders = borders.append("g").attr("id", "provinceBorders");
  borders
    .attr("opacity", null)
    .attr("stroke", null)
    .attr("stroke-width", null)
    .attr("stroke-dasharray", null)
    .attr("stroke-linecap", null)
    .attr("filter", null);
  stateBorders
    .attr("opacity", 0.8)
    .attr("stroke", "#56566d")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2")
    .attr("stroke-linecap", "butt");
  provinceBorders
    .attr("opacity", 0.8)
    .attr("stroke", "#56566d")
    .attr("stroke-width", 0.5)
    .attr("stroke-dasharray", "1")
    .attr("stroke-linecap", "butt");

  // v1.0 added state relations, provinces, forms and full names
  provs = viewbox.insert("g", "#borders").attr("id", "provs").attr("opacity", 0.6);
  States.collectStatistics();
  States.generateCampaigns();
  States.generateDiplomacy();
  States.defineStateForms();
  Provinces.generate();
  Provinces.getPoles();
  if (!helpers.layerIsOn("toggleBorders")) $("#borders").fadeOut();
  if (!helpers.layerIsOn("toggleStates")) regions.attr("display", "none").selectAll("path").remove();

  // v1.0 added zones layer
  const zonesLayer = viewbox.insert("g", "#borders").attr("id", "zones").attr("display", "none");
  zonesLayer
    .attr("opacity", 0.6)
    .attr("stroke", null)
    .attr("stroke-width", 0)
    .attr("stroke-dasharray", null)
    .attr("stroke-linecap", "butt");
  Zones.generate();
  if (!markers.selectAll("*").size()) {
    Markers.generate();
    turnButtonOn("toggleMarkers");
  }

  // v1.0 add fogging layer (state focus)
  fogging = viewbox
    .insert("g", "#ruler")
    .attr("id", "fogging-cont")
    .attr("mask", "url(#fog)")
    .append("g")
    .attr("id", "fogging")
    .style("display", "none");
  fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
  defs
    .append("mask")
    .attr("id", "fog")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", "white");

  // v1.0 changes states opacity bask to regions level
  if (statesBody.attr("opacity")) {
    regions.attr("opacity", statesBody.attr("opacity"));
    statesBody.attr("opacity", null);
  }

  // v1.0 changed labels to multi-lined
  labels.selectAll("textPath").each(function () {
    const text = this.textContent;
    const shift = this.getComputedTextLength() / -1.5;
    this.innerHTML = `<tspan x="${shift}">${text}</tspan>`;
  });

  // v1.0 added new biome - Wetland
  biomesData.name.push("Wetland");
  biomesData.color.push("#0b9131");
  biomesData.habitability.push(12);
}
