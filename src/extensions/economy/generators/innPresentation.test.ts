import { describe, expect, it } from "vitest";
import { getInnPresentation, getLodgingStylePresentation } from "./innPresentation";

describe("inn presentation", () => {
  it("keeps each functional lodging class available in every visual style", () => {
    for (const style of ["medievalCentralEuropean", "highFantasy", "jrpg"] as const) {
      expect(getLodgingStylePresentation(style).label).not.toHaveLength(0);
      for (const innClass of ["wayside", "market", "waterside", "grand", "caravanserai"] as const) {
        const presentation = getInnPresentation(innClass, style);
        expect(presentation.label).not.toHaveLength(0);
        expect(presentation.sceneCue).not.toHaveLength(0);
      }
    }
  });

  it("uses distinct JRPG presentation without changing the functional class", () => {
    expect(getInnPresentation("market", "jrpg")).toEqual({
      label: "Town Inn",
      sceneCue: "bright signboard and flowered forecourt"
    });
  });
});
