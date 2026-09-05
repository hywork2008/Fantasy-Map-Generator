import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setRegionalWaterSchemes,
  setUrbanWaterSystems
} from "../economyContext";
import type { UrbanWaterSystem } from "../generators/urbanWaterTypes";
import { drawWaterSupply } from "./drawWaterSupply";

function system(overrides: Partial<UrbanWaterSystem> & Pick<UrbanWaterSystem, "burgId">): UrbanWaterSystem {
  return {
    hasInheritedRomanWaterworks: false,
    hasUpstreamIntake: false,
    sourceProtection: 0,
    drinkingTreatmentTier: 0,
    treatmentOperationsFunding: 0,
    ...overrides
  } as UrbanWaterSystem;
}

describe("drawWaterSupply", () => {
  let node: SVGGElement;

  beforeEach(() => {
    node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const layer = select(node);
    initEconomyContext({ worldContext, getSvgLayer: () => layer } as unknown as ExtensionAPI);

    // No river cells -> buildInheritedWaterSupplyRoutes()/buildInheritedSewerRoutes() both
    // short-circuit to [] immediately (urbanWaterSupply.ts: `if (!riverCells.length) return [];`),
    // isolating this test's own treatmentPlantMarkup()/protectedIntakeMarkup() additions (§20.5)
    // from the Giant-route geometry machinery neither of these tests exercises.
    worldContext.pack = {
      cells: { i: [0], r: [0], p: [[0, 0]] },
      rivers: [],
      features: [],
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 12, name: "Testburg", state: 1, removed: false }]
    } as unknown as PackedGraph;
    setRegionalWaterSchemes([]);
  });

  afterEach(() => clearEconomyContext());

  it("draws a Tier 1 (slow sand filtration) marker with its funding share in the title", () => {
    setUrbanWaterSystems([
      system({ burgId: 1, drinkingTreatmentTier: 1, treatmentOperationsFunding: 0.7, sourceProtection: 1 })
    ]);

    drawWaterSupply();

    const groups = node.querySelectorAll("g[data-burg-id]");
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelector("text")?.textContent).toBe("🪨");
    expect(groups[0].querySelector("title")?.textContent).toContain("slow sand filtration");
    expect(groups[0].querySelector("title")?.textContent).toContain("70% funded");
  });

  it("draws a distinct icon for Tier 3 (controlled chlorination)", () => {
    setUrbanWaterSystems([
      system({ burgId: 1, drinkingTreatmentTier: 3, treatmentOperationsFunding: 1, sourceProtection: 1 })
    ]);

    drawWaterSupply();

    const groups = node.querySelectorAll("g[data-burg-id]");
    expect(groups[0].querySelector("text")?.textContent).toBe("🧪");
    expect(groups[0].querySelector("title")?.textContent).toContain("controlled chlorination");
  });

  it("fades an underfunded plant's marker instead of hiding it", () => {
    setUrbanWaterSystems([
      system({ burgId: 1, drinkingTreatmentTier: 1, treatmentOperationsFunding: 0, sourceProtection: 1 })
    ]);

    drawWaterSupply();

    const groups = node.querySelectorAll("g[data-burg-id]");
    expect(Number(groups[0].getAttribute("opacity"))).toBeLessThan(1);
    expect(groups[0].querySelector("title")?.textContent).toContain("0% funded");
  });

  it("draws a protected-intake marker for a Burg with sourceProtection past the Tier 1 threshold but no plant yet", () => {
    setUrbanWaterSystems([system({ burgId: 1, hasUpstreamIntake: true, sourceProtection: 0.8 })]);

    drawWaterSupply();

    const groups = node.querySelectorAll("g[data-burg-id]");
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelector("text")?.textContent).toBe("🛡️");
    expect(groups[0].querySelector("title")?.textContent).toContain("protected intake");
    expect(groups[0].querySelector("title")?.textContent).toContain("80%");
  });

  it("draws nothing for a Burg with no upstream intake and no treatment tier", () => {
    setUrbanWaterSystems([system({ burgId: 1, hasUpstreamIntake: false, sourceProtection: 0 })]);

    drawWaterSupply();

    expect(node.querySelectorAll("g[data-burg-id]")).toHaveLength(0);
  });

  it("draws nothing for a Burg below the source-protection threshold, even with an upstream intake", () => {
    setUrbanWaterSystems([system({ burgId: 1, hasUpstreamIntake: true, sourceProtection: 0.3 })]);

    drawWaterSupply();

    expect(node.querySelectorAll("g[data-burg-id]")).toHaveLength(0);
  });
});
