import { expect, it } from "vitest";
import { createGridDocument } from "./document";
import { defaultGenerationSettings, generateStageOnDocument } from "./generate";
import { validate } from "./mesh";
import { vertexHasKindPassage } from "./passages";

it("shows the curtain, passage splits, then gates in actual placement order", () => {
  const input = createGridDocument({ size: "tiny", grid: "voronoi", seed: "wall-checkpoint-grid" });
  const original = structuredClone(input);
  const settings = defaultGenerationSettings();
  settings.layout = "classic";
  settings.config.coast = "none";
  settings.config.rivers = [];
  settings.config.features.citadel = false;
  const walls = generateStageOnDocument(input, settings, "wall-checkpoint", 4, undefined, "walls")!;
  const passages = generateStageOnDocument(input, settings, "wall-checkpoint", 4, undefined, "passages")!;
  const gates = generateStageOnDocument(input, settings, "wall-checkpoint", 4)!;
  expect(walls).not.toBeNull();
  expect(passages).not.toBeNull();
  expect(gates).not.toBeNull();
  expect(walls.featureGroups.some(g => g.kind === "wall")).toBe(true);
  expect(walls.gates).toEqual([]);
  expect(passages.gates).toEqual([]);
  expect(walls.mesh.vertices).toEqual(input.mesh.vertices);
  expect(walls.mesh.edges).toEqual(input.mesh.edges);
  expect(Object.values(walls.mesh.faces).map(face => face.boundary)).toEqual(
    Object.values(input.mesh.faces).map(face => face.boundary)
  );
  expect(Object.keys(passages.mesh.faces).length).toBeGreaterThan(Object.keys(walls.mesh.faces).length);
  expect(passages.mesh).toEqual(gates.mesh);
  expect(gates.gates.length).toBeGreaterThan(0);
  for (const gate of gates.gates) expect(vertexHasKindPassage(passages, gate.vertexId, "wall")).toBe(true);
  for (const doc of [walls, passages, gates]) {
    expect(doc.featureGroups.some(g => g.kind === "road")).toBe(false);
    expect(validate(doc)).toEqual([]);
  }
  expect(generateStageOnDocument(input, settings, "wall-checkpoint", 4, undefined, "walls")).toEqual(walls);
  expect(generateStageOnDocument(input, settings, "wall-checkpoint", 4, undefined, "passages")).toEqual(passages);
  expect(input).toEqual(original);
});
