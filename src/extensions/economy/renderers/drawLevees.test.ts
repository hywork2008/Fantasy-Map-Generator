import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setLeveeSites, setLevees } from "../economyContext";
import { drawLevees } from "./drawLevees";

describe("drawLevees", () => {
  let node: SVGGElement;

  beforeEach(() => {
    node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const layer = select(node);
    initEconomyContext({ worldContext, getSvgLayer: () => layer } as unknown as ExtensionAPI);
    worldContext.pack = {
      cells: {
        p: {
          0: [0, 0],
          1: [10, 0],
          2: [20, 0],
          3: [30, 0],
          9: [90, 90]
        }
      }
    } as typeof worldContext.pack;

    setLeveeSites([
      { i: 1, riverId: 1, cells: [0, 1, 2], x: 10, y: 0, meanFloodHazard: 0.6, qualityScore: 0.5 },
      { i: 2, riverId: 2, cells: [3], x: 30, y: 0, meanFloodHazard: 0.5, qualityScore: 0.3 }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("draws an active levee as a polyline through its reach cells, with protection% and cell count in the title", () => {
    setLevees([
      {
        i: 1,
        siteId: 1,
        stateId: 1,
        burgId: 1,
        active: true,
        utilization: 1,
        lastFundedYear: 1890,
        protectionRating: 0.4
      }
    ]);

    drawLevees();

    const groups = node.querySelectorAll("g[data-i]");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("opacity")).toBe("1");
    expect(groups[0].querySelector("polyline")?.getAttribute("points")).toBe("0,0 10,0 20,0");
    expect(groups[0].querySelector("title")?.textContent).toContain("40% flood protection");
    expect(groups[0].querySelector("title")?.textContent).toContain("over 3 cells");
  });

  it("dims an inactive levee", () => {
    setLevees([
      {
        i: 1,
        siteId: 1,
        stateId: 1,
        burgId: 1,
        active: false,
        utilization: 0,
        lastFundedYear: 1889,
        protectionRating: 0,
        lastFailureReason: "fundingCut"
      }
    ]);

    drawLevees();

    const group = node.querySelector('g[data-i="1"]');
    expect(group?.getAttribute("opacity")).toBe("0.45");
    expect(group?.querySelector("title")?.textContent).toContain("idle");
  });

  it("skips a levee whose site no longer exists", () => {
    setLevees([
      {
        i: 9,
        siteId: 999,
        stateId: 1,
        burgId: 1,
        active: true,
        utilization: 1,
        lastFundedYear: 1890,
        protectionRating: 0.5
      }
    ]);

    drawLevees();

    expect(node.querySelectorAll("g[data-i]")).toHaveLength(0);
  });

  it("skips a reach with fewer than two resolvable cell points", () => {
    setLevees([
      {
        i: 1,
        siteId: 2,
        stateId: 1,
        burgId: 1,
        active: true,
        utilization: 1,
        lastFundedYear: 1890,
        protectionRating: 0.3
      }
    ]);

    drawLevees();

    expect(node.querySelectorAll("g[data-i]")).toHaveLength(0);
  });
});
