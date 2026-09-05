import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setDams,
  setGasPowerStations,
  setPowerStations
} from "../economyContext";
import type { Dam } from "../generators/damTypes";
import type { GasPowerStation, PowerStation } from "../generators/electricalTypes";
import { drawPowerGrid } from "./drawPowerGrid";

function station(overrides: Partial<PowerStation> & Pick<PowerStation, "burgId" | "stateId">): PowerStation {
  return {
    role: "service",
    active: true,
    utilization: 1,
    documentedRuns: 5,
    lastFundedYear: 1889,
    generationCapacity: 2,
    ...overrides
  };
}

function gasStation(
  overrides: Partial<GasPowerStation> & Pick<GasPowerStation, "burgId" | "stateId">
): GasPowerStation {
  return {
    role: "service",
    active: true,
    utilization: 1,
    documentedRuns: 5,
    lastFundedYear: 1889,
    generationCapacity: 2,
    ...overrides
  };
}

function dam(overrides: Partial<Dam> & Pick<Dam, "burgId" | "stateId">): Dam {
  return {
    i: 1,
    siteId: 1,
    role: "service",
    active: true,
    utilization: 1,
    documentedRuns: 5,
    lastFundedYear: 1889,
    electrified: true,
    generationCapacity: 2,
    floodProtectionRating: 0.5,
    ...overrides
  };
}

describe("drawPowerGrid", () => {
  let node: SVGGElement;

  beforeEach(() => {
    node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const layer = select(node);
    initEconomyContext({ worldContext, getSvgLayer: () => layer } as unknown as ExtensionAPI);
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", capital: 1, removed: false }],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, x: 0, y: 0, name: "Capital City", removed: false },
        { i: 2, state: 1, x: 10, y: 10, name: "Coaltown", removed: false }
      ]
    } as unknown as PackedGraph;
    setPowerStations([]);
    setGasPowerStations([]);
    setDams([]);
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("draws a station marker at an active PowerStation's Burg", () => {
    setPowerStations([station({ burgId: 2, stateId: 1 })]);

    drawPowerGrid();

    const groups = node.querySelectorAll('g[data-burg-id="2"]');
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelector("text")?.textContent).toBe("⚡");
    expect(groups[0].querySelector("title")?.textContent).toContain("coal-fired power station");
    expect(groups[0].querySelector("title")?.textContent).toContain("in service");
  });

  it("dims an idle PowerStation's marker instead of hiding it", () => {
    setPowerStations([station({ burgId: 2, stateId: 1, active: false })]);

    drawPowerGrid();

    const group = node.querySelector('g[data-burg-id="2"]');
    expect(Number(group?.getAttribute("opacity"))).toBeLessThan(1);
    expect(group?.querySelector("title")?.textContent).toContain("idle");
  });

  it("draws a distinct gas marker at an active GasPowerStation's Burg", () => {
    setGasPowerStations([gasStation({ burgId: 2, stateId: 1 })]);

    drawPowerGrid();

    const group = node.querySelector('g[data-burg-id="2"]');
    expect(group?.querySelector("text")?.textContent).toBe("🔥⚡");
    expect(group?.querySelector("title")?.textContent).toContain("gas-fired power station");
  });

  it("draws a distinct hydro marker for an electrified Dam", () => {
    setDams([dam({ burgId: 2, stateId: 1 })]);

    drawPowerGrid();

    const group = node.querySelector('g[data-burg-id="2"]');
    expect(group?.querySelector("text")?.textContent).toBe("💧⚡");
    expect(group?.querySelector("title")?.textContent).toContain("hydroelectric");
  });

  it("ignores an unelectrified Dam entirely", () => {
    setDams([dam({ burgId: 2, stateId: 1, electrified: false })]);

    drawPowerGrid();

    expect(node.querySelectorAll("g[data-burg-id]")).toHaveLength(0);
  });

  it("draws no transmission line before the State's powerGrid technology is adopted", () => {
    setPowerStations([station({ burgId: 2, stateId: 1 })]);
    setTechnologyProgressForTests([]); // powerGrid stays locked

    drawPowerGrid();

    expect(node.querySelectorAll("path")).toHaveLength(0);
    expect(node.querySelectorAll("g[data-hub-burg-id]")).toHaveLength(0);
  });

  it("draws a transmission line and grid hub once powerGrid is adopted", () => {
    setPowerStations([station({ burgId: 2, stateId: 1 })]);
    setTechnologyProgressForTests([
      { technologyId: "powerGrid", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);

    drawPowerGrid();

    const line = node.querySelector('g[data-source-burg-id="2"][data-hub-burg-id="1"] path');
    expect(line).not.toBeNull();
    expect(line?.getAttribute("d")).toBe("M 10,10 L 0,0");
    expect(node.querySelector('g[data-source-burg-id="2"]')?.querySelector("title")?.textContent).toContain(
      "Transmission line: Coaltown → Capital City"
    );

    const hub = node.querySelector('g[data-hub-burg-id="1"]:not([data-source-burg-id])');
    expect(hub).not.toBeNull();
    expect(hub?.querySelector("title")?.textContent).toContain("Volta power grid hub");
  });

  it("draws no feeder line for the capital's own generation site, but still marks it a hub", () => {
    setPowerStations([station({ burgId: 1, stateId: 1 })]);
    setTechnologyProgressForTests([
      { technologyId: "powerGrid", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);

    drawPowerGrid();

    expect(node.querySelectorAll("g[data-source-burg-id]")).toHaveLength(0);
    expect(node.querySelector('g[data-hub-burg-id="1"]:not([data-source-burg-id])')).not.toBeNull();
  });
});
