import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import input from "./fixtures/chalbianos-20261009.json";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { lineHitsDocumentWater } from "./waterGeometry";

// Chalbianos: FMG crossing 83 lands 111 m from the river-side gate. The gate
// had two outer arms and the straighter one (a 12 m stub toward the bank) was
// its only open arm, so the landing road could not reach it; once it could,
// smoothing dragged the landing vertex off the deck into the water.
describe("Chalbianos (bridge landing beside a river gate)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed);

  it("generates with every gate connected", () => {
    expect(city).not.toBeNull();
  }, 120000);

  it("keeps a dry road from the crossing 83 deck end to the town", () => {
    const crossing = city!.importedFixedCrossings!.crossings.find(c => c.id === 83)!;
    const landing = [crossing.approachA, crossing.approachB];
    const road = city!.featureGroups.find(
      g =>
        g.kind === "road" &&
        featureGroupVertices(city!, g).some(id => {
          const p = city!.mesh.vertices[id].point;
          return landing.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5);
        })
    );
    expect(road?.kind).toBe("road");
    if (road?.kind !== "road") return;
    for (const ref of road.segments) {
      const edge = city!.mesh.edges[ref.edgeId];
      const line = [city!.mesh.vertices[edge.a].point, city!.mesh.vertices[edge.b].point];
      expect(lineHitsDocumentWater(city!, line, road.style.widthMeters, true)).toBe(false);
    }
  });
});
