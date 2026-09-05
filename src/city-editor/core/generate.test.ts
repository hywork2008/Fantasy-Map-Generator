import { describe, expect, it } from "vitest";
import { createGridDocument, createSizedDocument } from "./document";
import { featureGroupVertices } from "./features";
import { polygonArea } from "./gen/geom";
import {
  defaultGenerationSettings,
  GENERATION_STAGES,
  type GenerationSettings,
  generateCoastWalkStep,
  generateGateStep,
  generateRiverWalkStep,
  generateRoadStep,
  generateStageOnDocument,
  generateUrbanPatchStep,
  generateWardStep,
  randomSeed,
  riversForCount,
  type SiteConfig
} from "./generate";
import { edgeBetween, facePoints, incidentEdges, validate } from "./mesh";
import type { CityDocument, FeatureGroup } from "./types";

const S = { coast: 1, river: 2, urban: 3, walls: 4, streets: 5, wards: 6 } as const;

/** The parts of the mesh generation must never touch: vertex coords, edges, and
 * every face's boundary + site. (face.properties IS written — that's the point.) */
function meshSkeleton(document: CityDocument): string {
  return JSON.stringify({
    vertices: document.mesh.vertices,
    edges: document.mesh.edges,
    faces: Object.fromEntries(
      Object.entries(document.mesh.faces).map(([id, face]) => [id, { boundary: face.boundary, site: face.site }])
    )
  });
}

function settings(overrides: Partial<SiteConfig>): GenerationSettings {
  const base = defaultGenerationSettings();
  return { config: { ...base.config, ...overrides } };
}

const SCENARIOS: Record<string, GenerationSettings> = {
  "landlocked, one river, walls + citadel": settings({
    coast: "none",
    rivers: ["meander"],
    features: { walls: true, citadel: true, plaza: true, temple: true, port: false, shanty: false }
  }),
  "coast + harbour + walls": settings({
    coast: "straight",
    rivers: ["toCoast"],
    features: { walls: true, citadel: false, plaza: true, temple: true, port: true, shanty: true }
  }),
  "bay, no walls": settings({
    coast: "bay",
    rivers: [],
    features: { walls: false, citadel: false, plaza: false, temple: false, port: true, shanty: false }
  })
};

const SEEDS = ["ce-gen-a", "ce-gen-b", "ce-gen-c"];

