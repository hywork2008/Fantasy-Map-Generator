import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import {
  defaultGenerationSettings,
  generateCityAttempt,
  generateCityOnDocument,
  generateStageOnDocument
} from "./generate";
import { captureGenerationDebugPreview, type GenerationDebugPreview } from "./generationDebug";

const input = () => createGridDocument({ size: "tiny", grid: "evolution", seed: "ce-audit-20261002-mesh" });
describe("rejected generation checkpoints", () => {
  it("captures the routed city and disconnected gate without changing the input", () => {
    const source = input();
    const before = structuredClone(source);
    let preview: GenerationDebugPreview | undefined;
    expect(
      generateCityAttempt(
        source,
        defaultGenerationSettings(),
        "ce-audit-20261002:0",
        () => {},
        1,
        p => {
          preview = p;
        }
      )
    ).toBeNull();
    expect(preview?.sample.failure?.reason).toBe("unconnected-gates");
    expect(preview!.document.featureGroups.some(g => g.kind === "road")).toBe(true);
    expect(preview!.document.featureGroups.some(g => g.kind === "river")).toBe(true);
    expect(preview!.highlights.contextual).toBe(false);
    expect(preview!.highlights.vertices.some(id => preview!.document.gates.some(g => g.vertexId === id))).toBe(true);
    expect(source).toEqual(before);
    preview!.document.mesh.vertices[preview!.highlights.vertices[0]].point[0] += 100;
    expect(source).toEqual(before);
  });
  it("stops at the first failed planning checkpoint in debug mode", () => {
    const source = input();
    const before = structuredClone(source);
    const settings = defaultGenerationSettings();
    settings.config.features.citadel = true;
    settings.castle = { position: "central", relationship: "integrated" };
    const previews: GenerationDebugPreview[] = [];
    expect(
      generateCityOnDocument(
        source,
        settings,
        "invalid-castle",
        () => {},
        p => previews.push(p)
      )
    ).toBeNull();
    expect(previews).toHaveLength(1);
    expect(previews.at(-1)?.sample.attempt).toBe(1);
    expect(previews.at(-1)?.seed).toBe("invalid-castle");
    expect(previews.every(p => p.sample.failure?.reason === "castle-no-site")).toBe(true);
    expect(previews.every(p => p.document.featureGroups.some(g => g.kind === "river"))).toBe(true);
    expect(previews[0].highlights.contextual).toBe(true);
    expect(previews[0].highlights.faces.length).toBeGreaterThan(0);
    expect(source).toEqual(before);
  });
  it("still retries eight attempts when debug mode is disabled", () => {
    const settings = defaultGenerationSettings();
    settings.config.features.citadel = true;
    settings.castle = { position: "central", relationship: "integrated" };
    const attempts: number[] = [];
    expect(
      generateCityOnDocument(input(), settings, "invalid-castle", sample => {
        if (sample.failure?.reason === "castle-no-site") attempts.push(sample.attempt);
      })
    ).toBeNull();
    expect(attempts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("captures a failure after geometry finishing", () => {
    let preview: GenerationDebugPreview | undefined;
    expect(
      generateCityAttempt(
        input(),
        defaultGenerationSettings(),
        "ce-audit-20261002:7:junction-retry:1",
        () => {},
        2,
        p => {
          preview = p;
        }
      )
    ).toBeNull();
    expect(preview?.sample.failure?.reason).toBe("self-intersecting-faces");
    expect(preview!.document.appearance).toBe("town");
    expect(preview!.highlights.faces.length).toBeGreaterThan(0);
    expect(preview!.highlights.contextual).toBe(false);
  });
  it("resolves bridge groups and edge IDs in diagnostic text", () => {
    const source = input();
    const refs = Object.values(source.mesh.edges)
      .slice(0, 2)
      .map(e => ({ edgeId: e.id, forward: true }));
    source.featureGroups.push({
      id: "gc:bridge-0",
      name: "Bridge",
      kind: "road",
      segments: refs,
      locked: false,
      style: { widthMeters: 4, color: "black" }
    });
    const preview = captureGenerationDebugPreview(
      source,
      {
        phase: "crossing-validation",
        elapsedMs: 0,
        attempt: 1,
        failure: {
          reason: "invalid-crossings",
          message: "invalid",
          details: ["橋 gc:bridge-0 の頂点数が 5", `城壁と河川が辺 ${refs[0].edgeId} を共有している`]
        }
      },
      "bridge"
    );
    expect(preview.highlights.edges).toEqual(refs.map(r => r.edgeId));
    expect(preview.highlights.contextual).toBe(false);
  });
  it.each([4, 7, 10])("captures failed stage %i without a complete-city retry", stage => {
    const settings = defaultGenerationSettings();
    settings.config.features.citadel = true;
    settings.castle = { position: "central", relationship: "integrated" };
    const previews: GenerationDebugPreview[] = [];
    expect(generateStageOnDocument(input(), settings, "failed-stage", stage, p => previews.push(p))).toBeNull();
    expect(previews).toHaveLength(1);
    expect(previews[0].sample.failure?.reason).toBe("castle-no-site");
    expect(previews[0].seed).toBe("failed-stage");
  });
});
