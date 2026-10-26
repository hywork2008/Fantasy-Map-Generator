import { expect, it } from "vitest";
import { model as amiens } from "../amiens";
import type { LandmarkModel } from "../architectureKit";
import { model as bruges } from "../brugesCityHall";
import { model as burgos } from "../burgos";
import { model as chartres } from "../chartres";
import { model as cologne } from "../cologne";
import { checkLandmark } from "../landmarkTestSupport";
import { model as milan } from "../milan";
import { model as reims } from "../reims";
import { model as sainteChapelle } from "../sainteChapelle";
import { model as salisbury } from "../salisbury";

const models = [chartres, amiens, reims, cologne, sainteChapelle, salisbury, milan, burgos, bruges];
const triangles = (assembly: ReturnType<LandmarkModel["create"]>) =>
  assembly.pickables.reduce(
    (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
    0
  );

for (const low of models) {
  const high = low.highDetail!;
  it(`${low.id}: offers independent high detail while retaining the default shell`, () => {
    expect(high).toBeDefined();
    expect(high.id).toBe(low.id);
    expect(high.highDetail).toBeUndefined();
    const simple = low.create();
    const detailed = high.create();
    try {
      expect(triangles(detailed)).toBeGreaterThan(triangles(simple) * 2);
      expect(simple.pickables.some(m => m.name === "roof-standing-seam")).toBe(false);
      expect(detailed.group).not.toBe(simple.group);
      expect(detailed.pickables.length).toBeLessThan(240);
    } finally {
      simple.dispose();
      detailed.dispose();
    }
  });
  checkLandmark(high, assembly => {
    const names = new Set(assembly.pickables.map(m => m.name));
    expect(names.has("paired-lancet-tracery")).toBe(true);
    expect(names.has("roof-standing-seam")).toBe(true);
    expect(names.has("portal-archivolt")).toBe(true);
    if (low !== bruges && low !== salisbury) expect(names.has("rose-colored-pane")).toBe(true);
    if ([chartres, cologne, burgos, milan].includes(low)) expect(names.has("spire-openwork-diagonal")).toBe(true);
  });
}
