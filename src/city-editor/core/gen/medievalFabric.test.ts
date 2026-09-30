import { describe, expect, it } from "vitest";
import { buildShare, decodeShare, encodeShare } from "../../io/incomingCity";
import { renderStandaloneCitySvg } from "../../render/svg";
import { createGridDocument, parseDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { DocumentHistory } from "../history";
import { meshFromCells } from "../mesh";
import { gatePlazaDisks } from "../passages";
import type { CityDocument, Point, WardKind } from "../types";
import { buildBlockFabric, type DistrictFabric } from "./blockInfill";
import { createFabricPlan, setBuildingPattern, setDistrictParameters } from "./fabricDistricts";
import { polygonBitesDisk } from "./gatePlazaBuildings";
import { isSimplePolygon, nearestOnPolyline, polygonCentroid, segmentInteriorInPolygon } from "./geom";
import { FabricCache } from "./localInfill";
import { buildMedievalFabric } from "./medievalFabric";
import { intersectConvex, plotArea } from "./parcelGeometry";

function fixture(wards: WardKind[] = ["craftsmen", "patriciate"], harbor = false): CityDocument {
  const rect = (x: number, w: number): Point[] => [
    [x, 0],
    [x + w, 0],
    [x + w, 160],
    [x, 160]
  ];
  const polygons = harbor ? [rect(-80, 80), rect(0, 160), rect(160, 160)] : wards.map((_, i) => rect(i * 160, 160));
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  for (const [i, f] of Object.values(mesh.faces).entries())
    Object.assign(f.properties, {
      ward: harbor ? (i === 0 ? null : i === 1 ? "harbor" : "patriciate") : wards[i],
      water: harbor && i === 0 ? "sea" : "land",
      buildable: !(harbor && i === 0),
      settlement: "core",
      depth: 8
    });
  const roadEdges = Object.values(mesh.edges).filter(e => {
    const a = mesh.vertices[e.a].point,
      b = mesh.vertices[e.b].point;
    return (a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) >= 0) || (harbor && a[0] === 160 && b[0] === 160);
  });
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    buildingPattern: "medieval",
    appearance: "town",
    layout: "organic",
    frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
    mesh,
    featureGroups: [
      {
        id: "entry",
        kind: "road",
        name: "Street",
        segments: roadEdges.map(e => ({ edgeId: e.id, forward: true })),
        style: { widthMeters: 5, color: "black" },
        locked: false
      }
    ],
    gates: [],
    elements: []
  };
  document.fabric = createFabricPlan(document, "parcel-regression");
  return document;
}

