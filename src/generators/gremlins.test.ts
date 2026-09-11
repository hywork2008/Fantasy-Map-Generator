import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import { simulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { advanceGremlins, evaluateStateGremlinStatus, getGremlinWardingStatus } from "./gremlins";

describe("gremlins", () => {
  it("evaluates presence based on electrical infrastructure under High/Dark Fantasy", () => {
    const world = {
      options: { culturesSet: "highFantasy", gremlinsEnabled: true },
      pack: {
        states: [
          { i: 0, removed: true },
          { i: 1, name: "Industrial State", removed: false }
        ]
      }
    } as unknown as WorldContext;

    // State with no electricity -> not infested
    const noElectric = evaluateStateGremlinStatus(1, world, {});
    expect(noElectric.infested).toBe(false);
    expect(noElectric.infestationLevel).toBe(0);

    // State with power stations and telegraph lines -> infested
    const electric = evaluateStateGremlinStatus(1, world, {
      powerStationInstallations: 2,
      telegraphLineInstallations: 3,
      copperWireAccess: 0.6,
      electricityCoverage: 0.5
    });
    expect(electric.infested).toBe(true);
    expect(electric.infestationLevel).toBeGreaterThan(0.5);

    // If options.gremlinsEnabled is false -> not infested
    const disabled = evaluateStateGremlinStatus(
      1,
      {
        ...world,
        options: { culturesSet: "highFantasy", gremlinsEnabled: false }
      } as unknown as WorldContext,
      {
        powerStationInstallations: 2
      }
    );
    expect(disabled.infested).toBe(false);

    // If culturesSet is world (non-fantasy) -> not infested
    const worldCulture = evaluateStateGremlinStatus(
      1,
      {
        ...world,
        options: { culturesSet: "world", gremlinsEnabled: true }
      } as unknown as WorldContext,
      {
        powerStationInstallations: 2
      }
    );
    expect(worldCulture.infested).toBe(false);
  });

  it("checks Secret Arcane Art warding status and reproducibility penalty", () => {
    const world = {
      options: { culturesSet: "highFantasy", gremlinsEnabled: true },
      pack: {
        states: [
          { i: 0, removed: true },
          { i: 1, name: "Mystic Tech State", removed: false }
        ]
      }
    } as unknown as WorldContext;

    const signals = {
      powerStationInstallations: 2,
      telegraphLineInstallations: 2
    };

    // 1. Without Secret Arcane Art (locked or absent)
    simulationContext.technology = {
      lastEvaluatedYear: 100,
      progress: [
        {
          technologyId: "arcaneGremlinWarding",
          scope: "state",
          ownerId: 1,
          stage: "locked",
          diffusion: 0
        }
      ]
    };
    expect(getGremlinWardingStatus(1)).toBe("none");
    const unwarded = evaluateStateGremlinStatus(1, world, signals);
    expect(unwarded.warded).toBe("none");
    expect(unwarded.disruptionChance).toBeGreaterThan(0);
    expect(unwarded.reproducibilityFactor).toBeLessThan(1); // Science development penalty!

    // 2. With Secret Arcane Art at demonstrated stage
    simulationContext.technology.progress[0].stage = "demonstrated";
    expect(getGremlinWardingStatus(1)).toBe("partial");
    const partiallyWarded = evaluateStateGremlinStatus(1, world, signals);
    expect(partiallyWarded.warded).toBe("partial");
    expect(partiallyWarded.disruptionChance).toBeLessThan(unwarded.disruptionChance);
    expect(partiallyWarded.reproducibilityFactor).toBeGreaterThan(unwarded.reproducibilityFactor);

    // 3. With Secret Arcane Art adopted / diffused
    simulationContext.technology.progress[0].stage = "adopted";
    expect(getGremlinWardingStatus(1)).toBe("full");
    const fullyWarded = evaluateStateGremlinStatus(1, world, signals);
    expect(fullyWarded.warded).toBe("full");
    expect(fullyWarded.disruptionChance).toBe(0);
    expect(fullyWarded.reproducibilityFactor).toBe(1); // Normal science restored!
  });

  it("simulates gremlin disruptions and malfunctions in unwarded electric states", () => {
    const world = {
      options: { culturesSet: "highFantasy", gremlinsEnabled: true },
      pack: {
        states: [
          { i: 0, removed: true },
          { i: 1, name: "Shock City", removed: false }
        ]
      }
    } as unknown as WorldContext;
    const simulation = { currentYear: 150 } as SimulationContext;

    simulationContext.technology = {
      lastEvaluatedYear: 150,
      progress: [
        {
          technologyId: "arcaneGremlinWarding",
          scope: "state",
          ownerId: 1,
          stage: "locked",
          diffusion: 0
        }
      ]
    };

    const signalsLookup = () => ({
      powerStationInstallations: 3,
      telegraphLineInstallations: 3,
      copperWireAccess: 0.8,
      electricityCoverage: 0.7
    });

    // RNG rolls to trigger disruption
    const rollAlwaysDisrupt = () => 0.05;

    const result = advanceGremlins(world, simulation, signalsLookup, rollAlwaysDisrupt);
    expect(result.changed).toBe(true);
    expect(result.incidents.length).toBeGreaterThan(0);
    const incident = result.incidents[0];
    expect(incident.stateId).toBe(1);
    expect(incident.year).toBe(150);
  });
});
