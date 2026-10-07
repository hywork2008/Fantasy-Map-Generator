import { describe, expect, it } from "vitest";
import { createSizedDocument } from "./document";
import { generateGateStep, generateRoadStep, generateStageOnDocument, generateWardStep } from "./generate";
import { cachedStep, SCENARIOS, SEEDS } from "./generateTestScenarios";
import { incidentEdges, validate } from "./mesh";
import type { CityDocument } from "./types";

// Split from generate.test.ts so the slow per-loop scrubs run in parallel with it.
describe("generateGateStep — per-loop ④ gate-placement scrub", () => {
  const base = createSizedDocument("small", "mesh-fixture");
  const walled = SCENARIOS["landlocked, one river, walls + citadel"];
  const open = SCENARIOS["bay, no walls"];

  it("valid document, gate topology prepared & frame untouched, for the first/middle/last gate", () => {
    for (const seed of SEEDS) {
      const { total } = cachedStep(generateGateStep, base, walled, seed, 0);
      expect(total).toBeGreaterThan(0);
      // First and last only: the "never shrinks" test walks every index for one seed.
      for (const idx of [0, total - 1]) {
        const step = cachedStep(generateGateStep, base, walled, seed, idx);
        expect(step.document, `gate ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        for (const gate of step.document.gates.filter(g => !g.ownerCastleId))
          expect(incidentEdges(step.document.mesh, gate.vertexId).length).toBeGreaterThanOrEqual(4);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("document.gates never shrinks as the step index grows, and reaches >0 by the end", () => {
    const seed = "ce-gate-a";
    const { total } = cachedStep(generateGateStep, base, walled, seed, 0);
    let prevCount = 0;
    for (let i = 0; i < total; i++) {
      const step = cachedStep(generateGateStep, base, walled, seed, i);
      const count = step.document?.gates?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(prevCount);
      prevCount = count;
    }
    expect(prevCount).toBeGreaterThan(0);
  });

  it("Walls off ⇒ the loop still runs (total > 0) but no gate ever renders", () => {
    const seed = "ce-gate-b";
    const { total } = cachedStep(generateGateStep, base, open, seed, 0);
    expect(total).toBeGreaterThan(0);
    const last = cachedStep(generateGateStep, base, open, seed, total - 1).document as CityDocument;
    expect(last.gates ?? []).toEqual([]);
  });

  it("clamps an out-of-range step index to the last / first gate", () => {
    const seed = "ce-gate-c";
    const { total } = cachedStep(generateGateStep, base, walled, seed, 0);
    expect(cachedStep(generateGateStep, base, walled, seed, total + 50).index).toBe(total - 1);
    expect(cachedStep(generateGateStep, base, walled, seed, -10).index).toBe(0);
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
      const { total } = cachedStep(generateRoadStep, base, walled, seed, 0);
      if (total === 0) continue; // some seeds route no land roads at all
      tested = true;
      // First and last only: the "never shrinks" test walks every index for one seed.
      for (const idx of [0, total - 1]) {
        const step = cachedStep(generateRoadStep, base, walled, seed, idx);
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
      total = cachedStep(generateRoadStep, base, walled, candidate, 0).total;
      if (total > 1) {
        seed = candidate;
        break;
      }
    }
    expect(total, "no seed produced more than one road in the search budget").toBeGreaterThan(1);
    let prevCount = 0;
    for (let i = 0; i < total; i++) {
      const step = cachedStep(generateRoadStep, base, walled, seed, i);
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
      total = cachedStep(generateRoadStep, base, walled, candidate, 0).total;
      if (total > 0) {
        seed = candidate;
        break;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(cachedStep(generateRoadStep, base, walled, seed, total + 50).index).toBe(total - 1);
    expect(cachedStep(generateRoadStep, base, walled, seed, -10).index).toBe(0);
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

  it("valid document, mesh & frame untouched, for the first/middle/last cell", { timeout: 20_000 }, () => {
    for (const seed of SEEDS) {
      const { total } = cachedStep(generateWardStep, base, scenario, seed, 0);
      expect(total).toBeGreaterThan(5);
      for (const idx of [0, 1, Math.floor(total / 2), total - 1]) {
        const step = cachedStep(generateWardStep, base, scenario, seed, idx);
        expect(step.document, `cell ${idx} returned null`).not.toBeNull();
        if (!step.document) continue;
        expect(validate(step.document)).toEqual([]);
        expect(step.document.frame).toEqual(base.frame);
      }
    }
  });

  it("reports every step's decision, and coloured-ward count only ever grows", { timeout: 20_000 }, () => {
    const seed = "ce-ward-a";
    const { total } = cachedStep(generateWardStep, base, scenario, seed, 0);
    let prevColoured = 0;
    for (let i = 0; i < Math.min(total, 40); i++) {
      const step = cachedStep(generateWardStep, base, scenario, seed, i);
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
    const { total } = cachedStep(generateWardStep, base, scenario, seed, 0);
    expect(cachedStep(generateWardStep, base, scenario, seed, total + 50).index).toBe(total - 1);
    expect(cachedStep(generateWardStep, base, scenario, seed, -10).index).toBe(0);
  });

  it("is deterministic in (document, settings, seed, stepIndex)", () => {
    const a = generateWardStep(base, scenario, "stable", 10);
    const b = generateWardStep(base, scenario, "stable", 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a mid-fill step's coloured wards stay a subset of the ordinary ⑥ stage's result", () => {
    const seed = "ce-ward-c";
    const { total } = cachedStep(generateWardStep, base, scenario, seed, 0);
    const full = generateStageOnDocument(base, scenario, seed, 6) as CityDocument;
    const fullWarded = new Set(
      Object.entries(full.mesh.faces)
        .filter(([, f]) => f.properties.ward !== null)
        .map(([id]) => id)
    );
    const mid = cachedStep(generateWardStep, base, scenario, seed, Math.floor(total / 2)).document as CityDocument;
    for (const [id, face] of Object.entries(mid.mesh.faces)) {
      if (face.properties.ward !== null) expect(fullWarded.has(id)).toBe(true);
    }
  });
});
