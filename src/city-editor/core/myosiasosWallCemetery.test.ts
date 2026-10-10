import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import input from "./fixtures/myosiasos-20261007.json";
import { polygonOverlaps } from "./fortifications";
import { frameRoadConnectedToTown } from "./frameRoadConnection";
import { buildBlockFabric } from "./gen/blockInfill";
import { polygonArea } from "./gen/geom";
import { FabricCache } from "./gen/localInfill";
import { corridor } from "./gen/parcelGeometry";
import { generateCityOnDocument, generateStageOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { facePoints } from "./mesh";

describe("Myosiasos (FMG harbour capital on a river mouth)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateStageOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed, 7)!;

  it("keeps the riverside wall whose corner grazes the drawn bank, so it reaches the shore", () => {
    const mesh = city.mesh;
    // Loose ends of the whole circuit: the wall is split into runs (and castle
    // curtains) that meet end to end, so count degree over every wall edge.
    const degree = new Map<string, number>();
    for (const group of city.featureGroups ?? [])
      if (group.kind === "wall")
        for (const { edgeId } of group.segments ?? [])
          for (const v of [mesh.edges[edgeId].a, mesh.edges[edgeId].b]) degree.set(v, (degree.get(v) ?? 0) + 1);
    const ends = [...degree].filter(([, n]) => n === 1).map(([v]) => v);
    const onShore = (v: string) =>
      Object.values(mesh.edges).some(
        edge =>
          (edge.a === v || edge.b === v) &&
          [edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id].properties.water === "sea")
      );
    expect(ends.length).toBeGreaterThan(0);
    expect(ends.filter(v => !onShore(v))).toEqual([]);
  });

  it("puts the cemetery in one modest cell", () => {
    const cemeteries = Object.values(city.mesh.faces).filter(face => face.properties.ward === "cemetery");
    expect(cemeteries).toHaveLength(1);
    const area = Math.abs(polygonArea(facePoints(city.mesh, cemeteries[0])));
    expect(area).toBeGreaterThan(3000);
    const coreArea = Object.values(city.mesh.faces)
      .filter(face => face.properties.settlement === "core")
      .reduce((sum, face) => sum + Math.abs(polygonArea(facePoints(city.mesh, face))), 0);
    expect(area / coreArea).toBeLessThan(0.1);
  });
});

describe("Myosiasos complete city", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;

  it("joins every FMG road leg, including both legs over the fixed bridge, to a gate road", () => {
    expect(city.frameRoads?.length).toBeGreaterThan(0);
    for (const leg of city.frameRoads ?? [])
      expect(frameRoadConnectedToTown(city, leg), `route ${leg.routeId}`).toBe(true);
  });

  it("gives the sea port quays and loading yards around its piers", () => {
    const harbor = buildBlockFabric(city, new FabricCache()).harbor;
    expect(harbor?.piers.length).toBeGreaterThan(0);
    expect(harbor?.spaces.filter(s => s.kind === "quay").length).toBeGreaterThan(0);
    expect(harbor?.spaces.filter(s => s.kind === "loading-yard").length).toBeGreaterThan(0);
  });

  it("keeps houses and fields off the gate roads", () => {
    const fabric = buildBlockFabric(city, new FabricCache());
    const roads = city.featureGroups
      .filter(g => g.kind === "road")
      .flatMap(g => {
        const points = featureGroupVertices(city, g).map(id => city.mesh.vertices[id].point);
        return points.slice(1).map((b, i) => corridor(points[i], b, g.style.widthMeters));
      });
    const onRoad = [...fabric.buildings.map(b => b.polygon), ...(fabric.farms ?? []).map(f => f.polygon)].filter(p =>
      roads.some(road => polygonOverlaps(p, road))
    );
    expect(onRoad).toHaveLength(0);
  });
});
