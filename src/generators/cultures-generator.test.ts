import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Grid } from "../types/Grid";
import type { PackedGraph } from "../types/PackedGraph";
import { Cultures } from "./cultures-generator";

describe("fantasy culture templates", () => {
  const previousSet = useOptionsState.getState().culturesSet;

  afterEach(() => {
    useOptionsState.setState({ culturesSet: previousSet });
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

  it("keeps Demon stateless and includes Beastfolk and Lich cultures in High Fantasy", () => {
    stubMapData();
    useOptionsState.setState({ culturesSet: "highFantasy" });
    const cultures = Cultures.getDefault();
    expect(cultures.map(c => c.raceKey)).not.toContain("demon");
    expect(cultures.find(c => c.raceKey === "beastfolk")?.name).toBe("Veldan");
    expect(cultures.find(c => c.raceKey === "lich")?.name).toBe("Morbane");
    expect(cultures.find(c => c.raceKey === "lich")?.odd).toBe(0.05);
    expect(cultures).toHaveLength(19);
  });

  it("includes an independent Demon culture alongside Beastfolk and Lich cultures in Dark Fantasy", () => {
    stubMapData();
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    const cultures = Cultures.getDefault();
    expect(cultures.find(c => c.raceKey === "demon")?.name).toBe("Nethrakan");
    expect(cultures.find(c => c.raceKey === "beastfolk")?.name).toBe("Veldan");
    expect(cultures.find(c => c.name === "Morbane")?.odd).toBe(1);
    expect(cultures.find(c => c.name === "Ossuaria")?.odd).toBe(0.05);
    expect(cultures).toHaveLength(38);
  });
});
