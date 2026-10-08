import { afterEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { corpseTreatmentToFuneralRite } from "../data/burialCultures";
import { useOptionsState } from "../store/optionsState";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { getCultureBurialProfile } from "../utils/cultureBurialProfile";
import { Cultures } from "./cultures-generator";

describe("fantasy culture templates", () => {
  const previousSet = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previousSet });
    vi.restoreAllMocks();
  });

  function stubMapData(): void {
    worldContext.pack = {
      cells: {
        s: [1],
        t: [1],
        h: [1],
        biomeCode: [6],
        g: [0],
        haven: [0],
        i: [0]
      }
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { temp: [10] } } as unknown as Grid;
  }

  it("adds cultures with one consistent burial tradition using their real geography", () => {
    stubMapData();
    useOptionsState.setState({ culturesSet: "highFantasy" });
    const cells = worldContext.pack.cells;
    cells.t[0] = 0;
    cells.r = new Uint16Array(1);
    cells.f = new Uint16Array(1);
    cells.culture = new Uint16Array(1);
    worldContext.pack.cultures = [{ i: 0, name: "Wildlands", base: 0, shield: "", code: "WL" }];
    let seed = 57;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    for (let i = 0; i < 30; i++) {
      worldContext.pack.cultures.length = 1;
      Cultures.add(0);
      const culture = worldContext.pack.cultures[1];
      const profile = getCultureBurialProfile(culture)!;
      expect(culture.funeralRite).toBe(corpseTreatmentToFuneralRite(profile.bodyFate));
      expect(profile.zoning).not.toBe("riverfront_ghat");
      expect(profile.bodyFate).not.toBe("submersion_water");
    }
  });

  it("keeps Demon stateless and includes Beastfolk and Lich cultures in High Fantasy", () => {
    stubMapData();
    useOptionsState.setState({ culturesSet: "highFantasy" });
    const cultures = Cultures.getDefault();
    expect(cultures.map(c => c.raceKey)).not.toContain("demon");
    expect(cultures.find(c => c.raceKey === "beastfolk")?.name).toBe("Veldan");
    expect(cultures.find(c => c.raceKey === "lich")?.name).toBe("Morbane");
    expect(cultures.find(c => c.raceKey === "lich")?.odd).toBe(0.05);
    expect(cultures.find(c => c.raceKey === "vampire")?.name).toBe("Sanguinia");
    expect(cultures.find(c => c.raceKey === "vampire")?.odd).toBe(0.05);
    expect(cultures).toHaveLength(20);
  });

  it("includes an independent Demon culture alongside Beastfolk, Lich, and Vampire cultures in Dark Fantasy", () => {
    stubMapData();
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    const cultures = Cultures.getDefault();
    expect(cultures.find(c => c.raceKey === "demon")?.name).toBe("Nethrakan");
    expect(cultures.find(c => c.raceKey === "beastfolk")?.name).toBe("Veldan");
    expect(cultures.find(c => c.name === "Morbane")?.odd).toBe(1);
    expect(cultures.find(c => c.name === "Ossuaria")?.odd).toBe(0.05);
    expect(cultures.find(c => c.raceKey === "vampire")?.name).toBe("Sanguinia");
    expect(cultures.find(c => c.raceKey === "vampire")?.odd).toBe(0.5);
    expect(cultures).toHaveLength(39);
  });
});
