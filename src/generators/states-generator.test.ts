import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import {
  getDefaultMaxWarDisparityRatio,
  getDefaultMaxWarDisparityRatioEnabled,
  useOptionsState
} from "../store/optionsState";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";
import { States } from "./states-generator";

describe("States.expandStates", () => {
  it("does not annex high-danger land under standard flood-fill", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    useOptionsState.setState({ initialSettlementPattern: "standard", growthRate: 100, statesGrowthRate: 1 });

    try {
      const danger = new Uint8Array([0, STATE_EXPAND_DANGER_BAN, 0]);
      const worldContext = {
        options: { initialSettlementPattern: "standard" },
        biomesData: { cost: new Uint16Array([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2]),
            state: new Uint16Array(3),
            h: new Uint8Array([25, 25, 25]),
            c: [[1], [0, 2], [1]],
            biomeCode: new Uint8Array([0, 0, 0]),
            culture: new Uint16Array([1, 1, 1]),
            pop: new Float32Array([10, 5, 5]),
            burg: new Uint16Array([1, 0, 0]),
            s: new Uint16Array([20, 20, 20]),
            f: new Uint16Array([0, 0, 0]),
            r: new Uint16Array(3),
            fl: new Uint16Array(3),
            t: new Int8Array([2, 2, 2]),
            danger,
            routes: {},
            p: [
              [0, 0],
              [1, 0],
              [2, 0]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 5, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state[0]).toBe(1);
      // Cell 1 is banned by danger; flood cannot claim it or leapfrog to cell 2 via it.
      expect(worldContext.pack.cells.state[1]).toBe(0);
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });

  it("does not create a Cold Desert administrative corridor without an initial movement route", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    // Without an initial route, both the distant burg and the intervening
    // Cold Desert remain unclaimed rather than forming a State-only corridor.
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 1, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2, 3, 4, 5, 6]),
            state: new Uint16Array(7),
            h: new Uint8Array([25, 25, 25, 25, 25, 25, 25]),
            c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5]],
            biomeCode: new Uint8Array([0, 0, 0, 0, 0, 0, 0]),
            culture: new Uint16Array([1, 1, 1, 1, 1, 1, 1]),
            pop: new Float32Array([10, 0, 0, 0, 0, 0, 10]),
            burg: new Uint16Array([1, 0, 0, 0, 0, 0, 2]),
            s: new Uint16Array([10, 10, 10, 10, 10, 10, 10]),
            f: new Uint16Array([0, 0, 0, 0, 0, 0, 0]),
            r: new Uint16Array(7),
            fl: new Uint16Array(7),
            t: new Int8Array([2, 2, 2, 2, 2, 2, 2]),
            routes: {},
            p: [
              [0, 0],
              [1, 0],
              [2, 0],
              [3, 0],
              [4, 0],
              [5, 0],
              [6, 0]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 6 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 0, 0, 0, 0]));
      expect(worldContext.pack.burgs[2].state).toBe(0);
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });

  it("does not infer an administrative connection from a route without a Settlement Foundation plan", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 100, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2]),
            state: new Uint16Array(3),
            h: new Uint8Array([25, 25, 25]),
            c: [[1], [0, 2], [1]],
            biomeCode: new Uint8Array([0, 0, 0]),
            culture: new Uint16Array([1, 1, 1]),
            pop: new Float32Array([10, 0, 10]),
            burg: new Uint16Array([1, 0, 2]),
            s: new Uint16Array([10, 10, 10]),
            f: new Uint16Array([0, 0, 0]),
            r: new Uint16Array(3),
            fl: new Uint16Array(3),
            t: new Int8Array([2, 2, 2]),
            routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } },
            p: [
              [0, 0],
              [1, 0],
              [2, 0]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 2 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0]));
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });

  it("leaves non-foundation wilderness unclaimed outside the capital", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 100, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2, 3]),
            state: new Uint16Array(4),
            h: new Uint8Array([25, 25, 25, 25]),
            c: [
              [1, 2, 3],
              [0, 2, 3],
              [0, 1, 3],
              [0, 1, 2]
            ],
            biomeCode: new Uint8Array(4),
            culture: new Uint16Array([1, 1, 1, 1]),
            pop: new Float32Array([10, 10, 10, 0]),
            burg: new Uint16Array([1, 2, 3, 0]),
            s: new Uint16Array([10, 10, 10, 10]),
            f: new Uint16Array(4),
            r: new Uint16Array(4),
            fl: new Uint16Array(4),
            t: new Int8Array([2, 2, 2, 2]),
            p: [
              [0, 0],
              [1, 0],
              [0, 1],
              [0.5, 0.5]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 1 }, { i: 3, capital: 0, cell: 2 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 0]));
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });
});

