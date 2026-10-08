import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import abere from "./fixtures/chaia-abere-20261008.json";
import { polygonOverlaps, townGates } from "./fortifications";
import { buildBlockFabric } from "./gen/blockInfill";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { gateCrossingFrame } from "./passages";
import type { Point } from "./types";

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

// Exact CE input exported from Chaia 2026-10-08-20-13.fmg, burg 3 (Abere).
describe("Chaia Abere regression", () => {
  const share = parseIncomingPayload(abere.share_json)!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {})!;
  const fabric = buildBlockFabric(city);

  it("pulls a gate that spiked out of the curtain back onto the wall line", () => {
    for (const gate of townGates(city)) {
      const frame = gateCrossingFrame(city, gate.vertexId)!;
      const wall = city.featureGroups.find(
        g => g.kind === "wall" && featureGroupVertices(city, g).includes(gate.vertexId)
      )!;
      const ids = featureGroupVertices(city, wall);
      const i = ids.indexOf(gate.vertexId);
      const [a, b] = [ids[i - 1], ids[i + 1]].map(id => city.mesh.vertices[id]?.point);
      if (!a || !b) continue;
      const outward =
        ((a[0] + b[0]) / 2 - frame.point[0]) * frame.inward[0] + ((a[1] + b[1]) / 2 - frame.point[1]) * frame.inward[1];
      expect(outward, gate.id).toBeLessThan(1.5);
    }
  });

  it("joins each barbican arm to the curtain", () => {
    const walls = city.featureGroups.filter(g => g.kind === "wall");
    const segments = walls.flatMap(g =>
      g.segments.map(ref => {
        const e = city.mesh.edges[ref.edgeId];
        return { a: city.mesh.vertices[e.a].point, b: city.mesh.vertices[e.b].point, r: g.style.widthMeters / 2 };
      })
    );
    expect(fabric.aerialLandmarks!.barbicans.length).toBeGreaterThan(0);
    for (const barbican of fabric.aerialLandmarks!.barbicans)
      for (const end of [barbican.court[0], barbican.court.at(-1)!])
        expect(Math.min(...segments.map(s => segmentDistance(end, s.a, s.b) - s.r))).toBeLessThan(0.6);
  });

  it("keeps river boats off the bridge deck and mills off the quay", () => {
    const crossings = city.importedFixedCrossings!.crossings;
    const ships = city.elements.filter(e => e.kind === "ship");
    expect(ships.length).toBeGreaterThan(0);
    for (const ship of ships)
      for (const c of crossings)
        for (const [a, b] of [
          [c.approachA, c.deckA],
          [c.deckA, c.deckB],
          [c.deckB, c.approachB]
        ] as [Point, Point][])
          expect(segmentDistance(ship.point!, a, b)).toBeGreaterThan(
            city.importedFixedCrossings!.roadWidthMeters / 2 + 2
          );
    const harbor = [...fabric.harbor!.spaces.map(s => s.polygon), ...fabric.harbor!.piers.map(p => p.polygon)];
    for (const mill of fabric.watermills!.mills)
      expect(harbor.some(h => polygonOverlaps(mill.millhousePolygon, h))).toBe(false);
  });
});
