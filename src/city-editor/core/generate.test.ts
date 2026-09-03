import { describe, expect, it } from "vitest";
import type { SiteConfig } from "../../city-generator";
import { createSizedDocument } from "./document";
import {
  defaultGenerationSettings,
  GENERATION_STAGES,
  type GenerationSettings,
  generateStageOnDocument,
  randomSeed,
  riversForCount
} from "./generate";
import { validate } from "./mesh";
import type { CityDocument } from "./types";

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
          it(`stage ${step}: valid document, mesh & frame untouched`, () => {
            const out = generateStageOnDocument(base, scenario, seed, step);
            expect(out, `stage ${step} returned null`).not.toBeNull();
            if (!out) return;
            expect(validate(out)).toEqual([]);
            expect(meshSkeleton(out)).toBe(baseline); // ← the reported bug
            expect(out.frame).toEqual(base.frame);
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

  it("a different seed ⇒ a different plan, same mesh", () => {
    const scenario = SCENARIOS["landlocked, one river, walls + citadel"];
    const plans = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const out = generateStageOnDocument(base, scenario, randomSeed(), S.wards);
      expect(meshSkeleton(out as CityDocument)).toBe(baseline);
      plans.add(JSON.stringify({ fg: out?.featureGroups, gates: out?.gates }));
    }
    expect(plans.size).toBeGreaterThan(1);
  });

  it("re-generating on its own output is a clean idempotent no-op", () => {
    const scenario = SCENARIOS["coast + harbour + walls"];
    const once = generateStageOnDocument(base, scenario, "idem", S.wards) as CityDocument;
    const twice = generateStageOnDocument(once, scenario, "idem", S.wards) as CityDocument;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("covers every stage id in GENERATION_STAGES", () => {
    expect(GENERATION_STAGES.map(s => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
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
