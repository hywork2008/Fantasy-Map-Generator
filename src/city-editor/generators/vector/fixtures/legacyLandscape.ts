import { getBurialCulturePreset } from "../../../../data/burialCultures";
import type { CityDocument, Point } from "../../../types/document";
import { layoutCemetery } from "../../cemeteryLayout";
import { createDocument } from "../../document";
import { polygonCentroid } from "../../geom";
import { meshFromCells } from "../../mesh";

export function legacyLandscapeFixture(): CityDocument {
  const source = createDocument("native-landscape", 256);
  const polygons: Point[][] = Array.from({ length: 9 }, (_, i) => {
    const x = (i % 3) * 20 - 30,
      y = Math.floor(i / 3) * 20 - 30;
    return [
      [x, y],
      [x + 20, y],
      [x + 20, y + 20],
      [x, y + 20]
    ];
  });
  polygons.push([
    [50, -30],
    [110, -30],
    [110, 30],
    [50, 30]
  ]);
  source.mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  source.featureGroups = [];
  source.elements = [];
  source.gates = [];
  source.version = 6;
  source.forestSettings = { version: 1, mode: "farmland", density: "dense" };
  source.biome = { id: 15, key: "centralEuropeanGreatForest", name: "Central forest", color: "#53794c" };
  for (const face of Object.values(source.mesh.faces))
    Object.assign(face.properties, { water: "land", ward: "farm", settlement: "outskirts" });
  source.mesh.faces.f4.properties.landCoverOverride = "open";
  source.mesh.faces.f9.properties.ward = "cemetery";
  source.civilization = {
    tradition: "latinWest",
    period: "highMedieval",
    faith: "sunni",
    cultureFaith: "latinCatholic",
    fortification: "european",
    culture: { id: 1, name: "Fixed native culture", nameBase: 0 }
  };
  source.burialProfile = getBurialCulturePreset("medieval_parish");
  const cemetery = {
    id: "cemetery:fixed",
    version: 1 as const,
    seed: "native-culture",
    form: "field" as const,
    faceId: "f9",
    boundary: polygons[9],
    courtyards: [],
    parts: [],
    accesses: [],
    trees: [],
    gatePoint: [80, -30] as Point,
    burialProfile: source.burialProfile,
    provenance: "generated" as const,
    locked: false
  };
  const plan = layoutCemetery(source, cemetery);
  if (!plan) throw Error("fixture-cemetery");
  source.cemeteries = [plan];
  return source;
}
