import type { AutoUpdateMigrationContext } from "./types";

export function migrateToV1_1_0({ pack, api, helpers }: AutoUpdateMigrationContext): void {
  const { Religions, Features } = api;

  // v1.0 code had a bug with religion layer id
  if (!relig.size()) relig = viewbox.insert("g", "#terrain").attr("id", "relig");

  // v1.0 had Sympathy status then relaced with Friendly
  for (const s of pack.states) {
    if (!s.diplomacy) continue;
    s.diplomacy = s.diplomacy.map(r => (r === "Sympathy" ? "Friendly" : r));
  }

  // labels should be toggled via style attribute, so remove display attribute
  labels.attr("display", null);

  // v1.0 added religions heirarchy tree
  if (pack.religions[1] && !pack.religions[1].code) {
    pack.religions
      .filter(r => r.i)
      .forEach(r => {
        r.origin = 0;
        r.code = r.name.slice(0, 2);
      });
  }

  if (!document.getElementById("freshwater")) {
    lakes.append("g").attr("id", "freshwater");
    lakes
      .select("#freshwater")
      .attr("opacity", 0.5)
      .attr("fill", "#a6c1fd")
      .attr("stroke", "#5f799d")
      .attr("stroke-width", 0.7)
      .attr("filter", null);
  }

  if (!document.getElementById("salt")) {
    lakes.append("g").attr("id", "salt");
    lakes
      .select("#salt")
      .attr("opacity", 0.5)
      .attr("fill", "#409b8a")
      .attr("stroke", "#388985")
      .attr("stroke-width", 0.7)
      .attr("filter", null);
  }

  // v1.1 added new lake and coast groups
  if (!document.getElementById("sinkhole")) {
    lakes.append("g").attr("id", "sinkhole");
    lakes.append("g").attr("id", "frozen");
    lakes.append("g").attr("id", "lava");
    lakes
      .select("#sinkhole")
      .attr("opacity", 1)
      .attr("fill", "#5bc9fd")
      .attr("stroke", "#53a3b0")
      .attr("stroke-width", 0.7)
      .attr("filter", null);
    lakes
      .select("#frozen")
      .attr("opacity", 0.95)
      .attr("fill", "#cdd4e7")
      .attr("stroke", "#cfe0eb")
      .attr("stroke-width", 0)
      .attr("filter", null);
    lakes
      .select("#lava")
      .attr("opacity", 0.7)
      .attr("fill", "#90270d")
      .attr("stroke", "#f93e0c")
      .attr("stroke-width", 2)
      .attr("filter", "url(#crumpled)");

    coastline.append("g").attr("id", "sea_island");
    coastline.append("g").attr("id", "lake_island");
    coastline
      .select("#sea_island")
      .attr("opacity", 0.5)
      .attr("stroke", "#1f3846")
      .attr("stroke-width", 0.7)
      .attr("filter", "url(#dropShadow)");
    coastline
      .select("#lake_island")
      .attr("opacity", 1)
      .attr("stroke", "#7c8eaf")
      .attr("stroke-width", 0.35)
      .attr("filter", null);
  }

  // v1.1 features stores more data
  defs.select("#land").selectAll("path").remove();
  defs.select("#water").selectAll("path").remove();
  coastline.selectAll("path").remove();
  lakes.selectAll("path").remove();

  Features.markupPack();
  helpers.createDefaultRuler();
}
