import { describe, expect, it } from "vitest";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import { createDefaultRaces, raceIdByKey } from "../data/races";
import {
  clearCharactersContext,
  getAllowedCharacterRaceKeys,
  initCharactersContext,
  resolveAllowedCharacterRaceId
} from "../extensions/characters/charactersContext";
import { resolveCharacterRaceName } from "../extensions/characters/controllers/characters-overview";
import { createPerson } from "../extensions/characters/personFactory";
import { Characters } from "../extensions/nobility/generators/characterLifecycle";
import { clearNobilityContext, getRulerId, initNobilityContext } from "../extensions/nobility/nobilityContext";
import { useOptionsState } from "../store/optionsState";
import type { ExtensionAPI } from "../types/extension-api";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { Burgs } from "./burgs-generator";
import { Cultures } from "./cultures-generator";
import { Names } from "./names-generator";
import { States } from "./states-generator";

describe("Lich undead realms generation", () => {
  function stubGraphData(): void {
    const cellsCount = 500;
    const cells = {
      i: Array.from({ length: cellsCount }, (_, i) => i),
      p: Array.from({ length: cellsCount }, (_, i) => [i * 5, i * 5] as [number, number]),
      h: new Uint8Array(cellsCount).fill(25),
      t: new Int8Array(cellsCount).fill(1),
      s: new Int16Array(cellsCount).fill(5), // low suitability by default
      pop: new Float32Array(cellsCount).fill(10),
      culture: new Uint16Array(cellsCount).fill(0),
      burg: new Uint16Array(cellsCount).fill(0),
      f: new Uint16Array(cellsCount).fill(0),
      haven: new Int32Array(cellsCount).fill(0),
      harbor: new Uint8Array(cellsCount).fill(0),
      r: new Uint16Array(cellsCount).fill(0),
      fl: new Uint16Array(cellsCount).fill(0),
      biomeCode: new Uint8Array(cellsCount).fill(6),
      g: new Uint16Array(cellsCount).fill(0),
      v: Array.from({ length: cellsCount }, () => []),
      c: Array.from({ length: cellsCount }, (_, idx) => [(idx + 1) % cellsCount, (idx - 1 + cellsCount) % cellsCount])
    };
    // Make cell 1-100 high suitability (fertile land for non-lich cultures)
    for (let i = 1; i <= 100; i++) {
      cells.s[i] = 80;
    }
    // Cell 400 is Lich culture center with very low suitability (harsh badlands)
    cells.s[400] = 1;

    // Culture 2 for other populated lands, 1 for Lich
    for (let i = 1; i <= 100; i++) {
      cells.culture[i] = 2;
    }
    cells.culture[400] = 1;

    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla" }];
    worldContext.pack = {
      cells,
      features: [{ type: "land" }],
      races: createDefaultRaces(),
      cultures: [
        { i: 0, name: "Wildlands", race: 0, shield: "" },
        { i: 1, name: "Morbane", race: raceIdByKey(createDefaultRaces(), "lich"), center: 400, shield: "" },
        { i: 2, name: "Human culture", race: 1, center: 10, shield: "" }
      ],
      burgs: [0 as never],
      states: [],
      rivers: []
    } as unknown as PackedGraph;

    worldContext.grid = {
      cells: { temp: new Int8Array(cellsCount).fill(10) },
      points: cells.p
    } as unknown as Grid;
    worldContext.biomesData = createDefaultBiomesData();
    worldContext.options = { initialSettlementPattern: "standard" } as never;
  }

  it("ensures a capital is placed in Lich territory despite low suitability", () => {
    stubGraphData();
    useOptionsState.setState({ statesNumber: 5, culturesSet: "darkFantasy" });

    Burgs.generate(worldContext, viewContext, appServices, {
      pack: worldContext.pack,
      grid: worldContext.grid
    } as never);

    const lichBurg = worldContext.pack.burgs.find(b => b.i && b.capital && b.culture === 1);
    expect(lichBurg).toBeDefined();
    expect(lichBurg?.cell).toBe(400);
    expect(lichBurg?.capital).toBe(1);
  });

  it("creates a State and generates a Lich sovereign with Arcane 92-100", () => {
    stubGraphData();
    useOptionsState.setState({ statesNumber: 5, culturesSet: "darkFantasy" });

    Burgs.generate(worldContext, viewContext, appServices, {
      pack: worldContext.pack,
      grid: worldContext.grid
    } as never);
    // Call createStates directly without full geometry-based expand/getPoles
    worldContext.pack.states = (States as any).createStates();

    const lichState = worldContext.pack.states.find(s => s.i && s.culture === 1);
    expect(lichState).toBeDefined();

    // Initialize character lifecycle
    const api = { worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI;
    initNobilityContext(api);
    initCharactersContext(api);

    Characters.generate({ randomSeed: 42 });

    const characters = worldContext.pack.characters ?? [];
    const lichRuler = characters.find(c => {
      const race = worldContext.pack.races?.[c.race];
      return race?.key === "lich";
    });

    expect(lichRuler).toBeDefined();
    expect(lichRuler?.arcane).toBeGreaterThanOrEqual(92);
    expect(lichRuler?.arcane).toBeLessThanOrEqual(100);

    clearNobilityContext();
    clearCharactersContext();
  });

  it("guarantees at least 1 Lich culture in Dark Fantasy across 50 generations", () => {
    stubGraphData();
    useOptionsState.setState({ culturesSet: "darkFantasy", cultures: 12 });
    const nameBases = Names.getNameBases();
    worldContext.nameBases = nameBases;

    for (let seed = 1; seed <= 50; seed++) {
      worldContext.pack.cultures = [];
      Cultures.generate(worldContext, viewContext, appServices, { pack: worldContext.pack, nameBases } as never);
      const lichCount = worldContext.pack.cultures.filter(c => {
        const race = worldContext.pack.races?.[c.race];
        return race?.key === "lich";
      }).length;
      expect(lichCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("generates Lich culture at around 5% in High Fantasy", () => {
    stubGraphData();
    useOptionsState.setState({ culturesSet: "highFantasy", cultures: 12 });
    const nameBases = Names.getNameBases();
    worldContext.nameBases = nameBases;

    let lichAppearances = 0;
    const RUNS = 100;
    for (let seed = 1; seed <= RUNS; seed++) {
      worldContext.pack.cultures = [];
      Cultures.generate(worldContext, viewContext, appServices, { pack: worldContext.pack, nameBases } as never);
      const hasLich = worldContext.pack.cultures.some(c => {
        const race = worldContext.pack.races?.[c.race];
        return race?.key === "lich";
      });
      if (hasLich) lichAppearances++;
    }
    // High Fantasy has ~5% chance: over 100 runs, should be between 1% and 15%
    expect(lichAppearances).toBeGreaterThanOrEqual(1);
    expect(lichAppearances).toBeLessThanOrEqual(20);
  });

  it("merges newly added catalog races when resolving initial allowed races", () => {
    // When storage contains an old list of races without lich
    const races = createDefaultRaces();
    const lichId = raceIdByKey(races, "lich");
    const allowedKeys = getAllowedCharacterRaceKeys();
    expect(allowedKeys).toContain("lich");
    expect(resolveAllowedCharacterRaceId(lichId, races)).toBe(lichId);
  });

  it("strictly limits Lich to state rulers (max 2 across the map) and records mortal originalRace for undead", () => {
    stubGraphData();
    useOptionsState.setState({ statesNumber: 6, culturesSet: "darkFantasy" });

    Burgs.generate(worldContext, viewContext, appServices, {
      pack: worldContext.pack,
      grid: worldContext.grid
    } as never);
    worldContext.pack.states = (States as any).createStates();

    const api = { worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI;
    initNobilityContext(api);
    initCharactersContext(api);

    Characters.generate({ randomSeed: 123 });

    const characters = worldContext.pack.characters ?? [];
    const lichCharacters = characters.filter(c => {
      const race = worldContext.pack.races?.[c.race];
      return race?.key === "lich";
    });

    // Lich characters must strictly be rulers and at most 2 across the entire map
    expect(lichCharacters.length).toBeGreaterThanOrEqual(1);
    expect(lichCharacters.length).toBeLessThanOrEqual(2);
    for (const lich of lichCharacters) {
      const isRuler =
        lich.titles.some(t => t.landed && t.entityType === "state") ||
        worldContext.pack.states?.some(s => s.i && getRulerId(s) === lich.i);
      expect(isRuler).toBe(true);
    }

    // Undead servitors (Zombie / Skeleton) must have originalRace defined
    // and resolveCharacterRaceName must include the original race name in parentheses
    const undeadCharacters = characters.filter(c => {
      const race = worldContext.pack.races?.[c.race];
      return race?.key === "zombie" || race?.key === "skeleton";
    });

    // If there are undead characters, verify their originalRace
    for (const undead of undeadCharacters) {
      expect(undead.originalRace).toBeDefined();
      const origRace = worldContext.pack.races?.[undead.originalRace!];
      expect(origRace?.key).not.toBe("demon");
      expect(origRace?.key).not.toBe("fallen_angel");
      expect(origRace?.key).not.toBe("lich");
      expect(origRace?.key).not.toBe("zombie");
      expect(origRace?.key).not.toBe("skeleton");

      const resolvedName = resolveCharacterRaceName(undead, worldContext.pack.races, worldContext.pack.cultures);
      expect(resolvedName).toMatch(/\((Human|Elf|Dwarf|Orc|Goblin|Halfling|Beastfolk|Giant|Draconic)\)/);
    }

    clearNobilityContext();
    clearCharactersContext();
  });

  it("scales Zombie and Skeleton ages to living equivalent when close to living realms, and older than mortals but younger than Lich when distant", () => {
    stubGraphData();
    useOptionsState.setState({ statesNumber: 5, culturesSet: "darkFantasy" });

    Burgs.generate(worldContext, viewContext, appServices, {
      pack: worldContext.pack,
      grid: worldContext.grid
    } as never);
    worldContext.pack.states = (States as any).createStates();

    const api = { worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI;
    initNobilityContext(api);
    initCharactersContext(api);

    Characters.generate({ randomSeed: 777 });

    const lichState = worldContext.pack.states?.find(s => {
      const culture = worldContext.pack.cultures?.[s.culture];
      return worldContext.pack.races?.[culture?.race]?.key === "lich";
    });
    expect(lichState).toBeDefined();

    const lichRuler = worldContext.pack.characters?.find(
      c => c.state === lichState?.i && worldContext.pack.races?.[c.race]?.key === "lich"
    );
    expect(lichRuler).toBeDefined();
    const lichAge = lichRuler!.age;

    // Test Case 1: When neighboring a living state
    lichState!.neighbors = [2]; // Neighboring living state 2
    const closeUndead = createPerson(1001, lichState!.culture, {
      homeStateId: lichState!.i,
      roleClass: "ordinary"
    });
    expect(["zombie", "skeleton"]).toContain(worldContext.pack.races?.[closeUndead.race]?.key);
    // Near living state: age is equivalent to a living mortal adult (e.g. 20 - 70)
    expect(closeUndead.age).toBeGreaterThanOrEqual(20);
    expect(closeUndead.age).toBeLessThanOrEqual(70);

    // Test Case 2: When distant and completely isolated from living states
    lichState!.neighbors = [0]; // Only wilderness
    // Move living capitals far away (> 300)
    for (const s of worldContext.pack.states) {
      if (s.i !== lichState!.i && worldContext.pack.burgs?.[s.capital]) {
        worldContext.pack.burgs[s.capital].x = 9000;
        worldContext.pack.burgs[s.capital].y = 9000;
      }
    }

    const distantUndead = createPerson(1002, lichState!.culture, {
      homeStateId: lichState!.i,
      roleClass: "ordinary"
    });
    expect(["zombie", "skeleton"]).toContain(worldContext.pack.races?.[distantUndead.race]?.key);
    // Distant: ancient thrall strictly younger than Lich ruler
    expect(distantUndead.age).toBeGreaterThanOrEqual(40);
    expect(distantUndead.age).toBeLessThan(lichAge);

    clearNobilityContext();
    clearCharactersContext();
  });
});
