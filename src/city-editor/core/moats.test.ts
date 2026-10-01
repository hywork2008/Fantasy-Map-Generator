import { describe, expect, it } from "vitest";
import { renderEditorSvg } from "../render/svg";
import { createGridDocument } from "./document";
import { boundaryEdges } from "./fortifications";
import { buildBlockFabric, FabricCache } from "./gen/blockInfill";
import { buildCityBuildings } from "./gen/buildingLots";
import { polygonCentroid } from "./gen/geom";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { meshFromCells, validate } from "./mesh";
import { MoatReservation } from "./moats";
import { gateCrossingFrame, straightenGateCrossings } from "./passages";
import type { CityDocument, Point } from "./types";

function fixture(): CityDocument {
  const polygons: Point[][] = [
    [
      [-80, -80],
      [80, -80],
      [80, 80],
      [-80, 80]
    ],
    [
      [80, -80],
      [240, -80],
      [240, 80],
      [80, 80]
    ]
  ];
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [1 - id],
      onBorder: true
    }))
  );
  for (const face of Object.values(mesh.faces))
    Object.assign(face.properties, { ward: "craftsmen", settlement: "core", buildable: true });
  const wall = boundaryEdges(mesh, ["f0"]);
  const roadEdge = Object.values(mesh.edges).find(
    e => mesh.vertices[e.a].point[0] === 240 && mesh.vertices[e.b].point[0] === 240
  )!;
  return {
    format: "fmg-city-editor",
    version: 2,
    mesh,
    frame: { extentMeters: 600, cityRadiusMeters: 100, blockSizeMeters: 50 },
    featureGroups: [
      {
        id: "wall",
        kind: "wall",
        name: "Curtain",
        segments: wall,
        style: { widthMeters: 4, color: "black" },
        locked: false
      },
      {
        id: "road",
        kind: "road",
        name: "Entry",
        segments: [{ edgeId: roadEdge.id, forward: true }],
        style: { widthMeters: 8, color: "black" },
        locked: false
      }
    ],
    defenseCircuits: [
      {
        id: "town",
        scope: "town",
        areaFaceIds: ["f0"],
        wallGroupIds: ["wall"],
        naturalBarriers: [],
        locked: false,
        moat: { enabled: true, widthMeters: 24 }
      }
    ],
    gates: [],
    elements: []
  };
}
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];