describe("States.generateDiplomacy", () => {
  it("generates diplomacy without crashing when cells.religion is undefined", () => {
    const mockWorldContext = {
      options: { year: 1000 },
      pack: {
        cells: {
          i: new Uint16Array([0, 1]),
          h: new Uint8Array([25, 25]),
          state: new Uint16Array([1, 2]),
          area: new Float32Array([100, 100]),
          f: new Uint16Array([0, 0]),
          c: [[1], [0]],
          p: [
            [0, 0],
            [10, 10]
          ]
          // religion is intentionally omitted/undefined (pre-Religions.generate)
        },
        states: [
          { i: 0, name: "Neutrals", diplomacy: [] },
          {
            i: 1,
            name: "Alpha",
            center: 0,
            culture: 1,
            type: "Generic",
            neighbors: [2],
            diplomacy: [],
            campaigns: []
          },
          {
            i: 2,
            name: "Beta",
            center: 1,
            culture: 1,
            type: "Generic",
            neighbors: [1],
            diplomacy: [],
            campaigns: []
          }
        ],
        burgs: [
          { i: 0 },
          { i: 1, state: 1, name: "Alpha Burg", x: 0, y: 0 },
          { i: 2, state: 2, name: "Beta Burg", x: 10, y: 10 }
        ],
        cultures: [
          { i: 0, name: "Wild" },
          { i: 1, name: "Culture A" }
        ],
        religions: undefined
      }
    } as unknown as WorldContext;

    States.worldContext = mockWorldContext;
    expect(() => States.generateDiplomacy()).not.toThrow();
    expect(mockWorldContext.pack.states[0].diplomacy).toBeDefined();
    expect(mockWorldContext.pack.states[1].diplomacy?.[2]).toBeDefined();
  });

  it("generates diplomacy with casus belli when cells.religion and religions are present", () => {
    const mockWorldContext = {
      options: { year: 1000 },
      pack: {
        cells: {
          i: new Uint16Array([0, 1]),
          h: new Uint8Array([25, 25]),
          state: new Uint16Array([1, 2]),
          area: new Float32Array([100, 100]),
          f: new Uint16Array([0, 0]),
          c: [[1], [0]],
          p: [
            [0, 0],
            [10, 10]
          ],
          religion: new Uint16Array([1, 2])
        },
        states: [
          { i: 0, name: "Neutrals", diplomacy: [] },
          {
            i: 1,
            name: "Alpha",
            center: 0,
            culture: 1,
            type: "Generic",
            form: "Theocracy",
            formName: "Holy Empire",
            neighbors: [2],
            diplomacy: [],
            campaigns: []
          },
          {
            i: 2,
            name: "Beta",
            center: 1,
            culture: 1,
            type: "Generic",
            form: "Theocracy",
            formName: "Holy Empire",
            neighbors: [1],
            diplomacy: [],
            campaigns: []
          }
        ],
        burgs: [
          { i: 0 },
          { i: 1, state: 1, name: "Alpha Burg", x: 0, y: 0 },
          { i: 2, state: 2, name: "Beta Burg", x: 10, y: 10 }
        ],
        cultures: [
          { i: 0, name: "Wild" },
          { i: 1, name: "Culture A" }
        ],
        religions: [
          { i: 0, name: "No religion" },
          { i: 1, name: "Solar Orthodoxy" },
          { i: 2, name: "Lunar Heresy" }
        ]
      }
    } as unknown as WorldContext;

    States.worldContext = mockWorldContext;
    expect(() => States.generateDiplomacy()).not.toThrow();
    expect(mockWorldContext.pack.states[0].diplomacy).toBeDefined();
  });

  it("generates WarDetails with mobilized forces and motivation pledges for coalition wars", () => {
    const prevAttempts = useOptionsState.getState().diplomacyHistoryAttempts;
    useOptionsState.setState({ diplomacyHistoryAttempts: 10 });

    const mockWorldContext = {
      options: { year: 1000 },
      pack: {
        cells: {
          i: new Uint16Array([0, 1, 2]),
          h: new Uint8Array([25, 25, 25]),
          state: new Uint16Array([1, 2, 3]),
          area: new Float32Array([100, 500, 100]),
          f: new Uint16Array([0, 0, 0]),
          c: [[1], [0, 2], [1]],
          p: [
            [0, 0],
            [10, 10],
            [20, 20]
          ],
          religion: new Uint16Array([1, 1, 1])
        },
        states: [
          { i: 0, name: "Neutrals", diplomacy: [] },
          {
            i: 1,
            name: "Alpha",
            center: 0,
            culture: 1,
            type: "Generic",
            expansionism: 0.5,
            neighbors: [2],
            diplomacy: [undefined, "x", "Rival", "Neutral"],
            campaigns: []
          },
          {
            i: 2,
            name: "Beta",
            center: 1,
            culture: 1,
            type: "Generic",
            expansionism: 10.0,
            neighbors: [1, 3],
            diplomacy: [undefined, "Rival", "x", "Ally"],
            campaigns: []
          },
          {
            i: 3,
            name: "Gamma",
            center: 2,
            culture: 1,
            type: "Generic",
            expansionism: 1.0,
            neighbors: [2],
            diplomacy: [undefined, "Neutral", "Ally", "x"],
            campaigns: []
          }
        ],
        burgs: [
          { i: 0 },
          { i: 1, state: 1, name: "Alpha Port", x: 0, y: 0, port: 1 },
          { i: 2, state: 2, name: "Beta Keep", x: 10, y: 10 },
          { i: 3, state: 3, name: "Gamma Port", x: 20, y: 20, port: 1 }
        ],
        cultures: [
          { i: 0, name: "Wild" },
          { i: 1, name: "Culture A" }
        ],
        religions: [
          { i: 0, name: "No religion" },
          { i: 1, name: "Common Faith" }
        ]
      }
    } as unknown as WorldContext;

    worldContext.pack = mockWorldContext.pack;
    worldContext.options = mockWorldContext.options;
    States.worldContext = mockWorldContext;
    for (let attempt = 0; attempt < 10; attempt++) {
      States.generateDiplomacy();
      if ((mockWorldContext.pack.states[0].diplomacy as any[][])?.length > 0) break;
    }

    // Check that wars have attached WarDetails
    const stateWithCampaign = mockWorldContext.pack.states.find(s => s.campaigns && s.campaigns.length > 0);
    expect(stateWithCampaign).toBeDefined();

    const campaign = stateWithCampaign!.campaigns![0];
    expect(campaign.details).toBeDefined();
    const details = campaign.details!;
    expect(details.id).toBeDefined();
    expect(details.name).toBe(campaign.name);
    expect(details.participants.length).toBeGreaterThanOrEqual(2);

    // Verify forces are populated
    for (const p of details.participants) {
      expect(p.forces.total).toBeGreaterThan(0);
      expect(p.forces.infantry).toBeGreaterThan(0);
      expect(p.transitType).toBeDefined();
      expect(p.transitDetail).toBeDefined();
    }

    // Chronicle event must have warId attached
    const chronicle = mockWorldContext.pack.states[0].diplomacy as any[][];
    expect(chronicle.length).toBeGreaterThan(0);
    const firstWarGroup = chronicle[0];
    const event = firstWarGroup.find(e => typeof e === "object");
    expect(event).toBeDefined();
    expect(event.warId).toBeDefined();
    expect(event.fromBurg).toBeDefined();
    expect(event.toBurg).toBeDefined();

    useOptionsState.setState({ diplomacyHistoryAttempts: prevAttempts });
  });

  it("sets tacticalRole, fromBurg, and toBurg on war events", () => {
    const prevAttempts = useOptionsState.getState().diplomacyHistoryAttempts;
    useOptionsState.setState({ diplomacyHistoryAttempts: 10 });

    const mockWorldContext = {
      options: { year: 1000 },
      pack: {
        cells: {
          i: new Uint16Array([0, 1, 2]),
          h: new Uint8Array([25, 25, 25]),
          state: new Uint16Array([1, 2, 3]),
          area: new Float32Array([100, 500, 100]),
          p: [
            [0, 0],
            [10, 0],
            [20, 0]
          ],
          c: [[1], [0, 2], [1]]
        },
        states: [
          { i: 0, name: "Neutrals", removed: true },
          {
            i: 1,
            name: "Alpha",
            expansionism: 1,
            neighbors: [2],
            campaigns: [],
            diplomacy: ["x", "x", "Enemy", "x"],
            culture: 1,
            center: 0
          },
          {
            i: 2,
            name: "Beta",
            expansionism: 10,
            neighbors: [1, 3],
            campaigns: [],
            diplomacy: ["x", "Enemy", "x", "Ally"],
            culture: 1,
            center: 1
          },
          {
            i: 3,
            name: "Gamma",
            expansionism: 1,
            neighbors: [2],
            campaigns: [],
            diplomacy: ["x", "Suspicion", "Ally", "x"],
            culture: 1,
            center: 2
          }
        ],
        burgs: [
          { i: 0 },
          { i: 1, name: "Alpha Burg", state: 1, cell: 0, x: 0, y: 0, port: 1 },
          { i: 2, name: "Beta Burg", state: 2, cell: 1, x: 10, y: 0, port: 1 },
          { i: 3, name: "Gamma Port", state: 3, cell: 2, x: 20, y: 0, port: 1 }
        ]
      }
    } as unknown as WorldContext;

    worldContext.pack = mockWorldContext.pack;
    worldContext.options = mockWorldContext.options;
    States.worldContext = mockWorldContext;
    for (let attempt = 0; attempt < 10; attempt++) {
      States.generateDiplomacy();
      if ((mockWorldContext.pack.states[0].diplomacy as any[][])?.length > 0) break;
    }

    const chronicle = mockWorldContext.pack.states[0].diplomacy as any[][];
    expect(chronicle.length).toBeGreaterThan(0);

    // Look for events with tacticalRole or transitType
    let foundTacticalOrLeader = false;
    for (const group of chronicle) {
      for (const item of group) {
        if (typeof item === "object" && item !== null) {
          if (item.tacticalRole) {
            foundTacticalOrLeader = true;
            expect(["leader", "concentrated", "divide"]).toContain(item.tacticalRole);
          }
          if (item.fromBurg !== undefined) {
            expect(typeof item.fromBurg).toBe("number");
          }
          if (item.toBurg !== undefined) {
            expect(typeof item.toBurg).toBe("number");
          }
        }
      }
    }
    expect(foundTacticalOrLeader).toBe(true);

    useOptionsState.setState({ diplomacyHistoryAttempts: prevAttempts });
  });

  it("does not form Ally relations with states that are neither land neighbors nor sea-connected", () => {
    // 3 inland states arranged in a line: 1 <-> 2 <-> 3
    // State 1 and 3 are neibsOfNeibs (not direct neighbors) and have NO ports.
    const mockWorldContext = {
      options: { year: 1000 },
      pack: {
        cells: {
          i: new Uint16Array([0, 1, 2]),
          h: new Uint8Array([25, 25, 25]),
          state: new Uint16Array([1, 2, 3]),
          area: new Float32Array([100, 100, 100]),
          p: [
            [0, 0],
            [10, 0],
            [20, 0]
          ],
          c: [[1], [0, 2], [1]]
        },
        states: [
          { i: 0, name: "Neutrals", removed: true },
          { i: 1, name: "State 1", expansionism: 1, neighbors: [2], campaigns: [], center: 0 },
          { i: 2, name: "State 2", expansionism: 1, neighbors: [1, 3], campaigns: [], center: 1 },
          { i: 3, name: "State 3", expansionism: 1, neighbors: [2], campaigns: [], center: 2 }
        ],
        burgs: [
          { i: 1, name: "Inland City 1", state: 1, cell: 0, x: 0, y: 0, port: 0 },
          { i: 2, name: "Inland City 2", state: 2, cell: 1, x: 10, y: 0, port: 0 },
          { i: 3, name: "Inland City 3", state: 3, cell: 2, x: 20, y: 0, port: 0 }
        ],
        routes: []
      }
    } as unknown as WorldContext;

    States.worldContext = mockWorldContext;

    // Run generateDiplomacy multiple times to ensure randomized rolls never produce "Ally" between 1 and 3
    for (let run = 0; run < 20; run++) {
      States.generateDiplomacy();
      const state1Diplomacy = mockWorldContext.pack.states[1].diplomacy as string[];
      const state3Diplomacy = mockWorldContext.pack.states[3].diplomacy as string[];

      expect(state1Diplomacy[3]).not.toBe("Ally");
      expect(state3Diplomacy[1]).not.toBe("Ally");
    }
  });

  it("skips declaring war when power/force disparity exceeds maxWarDisparityRatio", () => {
    const prevDisparity = useOptionsState.getState().maxWarDisparityRatio;
    const prevAttempts = useOptionsState.getState().diplomacyHistoryAttempts;
    useOptionsState.setState({ diplomacyHistoryAttempts: 10, maxWarDisparityRatio: 8 });

    // State 1 is a giant empire (area 2000), State 2 is a micro-state (area 50) -> ratio = 40x > 8x
    const mockWorldContext = {
      options: { year: 100 },
      pack: {
        cells: {
          i: [0, 1],
          h: [20, 20],
          area: [600, 500],
          state: [1, 2],
          pop: [500, 1],
          burg: [1, 2],
          p: [
            [0, 0],
            [10, 0]
          ],
          c: [[1], [0]],
          f: [0, 0]
        },
        states: [
          { i: 0, name: "Neutrals", removed: true },
          { i: 1, name: "Empire", expansionism: 2, neighbors: [2], campaigns: [], center: 0 },
          { i: 2, name: "MicroState", expansionism: 1, neighbors: [1], campaigns: [], center: 1 }
        ],
        burgs: [
          { i: 0, name: "None", state: 0, cell: 0, x: 0, y: 0, population: 0 },
          { i: 1, name: "Imperial Capital", state: 1, cell: 0, x: 0, y: 0, port: 0, population: 5000 },
          { i: 2, name: "Border Hamlet", state: 2, cell: 1, x: 10, y: 0, port: 0, population: 1 }
        ],
        routes: []
      }
    } as unknown as WorldContext;

    worldContext.pack = mockWorldContext.pack;
    worldContext.options = mockWorldContext.options;
    States.worldContext = mockWorldContext;

    // Run multiple times with maxWarDisparityRatio = 8 -> no war should be generated
    for (let run = 0; run < 10; run++) {
      mockWorldContext.pack.states[1].campaigns = [];
      mockWorldContext.pack.states[2].campaigns = [];
      States.generateDiplomacy();
      const chronicle = mockWorldContext.pack.states[0].diplomacy as any[][];
      expect(chronicle.length).toBe(0);
      expect(mockWorldContext.pack.states[1].campaigns!.length).toBe(0);
    }

    // When maxWarDisparityRatio is disabled (0) or high (e.g. 1000), war can be generated
    useOptionsState.setState({ maxWarDisparityRatio: 0 });
    let warOccurredWithHighRatio = false;
    for (let run = 0; run < 15; run++) {
      mockWorldContext.pack.states[1].campaigns = [];
      mockWorldContext.pack.states[2].campaigns = [];
      States.generateDiplomacy();
      const chronicle = mockWorldContext.pack.states[0].diplomacy as any[][];
      if (chronicle.length > 0) {
        warOccurredWithHighRatio = true;
        break;
      }
    }
    expect(warOccurredWithHighRatio).toBe(true);

    useOptionsState.setState({
      maxWarDisparityRatio: prevDisparity,
      diplomacyHistoryAttempts: prevAttempts
    });
  });

  it("defaults maxWarDisparityRatio to 8 always, and maxWarDisparityRatioEnabled to false for High/Dark Fantasy", () => {
    expect(getDefaultMaxWarDisparityRatio("highFantasy")).toBe(8);
    expect(getDefaultMaxWarDisparityRatio("darkFantasy")).toBe(8);
    expect(getDefaultMaxWarDisparityRatio("world")).toBe(8);
    expect(getDefaultMaxWarDisparityRatio("european")).toBe(8);
    expect(getDefaultMaxWarDisparityRatio(undefined)).toBe(8);
    expect(getDefaultMaxWarDisparityRatio(null)).toBe(8);

    expect(getDefaultMaxWarDisparityRatioEnabled("highFantasy")).toBe(false);
    expect(getDefaultMaxWarDisparityRatioEnabled("darkFantasy")).toBe(false);
    expect(getDefaultMaxWarDisparityRatioEnabled("world")).toBe(true);
    expect(getDefaultMaxWarDisparityRatioEnabled("european")).toBe(true);
    expect(getDefaultMaxWarDisparityRatioEnabled(undefined)).toBe(true);
    expect(getDefaultMaxWarDisparityRatioEnabled(null)).toBe(true);
  });

  it("disables disparity check by default for High Fantasy so war can be declared", () => {
    const prevAttempts = useOptionsState.getState().diplomacyHistoryAttempts;
    useOptionsState.setState({ diplomacyHistoryAttempts: 10 });

    // State 1 has area 200, State 2 has area 100 -> ratio = 2.0x
    const fantasyWorldContext = {
      options: { year: 100, culturesSet: "highFantasy" },
      pack: {
        cells: {
          i: [0, 1],
          h: [20, 20],
          area: [200, 100],
          state: [1, 2],
          pop: [200, 100],
          burg: [1, 2],
          p: [
            [0, 0],
            [10, 0]
          ],
          c: [[1], [0]],
          f: [0, 0]
        },
        states: [
          { i: 0, name: "Neutrals", removed: true },
          { i: 1, name: "Realm A", expansionism: 1, neighbors: [2], campaigns: [], center: 0 },
          { i: 2, name: "Realm B", expansionism: 1, neighbors: [1], campaigns: [], center: 1 }
        ],
        burgs: [
          { i: 0, name: "None", state: 0, cell: 0, x: 0, y: 0, population: 0 },
          { i: 1, name: "City A", state: 1, cell: 0, x: 0, y: 0, port: 0, population: 2000 },
          { i: 2, name: "City B", state: 2, cell: 1, x: 10, y: 0, port: 0, population: 1000 }
        ],
        routes: []
      }
    } as unknown as WorldContext;

    worldContext.pack = fantasyWorldContext.pack;
    worldContext.options = fantasyWorldContext.options;
    States.worldContext = fantasyWorldContext;

    let warGenerated = false;
    for (let run = 0; run < 10; run++) {
      fantasyWorldContext.pack.states[1].campaigns = [];
      fantasyWorldContext.pack.states[2].campaigns = [];
      States.generateDiplomacy();
      const chronicle = fantasyWorldContext.pack.states[0].diplomacy as any[][];
      if (chronicle.length > 0) {
        warGenerated = true;
        break;
      }
    }
    expect(warGenerated).toBe(true);

    // If maxWarDisparityRatioEnabled is explicitly turned on with limit 1, 2x disparity skips war
    fantasyWorldContext.options.maxWarDisparityRatioEnabled = true;
    fantasyWorldContext.options.maxWarDisparityRatio = 1;
    for (let run = 0; run < 10; run++) {
      fantasyWorldContext.pack.states[1].campaigns = [];
      fantasyWorldContext.pack.states[2].campaigns = [];
      States.generateDiplomacy();
      const chronicle = fantasyWorldContext.pack.states[0].diplomacy as any[][];
      expect(chronicle.length).toBe(0);
    }

    useOptionsState.setState({ diplomacyHistoryAttempts: prevAttempts });
  });
});
