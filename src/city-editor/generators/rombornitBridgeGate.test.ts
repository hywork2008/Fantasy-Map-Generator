import { expect, it } from "vitest";
import input from "../data/fixtures/rombornit-20261031.json";
import reportedInput from "../data/fixtures/rombornit-bank-remnant-20261031.json";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import type { Point } from "../types/document";
import { wallRunsOutsideGates } from "./fortifications";
import { generateCityOnDocument } from "./generation/generateCity";
import { segmentSegmentHit } from "./geom";

// The widened display hid the town-mesh exits from the approach router.
// The fixed bridge also bypassed regional-road gate installation entirely.
it.each([
  { label: "FMG export", input },
  { label: "reported city", input: reportedInput }
])(
  "generates Rombornit without a redundant bank curtain ($label)",
  ({ input }) => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed, () => {});
    expect(city).not.toBeNull();
    if (!city) return;
    expect(city.generationSeed).toBe(value.seed);
    expect(city.importedFixedCrossings!.crossings).toEqual(value.descriptor!.fixedCrossings!.crossings);
    expect(city.featureGroups.some(g => g.id === "gc:wall-0")).toBe(false);
    expect(city.featureGroups.some(g => g.id === "gc:wall-1" && g.segments.length > 0)).toBe(true);
    const crossing = city.importedFixedCrossings!.crossings.find(c => c.id === 145)!;

    const width = city.importedFixedCrossings!.roadWidthMeters;
    for (const offset of [-width / 2, 0, width / 2]) {
      const shift = (p: Point): Point => [p[0] + offset * crossing.tangent[0], p[1] + offset * crossing.tangent[1]];
      const a = shift(crossing.approachA);
      const b = shift(crossing.approachB);
      for (const group of city.featureGroups) {
        if (group.kind !== "wall") continue;
        for (const ref of group.segments) {
          const edge = city.mesh.edges[ref.edgeId];
          const line = [city.mesh.vertices[edge.a].point, city.mesh.vertices[edge.b].point];
          for (const run of wallRunsOutsideGates(city, line))
            expect(segmentSegmentHit(a, b, run[0], run[1])).toBeNull();
        }
      }
    }
  },
  120000
);