describe("medieval parcel fabric", () => {
  for (const [size, layout, coast] of [
    ["micro", "organic", "none"],
    ["tiny", "classic", "bay"],
    ["small", "bram", "bay"],
    ["medium", "circulade", "none"]
  ] as const) {
    it(`does not change generation acceptance or road geometry for ${size}/${layout}/${coast}`, () => {
      const seed = `review-${size}-${layout}-${coast}`;
      const input = createGridDocument({ size, grid: "evolution", seed });
      const settings = { ...defaultGenerationSettings(), layout };
      settings.config.coast = coast;
      settings.config.features.port = coast === "bay";
      const failures: string[][] = [[], []];
      const results = (["legacy", "medieval"] as const).map((buildingPattern, i) =>
        generateCityOnDocument(input, { ...settings, buildingPattern }, seed, s => {
          if (s.failure) failures[i].push(s.failure.reason);
        })
      );
      expect(!!results[1]).toBe(!!results[0]);
      expect(failures[1]).toEqual(failures[0]);
      if (results[0] && results[1]) {
        expect(results[1].mesh.vertices).toEqual(results[0].mesh.vertices);
        expect(results[1].featureGroups).toEqual(results[0].featureGroups);
        expect(results[1].gates).toEqual(results[0].gates);
      }
    });
  }

  it("keeps the legacy generator available with identical footprints after a round trip", () => {
    const old = setBuildingPattern(fixture([], true), "legacy");
    const before = buildBlockFabric(old).buildings;
    const alternate = buildBlockFabric(setBuildingPattern(old, "medieval"));
    expect(alternate.parcels!.length).toBeGreaterThan(0);
    expect(alternate.buildings).not.toEqual(before);
    expect(buildBlockFabric(setBuildingPattern(setBuildingPattern(old, "medieval"), "legacy")).buildings).toEqual(
      before
    );
  });

  it("replans a fully occupied row as a larger mansion and its garden together", () => {
    const document = fixture(["patriciate"]);
    document.fabric!.districts[0].parameters.gardenAmount = 1;
    const base: DistrictFabric = {
      buildings: Array.from({ length: 12 }, (_, i) => ({
        faceId: "f0",
        landmark: false,
        polygon: [
          [10 + i * 10, 20],
          [19 + i * 10, 20],
          [19 + i * 10, 32],
          [10 + i * 10, 32]
        ] as Point[]
      })),
      lanes: [
        {
          faceId: "f0",
          points: [
            [0, 17],
            [160, 17]
          ],
          widthMeters: 3
        }
      ],
      entrances: new Map(),
      farms: []
    };
    const fabric = buildMedievalFabric(document, base);
    expect(fabric.parcels!.some(p => ["patrician-house", "elite-compound"].includes(p.archetype))).toBe(true);
    expect(fabric.openSpaces!.some(s => s.kind === "formal-garden")).toBe(true);
    expect(Math.max(...fabric.buildings.map(b => plotArea(b.polygon)))).toBeGreaterThan(108 * 2);
    expect(fabric.buildings.reduce((s, b) => s + plotArea(b.polygon), 0)).toBeGreaterThanOrEqual(
      base.buildings.reduce((s, b) => s + plotArea(b.polygon), 0) * 0.78
    );
    expect(
      fabric.openSpaces!.some(space =>
        base.buildings.some(old => plotArea(intersectConvex(space.polygon, old.polygon)) > 1)
      )
    ).toBe(true);
    for (const parcel of fabric.parcels!) {
      expect(parcel.buildings.some(b => plotArea(b.polygon) > 108 * 2)).toBe(true);
      for (const space of parcel.openSpaces)
        for (const building of fabric.buildings)
          expect(plotArea(intersectConvex(space.polygon, building.polygon))).toBeLessThan(0.02);
    }
    document.mesh.faces.f0.properties.settlement = "outskirts";
    expect(buildMedievalFabric(document, base).buildings).toEqual(base.buildings);
  });

  it("has disjoint buildings and yards inside their parcels, clear of all generated streets", () => {
    const fabric = buildBlockFabric(fixture());
    expect(fabric.buildings.length).toBeGreaterThan(10);
    for (const parcel of fabric.parcels!) {
      for (const building of parcel.buildings) {
        expect(isSimplePolygon(building.polygon)).toBe(true);
        if (building.polygon !== parcel.polygon)
          expect(
            Math.abs(plotArea(intersectConvex(building.polygon, parcel.polygon)) - plotArea(building.polygon))
          ).toBeLessThan(0.01);
        for (const lane of fabric.lanes)
          expect(
            building.polygon.every(p => nearestOnPolyline(p, lane.points).dist + 0.01 >= lane.widthMeters / 2)
          ).toBe(true);
        for (const space of parcel.openSpaces)
          expect(plotArea(intersectConvex(building.polygon, space.polygon))).toBeLessThan(0.001);
      }
      for (let i = 0; i < parcel.buildings.length; i++)
        for (const other of parcel.buildings.slice(i + 1))
          expect(plotArea(intersectConvex(parcel.buildings[i].polygon, other.polygon))).toBeLessThan(0.001);
    }
    for (let i = 0; i < fabric.parcels!.length; i++)
      for (const other of fabric.parcels!.slice(i + 1))
        expect(plotArea(intersectConvex(fabric.parcels![i].polygon, other.polygon))).toBeLessThan(0.001);
  });

  it("plans cargo routes, warehouses and piers together, and protects shared loading spaces", () => {
    const fabric = buildBlockFabric(fixture([], true));
    expect(fabric.harbor!.piers.length).toBeGreaterThan(0);
    expect(fabric.harbor!.frontages.length).toBeGreaterThan(0);
    expect(fabric.parcels!.some(p => p.archetype === "warehouse-compound")).toBe(true);
    // Shared yards are optional when existing buildings leave no free apron.
    for (const b of fabric.buildings)
      for (const s of fabric.harbor!.spaces)
        expect(plotArea(intersectConvex(b.polygon, s.polygon))).toBeLessThan(0.001);
    for (const parcel of fabric.parcels!.filter(p => p.ward === "harbor" && p.archetype === "warehouse-compound"))
      expect(parcel.access.some(a => a.kind === "cargo" && a.widthMeters >= 2.5)).toBe(true);
  });

  it("allows a small port without a shared square and rejects warehouse berths behind a wall", () => {
    let doc = fixture([], true);
    doc = setDistrictParameters(doc, "f1", { harborPreset: "small" })!;
    const small = buildBlockFabric(doc);
    expect(small.harbor!.spaces.some(s => s.kind === "quay")).toBe(true);
    expect(small.harbor!.spaces.some(s => s.kind === "loading-yard")).toBe(false);
    const shore = Object.values(doc.mesh.edges).find(
      e => doc.mesh.vertices[e.a].point[0] === 0 && doc.mesh.vertices[e.b].point[0] === 0
    )!;
    doc.featureGroups.push({
      id: "wall",
      kind: "wall",
      name: "Wall",
      segments: [{ edgeId: shore.id, forward: true }],
      style: { widthMeters: 5, color: "black" },
      locked: false
    });
    const walled = buildBlockFabric(doc);
    expect(walled.harbor!.piers).toHaveLength(0);
    expect(walled.parcels!.some(p => p.ward === "harbor" && p.archetype === "warehouse-compound")).toBe(false);
  });

  it("round-trips the pattern and profiles, rejects invalid settings, and reproduces share links", () => {
    const document = setDistrictParameters(fixture(), "f0", {
      composition: "estates",
      gardenAmount: 0.8,
      sizeVariation: 0.9,
      parcelCoverage: 0.35
    })!;
    const loaded = parseDocument(JSON.stringify(document))!;
    expect(loaded.fabric!.version).toBe(5);
    expect(buildBlockFabric(loaded).parcels).toEqual(buildBlockFabric(document).parcels);
    expect(setDistrictParameters(document, "f0", { gardenAmount: 2 })).toBeNull();
    expect(parseDocument(JSON.stringify({ ...document, buildingPattern: "unknown" }))).toBeNull();
    const share = buildShare({
      seed: "repeat",
      grid: "evolution",
      size: "tiny",
      settings: { ...defaultGenerationSettings(), buildingPattern: "medieval" }
    });
    expect(decodeShare(encodeShare(share))!.settings.buildingPattern).toBe("medieval");
  });

  it("restores the generator selection and parcel profiles through Undo/Redo", () => {
    const initial = setBuildingPattern(fixture(), "legacy");
    const history = new DocumentHistory(initial);
    const changed = setBuildingPattern(initial, "medieval");
    history.commit(changed);
    expect(history.undo(changed)).toEqual(initial);
    const restored = history.redo(initial)!;
    expect(restored).toEqual(changed);
    expect(buildBlockFabric(restored).parcels).toEqual(buildBlockFabric(changed).parcels);
  });

  for (const layout of ["organic", "classic", "circulade", "bram"] as const) {
    it(`generates ${layout} cities with preserved patriciate wards and usable parcel fabric`, () => {
      const input = createGridDocument({ size: "tiny", grid: "evolution", seed: "parcels-city" });
      const settings = { ...defaultGenerationSettings(), buildingPattern: "medieval" as const, layout };
      settings.config.features.castle = false;
      settings.config.features.port = true;
      settings.config.coast = "bay";
      const city = generateCityOnDocument(input, settings, "parcels-city")!;
      expect(city.fabric!.version).toBe(5);
      expect(Object.values(city.mesh.faces).some(f => f.properties.ward === "patriciate")).toBe(true);
      const fabric = buildBlockFabric(city);
      expect(fabric.buildings.length).toBeGreaterThan(60);
      const coreBuildings = fabric.buildings.filter(b => city.mesh.faces[b.faceId].properties.settlement === "core");
      const legacy = setBuildingPattern(city, "legacy");
      const legacyCoreCount = buildBlockFabric(legacy).buildings.filter(
        b => city.mesh.faces[b.faceId].properties.settlement === "core"
      ).length;
      expect(coreBuildings.length).toBeGreaterThanOrEqual(legacyCoreCount * 0.8);
      expect(fabric.buildings.filter(b => b.parcelId).every(b => b.polygon.length === 4)).toBe(true);
      const original = buildBlockFabric(legacy);
      const outsideHarbor = (lane: { faceId: string }) => city.mesh.faces[lane.faceId]?.properties.ward !== "harbor";
      expect(fabric.lanes.filter(outsideHarbor)).toEqual(original.lanes.filter(outsideHarbor));
      const roofs = (f: DistrictFabric) => f.buildings.reduce((sum, b) => sum + plotArea(b.polygon), 0);
      expect(roofs(fabric)).toBeGreaterThanOrEqual(roofs(original) * 0.9);
      expect(fabric.buildings.filter(b => city.mesh.faces[b.faceId].properties.settlement === "outskirts")).toEqual(
        original.buildings.filter(b => city.mesh.faces[b.faceId].properties.settlement === "outskirts")
      );
      for (const b of fabric.buildings.filter(b => b.parcelId)) {
        for (const disk of gatePlazaDisks(city)) expect(polygonBitesDisk(b.polygon, disk, 0)).toBe(false);
      }
      for (const space of fabric.openSpaces!)
        for (const b of fabric.buildings)
          expect(plotArea(intersectConvex(b.polygon, space.polygon))).toBeLessThan(0.02);
      expect(buildBlockFabric(legacy).parcels).toBeUndefined();
      expect(parseDocument(JSON.stringify(city))).toEqual(city);
      for (const p of fabric.parcels!)
        for (const b of p.buildings) {
          expect(isSimplePolygon(b.polygon)).toBe(true);
          if (p.polygon !== b.polygon)
            expect(Math.abs(plotArea(intersectConvex(p.polygon, b.polygon)) - plotArea(b.polygon))).toBeLessThan(0.01);
        }
    });
  }

  it("reuses cached parcels and invalidates only changed district profiles", () => {
    const document = fixture([], true);
    const cache = new FabricCache();
    const first = buildBlockFabric(document, cache);
    const hits = cache.hits;
    expect(buildBlockFabric(document, cache).parcels).toEqual(first.parcels);
    expect(cache.hits).toBeGreaterThan(hits);
    const edited = setDistrictParameters(document, "f2", { composition: "estates", gardenAmount: 0.9 })!;
    expect(buildBlockFabric(edited, cache).parcels!.filter(p => p.faceIds.includes("f1"))).toEqual(
      first.parcels!.filter(p => p.faceIds.includes("f1"))
    );
  });

  it("draws garden spaces, compound identities and the planned harbor piers in SVG", () => {
    const svg = renderStandaloneCitySvg(fixture([], true));
    expect(svg.querySelectorAll(".ce-open-space").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".ce-building[data-archetype]").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".ce-pier").length).toBeGreaterThan(0);
  });

  it("keeps quay equipment off coastal roads and subdivision lanes out of working yards", () => {
    const document = fixture([], true);
    const road = document.featureGroups[0];
    if (road.kind === "river") throw new Error("Expected a road");
    const shore = Object.values(document.mesh.edges).find(
      e => document.mesh.vertices[e.a].point[0] === 0 && document.mesh.vertices[e.b].point[0] === 0
    )!;
    road.segments.push({ edgeId: shore.id, forward: true });
    const fabric = buildBlockFabric(document);
    expect(fabric.harbor!.cranes.length).toBeGreaterThan(0);
    expect(fabric.harbor!.cargoPiles.length).toBeGreaterThan(0);
    const equipment = [
      ...fabric.harbor!.cranes.map(c => ({ point: c.point, radius: c.radiusMeters })),
      ...fabric.harbor!.cargoPiles.map(c => ({ point: c.point, radius: Math.hypot(c.widthMeters, c.heightMeters) / 2 }))
    ];
    for (const item of equipment)
      for (const segment of road.segments) {
        const edge = document.mesh.edges[segment.edgeId];
        expect(
          nearestOnPolyline(item.point, [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point])
            .dist
        ).toBeGreaterThan(item.radius + road.style.widthMeters / 2);
      }
    for (const lane of fabric.lanes)
      for (const space of fabric.harbor!.spaces.filter(s => s.faceId === lane.faceId))
        for (let i = 1; i < lane.points.length; i++)
          expect(segmentInteriorInPolygon(lane.points[i - 1], lane.points[i], space.polygon)).toBe(false);
  });

  it("keeps cranes and cargo clear of buildings with dedicated open loading spaces", () => {
    const document = fixture([], true);
    document.historicalPeriod = "ageOfExploration";
    const fabric = buildBlockFabric(document);
    expect(fabric.harbor?.cranes.length).toBeGreaterThan(0);
    expect(fabric.harbor?.spaces.some(s => s.kind === "loading-yard")).toBe(true);
    for (const crane of fabric.harbor?.cranes ?? []) {
      for (const building of fabric.buildings) {
        for (const pt of building.polygon) {
          const d = Math.hypot(pt[0] - crane.point[0], pt[1] - crane.point[1]);
          expect(d).toBeGreaterThanOrEqual(crane.radiusMeters + 2.0);
        }
      }
    }
  });
});
