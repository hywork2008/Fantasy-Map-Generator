import { describe, expect, it } from "vitest";
import type { ForestMass } from "./forestMass";
import { renderObliqueForest } from "./obliqueArt";

/** 西半分が広葉樹、東半分が針葉樹の広い森（上限を超える本数になる大きさ） */
function halfAndHalfMass(size: number): ForestMass {
  return {
    outline: [],
    regions: {},
    stock: { deciduous: 1, coniferous: 1 },
    kinds: ["deciduous", "coniferous"],
    bbox: [0, 0, size, size],
    sample: ([x, y]) =>
      x < 0 || y < 0 || x > size || y > size ? null : { kind: x < size / 2 ? "deciduous" : "coniferous", stock: 1 }
  };
}

const countKind = (svg: string, kind: string) => svg.split(`#re-otree-${kind}-`).length - 1;

describe("renderObliqueForest", () => {
  it("上限を超える広い森でも、後に数える針葉樹がどのズーム段階でも消えない", () => {
    const mass = halfAndHalfMass(1200);
    for (const detail of [0, 1, 2]) {
      const svg = renderObliqueForest(mass, detail);
      const dec = countKind(svg, "deciduous");
      const con = countKind(svg, "coniferous");
      expect(con).toBeGreaterThan(dec * 0.5);
      expect(dec + con).toBeLessThan(14_000 * 1.5);
    }
  });
});
