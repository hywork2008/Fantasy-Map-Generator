import { describe, expect, it } from "vitest";
import { reliefShade } from "../renderers/cellElevationSvg";
import type { CityDocument, Id, RiverGroup } from "../types/document";
import { createGridDocument } from "./document";
import {
  applyElevationRelief,
  downhillAzimuth,
  elevationReliefScale,
  elevationSampler,
  presetAmplitude,
  presetElevation,
  reliefAmplitude,
  settleRiverGrades
} from "./elevationPreset";
import { settings } from "./generateTestScenarios";
import { generateStageOnDocument } from "./generation/previews";
import { incidentFaces } from "./mesh";

function grid(): CityDocument {
  return createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 50, seed: "elev-unit" });
}

function landBed(document: CityDocument, vertexId: Id): number | null {
  let bed = Infinity;
  for (const face of incidentFaces(document.mesh, vertexId)) {
    if (face.properties.water !== "land" || !Number.isFinite(face.properties.elevation)) continue;
    bed = Math.min(bed, face.properties.elevation);
  }
  return Number.isFinite(bed) ? bed : null;
}

function span(document: CityDocument): [Id, Id] {
  let low: Id | null = null;
  let high: Id | null = null;
  for (const vertex of Object.values(document.mesh.vertices)) {
    if (!low || vertex.point[0] < document.mesh.vertices[low].point[0]) low = vertex.id;
    if (!high || vertex.point[0] > document.mesh.vertices[high].point[0]) high = vertex.id;
  }
  if (!low || !high || low === high) throw new Error("mesh has no horizontal span");
  return [low, high];
}

function sharesFace(document: CityDocument, a: Id, b: Id): boolean {
  const faces = new Set(incidentFaces(document.mesh, a).map(face => face.id));
  return incidentFaces(document.mesh, b).some(face => faces.has(face.id));
}

function river(vertices: Id[], locked = false): RiverGroup {
  return {
    id: "river-test",
    kind: "river",
    name: "Test",
    vertices,
    source: null,
    mouth: null,
    style: { widthMeters: 8, color: "#4f8aad" },
    locked
  };
}

function setElevation(document: CityDocument, vertexId: Id, elevation: number): void {
  for (const face of incidentFaces(document.mesh, vertexId)) {
    face.properties.water = "land";
    face.properties.locked = false;
    face.properties.elevation = elevation;
  }
}

