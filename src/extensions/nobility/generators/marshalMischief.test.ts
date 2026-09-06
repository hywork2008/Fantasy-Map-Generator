import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import { tryProvokeWar } from "./marshalMischief";

describe("tryProvokeWar", () => {
  afterEach(() => {
    clearNobilityContext();
  });

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options.conflictAutonomy = "autonomous";
    worldContext.pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "A", diplomacy: [undefined, "x", "Neutral"], neighbors: [2] },
        { i: 2, name: "B", diplomacy: [undefined, "Neutral", "x"] }
      ]
    } as unknown as PackedGraph;
  });

  it("sets mutual Enemy diplomacy on a Neutral neighbor", () => {
    const ok = tryProvokeWar({ state: worldContext.pack.states[1]!, states: worldContext.pack.states });
    expect(ok).toBe(true);
    expect(worldContext.pack.states[1]!.diplomacy?.[2]).toBe("Enemy");
    expect(worldContext.pack.states[2]!.diplomacy?.[1]).toBe("Enemy");
  });
});
