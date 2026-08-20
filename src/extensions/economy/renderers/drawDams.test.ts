import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setDamSites, setDams } from "../economyContext";
import { drawDams } from "./drawDams";

describe("drawDams", () => {
  let node: SVGGElement;

  beforeEach(() => {
    node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const layer = select(node);
    initEconomyContext({ worldContext, getSvgLayer: () => layer } as unknown as ExtensionAPI);

    setDamSites([
      {
        i: 1,
        cell: 0,
        x: 5,
        y: 5,
        riverId: 1,
        dischargePotential: 0.6,
        headPotential: 0.8,
        qualityScore: 0.7,
        downstreamCells: []
      },
      {
        i: 2,
        cell: 1,
        x: 15,
        y: 15,
        riverId: 1,
        dischargePotential: 0.3,
        headPotential: 0.2,
        qualityScore: 0.25,
        downstreamCells: []
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("draws an electrified dam with a distinct icon and generation figure in its title", () => {
    setDams([
      {
        i: 1,
        siteId: 1,
        stateId: 1,
        burgId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 5,
        lastFundedYear: 1890,
        electrified: true,
        generationCapacity: 1.2,
        floodProtectionRating: 0.5
      }
    ]);

    drawDams();

    const groups = node.querySelectorAll("g[data-i]");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("opacity")).toBe("1");
    expect(groups[0].querySelector("text")?.textContent).toBe("🌊⚡");
    expect(groups[0].querySelector("title")?.textContent).toContain("50% flood protection");
    expect(groups[0].querySelector("title")?.textContent).toContain("1.2 generation");
  });

  it("dims a trial dam and dims an inactive dam further, neither showing the electrified badge", () => {
    setDams([
      {
        i: 1,
        siteId: 1,
        stateId: 1,
        burgId: 1,
        role: "trial",
        active: true,
        utilization: 0.6,
        documentedRuns: 1,
        lastFundedYear: 1890,
        electrified: false,
        generationCapacity: 0,
        floodProtectionRating: 0.2
      },
      {
        i: 2,
        siteId: 2,
        stateId: 1,
        burgId: 1,
        role: "trial",
        active: false,
        utilization: 0,
        documentedRuns: 0,
        lastFundedYear: 1889,
        electrified: false,
        generationCapacity: 0,
        floodProtectionRating: 0,
        lastFailureReason: "fundingCut"
      }
    ]);

    drawDams();

    const trial = node.querySelector('g[data-i="1"]');
    const idle = node.querySelector('g[data-i="2"]');
    expect(trial?.getAttribute("opacity")).toBe("0.7");
    expect(idle?.getAttribute("opacity")).toBe("0.45");
    expect(trial?.querySelector("text")?.textContent).toBe("🌊");
    expect(idle?.querySelector("title")?.textContent).toContain("idle");
  });

  it("skips a dam whose site no longer exists", () => {
    setDams([
      {
        i: 9,
        siteId: 999,
        stateId: 1,
        burgId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 5,
        lastFundedYear: 1890,
        electrified: false,
        generationCapacity: 0,
        floodProtectionRating: 0.5
      }
    ]);

    drawDams();

    expect(node.querySelectorAll("g[data-i]")).toHaveLength(0);
  });
});
