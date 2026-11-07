import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { createVectorScene } from "../../renderers/vector/scene3d";
import { parseDocument, serializeDocument } from "../../services/io/documentCodec";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { vectorFromFreeform } from "../../services/io/vector/freeform";
import { copyLegacyCity, restoreLegacyCopy } from "../../services/io/vector/legacyCopy";
import type { CityDocument, Point } from "../../types/document";
import type { FreeformCity } from "../../types/freeformCity";
import { buildHarborPlan } from "../blockInfill";
import { createDocument, createGridDocument } from "../document";
import { createFabricPlan } from "../fabricDistricts";
import { buildForestPlan } from "../forestPlan";
import { generateCityOnDocument } from "../generation/generateCity";
import { defaultGenerationSettings } from "../generation/settings";
import { polygonCentroid } from "../geom";
import { activeCargoAssignment, cargoShipGeometry } from "../harborCargo";
import { harborWaterField } from "../harborNavigation";
import { planHarborShips } from "../harborShips";
import { meshFromCells, validate } from "../mesh";
import { reconcileVectorEdit } from "./editing/dependencies";
import { featureReservations } from "./environmentState";
import { deriveVectorBlocks } from "./generation/pipeline";
import { containsRegion, regionArea, regionBoolean } from "./geometry/regions";
import { vectorTerrain } from "./terrain";

const observations: object[] = [];
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
function roundTrip(source: CityDocument) {
  const before = serializeDocument(source);
  expect(validate(source)).toEqual([]);
  expect(parseDocument(before)).not.toBeNull();
  const copy = copyLegacyCity(source);
  const loaded = parseVectorDocument(serializeVectorDocument(copy.document))!;
  expect(loaded).not.toBeNull();
  expect(serializeDocument(source)).toBe(before);
  expect(serializeDocument(restoreLegacyCopy(loaded)!)).toBe(before);
  expect(loaded).not.toHaveProperty("mesh");
  return { ...copy, document: loaded, sourceSha256: sha256(before) };
}
function cellDocument(polygons: Point[][], extent = 100): CityDocument {
  const doc = createDocument("m9-feature-acceptance", extent);
  doc.mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  doc.featureGroups = [];
  doc.elements = [];
  doc.gates = [];
  return doc;
}
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];

