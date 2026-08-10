import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebglPickDetail } from "../../../types/webglPicking";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setCaravans, setMarkets } from "../economyContext";
import type { Caravan, Market } from "../generators/marketTypes";
import { economyMapPickHandler } from "./economyMapPickHandler";

function pick(id: string): WebglPickDetail {
  return {
    kind: "extension",
    extensionId: "economy",
    id,
    cellId: null,
    layerId: "economy",
    index: 0,
    x: 0,
    y: 0,
    coordinate: null
  };
}

describe("economyMapPickHandler", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, name: "Sourceburg" } as Burg, { i: 2, name: "Harbor Two" } as Burg]
    } as unknown as PackedGraph;
    // Generated market IDs start at one, while their backing array starts at zero.
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: {} },
      { i: 2, centerBurgId: 2, color: "#222", goods: {} }
    ] as Market[]);
    setCaravans([
      { i: 7, seller: 2, sellerType: "market", buyer: 1, buyerType: "market", payload: [], state: "transit" } as Caravan
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("resolves caravan and market picks by market ID rather than array position", () => {
    expect(economyMapPickHandler.formatPick(pick("economy-caravan-7"))).toBe("Caravan: Harbor Two → Sourceburg");
    expect(economyMapPickHandler.formatPick(pick("economy-market-area-2-4"))).toBe("Market: Harbor Two");
  });
});
