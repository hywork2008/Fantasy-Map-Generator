import { expect, it } from "vitest";
import type { HarborPlan } from "../generators/harborFabric";
import { meshFromCells } from "../generators/mesh";
import type { CityDocument, Point } from "../types/document";
import { fallbackHarborPiers, plannedHarborPiers } from "./harborPierFacts";
import { collectPierSites } from "./pierSites";
import { renderTownQuays } from "./quaySvg";

function harborCity(): CityDocument {
  const polygons: Point[][] = [0, 1, 2, 3].map(i => {
    const x = (i % 2) * 50,
      y = Math.floor(i / 2) * 50;
    return [
      [x, y],
      [x + 50, y],
      [x + 50, y + 50],
      [x, y + 50]
    ];
  });
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygon[0],
      centroid: polygon[0],
      neighbors: [],
      onBorder: false
    }))
  );
  for (const id of ["f0", "f2"]) mesh.faces[id].properties.ward = "harbor";
  for (const id of ["f1", "f3"])
    Object.assign(mesh.faces[id].properties, { water: "sea", elevation: 0, depth: 6, buildable: false });
  return {
    format: "fmg-city-editor",
    version: 2,
    appearance: "town",
    mesh,
    frame: { extentMeters: 200, cityRadiusMeters: 50, blockSizeMeters: 50 },
    featureGroups: [],
    gates: [],
    elements: []
  };
}

it("uses the same fallback piers as the SVG and removes them when the harbor ward disappears", () => {
  const city = harborCity();
  const fallback = fallbackHarborPiers(city);
  expect(fallback.length).toBeGreaterThan(0);
  const sites = collectPierSites(city, undefined);
  expect(sites.map(site => site.deck)).toEqual(fallback.map(pier => pier.deck));
  expect(sites).toHaveLength(renderTownQuays(undefined, [], fallback).querySelectorAll(".ce-pier").length);
  for (const id of ["f0", "f2"]) city.mesh.faces[id].properties.ward = "merchant";
  expect(collectPierSites(city, undefined)).toEqual([]);
});

it("uses the exact planned polygon and never adds fallback piers when a planned harbor is filtered out", () => {
  const city = harborCity();
  const deck = [
    [49, 10],
    [70, 10],
    [70, 15],
    [49, 15]
  ] as Point[];
  const harbor: HarborPlan = {
    piers: [{ id: "planned", landFaceId: "f0", waterFaceId: "f1", depth: 6, polygon: deck }],
    spaces: [],
    frontages: [],
    cranes: [],
    cargoPiles: [],
    sharedArea: 0
  };
  expect(collectPierSites(city, harbor)).toEqual([{ id: "planned", deck, depth: 6 }]);
  city.mesh.faces.f0.properties.ward = "merchant";
  expect(fallbackHarborPiers(city).length).toBeGreaterThan(0);
  expect(collectPierSites(city, harbor)).toEqual([]);
  expect(renderTownQuays(harbor, plannedHarborPiers(city, harbor), []).querySelectorAll(".ce-pier")).toHaveLength(0);
});
