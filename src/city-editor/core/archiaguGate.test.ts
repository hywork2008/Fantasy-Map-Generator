import { expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/archiagu-20261010.json";
import { boundaryEdges } from "./fortifications";
import { generateCityAttempt } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { vertexHasCrossing } from "./passages";

it.each([input.seed, "xoe0u4"])(
  "keeps Archiagu's western gate approach open (seed %s)",
  seed => {
    const value = parseIncomingPayload(JSON.stringify(input))!;
    let preview: GenerationDebugPreview | undefined;
    const source = cityEditorDocument(value);
    const before = structuredClone(source);
    const city = generateCityAttempt(
      source,
      cityEditorSettings(value),
      seed,
      () => {},
      1,
      p => {
        preview = p;
      }
    );
    expect(city, JSON.stringify(preview?.sample.failure)).not.toBeNull();
    expect(city!.gates.filter(g => !g.ownerCastleId)).toHaveLength(3);
    for (const gate of city!.gates.filter(g => !g.ownerCastleId))
      expect(vertexHasCrossing(city!, gate.vertexId, "wall", "road"), gate.vertexId).toBe(true);
    expect(city!.castles).toHaveLength(1);
    const castleGate = city!.gates.find(g => g.ownerCastleId)!;
    const approach = city!.featureGroups.find(g => g.id === `${castleGate.ownerCastleId}:approach`)!;
    expect(approach.segments.length).toBeGreaterThan(0);
    const first = city!.mesh.edges[approach.segments[0].edgeId];
    const exit = first.a === castleGate.vertexId ? first.b : first.a;
    const town = city!.defenseCircuits!.find(c => c.scope === "town")!;
    const curtain = new Set(
      boundaryEdges(city!.mesh, town.areaFaceIds).flatMap(ref => {
        const edge = city!.mesh.edges[ref.edgeId];
        return [edge.a, edge.b];
      })
    );
    expect(curtain.has(exit), "castle entrance must face the city, not its curtain").toBe(false);
    const gatePoint = city!.mesh.vertices[castleGate.vertexId].point;
    const exitPoint = city!.mesh.vertices[exit].point;
    expect(exitPoint[0]).toBeGreaterThan(gatePoint[0]);
    expect(
      (exitPoint[0] - gatePoint[0]) * -gatePoint[0] + (exitPoint[1] - gatePoint[1]) * -gatePoint[1],
      "castle approach must head toward the city centre"
    ).toBeGreaterThan(0);
    expect(
      new Set(
        city!.featureGroups.flatMap(group =>
          group.kind === "road" && group.sourceRoad ? [group.sourceRoad.index] : []
        )
      )
    ).toEqual(new Set([0, 1, 2]));
    expect(city!.importedFixedCrossings).toEqual(input.descriptor.fixedCrossings);
    expect(source).toEqual(before);
  },
  120000
);
