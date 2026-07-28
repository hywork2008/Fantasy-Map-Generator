import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setGoods,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { drawMineralDeposits } from "./drawMineralDeposits";

describe("drawMineralDeposits", () => {
  let node: SVGGElement;

  beforeEach(() => {
    node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const layer = select(node);
    initEconomyContext({ worldContext, getSvgLayer: () => layer } as unknown as ExtensionAPI);

    worldContext.pack = {
      cells: {
        p: [
          [5, 5],
          [15, 15]
        ]
      }
    } as unknown as PackedGraph;

    setGoods([
      { i: 1, name: "Lead", tags: ["ore"], value: 3, unit: "wagon", icon: "good-lead", color: "#6f7285" },
      { i: 2, name: "Silver", tags: ["ore"], value: 20, unit: "bullion", icon: "good-silver", color: "#C0C0C0" }
    ] as never);
  });

  afterEach(() => clearEconomyContext());

  it("draws only discovered deposits, using the primary commodity's Good icon and color", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead", "silver"],
        yields: [],
        richness: 3,
        depth: "shallow",
        accessibility: 1,
        discovered: true,
        exhausted: false
      },
      {
        i: 2,
        districtId: 2,
        cell: 1,
        type: "mvt",
        primaryCommodity: "silver",
        commodities: ["silver"],
        yields: [],
        richness: 2,
        depth: "surface",
        accessibility: 0.2,
        discovered: false,
        exhausted: false
      }
    ] as never);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ] as never);

    drawMineralDeposits();

    const groups = node.querySelectorAll("g[data-i]");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("data-i")).toBe("1");
    expect(groups[0].getAttribute("opacity")).toBe("1");
    expect(groups[0].querySelector("use")?.getAttribute("href")).toBe("#good-lead");
    expect(groups[0].querySelector("circle")?.getAttribute("fill")).toBe("#6f7285");
    expect(groups[0].querySelector("title")?.textContent).toContain("lead, silver");
  });

  it("dims exhausted deposits and inactive-but-discovered deposits differently", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "mvt",
        primaryCommodity: "silver",
        commodities: ["silver"],
        yields: [],
        richness: 1,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: true
      },
      {
        i: 2,
        districtId: 2,
        cell: 1,
        type: "mvt",
        primaryCommodity: "silver",
        commodities: ["silver"],
        yields: [],
        richness: 1,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ] as never);
    setMineOperations([
      {
        i: 2,
        depositId: 2,
        burgId: 1,
        marketId: 1,
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: false
      }
    ] as never);

    drawMineralDeposits();

    const exhausted = node.querySelector('g[data-i="1"]');
    const inactive = node.querySelector('g[data-i="2"]');
    expect(exhausted?.getAttribute("opacity")).toBe("0.35");
    expect(inactive?.getAttribute("opacity")).toBe("0.6");
    expect(exhausted?.querySelector("title")?.textContent).toContain("exhausted");
    expect(inactive?.querySelector("title")?.textContent).toContain("inactive");
  });
});
