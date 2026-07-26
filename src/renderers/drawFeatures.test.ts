import { select } from "d3";
import { describe, expect, it } from "vitest";
import type { SvgGroup } from "../context/viewContext";
import { renderFeatureGroups } from "./draw-features";

describe("renderFeatureGroups", () => {
  it("creates a group declared by canonical feature data and replaces its projected uses", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const layer = select(svg).append("g") as SvgGroup;
    layer.append("g").attr("id", "freshwater").append("use").attr("data-f", "stale");

    renderFeatureGroups(layer, {
      freshwater: ['<use data-f="1"></use>'],
      volcanic: ['<use data-f="2"></use>']
    });

    expect(
      layer
        .selectAll("g")
        .nodes()
        .map(node => node.id)
    ).toEqual(["freshwater", "volcanic"]);
    expect(layer.select("#freshwater use").attr("data-f")).toBe("1");
    expect(layer.select("#volcanic use").attr("data-f")).toBe("2");
  });

  it("preserves a coastline hit target alongside its visible feature use", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const layer = select(svg).append("g") as SvgGroup;

    renderFeatureGroups(layer, {
      sea_island: [
        '<use href="#feature_2" data-f="2"></use>',
        '<use href="#feature_2" data-f="2" class="coastline-hit" pointer-events="stroke"></use>'
      ]
    });

    const hitTarget = layer.select("#sea_island use.coastline-hit");
    expect(hitTarget.attr("data-f")).toBe("2");
    expect(hitTarget.attr("pointer-events")).toBe("stroke");
  });
});
