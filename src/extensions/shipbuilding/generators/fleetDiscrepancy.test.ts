import { beforeEach, describe, expect, it } from "vitest";
import { appServices } from "../../../context/appServices";
import { viewContext } from "../../../context/viewContext";
import { worldContext } from "../../../context/worldContext";
import { createDefaultBiomesData } from "../../../data/biomeCatalog";
import { Military } from "../../../generators/military-generator";
import type { Burg, State } from "../../../types/models";
import { init as initShipbuilding } from "../index";
import { clearShipbuildingContext } from "../shipbuildingContext";
import { seedInitialFleets } from "./initialFleet";
import { clearShipyardQueues, getHulls } from "./shipyardQueue";

describe("fleet discrepancy test", () => {
  let mockApi: any;

  beforeEach(() => {
    clearShipyardQueues();
    clearShipbuildingContext();

    mockApi = new Proxy(
      {
        isExtensionEnabled: () => true,
        layerIsOn: () => false,
        worldContext
      },
      {
        get(target, prop) {
          if (prop in target) return (target as any)[prop];
          return () => () => {};
        }
      }
    );
    initShipbuilding(mockApi);
  });

  it("checks discrepancy between Vessel assets navy hulls and Military Overview fleet units", () => {
    // Setup pack with 1 state and 1 port burg
    const pack: any = {
      cells: {
        i: [0, 1, 2],
        h: [0, 50, 0], // cell 1 is land, cell 2 is ocean
        c: [[], [2], [1]],
        state: [0, 1, 0],
        province: [0, 1, 0],
        pop: [0, 1000, 0],
        maleAdults: [0, 220, 0],
        femaleAdults: [0, 230, 0],
        biomeCode: [0, 5, 0],
        culture: [0, 1, 0],
        religion: [0, 1, 0],
        f: [0, 1, 2], // 2 is ocean waterbody
        haven: [0, 2, 0], // cell 1 has ocean haven at cell 2
        burg: [0, 1, 0],
        p: [
          [0, 0],
          [10, 10],
          [20, 20]
        ],
        fl: [0, 0, 0],
        t: [0, 0, 0]
      },
      burgs: [
        {} as Burg,
        {
          i: 1,
          name: "PortBurg",
          state: 1,
          cell: 1,
          x: 10,
          y: 10,
          population: 30, // 30k urban population
          port: 1,
          capital: 1,
          citadel: 1,
          culture: 1
        } as Burg
      ],
      states: [
        {} as State,
        {
          i: 1,
          name: "State1",
          fullName: "State 1",
          color: "#ff0000",
          culture: 1,
          capital: 1,
          center: 1,
          cells: 1,
          area: 100,
          urban: 30,
          rural: 10,
          military: [],
          alert: 1,
          expansionism: 1,
          formName: "Kingdom",
          diplomacy: ["x", "x"],
          neighbors: [],
          campaigns: [],
          type: "Naval"
        } as State
      ],
      cultures: [{}, { i: 1, name: "NavalCulture", type: "Naval" }],
      religions: [{}, { i: 1, name: "Rel" }],
      provinces: [{}, { i: 1, state: 1, center: 1, burg: 1 }],
      features: [{}, { i: 1, type: "island" }, { i: 2, type: "ocean" }]
    };

    worldContext.pack = pack;
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.notes = [];
    worldContext.biomesData = createDefaultBiomesData();
    worldContext.options = {
      year: 1000,
      military: undefined,
      historicalPeriod: "ageOfExploration"
    } as any;

    const worldState = { pack, options: worldContext.options, biomesData: worldContext.biomesData } as any;

    // Step 1: Run Military.generate (Stage 18)
    Military.generate(worldContext, viewContext, appServices, worldState);

    // Step 2: Run seedInitialFleets (MapReadyTask)
    seedInitialFleets([], new Map());

    const hulls = getHulls();
    const stateNavyHulls = hulls.filter(h => h.owner === "state" && h.ownerId === 1);
    const totalFleetUnits = pack.states[1].military.reduce((sum: number, r: any) => sum + (r.u.fleet || 0), 0);

    expect(totalFleetUnits).toBe(stateNavyHulls.length);
    expect(totalFleetUnits).toBe(6);

    // Scenario 2: One hull goes into maintenance
    const firstNavyHull = stateNavyHulls[0];
    firstNavyHull.status = "maintenance";
    Military.refreshFleetCapacity(1);

    const fleetAfterMaint = pack.states[1].military.reduce((sum: number, r: any) => sum + (r.u.fleet || 0), 0);
    expect(fleetAfterMaint).toBe(5);
    expect(pack.states[1].military.find((r: any) => r.n === 1).plannedU.fleet).toBe(6);

    // Scenario 3: Hull returns from maintenance
    firstNavyHull.status = "voyage";
    Military.refreshFleetCapacity(1);

    const fleetAfterRepair = pack.states[1].military.reduce((sum: number, r: any) => sum + (r.u.fleet || 0), 0);
    expect(fleetAfterRepair).toBe(6);
    expect(pack.states[1].military.find((r: any) => r.n === 1).plannedU?.fleet).toBeUndefined();

    // Scenario 4: Military.generate is rerun (Recalculate military)
    Military.generate(worldContext, viewContext, appServices, worldState);
    const fleetAfterRecalc = pack.states[1].military.reduce((sum: number, r: any) => sum + (r.u.fleet || 0), 0);
    expect(fleetAfterRecalc).toBe(6);
  });
});
