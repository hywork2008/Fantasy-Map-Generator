import { beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { collectTechnologyOverviewRows, summarizeAtmosphericSteamPumping } from "./technologyOverview";
import { explainTechnologyGate, resetTechnologyProgress, setTechnologyProgressForTests } from "./technologyProgress";
import { createEmptyTechnologySimulationState } from "./technologyTypes";

function installWorld(): void {
  worldContext.options = { ...(worldContext.options ?? {}), gunpowderEraEnabled: true } as typeof worldContext.options;
  worldContext.pack = {
    ...(worldContext.pack ?? {}),
    states: [
      0,
      { i: 1, name: "Coast", removed: false, capital: 1 },
      { i: 2, name: "Inland", removed: false, capital: 2 }
    ],
    burgs: [
      0,
      { i: 1, state: 1, x: 10, y: 20, capital: 1, removed: false },
      { i: 2, state: 2, x: 30, y: 40, capital: 1, removed: false }
    ]
  } as typeof worldContext.pack;
  simulationContext.currentYear = 1200;
  simulationContext.technology = createEmptyTechnologySimulationState();
}

describe("technologyOverview", () => {
  beforeEach(() => {
    installWorld();
    resetTechnologyProgress();
  });

  it("emits one row per live state and active technology, including locked steam", () => {
    const rows = collectTechnologyOverviewRows();
    const steam = rows.filter(row => row.technologyId === "atmosphericSteamPumping");
    expect(steam).toHaveLength(2);
    expect(steam.every(row => row.stage === "locked")).toBe(true);
    expect(rows.find(row => row.stateId === 1 && row.technologyId === "threeFieldAgriculture")?.stage).toBe("diffused");
  });

  it("summarizes atmospheric steam pumping stages and keeps capital zoom points", () => {
    setTechnologyProgressForTests([
      {
        technologyId: "atmosphericSteamPumping",
        scope: "state",
        ownerId: 1,
        stage: "demonstrated",
        demonstratedYear: 1210,
        discoveredYear: 1205,
        diffusion: 0
      }
    ]);
    const rows = collectTechnologyOverviewRows();
    const coastSteam = rows.find(row => row.stateId === 1 && row.technologyId === "atmosphericSteamPumping");
    expect(coastSteam).toMatchObject({
      stage: "demonstrated",
      discoveredYear: 1205,
      demonstratedYear: 1210,
      capitalX: 10,
      capitalY: 20
    });
    expect(summarizeAtmosphericSteamPumping(rows)).toEqual({
      states: 2,
      known: 1,
      demonstrated: 1,
      adopted: 0,
      diffused: 0
    });
  });

  it("explains why a collected atmospheric steam pumping row is stuck", () => {
    const steam = collectTechnologyOverviewRows().find(row => row.technologyId === "atmosphericSteamPumping");
    expect(steam).toBeTruthy();
    if (!steam) return;
    const lines = explainTechnologyGate(steam.stateId, steam.technologyId);
    expect(lines[0]).toMatch(/^hint is /);
    expect(lines.some(line => line.startsWith("unmet known min"))).toBe(true);
  });
});
