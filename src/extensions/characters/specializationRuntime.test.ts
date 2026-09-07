import { afterEach, describe, expect, it } from "vitest";
import type { SimulationSystem } from "../../generators/simulationSystem";
import type { ExtensionCommandDefinition } from "../../runtime/worldRuntime";
import type { ExtensionAPI } from "../../types/extension-api";
import type { Culture, State } from "../../types/models";
import { generateWorldLanguages } from "../../utils/worldLanguages";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import type { Character } from "./characterTypes";
import {
  readEconomyPractice,
  registerSpecializationCommands,
  registerSpecializationSimulation
} from "./specializationRuntime";
import { emptySpecializations } from "./specializations";

afterEach(clearCharactersContext);
describe("expertise commands", () => {
  it("validates before changing state and resolves optional Economy skills without duplicating them", () => {
    const character = { i: 1, skills: { martial: 72 }, specializations: emptySpecializations() } as Character;
    const commands = new Map<string, ExtensionCommandDefinition>();
    const world = {
      pack: {
        cultures: [{ i: 1, name: "A" }] as Culture[],
        states: [{ i: 1, culture: 1 }] as State[],
        languageWorld: undefined as ReturnType<typeof generateWorldLanguages> | undefined
      }
    };
    const simulation = {
      extensions: {
        characters: { characters: [character] },
        economy: { individualSkills: [{ characterId: 1, domain: "blacksmithing", proficiency: 83 }] }
      }
    };
    let enabled = true;
    const api = {
      worldContext: world,
      simulationContext: simulation,
      isExtensionEnabled: () => enabled,
      registerExtensionCommand: (command: ExtensionCommandDefinition) => {
        commands.set(command.name, command);
        return () => {
          commands.delete(command.name);
        };
      }
    } as unknown as ExtensionAPI;
    initCharactersContext(api);
    const dispose = registerSpecializationCommands(api);
    const profile = emptySpecializations();
    profile.domains.push({ domainId: "martial.command", practice: 0 });
    commands.get("setSpecializations")!.execute({ characterId: 1, profile });
    expect(character.specializations!.domains[0].practice).toBe(0);
    profile.domains[0].practice = 200;
    expect(() => commands.get("setSpecializations")!.execute({ characterId: 1, profile })).toThrow();
    expect(character.specializations!.domains[0].practice).toBe(0);
    expect(character.skills.martial).toBe(72);
    expect(readEconomyPractice(1, "blacksmithing")).toBe(83);
    enabled = false;
    expect(readEconomyPractice(1, "blacksmithing")).toBeUndefined();
    const languages = generateWorldLanguages(world.pack.cultures, world.pack.states);
    commands.get("setWorldLanguages")!.execute(languages);
    character.specializations!.languages.push({
      languageId: languages.languages[0].id,
      listening: 90,
      speaking: 80,
      acquisition: "native",
      literacy: []
    });
    const existing = structuredClone(character.specializations);
    languages.states[0].courtLanguageIds = [];
    commands.get("setWorldLanguages")!.execute(languages);
    expect(character.specializations).toEqual(existing);
    const before = structuredClone(world.pack.languageWorld);
    languages.languages = [];
    expect(() => commands.get("setWorldLanguages")!.execute(languages)).toThrow();
    expect(world.pack.languageWorld).toEqual(before);
    dispose();
    expect(commands.size).toBe(0);
  });
});

it("advances learning once through Characters with Nobility disabled", () => {
  const student = { i: 1, location: 10, titles: [], specializations: emptySpecializations() } as unknown as Character;
  const teacher = { i: 2, location: 10, titles: [], specializations: emptySpecializations() } as unknown as Character;
  teacher.specializations!.domains = [{ domainId: "learning.history", knowledge: 80 }];
  student.specializations!.learningPlan = {
    kind: "domain",
    teacherId: 2,
    domainId: "learning.history",
    axis: "knowledge"
  };
  let system: SimulationSystem | undefined;
  const api = {
    worldContext: { pack: {} },
    simulationContext: { currentYear: 1000, extensions: { characters: { characters: [student, teacher] } } },
    isExtensionEnabled: (id: string) => id === "characters",
    registerSimulationSystem: (registered: SimulationSystem) => {
      system = registered;
      return () => {
        system = undefined;
      };
    }
  } as unknown as ExtensionAPI;
  initCharactersContext(api);
  const stop = registerSpecializationSimulation(api);
  const topics: string[] = [];
  system!.run(
    { delta: { years: 1, months: 0, days: 0 } } as Parameters<SimulationSystem["run"]>[0],
    { markChanged: (...changed: string[]) => topics.push(...changed) } as unknown as Parameters<
      SimulationSystem["run"]
    >[1]
  );
  expect(student.specializations!.domains[0].knowledge).toBeGreaterThan(0);
  expect(student.specializations!.experience).toHaveLength(1);
  expect(topics).toEqual(["extension.characters"]);
  stop();
  expect(system).toBeUndefined();
});