describe("M9 feature-specific release evidence", () => {
  it("converts fixed defense ownership, heights, portals and reservations with exact source restoration", () => {
    const settings = defaultGenerationSettings();
    settings.config = structuredClone(settings.config);
    Object.assign(settings.config, { rivers: [], coast: "none", relief: false });
    Object.assign(settings.config.features, { walls: true, citadel: false });
    Object.assign(settings, {
      generationMethod: "skeleton-first",
      wallShape: "bastioned",
      walledAreaShare: 1,
      historicalPeriod: "ageOfExploration",
      townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "dry", streetPlan: "radial" }
    });
    const source = generateCityOnDocument(
      createGridDocument({
        size: "tiny",
        grid: "evolution",
        seed: "m9-defense",
        extentMeters: 1200,
        cityRadiusMeters: 100
      }),
      settings,
      "m9-defense"
    );
    expect(source?.bastionedTown).toBeDefined();
    const plan = source!.bastionedTown!;
    expect(plan.bastions.length).toBeGreaterThan(0);
    expect(plan.ditches.length).toBeGreaterThan(0);
    expect(plan.accesses.length).toBeGreaterThan(0);
    // Exclude unrelated infill and rural snapshots from this defense-only saved fixture.
    // The ordinary generated document exceeds the existing 6 MiB import budget.
    delete source!.fabric;
    delete source!.ruralFieldSnapshot;
    const copy = roundTrip(source!);
    expect(
      copy.document.environment?.defenses,
      JSON.stringify(
        copy.report.filter(
          r => r.status === "unsupported" && ["defense-plan", "wall", "gate", "road"].includes(r.category)
        )
      )
    ).toBeDefined();
    const entities = [
      ...plan.bastions,
      ...plan.curtains,
      ...plan.outworks,
      ...plan.ditches,
      ...plan.coveredWays,
      ...plan.accesses,
      ...(plan.sluices ?? []),
      ...(plan.works ?? [])
    ];
    for (const part of entities)
      expect(copy.report).toContainEqual(expect.objectContaining({ id: part.id, status: "converted" }));
    for (const [i] of plan.glacis.entries())
      expect(copy.report).toContainEqual(
        expect.objectContaining({ id: `${plan.id}:glacis:${i}`, status: "converted" })
      );
    const adopted = copy.document.environment!.defenses![plan.id];
    expect(JSON.stringify(adopted)).not.toMatch(/wallEdgeIds|faceIds|vertexId|sourceJson/);
    expect(adopted.bastions.map(p => p.elevations)).toEqual(plan.bastions.map(p => p.elevations));
    expect(adopted.ditches).toEqual(plan.ditches);
    expect(adopted.outworks).toEqual(plan.outworks);
    expect(adopted.glacis).toEqual(plan.glacis);
    expect(adopted.accesses.map(p => p.elevations)).toEqual(plan.accesses.map(p => p.elevations));
    for (const access of adopted.accesses.filter(a => a.role === "civic"))
      expect(copy.document.connections.gates[access.portal.id]).toBeDefined();
    const reserved = featureReservations(copy.document),
      blocks = deriveVectorBlocks(copy.document);
    expect(blocks.length).toBeGreaterThan(0);
    const overlap = regionBoolean(blocks, reserved, "intersection").reduce((n, p) => n + regionArea(p), 0);
    expect(overlap).toBeLessThan(1e-5);
    const data = vectorRenderData(copy.document),
      scene = createVectorScene(data);
    expect(data.groundCutouts).toEqual(plan.ditches.flatMap(d => d.region));
    const bedSurfaces = data.surfaces.filter(s => s.pieceRole === "ditch-bed");
    expect(bedSurfaces.length).toBeGreaterThan(0);
    for (const surface of bedSurfaces) {
      const mesh = scene.group.children.find(n => n.userData.id === surface.id) as THREE.Mesh;
      expect(mesh).toBeDefined();
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(bounds.min.y).toBeCloseTo(Math.min(...surface.elevations!.flatMap(e => e.bottom)), 4);
    }
    const ground = scene.group.children[0] as THREE.Mesh;
    const vertices = ground.geometry.getAttribute("position"),
      indices = ground.geometry.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
      const p: Point = [
        ids.reduce((n, j) => n + vertices.getX(j), 0) / 3,
        -ids.reduce((n, j) => n + vertices.getZ(j), 0) / 3
      ];
      expect(containsRegion(data.groundCutouts!, p)).toBe(false);
    }
    scene.dispose();
    const malformed = (change: (p: typeof adopted) => void) => {
      const candidate = structuredClone(copy.document);
      change(candidate.environment!.defenses![plan.id]);
      expect(parseVectorDocument(JSON.stringify(candidate))).toBeNull();
    };
    malformed(p => {
      p.bastions[0].ownerId = "missing-owner";
    });
    malformed(p => {
      p.accesses[0].portal.id = "missing-portal";
    });
    malformed(p => {
      p.ditches[0].bed[0] = NaN;
    });
    malformed(p => {
      p.circuit.wallPathIds = ["missing-wall"];
    });
    malformed(p => {
      p.bastions[0].wallSpans[0].from.t = 2;
    });
    malformed(p => {
      const access = p.accesses[0];
      access.bridge[1] = [access.bridge[0][0] + 1000, access.bridge[0][1] + 1000];
    });
    const edited = structuredClone(copy.document);
    edited.environment!.defenses![plan.id].bastions[0].elevations.crest[0] += 1;
    expect(() => reconcileVectorEdit(copy.document, edited)).toThrow("dependency-fixed-defense");
    const wetSource = structuredClone(source!);
    for (const ditch of wetSource.bastionedTown!.ditches) {
      ditch.kind = "wet";
      ditch.waterLevel = (Math.max(...ditch.bed) + Math.min(...ditch.bank)) / 2;
      ditch.supply = { kind: "closed-basin", inlet: "none", outlet: "none" };
    }
    const wet = roundTrip(wetSource);
    expect(
      wet.document.environment?.defenses,
      JSON.stringify(wet.report.filter(r => r.category === "defense-plan"))
    ).toBeDefined();
    const wetData = vectorRenderData(wet.document);
    expect(wetData.surfaces.some(s => s.pieceRole === "ditch-water")).toBe(true);
    const wetScene = createVectorScene(wetData);
    expect(wetScene.group.children.some(n => n.userData.pieceRole === "defense-bridge")).toBe(true);
    wetScene.dispose();
    const reliefSource = structuredClone(source!);
    Object.values(reliefSource.mesh.faces).find(f => f.properties.water === "land")!.properties.elevation = 10;
    const relief = roundTrip(reliefSource);
    expect(relief.document.environment?.defenses).toBeUndefined();
    expect(relief.report).toContainEqual(
      expect.objectContaining({
        category: "defense-plan",
        status: "unsupported",
        reason: expect.stringContaining("defense-relief-not-supported")
      })
    );
    observations.push({
      id: "legacy-defense",
      sourceSha256: copy.sourceSha256,
      wetSourceSha256: wet.sourceSha256,
      outcome: "partially-accepted",
      convertedEntities: entities.length + plan.glacis.length,
      archiveRestored: true,
      blockReservationOverlapM2: overlap,
      dryAndWetDitches: true,
      accepted:
        "Fixed semantic ownership, absolute elevations, wall spans, gates, access links, generation reservations, shared geometry and excavated ground.",
      remaining:
        "Editable defense authoring, broader relief/waterfront cases, legacy castles and the 6 MiB archive budget remain outside this fixed-case acceptance."
    });
  }, 30000);

  it("tests a real legacy cargo berth and reports that navigation and ship semantics are not converted", () => {
    const source = cellDocument([rect(-100, 0, 100, 160), rect(0, 0, 160, 160), rect(160, 0, 160, 160)], 1000);
    source.historicalPeriod = "ageOfExploration";
    source.gridKind = "evolution";
    source.buildingPattern = "medieval";
    source.appearance = "town";
    source.layout = "organic";
    for (const [i, face] of Object.values(source.mesh.faces).entries())
      Object.assign(face.properties, {
        ward: i === 0 ? null : i === 1 ? "harbor" : "merchant",
        water: i === 0 ? "sea" : "land",
        buildable: i !== 0,
        settlement: "core",
        depth: 6
      });
    const edges = Object.values(source.mesh.edges).filter(e => {
      const a = source.mesh.vertices[e.a].point,
        b = source.mesh.vertices[e.b].point;
      return (a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) >= 0) || (a[0] === 160 && b[0] === 160);
    });
    source.featureGroups = edges.map((e, i) => ({
      id: `entry:${i}`,
      kind: "road",
      name: "Street",
      segments: [{ edgeId: e.id, forward: true }],
      style: { widthMeters: 5, color: "black" },
      locked: false
    }));
    source.elements = [{ id: "gc:harbor", kind: "harbor", faceIds: ["f1"], point: [80, 80], locked: false }];
    source.fabric = createFabricPlan(source, "harbor-test-seed");
    const harbor = buildHarborPlan(source),
      ships = planHarborShips(source, "cargo-test", undefined, harbor);
    const cargo = ships.filter(s => activeCargoAssignment(s));
    expect(harbor.cargoQuays!.length).toBeGreaterThan(0);
    expect(cargo.length).toBeGreaterThan(0);
    for (const ship of cargo) {
      const assignment = ship.harborOperation!;
      expect(harbor.cargoQuays!.some(q => q.id === assignment.berthId && q.craneId === assignment.craneId)).toBe(true);
      const dimensions = cargoShipGeometry(ship.shipType!, ship.sizeMeters!);
      expect(harborWaterField(source, dimensions.draft + 0.5).navigable(ship.point!, dimensions.beam / 2)).toBe(true);
    }
    source.elements.push(...ships);
    const copy = roundTrip(source);
    for (const ship of cargo)
      expect(copy.report).toContainEqual(
        expect.objectContaining({ id: `${ship.id}:cargo`, category: "harbor-cargo-assignment", status: "unsupported" })
      );
    for (const ship of ships)
      expect(copy.report).toContainEqual(
        expect.objectContaining({ id: ship.id, category: "ship", status: "unsupported" })
      );
    observations.push({
      id: "legacy-harbor",
      sourceSha256: copy.sourceSha256,
      outcome: "not-accepted",
      sourceCargoQuays: harbor.cargoQuays!.length,
      sourceShips: ships.length,
      sourceActiveCargoAssignments: cargo.length,
      archiveRestored: true,
      remaining:
        "Draft-safe navigation, crane/berth links, ship dimensions and display state have no active vector equivalent."
    });
  }, 30000);

  it("copies resolved automatic forests with clearing holes and water exclusions instead of contradictory farms", () => {
    const source = cellDocument(
      Array.from({ length: 9 }, (_, i) => rect((i % 3) * 20 - 30, Math.floor(i / 3) * 20 - 30, 20, 20))
    );
    source.version = 6;
    source.forestSettings = { version: 1, mode: "farmland", density: "dense" };
    for (const face of Object.values(source.mesh.faces))
      Object.assign(face.properties, { ward: "farm", settlement: "outskirts", water: "land" });
    source.mesh.faces.f4.properties.landCoverOverride = "open";
    const empty = { buildings: [], lanes: [], entrances: new Map(), farms: [] };
    const baseline = buildForestPlan(source, empty);
    expect(baseline.regions).toHaveLength(1);
    expect(baseline.regions[0].holes).toHaveLength(1);
    const check = (doc: CityDocument) => {
      const expected = buildForestPlan(doc, empty),
        copy = roundTrip(doc);
      const forest = Object.values(copy.document.regions).filter(r => r.kind === "forest");
      expect(forest.length).toBeGreaterThan(0);
      expect(regionBoolean(forest, expected.regions, "difference").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(
        1e-5
      );
      expect(regionBoolean(expected.regions, forest, "difference").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(
        1e-5
      );
      const farms = Object.values(copy.document.regions).filter(r => r.kind === "farm");
      expect(regionBoolean(forest, farms, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1e-5);
      const data = vectorRenderData(copy.document);
      for (const region of forest)
        expect(data.surfaces.find(s => s.id === region.id)?.polygons).toEqual([
          { outer: region.outer, holes: region.holes }
        ]);
      const scene = createVectorScene(data);
      for (const region of forest) expect(scene.group.children.some(n => n.userData.id === region.id)).toBe(true);
      scene.dispose();
      expect(copy.report).toContainEqual(expect.objectContaining({ category: "forest", status: "snapshot" }));
      expect(copy.report).toContainEqual(
        expect.objectContaining({ category: "forestSettings", status: "unsupported" })
      );
      return {
        sourceSha256: copy.sourceSha256,
        areaM2: expected.areaM2,
        holes: forest.reduce((n, r) => n + r.holes.length, 0)
      };
    };
    const clearing = check(source);
    expect(clearing.holes).toBe(1);
    source.mesh.faces.f1.properties.water = "lake";
    source.mesh.faces.f1.properties.depth = 4;
    const wet = check(source);
    expect(wet.areaM2).toBeLessThan(clearing.areaM2);
    const roadEdge = Object.values(source.mesh.edges).find(e => {
      const a = source.mesh.vertices[e.a].point,
        b = source.mesh.vertices[e.b].point;
      return a[0] === -10 && b[0] === -10 && Math.min(a[1], b[1]) === 10;
    })!;
    expect(roadEdge).toBeDefined();
    source.featureGroups = [
      {
        id: "forest-road",
        name: "Forest access",
        kind: "road",
        locked: true,
        segments: [{ edgeId: roadEdge.id, forward: true }],
        style: { widthMeters: 4, color: "black" }
      }
    ];
    const road = check(source);
    expect(road.areaM2).toBeLessThan(wet.areaM2);
    observations.push({
      id: "legacy-landscape",
      outcome: "partially-accepted",
      clearing,
      wet,
      road,
      accepted:
        "Resolved automatic forest polygons, clearing holes, water exclusion, disjoint farm ownership, native persistence and shared 2D/3D geometry.",
      remaining:
        "Tree appearance, forest regeneration, other landscape generators and cultural settings remain archived."
    });
  });

  it("measures sharp pad error against an independent analytic profile, including triangle interiors", () => {
    const city: FreeformCity = {
      format: "fmg-freeform-city",
      version: 1,
      frame: { extentMeters: 128 },
      ground: { version: 1, template: "dome", seed: 1, sampleMeters: 8, parts: [{ kind: "offset", meters: 0 }] },
      sculpt: [],
      placements: [],
      ways: [],
      rivers: [],
      zones: [],
      plots: [
        {
          id: "sharp-pad",
          ownerId: "pad-owner",
          outline: rect(-8.5, -8.5, 17, 17),
          levelMeters: 20,
          edge: { kind: "wall" },
          marginMeters: 0
        }
      ]
    };
    const doc = parseVectorDocument(serializeVectorDocument(vectorFromFreeform(city)))!;
    const terrain = vectorTerrain(doc),
      mesh = vectorRenderData(doc).terrain!;
    // The authored wall uses a 0.25m inward band. This formula does not call the
    // evaluator under test, and barycentric interpolation uses the actual draw triangles.
    const analytic = (x: number) => (x <= 8.25 ? 20 : x >= 8.5 ? 0 : (20 * (8.5 - x)) / 0.25);
    const drawAt = (p: Point) => {
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = mesh.indices.slice(i, i + 3).map(j => mesh.points[j]);
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        const u = ((b[2] - c[2]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[2])) / d;
        const v = ((c[2] - a[2]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[2])) / d;
        if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) return a[1] * u + b[1] * v + c[1] * (1 - u - v) + 0.01;
      }
      throw Error("Probe is outside the rendered terrain");
    };
    let maxEvaluatorErrorMeters = 0,
      maxDrawErrorMeters = 0;
    for (let i = 0; i <= 256; i++) {
      const x = 8 + (i * 2) / 256,
        p: Point = [x, 0.37];
      maxEvaluatorErrorMeters = Math.max(maxEvaluatorErrorMeters, Math.abs(terrain.heightAt(p) - analytic(x)));
      maxDrawErrorMeters = Math.max(maxDrawErrorMeters, Math.abs(drawAt(p) - analytic(x)));
    }
    expect(maxEvaluatorErrorMeters).toBeLessThan(1e-8);
    // Characterize an existing release blocker; passing this regression is NOT a 5mm acceptance.
    expect(maxDrawErrorMeters).toBeGreaterThan(0.005);
    observations.push({
      id: "sharp-grading",
      outcome: "not-accepted",
      probes: 257,
      inputSha256: sha256(JSON.stringify(city)),
      maxEvaluatorErrorMeters,
      maxDrawErrorMeters,
      remaining:
        "A fixed draw grid cannot guarantee continuous vertical accuracy at unaligned breaklines. The sampled maximum is a lower bound, not a continuous certificate."
    });
  });
});

afterAll(() => {
  if (process.env.CE_MESHLESS_FEATURE_ACCEPTANCE_OUT) {
    expect(observations).toHaveLength(4);
    writeFileSync(
      process.env.CE_MESHLESS_FEATURE_ACCEPTANCE_OUT,
      `${JSON.stringify(
        {
          format: "ce-meshless-m9-feature-acceptance",
          version: 1,
          releaseChannel: "preview",
          observations
        },
        null,
        2
      )}\n`,
      { flag: "wx" }
    );
  }
});
