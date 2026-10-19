import type { KrakPhase } from "../../buildings/fortresses/krak";
import type { CityDocument, Point } from "../types/document";
import { createCastleOnFace } from "./castles";
import { setCastleFortress } from "./fortressPlacement";
import { meshFromCells } from "./mesh";

/** Small, editable hill study for BV export and end-to-end inspection in CE. */
export function createFortressStudy(phase: KrakPhase = "hospitalier-1270"): CityDocument {
  const cells = [];
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) {
      const cx = x * 160,
        cy = y * 190;
      const polygon: Point[] = [
        [cx - 80, cy - 95],
        [cx + 80, cy - 95],
        [cx + 80, cy + 95],
        [cx - 80, cy + 95]
      ];
      cells.push({
        id: cells.length,
        site: [cx, cy] as Point,
        polygon,
        centroid: [cx, cy] as Point,
        neighbors: [],
        onBorder: Math.abs(x) === 2 || Math.abs(y) === 2
      });
    }
  const mesh = meshFromCells(cells);
  for (const face of Object.values(mesh.faces)) {
    const [x, y] = face.site!;
    face.properties.elevation = 100 + Math.round(42 * Math.exp(-((x / 190) ** 2 + (y / 225) ** 2)));
    face.properties.buildable = false;
    face.properties.ward = "empty";
  }
  const source: CityDocument = {
    format: "fmg-city-editor",
    version: 2,
    historicalPeriod: "highMedieval",
    appearance: "town",
    frame: { extentMeters: 950, cityRadiusMeters: 180, blockSizeMeters: 160 },
    mesh,
    featureGroups: [],
    gates: [],
    elements: [{ id: "study-plaza", kind: "plaza", point: [240, 0], faceIds: [], locked: false }],
    castles: [],
    defenseCircuits: []
  };
  const road = Object.values(mesh.edges).find(edge => {
    const a = mesh.vertices[edge.a].point,
      b = mesh.vertices[edge.b].point;
    return a[0] >= 240 && b[0] >= 240 && Math.abs(a[1]) <= 95 && Math.abs(b[1]) <= 95;
  });
  if (road)
    source.featureGroups.push({
      id: "study-approach",
      name: "Approach",
      kind: "road",
      segments: [{ edgeId: road.id, forward: true }],
      style: { widthMeters: 5, color: "#d5cfbf" },
      locked: false
    });
  const castle = createCastleOnFace(source, "f12");
  if (!castle?.castles?.[0]) throw new Error("Could not create the fortress study circuit");
  const result = setCastleFortress(castle, castle.castles[0].id, phase);
  if (!result) throw new Error("The fortress study does not fit its circuit");
  return result;
}
