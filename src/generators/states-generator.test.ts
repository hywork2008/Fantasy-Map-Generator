import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
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
    useOptionsState.setState({ diplomacyHistoryAttempts: 5 });

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
    States.generateDiplomacy();

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

    useOptionsState.setState({ diplomacyHistoryAttempts: prevAttempts });
  });
});
