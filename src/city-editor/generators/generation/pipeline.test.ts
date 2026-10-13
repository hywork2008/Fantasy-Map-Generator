import { describe, expect, it } from "vitest";
import type { GenerationSample } from "../../types/contracts/generationDiagnostics";
import { type CityParams, DEFAULT_WALL_PLAN } from "../../types/geometry";
import { createGridDocument } from "../document";
import { resolveWallPlan, siteToGeography, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { cellsFromMesh } from "./meshGeometry";
import { runPlan } from "./pipeline";
import { defaultGenerationSettings } from "./settings";

const seed = "phase2-pipeline-boundary";
function request() {
  const document = createGridDocument({ size: "small", grid: "voronoi", seed });
  const settings = defaultGenerationSettings();
  settings.config = {
    ...settings.config,
    coast: "straight",
    rivers: ["toCoast"],
    features: { walls: true, citadel: true, plaza: true, temple: true, port: true, shanty: false }
  };
  const { extentMeters, cityRadiusMeters, blockSizeMeters } = document.frame;
  const descriptor = synthSite("largeTown", settings.config, seed, { extentMeters, cityRadiusMeters });
  const geo = siteToGeography(descriptor);
  const baseProgram = siteToProgram(descriptor);
  const program = {
    ...baseProgram,
    wallPlan: resolveWallPlan(baseProgram.wallPlan ?? DEFAULT_WALL_PLAN, settings.config.wall)
  };
  const params: CityParams = {
    seed,
    extentMeters,
    cityRadiusMeters,
    dwellings: descriptor.burg.dwellings,
    cellSizeMeters: blockSizeMeters,
    lloydPasses: 1
  };
  const { cells, faceIdOf } = cellsFromMesh(document.mesh, extentMeters / 2);
  return { document, settings, geo, program, params, cells, faceIdOf };
}

function execute(input: ReturnType<typeof request>, stage: number, attempt: number) {
  const { document, settings, geo, program, params, cells, faceIdOf } = input;
  const samples: GenerationSample[] = [];
  const plan = runPlan(
    document.mesh,
    faceIdOf,
    cells,
    geo,
    program,
    params,
    seed,
    document.frame.extentMeters / 2,
    document.frame.blockSizeMeters,
    settings,
    stage,
    false,
    sample => samples.push(sample),
    attempt,
    true,
    document.gridKind,
    document
  );
  return { plan, samples };
}

function orderedData(value: unknown) {
  return JSON.stringify(value, (_, item) =>
    item instanceof Set ? { set: [...item] } : item instanceof Map ? { map: [...item] } : item
  );
}

describe("planning pipeline contracts", () => {
  it("stops at each requested boundary and reports the admitted urban counts before wall adjustments", () => {
    const phases = ["edge-graph", "coast", "river", "urban", "wall-plan", "street-plan", "wards"];
    for (let stage = 1; stage <= 6; stage++) {
      const { plan, samples } = execute(request(), stage, 3);
      expect(samples.map(sample => sample.phase)).toEqual(phases.slice(0, stage + 1));
      expect(samples.every(sample => sample.attempt === 3 && Number.isFinite(sample.elapsedMs))).toBe(true);
      if (stage === 3) {
        expect(samples[3].counts?.builtUpFaces).toBe(plan.builtUp.size);
        expect(samples[3].counts?.urbanFaces).toBeGreaterThanOrEqual(plan.urban.size);
      }
      if (stage < 4) expect(plan.borderLoops).toEqual([]);
      if (stage < 5) expect(plan.roads).toEqual([]);
      if (stage < 6) expect(plan.wards.size).toBe(0);
    }
  });

  it("owns no source mutation or cross-run state, including after planning a different seed", () => {
    const input = request();
    const before = orderedData(input);
    const first = execute(input, 6, 1);
    const other = request();
    runPlan(
      other.document.mesh,
      other.faceIdOf,
      other.cells,
      other.geo,
      other.program,
      other.params,
      "other-seed",
      other.document.frame.extentMeters / 2,
      other.document.frame.blockSizeMeters,
      other.settings,
      6
    );
    const repeated = execute(input, 6, 2);
    expect(orderedData(input)).toBe(before);
    expect(orderedData(repeated.plan)).toBe(orderedData(first.plan));
    expect(repeated.plan.sea).not.toBe(first.plan.sea);
    expect(repeated.plan.wards).not.toBe(first.plan.wards);
    expect(repeated.samples.map(({ elapsedMs, attempt, ...sample }) => sample)).toEqual(
      first.samples.map(({ elapsedMs, attempt, ...sample }) => sample)
    );
  });
});