describe("generateStageOnDocument", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const baseline = meshSkeleton(base);

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    for (const seed of SEEDS) {
      describe(`${name} · ${seed}`, () => {
        for (const step of Object.values(S)) {
          it(`stage ${step}: valid document, frame untouched`, () => {
            const out = generateStageOnDocument(base, scenario, seed, step);
            expect(out, `stage ${step} returned null`).not.toBeNull();
            if (!out) return;
            expect(validate(out)).toEqual([]);
            expect(out.frame).toEqual(base.frame);
            // ①–④ must not rebuild the grid. ⑤–⑥ may merge/split a vertex to
            // open a 4-way gate or bridge, so the skeleton may change.
            if (step < S.streets) expect(meshSkeleton(out)).toBe(baseline);
          });
        }

        it("withholds each plan layer until its own stage", () => {
          const coast = generateStageOnDocument(base, scenario, seed, S.coast);
          expect(coast?.featureGroups.some(g => g.kind === "river")).toBe(false);
          expect(coast?.featureGroups.some(g => g.kind === "wall")).toBe(false);
          expect(coast?.featureGroups.some(g => g.kind === "road")).toBe(false);
          const beforeStreets = generateStageOnDocument(base, scenario, seed, S.walls);
          expect(beforeStreets?.featureGroups.some(g => g.kind === "road")).toBe(false);
        });

        it("assigns wards to cells only at the ward stage", () => {
          const beforeWards = generateStageOnDocument(base, scenario, seed, S.streets);
          expect(Object.values(beforeWards?.mesh.faces ?? {}).every(f => f.properties.ward === null)).toBe(true);
          const warded = generateStageOnDocument(base, scenario, seed, S.wards);
          expect(Object.values(warded?.mesh.faces ?? {}).some(f => f.properties.ward !== null)).toBe(true);
        });
      });
    }
  }

  it("tags sea cells when the coast reaches the window", () => {
    const bay = SCENARIOS["bay, no walls"];
    const tagged = SEEDS.some(seed => {
      const out = generateStageOnDocument(base, bay, seed, S.coast);
      return Object.values(out?.mesh.faces ?? {}).some(f => f.properties.water === "sea");
    });
    expect(tagged).toBe(true);
  });

  it("draws a wall round the urban blob when Walls is on (some seed)", () => {
    const walled = SCENARIOS["landlocked, one river, walls + citadel"];
    const drew = SEEDS.some(
      seed =>
        (generateStageOnDocument(base, walled, seed, S.walls)?.featureGroups.filter(g => g.kind === "wall").length ??
          0) > 0
    );
    expect(drew).toBe(true);
  });

  it("emits no wall when Walls is off", () => {
    const open = SCENARIOS["bay, no walls"];
    for (const seed of SEEDS) {
      const out = generateStageOnDocument(base, open, seed, S.walls);
      expect(out?.featureGroups.filter(g => g.kind === "wall").length ?? 0).toBe(0);
      expect(out?.gates ?? []).toEqual([]);
    }
  });

  it("is deterministic in (document, settings, seed, stage)", () => {
    const scenario = SCENARIOS["coast + harbour + walls"];
    const a = generateStageOnDocument(base, scenario, "stable", S.wards);
    const b = generateStageOnDocument(base, scenario, "stable", S.wards);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a different seed ⇒ a different plan, same map frame", () => {
    const scenario = SCENARIOS["landlocked, one river, walls + citadel"];
    const plans = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const out = generateStageOnDocument(base, scenario, randomSeed(), S.wards);
      expect(out?.frame).toEqual(base.frame);
      plans.add(JSON.stringify({ fg: out?.featureGroups, gates: out?.gates }));
    }
    expect(plans.size).toBeGreaterThan(1);
  });

  it("re-generating on its own output stays valid with disjoint river/road edges", () => {
    const scenario = SCENARIOS["coast + harbour + walls"];
    const once = generateStageOnDocument(base, scenario, "idem", S.wards) as CityDocument;
    const twice = generateStageOnDocument(once, scenario, "idem", S.wards) as CityDocument;
    expect(twice).not.toBeNull();
    expect(validate(twice)).toEqual([]);
    const riverEdges = edgeIdsUsedBy(twice, "river");
    const roadEdges = edgeIdsUsedBy(twice, "road");
    for (const id of roadEdges) expect(riverEdges.has(id)).toBe(false);
  });

  it("covers every stage id in GENERATION_STAGES", () => {
    expect(GENERATION_STAGES.map(s => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

function edgeIdsUsedBy(document: CityDocument, kind: FeatureGroup["kind"]): Set<string> {
  const ids = new Set<string>();
  for (const group of document.featureGroups) {
    if (group.kind !== kind) continue;
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = edgeBetween(document.mesh, group.vertices[i - 1], group.vertices[i]);
        if (edge) ids.add(edge.id);
      }
    } else {
      for (const segment of group.segments) ids.add(segment.edgeId);
    }
  }
  return ids;
}

describe("Phase G7 — generated roads never share an edge with a river", () => {
  const base = createSizedDocument("small", "mesh-fixture");

  it("stage ⑤ road edgeIds ∩ river-derived edgeIds is empty", () => {
    const withRivers = [SCENARIOS["landlocked, one river, walls + citadel"], SCENARIOS["coast + harbour + walls"]];
    let sawRiver = false;
    let sawRoad = false;
    for (const scenario of withRivers) {
      for (const seed of SEEDS) {
        const out = generateStageOnDocument(base, scenario, seed, S.streets);
        expect(out, `${seed} returned null`).not.toBeNull();
        if (!out) continue;
        const riverEdges = edgeIdsUsedBy(out, "river");
        const roadEdges = edgeIdsUsedBy(out, "road");
        if (riverEdges.size) sawRiver = true;
        if (roadEdges.size) sawRoad = true;
        for (const id of roadEdges) expect(riverEdges.has(id), `road occupies river edge ${id}`).toBe(false);
      }
    }
    expect(sawRiver).toBe(true);
    expect(sawRoad).toBe(true);
  });

  it("road–river meeting vertices have 4+ edges so they can pass through on diagonals", () => {
    const scenario = SCENARIOS["landlocked, one river, walls + citadel"];
    let meetings = 0;
    for (const seed of SEEDS) {
      const out = generateStageOnDocument(base, scenario, seed, S.streets);
      if (!out) continue;
      const riverVerts = new Set<string>();
      const roadVerts = new Set<string>();
      for (const group of out.featureGroups) {
        const verts = featureGroupVertices(out, group);
        if (group.kind === "river") for (const id of verts) riverVerts.add(id);
        if (group.kind === "road") for (const id of verts) roadVerts.add(id);
      }
      for (const id of roadVerts) {
        if (!riverVerts.has(id)) continue;
        meetings++;
        expect(incidentEdges(out.mesh, id).length).toBeGreaterThanOrEqual(4);
      }
    }
    expect(meetings).toBeGreaterThanOrEqual(0);
  });

  it("when a wall sits on a river edge, the road still does not", () => {
    const scenario = SCENARIOS["landlocked, one river, walls + citadel"];
    for (const seed of SEEDS) {
      const out = generateStageOnDocument(base, scenario, seed, S.streets);
      if (!out) continue;
      const riverEdges = edgeIdsUsedBy(out, "river");
      const wallEdges = edgeIdsUsedBy(out, "wall");
      const roadEdges = edgeIdsUsedBy(out, "road");
      for (const id of wallEdges) {
        if (!riverEdges.has(id)) continue;
        expect(roadEdges.has(id)).toBe(false);
      }
    }
  });
});

/** Buildable land face ids — the ③ urban-core marker this module writes. */
function buildableLandFaceIds(document: CityDocument): Set<string> {
  return new Set(
    Object.values(document.mesh.faces)
      .filter(f => f.properties.water === "land" && f.properties.buildable)
      .map(f => f.id)
  );
}

describe("generateUrbanPatchStep — per-loop urban-core scrub (towngen-comparison.md §2.1)", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const baseline = meshSkeleton(base);
  const scenario = SCENARIOS["landlocked, one river, walls + citadel"];

  it("valid document, mesh & frame untouched, for the first/middle/last step", () => {
    for (const seed of SEEDS) {
      const { total } = generateUrbanPatchStep(base, scenario, seed, 0);
      expect(total).toBeGreaterThan(5);
      for (const idx of [0, 1, Math.floor(total / 2), total - 1]) {
        const step = generateUrbanPatchStep(base, scenario, seed, idx);
        expect(step.document, `step ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(meshSkeleton(step.document)).toBe(baseline);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("admits exactly one more buildable land cell per step, strictly growing", () => {
    const seed = "ce-patch-a";
    const { total } = generateUrbanPatchStep(base, scenario, seed, 0);
    let prev: Set<string> | null = null;
    for (let i = 0; i < Math.min(total, 20); i++) {
      const step = generateUrbanPatchStep(base, scenario, seed, i);
      const buildable = buildableLandFaceIds(step.document as CityDocument);
      expect(step.index).toBe(i);
      expect(buildable.size).toBe(i + 1);
      if (prev) for (const id of prev) expect(buildable.has(id)).toBe(true);
      prev = buildable;
    }
  });

  it("reports the admitted cell id as the sole newly-buildable face between two steps", () => {
    const seed = "ce-patch-b";
    const prevStep = generateUrbanPatchStep(base, scenario, seed, 3);
    const nextStep = generateUrbanPatchStep(base, scenario, seed, 4);
    const prevBuildable = buildableLandFaceIds(prevStep.document as CityDocument);
    const nextBuildable = buildableLandFaceIds(nextStep.document as CityDocument);
    const added = [...nextBuildable].filter(id => !prevBuildable.has(id));
    expect(added).toHaveLength(1);
    expect(nextStep.cellId).not.toBeNull();
  });

  it("clamps an out-of-range step index to the last / first admitted cell", () => {
    const seed = "ce-patch-c";
    const { total } = generateUrbanPatchStep(base, scenario, seed, 0);
    expect(generateUrbanPatchStep(base, scenario, seed, total + 50).index).toBe(total - 1);
    expect(generateUrbanPatchStep(base, scenario, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateUrbanPatchStep(base, scenario, "stable", 6);
    const b = generateUrbanPatchStep(base, scenario, "stable", 6);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a mid-fill step's buildable cells stay a subset of the ordinary ③ stage's result", () => {
    const seed = "ce-patch-d";
    const { total } = generateUrbanPatchStep(base, scenario, seed, 0);
    const full = generateStageOnDocument(base, scenario, seed, 3) as CityDocument;
    const fullBuildable = buildableLandFaceIds(full);
    const stepped = generateUrbanPatchStep(base, scenario, seed, total - 1).document as CityDocument;
    for (const id of buildableLandFaceIds(stepped)) expect(fullBuildable.has(id)).toBe(true);
  });
});

describe("GenerationSettings.urbanNPatches — the ③ count-cutoff override", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const scenario = SCENARIOS["landlocked, one river, walls + citadel"];

  it("caps the flood-fill total to exactly N when N is well inside the eligible area", () => {
    const capped: GenerationSettings = { ...scenario, urbanNPatches: 8 };
    expect(generateUrbanPatchStep(base, capped, "ce-npatches", 0).total).toBe(8);
  });

  it("is unset by default; setting it shrinks the total relative to the auto count", () => {
    const withCap = generateUrbanPatchStep(base, { ...scenario, urbanNPatches: 6 }, "ce-npatches-2", 0).total;
    const uncapped = generateUrbanPatchStep(base, scenario, "ce-npatches-2", 0).total;
    expect(withCap).toBe(6);
    expect(withCap).toBeLessThan(uncapped);
  });

  it("also caps the ordinary ③ stage button's urban footprint (not only the stepper)", () => {
    const capped: GenerationSettings = { ...scenario, urbanNPatches: 5 };
    const uncappedOut = generateStageOnDocument(base, scenario, "ce-npatches-3", 3) as CityDocument;
    const cappedOut = generateStageOnDocument(base, capped, "ce-npatches-3", 3) as CityDocument;
    expect(buildableLandFaceIds(cappedOut).size).toBeLessThan(buildableLandFaceIds(uncappedOut).size);
  });
});

describe("③ auto core area is grid-agnostic (π R² / mean cell area)", () => {
  const scenario = SCENARIOS["landlocked, one river, walls + citadel"];
  const seed = "ce-urban-area";

  const builtArea = (document: CityDocument): number =>
    Object.values(document.mesh.faces)
      .filter(face => face.properties.water === "land" && face.properties.buildable)
      .reduce((sum, face) => sum + Math.abs(polygonArea(facePoints(document.mesh, face))), 0);

  it("hex 50 m and Voronoi Small towns cover a similar built-up area", () => {
    const hex = createGridDocument({ size: "small", grid: "hex", hexSizeMeters: 50, seed });
    const voronoi = createGridDocument({ size: "small", grid: "voronoi", seed });
    const hexOut = generateStageOnDocument(hex, scenario, seed, 3) as CityDocument;
    const voronoiOut = generateStageOnDocument(voronoi, scenario, seed, 3) as CityDocument;
    const hexArea = builtArea(hexOut);
    const voronoiArea = builtArea(voronoiOut);
    expect(hexArea).toBeGreaterThan(0);
    expect(voronoiArea).toBeGreaterThan(0);
    expect(hexArea / voronoiArea).toBeGreaterThan(0.7);
    expect(hexArea / voronoiArea).toBeLessThan(1.4);
  });

  it("hex 50 m walls stay inside the Small frame", () => {
    const hex = createGridDocument({ size: "small", grid: "hex", hexSizeMeters: 50, seed });
    const out = generateStageOnDocument(hex, scenario, seed, 4) as CityDocument;
    const half = out.frame.extentMeters / 2;
    const walls = out.featureGroups.filter(group => group.kind === "wall");
    expect(walls.length).toBeGreaterThan(0);
    let maxAbs = 0;
    for (const group of walls) {
      if (group.kind !== "wall") continue;
      for (const segment of group.segments) {
        const edge = out.mesh.edges[segment.edgeId];
        for (const id of [edge.a, edge.b]) {
          const [x, y] = out.mesh.vertices[id].point;
          maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
        }
      }
    }
    expect(maxAbs).toBeLessThan(half * 0.9);
  });
});

describe("generateCoastWalkStep — per-loop ① shoreline scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const baseline = meshSkeleton(base);
  const coastal = SCENARIOS["coast + harbour + walls"];
  const landlocked = SCENARIOS["landlocked, one river, walls + citadel"];

  it("valid document, mesh & frame untouched, for the first/middle/last vertex", () => {
    for (const seed of SEEDS) {
      const { total } = generateCoastWalkStep(base, coastal, seed, 0);
      expect(total).toBeGreaterThan(3);
      for (const idx of [0, 1, Math.floor(total / 2), total - 1]) {
        const step = generateCoastWalkStep(base, coastal, seed, idx);
        expect(step.document, `vertex ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(meshSkeleton(step.document)).toBe(baseline);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("reveals exactly one more walked vertex per step, strictly growing", () => {
    const seed = "ce-coast-a";
    const { total } = generateCoastWalkStep(base, coastal, seed, 0);
    for (let i = 0; i < Math.min(total, 20); i++) {
      const step = generateCoastWalkStep(base, coastal, seed, i);
      expect(step.index).toBe(i);
      expect(step.overlayPaths).toHaveLength(1);
      expect(step.overlayPaths?.[0]).toHaveLength(i + 1);
    }
  });

  it("never tags a sea cell while scrubbing — press ① itself for the classified result", () => {
    const seed = "ce-coast-b";
    const { total } = generateCoastWalkStep(base, coastal, seed, 0);
    const last = generateCoastWalkStep(base, coastal, seed, total - 1).document as CityDocument;
    expect(Object.values(last.mesh.faces).some(f => f.properties.water === "sea")).toBe(false);
    const pressed = generateStageOnDocument(base, coastal, seed, 1) as CityDocument;
    expect(Object.values(pressed.mesh.faces).some(f => f.properties.water === "sea")).toBe(true);
  });

  it("clamps an out-of-range step index to the last / first vertex", () => {
    const seed = "ce-coast-c";
    const { total } = generateCoastWalkStep(base, coastal, seed, 0);
    expect(generateCoastWalkStep(base, coastal, seed, total + 50).index).toBe(total - 1);
    expect(generateCoastWalkStep(base, coastal, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateCoastWalkStep(base, coastal, "stable", 3);
    const b = generateCoastWalkStep(base, coastal, "stable", 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("no coastline configured ⇒ total 0, no overlay", () => {
    const step = generateCoastWalkStep(base, landlocked, "ce-coast-d", 0);
    expect(step.total).toBe(0);
    expect(step.index).toBe(-1);
    expect(step.overlayPaths).toEqual([]);
  });
});

describe("generateRiverWalkStep — per-loop ② river-walk scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const baseline = meshSkeleton(base);
  const oneRiver = SCENARIOS["landlocked, one river, walls + citadel"];
  const noRiver = SCENARIOS["bay, no walls"];
  const twoRivers: GenerationSettings = {
    config: { ...oneRiver.config, coast: "bay", rivers: riversForCount({ ...oneRiver.config, coast: "bay" }, 2) }
  };

  it("valid document, mesh & frame untouched, for the first/middle/last vertex", () => {
    for (const seed of SEEDS) {
      const { total } = generateRiverWalkStep(base, oneRiver, seed, 0);
      expect(total).toBeGreaterThan(1);
      for (const idx of [0, 1, Math.floor(total / 2), total - 1]) {
        const step = generateRiverWalkStep(base, oneRiver, seed, idx);
        expect(step.document, `vertex ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(meshSkeleton(step.document)).toBe(baseline);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("reveals exactly one more walked vertex per step, strictly growing", () => {
    const seed = "ce-river-a";
    const { total } = generateRiverWalkStep(base, oneRiver, seed, 0);
    for (let i = 0; i < Math.min(total, 20); i++) {
      const step = generateRiverWalkStep(base, oneRiver, seed, i);
      expect(step.index).toBe(i);
      expect(step.overlayPaths?.[0]).toHaveLength(i + 1);
    }
  });

  it("never draws a river feature group while scrubbing — press ② itself for the result", () => {
    const seed = "ce-river-b";
    const { total } = generateRiverWalkStep(base, oneRiver, seed, 0);
    const last = generateRiverWalkStep(base, oneRiver, seed, total - 1).document as CityDocument;
    expect(last.featureGroups.some(g => g.kind === "river")).toBe(false);
    const pressed = generateStageOnDocument(base, oneRiver, seed, 2) as CityDocument;
    expect(pressed.featureGroups.some(g => g.kind === "river")).toBe(true);
  });

  it("no river configured ⇒ total 0, no overlay", () => {
    const step = generateRiverWalkStep(base, noRiver, "ce-river-c", 0);
    expect(step.total).toBe(0);
    expect(step.index).toBe(-1);
    expect(step.overlayPaths).toEqual([]);
  });

  it("two rivers: completes the first river's walk before the second begins", () => {
    let picked: { seed: string; total: number; firstLen: number } | null = null;
    for (const seed of [...SEEDS, "ce-river-2a", "ce-river-2b", "ce-river-2c"]) {
      const probe = generateRiverWalkStep(base, twoRivers, seed, 0);
      // Need a scenario where BOTH rivers actually walked onto the grid.
      const atEnd = generateRiverWalkStep(base, twoRivers, seed, probe.total - 1);
      if (atEnd.overlayPaths?.every(p => p.length > 0) && atEnd.overlayPaths.length === 2) {
        picked = { seed, total: probe.total, firstLen: atEnd.overlayPaths[0].length };
        break;
      }
    }
    expect(picked, "no seed produced two walked rivers in the search budget").not.toBeNull();
    if (!picked) return;
    const { seed, firstLen } = picked;

    // Just before river 1 finishes: river 1 partial, river 2 untouched.
    const before = generateRiverWalkStep(base, twoRivers, seed, firstLen - 2);
    expect(before.overlayPaths?.[0]).toHaveLength(firstLen - 1);
    expect(before.overlayPaths?.[1]).toEqual([]);

    // Right as river 2 starts: river 1 complete, river 2 has its first vertex.
    const after = generateRiverWalkStep(base, twoRivers, seed, firstLen);
    expect(after.overlayPaths?.[0]).toHaveLength(firstLen);
    expect(after.overlayPaths?.[1]).toHaveLength(1);
    expect(after.detail).toContain("river 2");
  });

  it("clamps an out-of-range step index to the last / first vertex", () => {
    const seed = "ce-river-d";
    const { total } = generateRiverWalkStep(base, oneRiver, seed, 0);
    expect(generateRiverWalkStep(base, oneRiver, seed, total + 50).index).toBe(total - 1);
    expect(generateRiverWalkStep(base, oneRiver, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateRiverWalkStep(base, oneRiver, "stable", 2);
    const b = generateRiverWalkStep(base, oneRiver, "stable", 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("generateGateStep — per-loop ④ gate-placement scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const baseline = meshSkeleton(base);
  const walled = SCENARIOS["landlocked, one river, walls + citadel"];
  const open = SCENARIOS["bay, no walls"];

  it("valid document, mesh & frame untouched, for the first/middle/last gate", () => {
    for (const seed of SEEDS) {
      const { total } = generateGateStep(base, walled, seed, 0);
      expect(total).toBeGreaterThan(0);
      for (const idx of [0, Math.floor(total / 2), total - 1]) {
        const step = generateGateStep(base, walled, seed, idx);
        expect(step.document, `gate ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(meshSkeleton(step.document)).toBe(baseline);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("document.gates never shrinks as the step index grows, and reaches >0 by the end", () => {
    const seed = "ce-gate-a";
    const { total } = generateGateStep(base, walled, seed, 0);
    let prevCount = 0;
    for (let i = 0; i < total; i++) {
      const step = generateGateStep(base, walled, seed, i);
      const count = step.document?.gates?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(prevCount);
      prevCount = count;
    }
    expect(prevCount).toBeGreaterThan(0);
  });

  it("Walls off ⇒ the loop still runs (total > 0) but no gate ever renders", () => {
    const seed = "ce-gate-b";
    const { total } = generateGateStep(base, open, seed, 0);
    expect(total).toBeGreaterThan(0);
    const last = generateGateStep(base, open, seed, total - 1).document as CityDocument;
    expect(last.gates ?? []).toEqual([]);
  });

  it("clamps an out-of-range step index to the last / first gate", () => {
    const seed = "ce-gate-c";
    const { total } = generateGateStep(base, walled, seed, 0);
    expect(generateGateStep(base, walled, seed, total + 50).index).toBe(total - 1);
    expect(generateGateStep(base, walled, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateGateStep(base, walled, "stable", 1);
    const b = generateGateStep(base, walled, "stable", 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("generateRoadStep — per-loop ⑤ approach-road scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const walled = SCENARIOS["landlocked, one river, walls + citadel"];

  it("valid document, mesh & frame untouched, for the first/middle/last road", () => {
    let tested = false;
    for (const seed of SEEDS) {
      const { total } = generateRoadStep(base, walled, seed, 0);
      if (total === 0) continue; // some seeds route no land roads at all
      tested = true;
      for (const idx of [0, Math.floor(total / 2), total - 1]) {
        const step = generateRoadStep(base, walled, seed, idx);
        expect(step.document, `road ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
    expect(tested, "no seed produced any road in the search budget").toBe(true);
  });

  it("drawn road count never shrinks as the step index grows, and reaches >0 by the end", () => {
    let seed = "";
    let total = 0;
    for (const candidate of [...SEEDS, "ce-road-a", "ce-road-b", "ce-road-c"]) {
      total = generateRoadStep(base, walled, candidate, 0).total;
      if (total > 1) {
        seed = candidate;
        break;
      }
    }
    expect(total, "no seed produced more than one road in the search budget").toBeGreaterThan(1);
    let prevCount = 0;
    for (let i = 0; i < total; i++) {
      const step = generateRoadStep(base, walled, seed, i);
      const count = step.document?.featureGroups.filter(g => g.kind === "road").length ?? 0;
      expect(count).toBeGreaterThanOrEqual(prevCount);
      prevCount = count;
    }
    expect(prevCount).toBeGreaterThan(0);
  });

  it("clamps an out-of-range step index to the last / first road", () => {
    let seed = "";
    let total = 0;
    for (const candidate of SEEDS) {
      total = generateRoadStep(base, walled, candidate, 0).total;
      if (total > 0) {
        seed = candidate;
        break;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(generateRoadStep(base, walled, seed, total + 50).index).toBe(total - 1);
    expect(generateRoadStep(base, walled, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateRoadStep(base, walled, "stable", 0);
    const b = generateRoadStep(base, walled, "stable", 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("generateWardStep — per-loop ⑥ ward-assignment scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const scenario = SCENARIOS["landlocked, one river, walls + citadel"];

  it("valid document, mesh & frame untouched, for the first/middle/last cell", () => {
    for (const seed of SEEDS) {
      const { total } = generateWardStep(base, scenario, seed, 0);
      expect(total).toBeGreaterThan(5);
      for (const idx of [0, 1, Math.floor(total / 2), total - 1]) {
        const step = generateWardStep(base, scenario, seed, idx);
        expect(step.document, `cell ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("reports every step's decision, and coloured-ward count only ever grows", { timeout: 20_000 }, () => {
    const seed = "ce-ward-a";
    const { total } = generateWardStep(base, scenario, seed, 0);
    let prevColoured = 0;
    for (let i = 0; i < Math.min(total, 40); i++) {
      const step = generateWardStep(base, scenario, seed, i);
      expect(step.index).toBe(i);
      expect(step.detail).toMatch(/cell #\d+ — \d+\/\d+$/);
      const coloured =
        Object.values(step.document?.mesh.faces ?? {}).filter(f => f.properties.ward !== null).length ?? 0;
      expect(coloured).toBeGreaterThanOrEqual(prevColoured);
      prevColoured = coloured;
    }
    expect(prevColoured).toBeGreaterThan(0);
  });

  it("clamps an out-of-range step index to the last / first cell", () => {
    const seed = "ce-ward-b";
    const { total } = generateWardStep(base, scenario, seed, 0);
    expect(generateWardStep(base, scenario, seed, total + 50).index).toBe(total - 1);
    expect(generateWardStep(base, scenario, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateWardStep(base, scenario, "stable", 10);
    const b = generateWardStep(base, scenario, "stable", 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a mid-fill step's coloured wards stay a subset of the ordinary ⑥ stage's result", () => {
    const seed = "ce-ward-c";
    const { total } = generateWardStep(base, scenario, seed, 0);
    const full = generateStageOnDocument(base, scenario, seed, 6) as CityDocument;
    const fullWarded = new Set(
      Object.entries(full.mesh.faces)
        .filter(([, f]) => f.properties.ward !== null)
        .map(([id]) => id)
    );
    const mid = generateWardStep(base, scenario, seed, Math.floor(total / 2)).document as CityDocument;
    for (const [id, face] of Object.entries(mid.mesh.faces)) {
      if (face.properties.ward !== null) expect(fullWarded.has(id)).toBe(true);
    }
  });
});

describe("riversForCount", () => {
  it("clamps negatives to an empty list", () => {
    expect(riversForCount(defaultGenerationSettings().config, -3)).toEqual([]);
  });
  it("sends the first river to the coast when there is one", () => {
    const config = { ...defaultGenerationSettings().config, coast: "bay" as const };
    expect(riversForCount(config, 2)).toEqual(["toCoast", "meander"]);
  });
  it("keeps every river inland when landlocked", () => {
    const config = { ...defaultGenerationSettings().config, coast: "none" as const };
    expect(riversForCount(config, 2)).toEqual(["meander", "meander"]);
  });
});