describe("elevation presets", () => {
  it("scales relief with the frame", () => {
    expect(reliefAmplitude(300)).toBe(12);
    expect(reliefAmplitude(600)).toBe(24);
    expect(reliefAmplitude(1200)).toBe(48);
    expect(reliefAmplitude(4800)).toBe(80);
  });

  it("multiplies the clamped base and snaps the slider scale", () => {
    expect(elevationReliefScale(undefined)).toBe(1);
    expect(elevationReliefScale(8.4)).toBe(8);
    expect(elevationReliefScale(0.2)).toBe(1);
    expect(presetAmplitude(1200, 1)).toBe(48);
    expect(presetAmplitude(1200, 2)).toBe(96);
    expect(presetAmplitude(4800, 1)).toBe(80);
    expect(presetAmplitude(4800, 4)).toBe(320);
    expect(presetAmplitude(300, 2)).toBe(24);
  });

  it("shapes a slope, a dome, a basin, and a valley", () => {
    const half = 150;
    const amplitude = 12;
    expect(presetElevation("slope", [-half, 0], half, 0, amplitude)).toBe(14);
    expect(presetElevation("slope", [half, 0], half, 0, amplitude)).toBe(2);
    expect(presetElevation("slope", [0, 0], half, 0, amplitude)).toBe(8);
    expect(presetElevation("dome", [0, 0], half, 0, amplitude)).toBe(14);
    expect(presetElevation("dome", [half, half], half, 0, amplitude)).toBe(2);
    expect(presetElevation("basin", [0, 0], half, 0, amplitude)).toBe(2);
    expect(presetElevation("basin", [half, half], half, 0, amplitude)).toBe(14);
    expect(presetElevation("valley", [0, 0], half, 0, amplitude)).toBe(2);
    expect(presetElevation("valley", [0, half], half, 0, amplitude)).toBe(14);
  });

  it.each(["slope", "valley"] as const)("rotates %s through arbitrary angles independently of rivers", preset => {
    const plan = {
      elevationPreset: preset,
      rivers: [
        {
          resolvedEdgePoints: [
            [0, 0],
            [100, 0]
          ] as [number, number][]
        }
      ],
      waterPolygon: null
    };
    const sample = (rotation: number) =>
      elevationSampler({ ...plan, elevationRotation: rotation }, { extentMeters: 300 });
    const angle = 37.5;
    const radians = (angle * Math.PI) / 180;
    const rotated = sample(angle);
    const reference = sample(0);
    const point: [number, number] = [
      100 * Math.cos(radians) - 50 * Math.sin(radians),
      100 * Math.sin(radians) + 50 * Math.cos(radians)
    ];
    expect(rotated(point, 0, 1)).toBe(reference([100, 50], 0, 1));
    expect(sample(360)([100, 50], 0, 1)).toBe(reference([100, 50], 0, 1));
    expect(sample(90)([100, 0], 0, 1)).toBe(reference([0, 100], 0, 1));
    if (preset === "slope") expect(sample(180)([150, 0], 0, 1)).toBe(14);

    const source = grid();
    const first = applyElevationRelief(source, { elevationPreset: preset, elevationRotation: 0 });
    const turned = applyElevationRelief(first, { elevationPreset: preset, elevationRotation: angle });
    expect(turned).not.toBe(first);
    expect(applyElevationRelief(turned, { elevationPreset: preset, elevationRotation: angle })).toBe(turned);
  });

  it("orients downhill along a river, then a coast, then the seed", () => {
    expect(
      downhillAzimuth(
        [
          {
            resolvedEdgePoints: [
              [0, 0],
              [10, 0]
            ]
          }
        ],
        null,
        "seed"
      )
    ).toBeCloseTo(0);
    const coast = downhillAzimuth(
      [],
      [
        [100, 0],
        [110, 10],
        [110, -10]
      ],
      "seed"
    );
    expect(coast).toBeGreaterThan(-0.2);
    expect(coast).toBeLessThan(0.2);
    const hashed = downhillAzimuth([], null, "seed");
    expect(hashed).toBe(downhillAzimuth([], null, "seed"));
    expect(hashed).toBeGreaterThanOrEqual(0);
    expect(hashed).toBeLessThan(Math.PI * 2);
  });

  it("keeps a flat map on the FMG height or the current land elevation", () => {
    const sample = elevationSampler(
      {
        elevationPreset: "flat",
        fmgElevations: new Map([[3, 237]]),
        rivers: [],
        waterPolygon: null
      },
      { extentMeters: 300 }
    );
    expect(sample([0, 0], 3, 1)).toBe(237);
    expect(sample([0, 0], 9, 4.2)).toBe(4.2);
    expect(sample([0, 0], 9, 0)).toBe(1);
    const slope = elevationSampler(
      {
        elevationPreset: "slope",
        fmgElevations: new Map([[0, 237]]),
        elevationSeed: "seed",
        rivers: [
          {
            resolvedEdgePoints: [
              [0, 0],
              [10, 0]
            ]
          }
        ],
        waterPolygon: null
      },
      { extentMeters: 300 }
    );
    expect(slope([150, 0], 0, 1)).toBe(2);
    expect(slope([-150, 0], 0, 1)).toBe(14);
    const doubled = elevationSampler(
      {
        elevationPreset: "slope",
        elevationRelief: 2,
        elevationSeed: "seed",
        rivers: [
          {
            resolvedEdgePoints: [
              [0, 0],
              [10, 0]
            ]
          }
        ],
        waterPolygon: null
      },
      { extentMeters: 300 }
    );
    expect(doubled([-150, 0], 0, 1)).toBe(26);
    expect(doubled([150, 0], 0, 1)).toBe(2);
  });

  it("paints a tint only once a land cell is visibly above 1 m", () => {
    expect(reliefShade(1)).toBeNull();
    expect(reliefShade(1.7)).toBeNull();
    expect(reliefShade(41)).toEqual({ fill: "#6e5840", opacity: "0.73" });
  });

  it("returns the same document when every river already runs downhill", () => {
    const document = grid();
    for (const face of Object.values(document.mesh.faces)) face.properties.elevation = 5;
    const [low, high] = span(document);
    document.featureGroups = [river([low, high])];
    expect(settleRiverGrades(document)).toBe(document);
  });

  it("reverses an uphill river and leaves the previous document untouched", () => {
    const document = grid();
    const [low, high] = span(document);
    expect(sharesFace(document, low, high)).toBe(false);
    for (const face of Object.values(document.mesh.faces)) face.properties.elevation = 3;
    setElevation(document, high, 12);
    document.featureGroups = [river([low, high])];
    const kept = incidentFaces(document.mesh, high)[0];
    const settled = settleRiverGrades(document);
    const turned = settled.featureGroups[0];
    expect(kept.properties.elevation).toBe(12);
    expect(turned?.kind).toBe("river");
    if (turned?.kind !== "river") return;
    expect(turned.vertices).toEqual([high, low]);
    expect(turned.mouth?.vertexId).toBe(low);
    expect(landBed(settled, high)).toBeGreaterThanOrEqual((landBed(settled, low) ?? 0) - 1e-6);
  });

  it("does not reverse a locked river, and still lowers unlocked steps", () => {
    const document = grid();
    const [low, high] = span(document);
    for (const face of Object.values(document.mesh.faces)) face.properties.elevation = 3;
    setElevation(document, high, 12);
    document.featureGroups = [river([low, high], true)];
    const settled = settleRiverGrades(document);
    const group = settled.featureGroups[0];
    expect(group?.kind).toBe("river");
    if (group?.kind !== "river") return;
    expect(group.vertices).toEqual([low, high]);
    expect(settled.featureGroups).toBe(document.featureGroups);
    expect(landBed(settled, high)!).toBeLessThanOrEqual((landBed(settled, low) ?? 0) + 1e-6);
  });

  it("puts the sea end downstream and does not lower the sea", () => {
    const document = grid();
    const [inland, sea] = span(document);
    for (const face of incidentFaces(document.mesh, sea)) {
      face.properties.water = "sea";
      face.properties.elevation = 0;
    }
    document.featureGroups = [river([sea, inland])];
    const settled = settleRiverGrades(document);
    const group = settled.featureGroups[0];
    expect(group?.kind).toBe("river");
    if (group?.kind !== "river") return;
    expect(group.vertices).toEqual([inland, sea]);
    expect(group.mouth).toEqual({ vertexId: sea, kind: "water" });
    for (const face of incidentFaces(settled.mesh, sea)) {
      expect(face.properties.water).toBe("sea");
      expect(face.properties.elevation).toBe(0);
    }
  });

  it("lowers an unlocked hump and keeps a locked cell", () => {
    const document = grid();
    let middle: Id | null = null;
    let upstream: Id | null = null;
    let downstream: Id | null = null;
    for (const vertex of Object.values(document.mesh.vertices)) {
      const around = incidentFaces(document.mesh, vertex.id);
      if (around.length < 3) continue;
      const neighbors = new Set<Id>();
      for (const face of around) {
        for (const ref of face.boundary) {
          const edge = document.mesh.edges[ref.edgeId];
          if (!edge) continue;
          if (edge.a !== vertex.id) neighbors.add(edge.a);
          if (edge.b !== vertex.id) neighbors.add(edge.b);
        }
      }
      const exclusive = [...neighbors].filter(id =>
        incidentFaces(document.mesh, id).some(face => !around.some(owned => owned.id === face.id))
      );
      if (exclusive.length < 2) continue;
      middle = vertex.id;
      upstream = exclusive[0];
      downstream = exclusive[1];
      break;
    }
    expect(middle).not.toBeNull();
    if (!middle || !upstream || !downstream) return;
    for (const face of Object.values(document.mesh.faces)) face.properties.elevation = 4;
    for (const face of incidentFaces(document.mesh, middle)) face.properties.elevation = 10;
    document.featureGroups = [river([upstream, middle, downstream])];
    const open = settleRiverGrades(document);
    expect(document.mesh.faces[incidentFaces(document.mesh, middle)[0].id].properties.elevation).toBe(10);
    for (const face of incidentFaces(open.mesh, middle)) expect(face.properties.elevation).toBe(4);

    for (const face of incidentFaces(document.mesh, middle)) face.properties.locked = true;
    const closed = settleRiverGrades(document);
    for (const face of incidentFaces(closed.mesh, middle)) expect(face.properties.elevation).toBe(10);
  });

  it("rewrites only land relief and leaves a second pass unchanged", () => {
    const document = grid();
    const road = {
      id: "road-kept",
      kind: "road" as const,
      name: "Street",
      segments: [],
      style: { widthMeters: 4, color: "#888" },
      locked: false
    };
    document.featureGroups = [road];
    const faces = Object.values(document.mesh.faces);
    const wardFace = faces[0];
    const locked = faces[1];
    const sea = faces[2];
    const reserved = faces[3];
    wardFace.properties.ward = "market";
    locked.properties.locked = true;
    locked.properties.elevation = 7;
    sea.properties.water = "sea";
    sea.properties.elevation = 0;
    reserved.properties.elevation = 9;
    document.defenseCircuits = [
      {
        id: "castle-circuit",
        scope: "castle",
        areaFaceIds: [reserved.id],
        wallGroupIds: [],
        naturalBarriers: [],
        locked: false
      }
    ];
    const skip = new Set([locked.id, sea.id, reserved.id]);
    const mild = applyElevationRelief(document, {
      elevationPreset: "slope",
      elevationRelief: 1,
      elevationSeed: "seed"
    });
    const steep = applyElevationRelief(document, {
      elevationPreset: "slope",
      elevationRelief: 4,
      elevationSeed: "seed"
    });
    expect(landRange(steep, skip)).toBeGreaterThan(landRange(mild, skip) * 3);
    expect(steep.featureGroups).toBe(document.featureGroups);
    expect(steep.mesh.faces[wardFace.id].properties.ward).toBe("market");
    expect(steep.mesh.faces[locked.id]).toBe(locked);
    expect(steep.mesh.faces[locked.id].properties.elevation).toBe(7);
    expect(steep.mesh.faces[sea.id].properties.water).toBe("sea");
    expect(steep.mesh.faces[sea.id].properties.elevation).toBe(0);
    expect(steep.mesh.faces[reserved.id].properties.elevation).toBe(9);
    expect(wardFace.properties.elevation).toBe(1);
    expect(applyElevationRelief(steep, { elevationPreset: "slope", elevationRelief: 4, elevationSeed: "seed" })).toBe(
      steep
    );
    expect(applyElevationRelief(document, { elevationPreset: "flat", elevationRelief: 8 })).toBe(document);
  });
});

