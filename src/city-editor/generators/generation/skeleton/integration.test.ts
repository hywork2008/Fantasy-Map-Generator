import { describe, expect, it } from "vitest";
import nemyshl from "../../../data/fixtures/nemyshl-20261014.json";
import { parseDocument } from "../../../services/io/documentCodec";
import { buildShare, parseIncomingPayload } from "../../../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../../services/io/shareRequest";
import type { GenerationSample } from "../../../types/contracts/generationDiagnostics";
import type { GenerationSettings } from "../../../types/generation";
import { buildBlockFabric } from "../../blockInfill";
import { createGridDocument } from "../../document";
import { validate } from "../../mesh";
import { explainGeneratedCrossingFailures } from "../../passages";
import { generateCityOnDocument } from "../generateCity";
import { generateStageOnDocument, generateWardStep } from "../previews";
import { defaultGenerationSettings } from "../settings";
import { generationStageDefinitions } from "../stages";
import { generateSkeletonPreview } from "./previews";
import { prepareSkeletonRun } from "./toPlan";

const source = () => createGridDocument({ size: "tiny", grid: "evolution", seed: "s3-source" });
const settings = (): GenerationSettings => ({ ...defaultGenerationSettings(), generationMethod: "skeleton-first" });

describe("skeleton-first full generation", () => {
  it.each(["organic", "round", "oval", "square", "polygon", "bastioned"] as const)(
    "generates and reloads a %s wall with valid bridges and buildings",
    wallShape => {
      const input = source(),
        opts = { ...settings(), wallShape },
        before = JSON.stringify(input);
      const samples: GenerationSample[] = [];
      const city = generateCityOnDocument(input, opts, "s3", sample => samples.push(sample))!;
      expect(city).toBeTruthy();
      expect(city.gridKind).toBe("evolution");
      expect(city.fabric?.generation?.algorithm).toBe("skeleton-city-v1");
      expect(validate(city)).toEqual([]);
      expect(explainGeneratedCrossingFailures(city)).toEqual([]);
      expect(buildBlockFabric(city).buildings.length).toBeGreaterThan(0);
      expect(parseDocument(JSON.stringify(city))).not.toBeNull();
      expect(JSON.stringify(input)).toBe(before);
      const audits = samples.filter(s => s.phase.startsWith("skeleton-audit:"));
      expect(audits.length).toBeGreaterThan(0);
      for (const audit of audits) expect(audit.counts?.constraintChanges).toBe(0);
    }
  );

  it("replays a saved recipe byte-for-byte and supports a regenerated document as input", () => {
    const city = generateCityOnDocument(source(), settings(), "s3", () => {})!;
    const loaded = parseDocument(JSON.stringify(city))!;
    const recipe = loaded.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed, () => {});
    expect(replay).toEqual(city);
    const regenerated = generateCityOnDocument(city, settings(), "s3-new", () => {})!;
    expect(parseDocument(JSON.stringify(regenerated))).not.toBeNull();
  });

  it("keeps the omitted generation method equivalent to explicit mesh-first", () => {
    const opts = defaultGenerationSettings();
    opts.config.rivers = [];
    const input = source();
    const implicit = generateCityOnDocument(input, opts, "mesh-compat", () => {})!;
    const explicit = generateCityOnDocument(
      input,
      { ...opts, generationMethod: "mesh-first" },
      "mesh-compat",
      () => {}
    )!;
    expect(implicit).toBeTruthy();
    expect(explicit).toBeTruthy();
    delete explicit.fabric!.generation!.settings.generationMethod;
    expect(explicit).toEqual(implicit);
    expect(implicit.fabric?.generation?.algorithm).toBe("castle-city-v1");
  });

  it("keeps FMG surveyed rivers and certified crossings under their original ownership", () => {
    const share = parseIncomingPayload(JSON.stringify(nemyshl))!;
    const opts = { ...cityEditorSettings(share), generationMethod: "skeleton-first" as const };
    const input = cityEditorDocument(share);
    expect(prepareSkeletonRun(input, opts, share.seed).inputs.rivers.length).toBeGreaterThan(0);
    const city = generateCityOnDocument(input, opts, share.seed, () => {})!;
    expect(city).toBeTruthy();
    expect(city.importedFixedCrossings).toEqual(share.descriptor!.fixedCrossings);
    expect(city.featureGroups.filter(g => g.kind === "river")).toHaveLength(0);
    expect(city.featureGroups.filter(g => g.kind === "road" && g.sourceRoad).length).toBe(city.importedRoadCount);
    expect(validate(city)).toEqual([]);
    expect(parseDocument(JSON.stringify(city))).not.toBeNull();
  });

  it("does not join separate road runs after a bridge detour leaves the frame", () => {
    const input = createGridDocument({ size: "tiny", grid: "evolution", seed: "ce-s0-20261014-mesh" });
    const opts = settings();
    opts.config.rivers = ["meander", "meander"];
    const city = generateCityOnDocument(input, opts, "ce-s0-20261014:6", () => {});
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    expect(parseDocument(JSON.stringify(city))).not.toBeNull();
  });

  it("refines an undersized historic curtain consistently in generation and previews", () => {
    const input = source();
    input.frame.cityRadiusMeters = 40;
    const opts = { ...settings(), walledAreaShare: 0.65 };
    opts.config.rivers = [];
    const run = prepareSkeletonRun(input, opts, "small-curtain");
    expect(run.inputs.cellSize).toBeLessThan(input.frame.blockSizeMeters);
    const preview = generateSkeletonPreview(input, opts, "small-curtain", 6);
    expect(preview.document).not.toBeNull();
    const city = generateCityOnDocument(input, opts, "small-curtain", () => {});
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
  });

  it("rejects unsupported API options with diagnostics", () => {
    const samples: GenerationSample[] = [];
    expect(
      generateCityOnDocument(source(), { ...settings(), townWallRings: "double" }, "bad", s => samples.push(s))
    ).toBeNull();
    expect(samples[0].failure?.reason).toBe("unsupported-skeleton-settings");
    expect(samples[0].failure?.message).toContain("double walls");
  });

  it("rejects a bastioned wall before the age of exploration", () => {
    const samples: GenerationSample[] = [];
    const opts = { ...settings(), wallShape: "bastioned" as const, historicalPeriod: "lateMedieval" as const };
    expect(generateCityOnDocument(source(), opts, "early", s => samples.push(s))).toBeNull();
    expect(samples[0].failure?.reason).toBe("unsupported-skeleton-settings");
    expect(samples[0].failure?.message).toContain("bastioned");
  });

  it("keeps method and shape in shared requests", () => {
    const opts = { ...settings(), wallShape: "polygon" as const, wallSides: 7 };
    const share = buildShare({ seed: "shared-s3", grid: "evolution", size: "tiny", settings: opts });
    const parsed = parseIncomingPayload(JSON.stringify(share));
    expect(parsed?.settings?.generationMethod).toBe("skeleton-first");
    expect(parsed?.settings?.wallSides).toBe(7);
  });

  it("previews K1-K5 without a mesh, K6 with a mesh, then the downstream wards", () => {
    const input = source(),
      opts = settings();
    const definitions = generationStageDefinitions(opts);
    expect(definitions.slice(0, 6).map(s => s.processStep)).toEqual([-1, -2, -3, -4, -5, -6]);
    for (let step = 1; step <= 6; step++) {
      const preview = generateSkeletonPreview(input, opts, "s3", step);
      expect(preview.document).not.toBeNull();
      expect(preview.overlayPaths.length).toBeGreaterThan(0);
      expect(Object.keys(preview.document!.mesh.faces).length > 0).toBe(step === 6);
    }
    const wards = generateStageOnDocument(input, opts, "s3", 6, undefined, "wards");
    expect(wards).not.toBeNull();
    expect(Object.values(wards!.mesh.faces).some(f => f.properties.ward !== null)).toBe(true);
    const firstWard = generateWardStep(input, opts, "s3", 0);
    const lastWard = generateWardStep(input, opts, "s3", 10000);
    expect(firstWard.document).not.toBeNull();
    expect(lastWard.document).not.toBeNull();
    expect(lastWard.total).toBeGreaterThan(0);
    expect(lastWard.document!.mesh.vertices).toEqual(firstWard.document!.mesh.vertices);
    expect(lastWard.document!.mesh.edges).toEqual(firstWard.document!.mesh.edges);
  });
});
