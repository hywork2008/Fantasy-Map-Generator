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

  // The road ran straight on from the deck (v261) for 120 m, then turned 100°
  // back to the gate (v63) at v266. The bend vertex now sits midway.
  it("runs straight from the crossing 83 landing to the river gate", () => {
    const crossing = city!.importedFixedCrossings!.crossings.find(c => c.id === 83)!;
    const gates = new Set(city!.gates.map(g => g.vertexId));
    const road = city!.featureGroups.find(g => g.id === "gc:road-3")!;
    const ids = featureGroupVertices(city!, road);
    const points = ids.map(id => city!.mesh.vertices[id].point);
    const from = points.findIndex(p => Math.hypot(p[0] - crossing.approachB[0], p[1] - crossing.approachB[1]) < 0.5);
    const to = ids.findIndex(id => gates.has(id));
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from + 1);
    const [landing, gate] = [points[from], points[to]];
    const run = points.slice(from + 1, to);
    run.forEach((p, k) => {
      const t = (k + 1) / (to - from);
      const on = [landing[0] + (gate[0] - landing[0]) * t, landing[1] + (gate[1] - landing[1]) * t];
      expect(Math.hypot(p[0] - on[0], p[1] - on[1])).toBeLessThan(0.5);
    });
  });
});