function landRange(document: CityDocument, skip: ReadonlySet<Id>): number {
  const heights = Object.values(document.mesh.faces)
    .filter(face => face.properties.water === "land" && !skip.has(face.id))
    .map(face => face.properties.elevation);
  return Math.max(...heights) - Math.min(...heights);
}

describe("generated cell elevations", () => {
  const features = { walls: false, citadel: false, plaza: false, temple: false, port: false, shanty: false };

  it("keeps a flat standalone map at 1 m even when relief is on", () => {
    const input = createGridDocument({ size: "micro", grid: "hex", seed: "elev-flat" });
    const options = settings({ coast: "none", rivers: [], relief: true, layout: "organic", features });
    options.elevationPreset = "flat";
    options.layout = "organic";
    const city = generateStageOnDocument(input, options, "elev-flat", 1);
    expect(city).not.toBeNull();
    const land = Object.values(city!.mesh.faces).filter(face => face.properties.water === "land");
    expect(land.length).toBeGreaterThan(0);
    expect(new Set(land.map(face => face.properties.elevation))).toEqual(new Set([1]));
  });

  it("passes rotation through staged generation", () => {
    const input = grid();
    const options = settings({ coast: "none", rivers: [], relief: false, layout: "organic", features });
    options.elevationPreset = "slope";
    options.elevationRotation = 127.5;
    const city = generateStageOnDocument(input, options, "rotation", 1)!;
    expect(city).not.toBeNull();
    expect(applyElevationRelief(city, { elevationPreset: "slope", elevationRotation: 127.5 })).toBe(city);
  });

  it("writes a slope and keeps the river from climbing", () => {
    const input = createGridDocument({ size: "micro", grid: "hex", seed: "elev-slope" });
    const options = settings({
      coast: "none",
      rivers: ["straight"],
      relief: false,
      layout: "organic",
      features
    });
    options.elevationPreset = "slope";
    options.layout = "organic";
    const city = generateStageOnDocument(input, options, "elev-slope", 2);
    expect(city).not.toBeNull();
    const land = Object.values(city!.mesh.faces).filter(face => face.properties.water === "land");
    const heights = land.map(face => face.properties.elevation);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(4);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(1);
    const group = city!.featureGroups.find(item => item.kind === "river");
    expect(group?.kind).toBe("river");
    if (group?.kind !== "river") return;
    let running: number | null = null;
    for (const vertexId of group.vertices) {
      const height = landBed(city!, vertexId);
      if (height === null) continue;
      if (running !== null) expect(height).toBeLessThanOrEqual(running + 1e-6);
      running = height;
    }
    expect(running).not.toBeNull();
  });
});
