import { expect, it } from "vitest";
import { buildBlockFabric } from "./blockInfill";
import { createGridDocument } from "./document";
import { createFabricPlan } from "./fabricDistricts";
import { encloseCircleWithWalls } from "./features";
import { outerTownCircuit } from "./fortifications";
import { polygonCentroid } from "./geom";
import {
  createCastlePlanFromCells,
  finishManualGeometry,
  placeCivicElement,
  registerTownFromWalls,
  settleManualCity
} from "./manualCompletion";
import { facePoints, validate } from "./mesh";

it("takes a hand-painted walled town through the New city stages that have no drawing tool", () => {
  let document = createGridDocument({ size: "small", grid: "voronoi", seed: "manual-completion" });
  const radius = document.frame.cityRadiusMeters;
  const centre = (id: string) => polygonCentroid(facePoints(document.mesh, document.mesh.faces[id]));
  const byDistance = Object.values(document.mesh.faces)
    .map(face => ({ id: face.id, distance: Math.hypot(...centre(face.id)) }))
    .sort((a, b) => a.distance - b.distance);
  for (const { id, distance } of byDistance)
    document.mesh.faces[id].properties.ward = distance < radius * 0.8 ? "craftsmen" : null;
  const plazaFace = byDistance[0].id;
  const templeFace = byDistance[1].id;
  document.mesh.faces[plazaFace].properties.ward = "market";
  const castleFace = byDistance.find(({ distance }) => distance > radius * 0.4)!.id;
  document.mesh.faces[castleFace].properties.ward = "castle";

  expect(registerTownFromWalls(document)).toBeNull();
  document = encloseCircleWithWalls(document, [0, 0], radius * 0.8)!;
  document = registerTownFromWalls(document)!;
  const town = outerTownCircuit(document)!;
  expect(town.wallGroupIds.length).toBeGreaterThan(0);
  expect(document.mesh.faces[plazaFace].properties.settlement).toBe("core");

  document = createCastlePlanFromCells(document, castleFace)!;
  expect(document.castles).toHaveLength(1);
  document = placeCivicElement(document, plazaFace, "plaza")!;
  document = placeCivicElement(document, templeFace, "temple")!;
  expect(document.elements.filter(e => e.kind === "plaza" || e.kind === "temple")).toHaveLength(2);
  expect(placeCivicElement(document, plazaFace, "harbor")).toBeNull();

  document = finishManualGeometry(document, "manual-completion")!;
  expect(document).not.toBeNull();
  expect(validate(document)).toEqual([]);
  document = settleManualCity(document, "manual-completion", { historicalPeriod: "highMiddleAges" });
  expect(document.historicalPeriod).toBe("highMiddleAges");

  document = { ...document, appearance: "town", fabric: createFabricPlan(document, "manual-completion") };
  expect(buildBlockFabric(document).buildings.length).toBeGreaterThan(0);
});