describe("moat reservations", () => {
  it("reserves the exterior width and round corners without consuming interior land", () => {
    const moat = new MoatReservation(fixture());
    expect(moat.hitsPolygon(rect(81, -5, 4, 10))).toBe(true);
    expect(moat.hitsPolygon(rect(106.5, -5, 4, 10))).toBe(false);
    expect(moat.hitsPolygon(rect(93, 93, 3, 3))).toBe(true);
    expect(moat.hitsPolygon(rect(72, -5, 6, 10))).toBe(false);
    // Neither endpoints nor the footprint centre alone detect this overlap.
    expect(moat.hitsPolygon(rect(70, -2, 160, 4))).toBe(true);
  });

  it.each([undefined, "evolution"] as const)(
    "rejects overlapping buildings on %s grids and responds to edits with the same cache",
    gridKind => {
      const doc = fixture();
      doc.gridKind = gridKind;
      doc.defenseCircuits![0].moat!.enabled = false;
      const cache = new FabricCache();
      const before = gridKind ? buildBlockFabric(doc, cache).buildings : buildCityBuildings(doc);
      expect(before.length).toBeGreaterThan(0);
      doc.defenseCircuits![0].moat!.enabled = true;
      const moat = new MoatReservation(doc, 2);
      expect(before.some(b => moat.hitsPolygon(b.polygon))).toBe(true);
      const after = gridKind ? buildBlockFabric(doc, cache).buildings : buildCityBuildings(doc);
      expect(after.length).toBeLessThan(before.length);
      expect(after.length).toBeGreaterThan(0);
      expect(after.every(b => !moat.hitsPolygon(b.polygon))).toBe(true);
      if (gridKind)
        expect(
          buildBlockFabric(doc, cache).lanes.every(
            l => moat.roadParts(l.points).bridges.length === 0 && moat.dryRuns(l.points).length > 0
          )
        ).toBe(true);
      doc.defenseCircuits![0].moat!.enabled = false;
      expect(gridKind ? buildBlockFabric(doc, cache).buildings : buildCityBuildings(doc)).toEqual(before);
    }
  );

  it("keeps medieval parcel buildings and their displayed spaces out of the moat", () => {
    const doc = fixture();
    doc.gridKind = "evolution";
    doc.buildingPattern = "medieval";
    const moat = new MoatReservation(doc, 2);
    const fabric = buildBlockFabric(doc);
    expect(fabric.buildings.length).toBeGreaterThan(0);
    expect(fabric.buildings.every(b => !moat.hitsPolygon(b.polygon))).toBe(true);
    expect(fabric.parcels?.every(parcel => parcel.buildings.every(b => !moat.hitsPolygon(b.polygon)))).toBe(true);
  });

  it("blocks non-gate roads and preserves a gate-connected bridge aligned with the road", () => {
    const doc = fixture();
    const vertex = Object.values(doc.mesh.vertices).find(v => v.point[0] === 80 && v.point[1] === -80)!;
    doc.gates.push({ id: "gate", vertexId: vertex.id, locked: false, passageWidthMeters: 10 });
    const moat = new MoatReservation(doc, 5);
    expect(moat.roadAllowed([80, 0], [160, 0])).toBe(false);
    expect(moat.roadAllowed([0, 0], [0, 60])).toBe(true);
    expect(moat.roadAllowed(vertex.point, [160, -120])).toBe(true);
    const parts = moat.roadParts([vertex.point, [160, -120]]);
    expect(parts.bridges).toHaveLength(1);
    expect(parts.dry).toHaveLength(1);
    expect(parts.bridges[0][0][0]).toBeCloseTo(vertex.point[0]);
    expect(parts.bridges[0][0][1]).toBeCloseTo(vertex.point[1]);
    expect(
      moat.roadParts([
        [80, 0],
        [160, 0]
      ]).bridges
    ).toHaveLength(0);
  });

  it("squares the gn8tsm v66 drawbridge while preserving the river approach and identical dry-city topology", () => {
    const settings = defaultGenerationSettings();
    settings.config = {
      coast: "none",
      rivers: ["through"],
      relief: false,
      features: { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true },
      wall: { envelope: "auto", coast: "auto", line: "auto" },
      layout: "auto"
    };
    Object.assign(settings, {
      streets: { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true },
      buildingPattern: "medieval",
      layout: "circulade",
      walledAreaShare: 1,
      moats: { town: true, castle: true },
      historicalPeriod: "ageOfExploration"
    });
    const source = createGridDocument({
      grid: "evolution",
      size: "tiny",
      seed: "3bynwo",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const city = generateCityOnDocument(source, settings, "gn8tsm")!;
    expect(city).not.toBeNull();
    expect(city.generationSeed).toBe("gn8tsm");
    expect(validate(city)).toEqual([]);
    const frame = gateCrossingFrame(city, "v66")!;
    const outside = frame.roads.filter(
      point => (point[0] - frame.point[0]) * frame.inward[0] + (point[1] - frame.point[1]) * frame.inward[1] < 0
    );
    expect(outside).toHaveLength(1);
    const delta: Point = [outside[0][0] - frame.point[0], outside[0][1] - frame.point[1]];
    expect(delta[0] * frame.tangent[0] + delta[1] * frame.tangent[1]).toBeCloseTo(0, 8);
    expect(Math.hypot(...delta)).toBeGreaterThanOrEqual(24 - 1e-8);
    expect(city.mesh.vertices.v100.point).toEqual([15.103083214703275, 197.14223977142487]);
    expect(straightenGateCrossings(city).mesh).toEqual(city.mesh);
    const dry = generateCityOnDocument(source, { ...settings, moats: { town: false, castle: false } }, "gn8tsm")!;
    expect(dry.mesh).toEqual(city.mesh);
    const svg = renderEditorSvg(
      city,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-300 -300 600 600",
      1
    );
    const gateId = city.gates.find(gate => gate.vertexId === "v66")!.id;
    const deck = svg.querySelector(`.ce-drawbridge[data-gate-id="${gateId}"] .ce-drawbridge-deck`)!;
    expect(deck).not.toBeNull();
    const coordinates = deck
      .getAttribute("d")!
      .split(/[ML ,]+/)
      .filter(Boolean)
      .map(Number);
    for (let i = 0; i < coordinates.length; i += 2)
      expect(
        (coordinates[i] - frame.point[0]) * frame.tangent[0] + (-coordinates[i + 1] - frame.point[1]) * frame.tangent[1]
      ).toBeCloseTo(0, 8);
  });

  it.each(["voronoi", "hex", "evolution"] as const)(
    "completes a %s city with both moats and keeps its buildings clear",
    grid => {
      const settings = defaultGenerationSettings();
      settings.config = {
        ...settings.config,
        coast: "none",
        rivers: [],
        features: { walls: true, citadel: true, plaza: true, temple: true, port: false, shanty: false }
      };
      settings.castle =
        grid === "hex" ? { size: "small" } : { size: "small", position: "central", relationship: "detached" };
      if (grid === "hex") settings.config.rivers = ["meander"];
      settings.moats = { town: true, castle: true };
      const doc = generateCityOnDocument(
        createGridDocument({
          size: "small",
          grid,
          hexSizeMeters: 50,
          seed: grid === "hex" ? "ce-urban-area" : "castle-mesh"
        }),
        settings,
        grid === "hex" ? "ce-urban-area" : "castle-test"
      );
      expect(doc).not.toBeNull();
      const moat = new MoatReservation(doc!, 2);
      const buildings = buildCityBuildings(doc!);
      expect(buildings.length).toBeGreaterThan(0);
      expect(buildings.every(b => !moat.hitsPolygon(b.polygon))).toBe(true);
      const invalidRoads = doc!.featureGroups.flatMap(group => {
        if (group.kind !== "road") return [];
        const reservation = new MoatReservation(doc!, group.style.widthMeters / 2 + 1);
        return group.segments
          .filter(ref => {
            const edge = doc!.mesh.edges[ref.edgeId];
            return !reservation.roadAllowed(doc!.mesh.vertices[edge.a].point, doc!.mesh.vertices[edge.b].point);
          })
          .map(ref => `${group.id}:${ref.edgeId}`);
      });
      expect(invalidRoads).toEqual([]);
      const svg = renderEditorSvg(
        doc!,
        "select",
        { faceId: null, edgeId: null, vertexId: null, groupId: null },
        "-600 -600 1200 1200",
        1
      );
      expect(svg.querySelectorAll(".ce-moat-road-bridge").length).toBeGreaterThan(0);
    },
    30000
  );
});
