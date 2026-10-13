import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import input from "../data/fixtures/poilleneuzy-20261012.json";
import { renderLandscapeLayer } from "../renderers/landscape";
import { renderStandaloneCitySvg } from "../renderers/standaloneSvg";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import type { BurgSiteDescriptor } from "../types/contracts/burgSiteDescriptor";
import type { CityDocument } from "../types/document";
import { buildBlockFabric, type DistrictFabric } from "./blockInfill";
import { MIN_CEMETERY_GROUND_M2 } from "./cemeteryLayout";
import { generateCityOnDocument } from "./generation/generateCity";
import { polygonArea } from "./geom";
import { harborLandFace, harborRootIsDry, pruneInvalidHarbors } from "./harborLand";
import { planHarborShips } from "./harborShips";
import { faceNeighbors, facePoints, validate } from "./mesh";
import { resolvePortFrontages } from "./site/portFrontages";

describe("Poilleneuzy: surveyed river crossing the former sea harbour", () => {
  let city: CityDocument;
  let fabric: DistrictFabric;
  beforeAll(() => {
    const share = parseIncomingPayload(JSON.stringify(input))!;
    const result = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed);
    expect(result).not.toBeNull();
    city = result!;
    fabric = buildBlockFabric(city);
    if (process.env.CE_POILLENEUZY_PREVIEW) {
      writeFileSync(process.env.CE_POILLENEUZY_PREVIEW, renderStandaloneCitySvg(city).outerHTML);
      writeFileSync(`${process.env.CE_POILLENEUZY_PREVIEW}.json`, JSON.stringify({ city, harbor: fabric.harbor }));
    }
  });
  it("keeps the FMG geography, castle, roads and source position", () => {
    expect(validate(city)).toEqual([]);
    expect(city.castles).toHaveLength(1);
    expect(city.importedFixedCrossings?.rivers).toEqual(input.descriptor.fixedCrossings.rivers);
    expect(city.waterAccess?.port).toEqual({ river: true, sea: true, lake: false });
    expect(city.featureGroups.filter(g => g.kind === "road" && g.sourceRoad)).toHaveLength(2);
  });
  it("exports its roads in the directions of their towns (west and south-east)", () => {
    const roads = input.descriptor.roads.filter(r => r.nextBurg);
    const azimuth = (name: string) => roads.find(r => r.nextBurg!.name === name)!.entryAzimuthDeg;
    expect(azimuth("Monnevilles")).toBeGreaterThan(225);
    expect(azimuth("Monnevilles")).toBeLessThan(315);
    expect(azimuth("Grinaismouil")).toBeGreaterThan(90);
    expect(azimuth("Grinaismouil")).toBeLessThan(180);
    // The town stands on its surveyed bank, clear of the river.
    const placement = input.descriptor.burg.riverPlacement!;
    expect(placement.bankDistanceMeters).toBeGreaterThan(input.descriptor.frame.cityRadiusMeters);
  });
  it("moves a cemetery whose cell lost its ground to the river onto a face with room for its graves", () => {
    const cemeteryFaces = Object.values(city.mesh.faces).filter(f => f.properties.ward === "cemetery");
    expect(cemeteryFaces).toHaveLength(city.cemeteries?.length ?? 0);
    for (const cemetery of city.cemeteries ?? []) {
      expect(Math.abs(polygonArea(cemetery.boundary))).toBeGreaterThanOrEqual(MIN_CEMETERY_GROUND_M2);
      expect(cemetery.parts.length).toBeGreaterThan(0);
    }
  });
  it("keeps biome scenery off ground claimed by beaches and facilities", () => {
    const open = renderLandscapeLayer(city, true);
    expect(open.childNodes.length).toBeGreaterThan(0);
    const half = city.frame.extentMeters / 2;
    const all = renderLandscapeLayer(city, true, "detailed", {
      polygons: [
        [
          [-half, -half],
          [half, -half],
          [half, half],
          [-half, half]
        ]
      ],
      discs: []
    });
    expect(all.childNodes.length).toBe(0);
    const disc = renderLandscapeLayer(city, true, "detailed", {
      polygons: [],
      discs: [{ center: [0, 0], radius: half * 2 }]
    });
    expect(disc.childNodes.length).toBe(0);
  });
  it("rebuilds distinct river and sea harbours on usable land", () => {
    const harbors = city.elements.filter(e => e.kind === "harbor");
    expect(harbors).toHaveLength(2);
    expect(harbors.map(e => e.harborKind).sort()).toEqual(["river", "sea"]);
    for (const harbor of harbors) for (const id of harbor.faceIds) expect(harborLandFace(city, id)).toBe(true);
    expect(fabric.harbor?.piers.some(p => !!p.riverId)).toBe(true);
    expect(fabric.harbor?.piers.some(p => !p.riverId)).toBe(true);
    for (const pier of fabric.harbor!.piers) {
      const start = pier.start!,
        end = pier.end!;
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      expect(
        harborRootIsDry(city, pier.landFaceId!, [
          start[0] - ((end[0] - start[0]) * 1.2) / length,
          start[1] - ((end[1] - start[1]) * 1.2) / length
        ])
      ).toBe(true);
    }
  });
  it("removes a flooded ward and its ship in the neighbouring water cell", () => {
    const next = structuredClone(city);
    const harbor = next.elements.find(e => e.kind === "harbor" && e.harborKind === "sea")!;
    const moored = (id: number) =>
      next.elements.some(e => e.kind === "ship" && e.harborFaceId === id && !e.faceIds.includes(id));
    const owner = harbor.faceIds.find(moored)!;
    expect(owner).toBeDefined();
    next.waterAreas = [
      ...(next.waterAreas ?? []),
      { kind: "river", polygon: facePoints(next.mesh, next.mesh.faces[owner]) }
    ];
    pruneInvalidHarbors(next);
    expect(next.mesh.faces[owner].properties.ward).not.toBe("harbor");
    expect(
      next.elements.some(e => e.harborFaceId === owner || (e.kind === "harbor" && e.faceIds.includes(owner)))
    ).toBe(false);
    const rebuilt = buildBlockFabric(next);
    expect(rebuilt.harbor?.piers.some(p => p.landFaceId === owner) ?? false).toBe(false);
    expect(planHarborShips(next).some(e => e.harborFaceId === owner)).toBe(false);
    expect(next.elements.some(e => e.kind === "harbor" && e.harborKind === "river")).toBe(true);
  });
  it("also removes neighbouring generated ships from older documents without an owner field", () => {
    const next = structuredClone(city);
    const ship = next.elements.find(
      e => e.kind === "ship" && e.harborFaceId !== undefined && !e.faceIds.includes(e.harborFaceId)
    )!;
    const owner = ship.harborFaceId!;
    delete ship.harborFaceId;
    // Flood every harbour beside the ship: one surviving neighbour keeps it.
    const flooded = new Set([
      owner,
      ...ship.faceIds
        .flatMap(id => faceNeighbors(next.mesh, id))
        .filter(id => next.mesh.faces[id]?.properties.ward === "harbor")
    ]);
    for (const id of flooded) next.mesh.faces[id].properties.water = "sea";
    pruneInvalidHarbors(next);
    expect(next.elements.some(e => e.id === ship.id)).toBe(false);
  });
  it("adds a local river landing only with a port, usable depth and a nearby surveyed bank", () => {
    const source = structuredClone(input.descriptor) as unknown as BurgSiteDescriptor;
    expect(resolvePortFrontages(source).burg.waterAccess?.port.river).toBe(true);
    expect(source.burg.waterAccess?.port.river).toBe(false);
    for (const mutate of [
      (d: BurgSiteDescriptor) => {
        d.burg.port = false;
      },
      (d: BurgSiteDescriptor) => {
        d.burg.waterAccess!.port.sea = false;
      },
      (d: BurgSiteDescriptor) => {
        d.rivers[0].depthMeters = 0.3;
      },
      (d: BurgSiteDescriptor) => {
        d.fixedCrossings = undefined;
        d.rivers[0].leftBankSegments = [];
        d.rivers[0].rightBankSegments = [];
      }
    ]) {
      const d = structuredClone(source);
      mutate(d);
      expect(resolvePortFrontages(d).burg.waterAccess?.port.river).toBe(false);
    }
  });
});
