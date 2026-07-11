import { describe, expect, it } from "vitest";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import {
  getBurgIconStyle,
  getCoastlinePaint,
  getDashArray,
  getEmblemStyle,
  getHeightStyle,
  getIcePaint,
  getLabelStyle,
  getLakePaint,
  getMarkerStyle,
  getPathDashStyles,
  getPathPaintStyles,
  getRiverPaint,
  type LayerStyleSelection,
  parseOptionalNumber
} from "./webglStyleExtractors";

class MockSelection implements LayerStyleSelection {
  constructor(
    private readonly attrs: Record<string, string | null> = {},
    private readonly styles: Record<string, string> = {},
    private readonly children: Record<string, MockSelection> = {},
    private readonly isEmpty = false
  ) {}

  empty(): boolean {
    return this.isEmpty;
  }

  attr(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  style(name: string): string {
    return this.styles[name] ?? "";
  }

  select(selector: string): MockSelection {
    return this.children[selector] ?? new MockSelection({}, {}, {}, true);
  }
}

function createWorldContext(): WorldContext {
  return {
    options: {
      burgs: {
        groups: [
          { name: "town", active: true, order: 1 },
          { name: "city", active: true, order: 2 }
        ]
      }
    },
    style: {
      burgIcons: {
        city: { fill: "#123456", opacity: "0.5", "data-size": "8" }
      },
      anchors: {
        city: { fill: "#abcdef", opacity: "0.75", "font-size": "2" }
      },
      burgLabels: {
        town: { fill: "#654321", opacity: "0.6", "font-size": "5", "data-dy": "-0.8" }
      }
    }
  } as unknown as WorldContext;
}

describe("webgl style extractors", () => {
  it("parses numeric SVG attribute values defensively", () => {
    expect(parseOptionalNumber("1.25px")).toBe(1.25);
    expect(parseOptionalNumber("none")).toBeNull();
    expect(parseOptionalNumber("null")).toBeNull();
    expect(parseOptionalNumber(undefined)).toBeNull();
  });

  it("extracts SVG dash patterns for WebGL border and route paths", () => {
    const viewContext = {
      stateBorders: new MockSelection({ "stroke-dasharray": "2" }),
      provinceBorders: new MockSelection({ "stroke-dasharray": "0 2" }),
      roads: new MockSelection({ "stroke-dasharray": "3, 1" }),
      trails: new MockSelection({ "stroke-dasharray": "none" }),
      searoutes: new MockSelection({}, { "stroke-dasharray": "1 2" })
    } as unknown as ViewContext;

    expect(getPathDashStyles(viewContext)).toEqual({
      stateBorders: [2, 2],
      provinceBorders: [0, 2],
      roads: [3, 1],
      trails: [0, 0],
      searoutes: [1, 2]
    });
    expect(getDashArray(new MockSelection({ "stroke-dasharray": "0 0" }))).toEqual([0, 0]);
    expect(getDashArray(new MockSelection({ "stroke-dasharray": "4 2 1 2" }))).toEqual([4, 2]);
    expect(getPathPaintStyles(viewContext)).toEqual({
      stateBorders: [86, 86, 109, 204],
      provinceBorders: [86, 86, 109, 204],
      roads: [208, 99, 36, 230],
      trails: [208, 99, 36, 230],
      searoutes: [255, 255, 255, 230]
    });
  });

  it("reads river fill and opacity from its SVG layer", () => {
    const viewContext = {
      rivers: new MockSelection({ fill: "#123456", opacity: "0.4" })
    } as unknown as ViewContext;

    expect(getRiverPaint(viewContext).color).toEqual([18, 52, 86, 102]);
  });

  it("reads lake and coastline paint from SVG group attributes", () => {
    const viewContext = {
      lakes: new MockSelection(
        {},
        {},
        {
          "#freshwater": new MockSelection(
            { fill: "#112233", stroke: "#445566", "stroke-width": "1.25" },
            {
              opacity: "0.4"
            }
          )
        }
      ),
      coastline: new MockSelection(
        {},
        {},
        {
          "#sea_island": new MockSelection({ stroke: "#778899", "stroke-width": "2" }, { opacity: "0.5" })
        }
      )
    } as unknown as ViewContext;

    const lakes = getLakePaint(viewContext);
    const coastline = getCoastlinePaint(viewContext);

    expect(lakes.freshwater.fill).toEqual([17, 34, 51, 102]);
    expect(lakes.freshwater.stroke).toEqual([68, 85, 102, 102]);
    expect(lakes.freshwater.strokeWidth).toBe(1.25);
    expect(coastline.sea_island.stroke).toEqual([119, 136, 153, 128]);
    expect(coastline.sea_island.strokeWidth).toBe(2);
  });

  it("reads ice, height, emblem, and marker settings from view layers", () => {
    const viewContext = {
      scale: 3,
      ice: new MockSelection({ fill: "#ffffff", stroke: "#8899aa", "stroke-width": "0.75", opacity: "0.8" }),
      terrs: new MockSelection(
        {},
        {},
        {
          "#landHeights": new MockSelection({ scheme: "bright", opacity: "0.65" }),
          "#oceanHeights": new MockSelection({ "data-render": "1" })
        }
      ),
      emblems: new MockSelection(
        { opacity: "0.7" },
        {},
        {
          "#stateEmblems": new MockSelection({ "data-size": "1.5" }),
          "#provinceEmblems": new MockSelection({ "data-size": "1.2" }),
          "#burgEmblems": new MockSelection({ "data-size": "0.9" })
        }
      ),
      markers: new MockSelection({ pinned: "1", rescale: "0" })
    } as unknown as ViewContext;

    expect(getIcePaint(viewContext)).toMatchObject({ fill: [255, 255, 255, 204], strokeWidth: 0.75 });
    expect(getHeightStyle(viewContext)).toEqual({ scheme: "bright", opacity: 0.65, includeOcean: true });
    expect(getEmblemStyle(viewContext)).toEqual({
      opacity: 0.7,
      sizes: { state: 1.5, province: 1.2, burg: 0.9 }
    });
    expect(getMarkerStyle(viewContext)).toEqual({ pinnedOnly: true, rescale: false, scale: 3 });
  });

  it("merges burg icon and label styles from SVG selections and stored world style", () => {
    const worldContext = createWorldContext();
    const viewContext = {
      labels: new MockSelection({}, {}, { "#states": new MockSelection({ fill: "#111111", "data-size": "30" }) }),
      burgLabels: new MockSelection(),
      burgIcons: new MockSelection(),
      anchors: new MockSelection()
    } as unknown as ViewContext;

    const burgIconStyle = getBurgIconStyle(worldContext, viewContext);
    const labelStyle = getLabelStyle(worldContext, viewContext);

    expect([...burgIconStyle.visibleGroups]).toEqual(["town", "city"]);
    expect(burgIconStyle.burgIcons.city).toEqual({ fill: "#123456", opacity: 0.5, size: 8, icon: "#icon-circle" });
    expect(burgIconStyle.anchors.city).toEqual({ fill: "#abcdef", opacity: 0.75, size: 2, icon: "#icon-anchor" });
    expect(labelStyle.state).toMatchObject({
      fill: "#111111",
      size: 30,
      fontFamily: "Almendra SC",
      haloColor: "white"
    });
    expect(labelStyle.burgLabels.town).toMatchObject({ fill: "#654321", opacity: 0.6, size: 5, dy: -0.8 });
  });

  it("reads font-family and the halo color out of a text-shadow style string", () => {
    const worldContext = createWorldContext();
    const viewContext = {
      labels: new MockSelection(
        {},
        {},
        {
          "#states": new MockSelection({
            "font-family": "Orbitron",
            style: "text-shadow: black 0px 0px 0.1px"
          })
        }
      ),
      burgLabels: new MockSelection(),
      burgIcons: new MockSelection(),
      anchors: new MockSelection()
    } as unknown as ViewContext;

    const labelStyle = getLabelStyle(worldContext, viewContext);
    expect(labelStyle.state).toMatchObject({ fontFamily: "Orbitron", haloColor: "black" });
  });

  it("falls back to the default font/halo when neither a selection nor stored style is available", () => {
    const worldContext = createWorldContext();
    const viewContext = {
      labels: new MockSelection(),
      burgLabels: new MockSelection(),
      burgIcons: new MockSelection(),
      anchors: new MockSelection()
    } as unknown as ViewContext;

    const labelStyle = getLabelStyle(worldContext, viewContext);
    expect(labelStyle.state).toMatchObject({ fontFamily: "Almendra SC", haloColor: "white" });
  });

  it("uses safe fallback paint when optional SVG style attributes are missing", () => {
    const viewContext = {
      scale: 1,
      lakes: new MockSelection({}, {}, { "#freshwater": new MockSelection() }),
      coastline: new MockSelection({}, {}, { "#sea_island": new MockSelection() }),
      ice: new MockSelection(),
      terrs: new MockSelection({}, {}, { "#landHeights": new MockSelection(), "#oceanHeights": new MockSelection() }),
      emblems: new MockSelection(
        {},
        {},
        {
          "#stateEmblems": new MockSelection(),
          "#provinceEmblems": new MockSelection(),
          "#burgEmblems": new MockSelection()
        }
      )
    } as unknown as ViewContext;

    expect(getLakePaint(viewContext).freshwater).toMatchObject({ fill: [166, 193, 253, 128], strokeWidth: 0.7 });
    expect(getCoastlinePaint(viewContext).sea_island).toMatchObject({ strokeWidth: 0.5 });
    expect(getIcePaint(viewContext)).toMatchObject({ strokeWidth: 0.5 });
    expect(getHeightStyle(viewContext)).toEqual({ scheme: "bright", opacity: 1, includeOcean: false });
    expect(getEmblemStyle(viewContext)).toEqual({ opacity: 0.9, sizes: { state: 1, province: 1, burg: 1 } });
  });
});
