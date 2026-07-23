import { afterEach, describe, expect, it } from "vitest";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { presentationData } from "../../runtime/presentationData";
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
  parseDashArray,
  parseOptionalNumber
} from "./webglStyleExtractors";

function createWorldContext(): WorldContext {
  return {
    options: {
      burgs: {
        groups: [
          { name: "town", active: true, order: 1 },
          { name: "city", active: true, order: 2 }
        ]
      }
    }
  } as unknown as WorldContext;
}

function withStyles(styles: typeof presentationData.styles, run: () => void): void {
  const saved = presentationData.styles;
  presentationData.styles = styles;
  try {
    run();
  } finally {
    presentationData.styles = saved;
  }
}

describe("webgl style extractors", () => {
  afterEach(() => {
    presentationData.styles = {};
  });

  it("reads styles only from PresentationData and ignores absent SVG", () => {
    withStyles(
      {
        "#rivers": { fill: "#abcdef", opacity: 0.25 },
        "#stateBorders": { stroke: "#123456", opacity: 0.5, "stroke-dasharray": "6 2" }
      },
      () => {
        const viewContext = {} as unknown as ViewContext;
        expect(getRiverPaint(viewContext).color).toEqual([171, 205, 239, 64]);
        expect(getPathDashStyles(viewContext).stateBorders).toEqual([6, 2]);
        expect(getPathPaintStyles(viewContext).stateBorders).toEqual([18, 52, 86, 128]);
      }
    );
  });

  it("uses the fallback for a missing burg group when PresentationData has no record", () => {
    const worldContext = createWorldContext();
    const viewContext = { scale: 1 } as unknown as ViewContext;

    expect(getBurgIconStyle(worldContext, viewContext).burgIcons.city).toEqual({
      fill: "#3e3e4b",
      opacity: 1,
      size: 5,
      icon: "#icon-circle"
    });
  });

  it("parses numeric attribute values defensively", () => {
    expect(parseOptionalNumber("1.25px")).toBe(1.25);
    expect(parseOptionalNumber("none")).toBeNull();
    expect(parseOptionalNumber("null")).toBeNull();
    expect(parseOptionalNumber(undefined)).toBeNull();
  });

  it("extracts dash patterns for WebGL border and route paths from PresentationData", () => {
    withStyles(
      {
        "#stateBorders": { "stroke-dasharray": "2", stroke: "#56566d", opacity: 0.8 },
        "#provinceBorders": { "stroke-dasharray": "0 2", stroke: "#56566d", opacity: 0.8 },
        "#roads": { "stroke-dasharray": "3, 1", stroke: "#d06324", opacity: 0.9 },
        "#trails": { "stroke-dasharray": "none", stroke: "#d06324", opacity: 0.9 },
        "#searoutes": { "stroke-dasharray": "1 2", stroke: "#ffffff", opacity: 0.9 }
      },
      () => {
        expect(getPathDashStyles()).toEqual({
          stateBorders: [2, 2],
          provinceBorders: [0, 2],
          roads: [3, 1],
          trails: [0, 0],
          searoutes: [1, 2]
        });
        expect(getDashArray("#stateBorders")).toEqual([2, 2]);
        expect(parseDashArray("0 0")).toEqual([0, 0]);
        expect(parseDashArray("4 2 1 2")).toEqual([4, 2]);
        expect(getPathPaintStyles()).toEqual({
          stateBorders: [86, 86, 109, 204],
          provinceBorders: [86, 86, 109, 204],
          roads: [208, 99, 36, 230],
          trails: [208, 99, 36, 230],
          searoutes: [255, 255, 255, 230]
        });
      }
    );
  });

  it("reads river fill and opacity from PresentationData", () => {
    withStyles({ "#rivers": { fill: "#123456", opacity: "0.4" } }, () => {
      expect(getRiverPaint().color).toEqual([18, 52, 86, 102]);
    });
  });

  it("reads lake and coastline paint from PresentationData", () => {
    withStyles(
      {
        "#freshwater": { fill: "#112233", stroke: "#445566", "stroke-width": "1.25", opacity: "0.4" },
        "#sea_island": { stroke: "#778899", "stroke-width": "2", opacity: "0.5" }
      },
      () => {
        const lakes = getLakePaint();
        const coastline = getCoastlinePaint();

        expect(lakes.freshwater.fill).toEqual([17, 34, 51, 102]);
        expect(lakes.freshwater.stroke).toEqual([68, 85, 102, 102]);
        expect(lakes.freshwater.strokeWidth).toBe(1.25);
        expect(coastline.sea_island.stroke).toEqual([119, 136, 153, 128]);
        expect(coastline.sea_island.strokeWidth).toBe(2);
      }
    );
  });

  it("reads ice, height, emblem, and marker settings from PresentationData", () => {
    withStyles(
      {
        "#ice": { fill: "#ffffff", stroke: "#8899aa", "stroke-width": "0.75", opacity: "0.8" },
        "#terrs > #landHeights": { scheme: "bright", opacity: "0.65" },
        "#terrs > #oceanHeights": { "data-render": "1" },
        "#emblems": { opacity: "0.7" },
        "#emblems > #stateEmblems": { "data-size": "1.5" },
        "#emblems > #provinceEmblems": { "data-size": "1.2" },
        "#emblems > #burgEmblems": { "data-size": "0.9" },
        "#markers": { pinned: "1", rescale: "0" }
      },
      () => {
        const viewContext = { scale: 3 } as unknown as ViewContext;
        expect(getIcePaint()).toMatchObject({ fill: [255, 255, 255, 204], strokeWidth: 0.75 });
        expect(getHeightStyle()).toEqual({ scheme: "bright", opacity: 0.65, includeOcean: true });
        expect(getEmblemStyle()).toEqual({
          opacity: 0.7,
          sizes: { state: 1.5, province: 1.2, burg: 0.9 }
        });
        expect(getMarkerStyle(viewContext)).toEqual({ pinnedOnly: true, rescale: false, scale: 3 });
      }
    );
  });

  it("reads burg icon and label styles from PresentationData", () => {
    withStyles(
      {
        "#burgIcons > g#city": { fill: "#123456", opacity: 0.5, "font-size": 1.5 },
        "#anchors > g#city": { fill: "#abcdef", opacity: 0.75, "font-size": 1.5 },
        "#burgLabels > g#town": { fill: "#654321", opacity: "0.6", "font-size": "5", "data-dy": "-0.8" },
        "#labels > #states": { fill: "#111111", "data-size": "30" }
      },
      () => {
        const worldContext = createWorldContext();
        const viewContext = { scale: 1 } as unknown as ViewContext;
        const burgIconStyle = getBurgIconStyle(worldContext, viewContext);
        const labelStyle = getLabelStyle(worldContext, viewContext);

        expect([...burgIconStyle.visibleGroups]).toEqual(["town", "city"]);
        expect(burgIconStyle.burgIcons.city).toEqual({
          fill: "#123456",
          opacity: 0.5,
          size: 1.5,
          icon: "#icon-circle"
        });
        expect(burgIconStyle.anchors.city).toEqual({
          fill: "#abcdef",
          opacity: 0.75,
          size: 1.5,
          icon: "#icon-anchor"
        });
        expect(labelStyle.state).toMatchObject({
          fill: "#111111",
          size: 30,
          fontFamily: "Almendra SC",
          haloColor: "white"
        });
        expect(labelStyle.burgLabels.town).toMatchObject({ fill: "#654321", opacity: 0.6, size: 5, dy: -0.8 });
      }
    );
  });

  it("reads font-family and the halo color out of a text-shadow style string", () => {
    withStyles(
      {
        "#labels > #states": {
          "font-family": "Orbitron",
          style: "text-shadow: black 0px 0px 0.1px"
        }
      },
      () => {
        const worldContext = createWorldContext();
        const viewContext = { scale: 1 } as unknown as ViewContext;
        const labelStyle = getLabelStyle(worldContext, viewContext);
        expect(labelStyle.state).toMatchObject({ fontFamily: "Orbitron", haloColor: "black" });
      }
    );
  });

  it("falls back to the default font/halo when no stored style is available", () => {
    const worldContext = createWorldContext();
    const viewContext = { scale: 1 } as unknown as ViewContext;
    const labelStyle = getLabelStyle(worldContext, viewContext);
    expect(labelStyle.state).toMatchObject({ fontFamily: "Almendra SC", haloColor: "white" });
  });

  it("uses safe fallback paint when PresentationData has no entries", () => {
    expect(getLakePaint().freshwater).toMatchObject({ fill: [166, 193, 253, 128], strokeWidth: 0.7 });
    expect(getCoastlinePaint().sea_island).toMatchObject({ strokeWidth: 0.5 });
    expect(getIcePaint()).toMatchObject({ strokeWidth: 0.5 });
    expect(getHeightStyle()).toEqual({ scheme: "bright", opacity: 1, includeOcean: false });
    expect(getEmblemStyle()).toEqual({ opacity: 0.9, sizes: { state: 1, province: 1, burg: 1 } });
  });
});
