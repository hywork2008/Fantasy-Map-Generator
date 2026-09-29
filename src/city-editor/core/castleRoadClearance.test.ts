import { expect, it } from "vitest";
import { castleRoadEdgeAllowed } from "./castles";
import { createGridDocument } from "./document";
import { removeGroup } from "./features";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { validate } from "./mesh";

it("keeps roads clear of the reported cape castle and allows curtain deletion", () => {
  const input = createGridDocument({
    size: "tiny",
    grid: "evolution",
    seed: "1ku5501",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.walledAreaShare = 1;
  settings.config.coast = "cape";
  settings.config.rivers = ["beside", "greatBend"];
  settings.config.relief = false;
  settings.config.features = { walls: false, citadel: true, plaza: true, temple: false, port: true, shanty: true };
  const city = generateCityOnDocument(input, settings, "15c0p36");
  expect(city).not.toBeNull();
  expect(city!.castles).toHaveLength(1);
  expect(validate(city!)).toEqual([]);
  const approach = city!.featureGroups.find(g => g.id === "gc:castle-0:approach");
  expect(approach?.kind).toBe("road");
  if (approach?.kind === "road") expect(approach.segments.length).toBeGreaterThan(0);
  const wallEdges = new Set(city!.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : [])));
  for (const group of city!.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) expect(wallEdges.has(ref.edgeId)).toBe(false);
    for (const ref of group.segments)
      expect(castleRoadEdgeAllowed(city!, ref.edgeId, group.style.widthMeters), `${group.id}/${ref.edgeId}`).toBe(true);
  }
  const wall = city!.featureGroups.find(g => g.id === "gc:castle-0:curtain-0")!;
  expect(wall).toBeDefined();
  if (wall.kind === "wall") {
    const curtain = city!.mesh.edges[wall.segments[0].edgeId];
    const a = city!.mesh.vertices[curtain.a].point,
      b = city!.mesh.vertices[curtain.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const offset = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const probe = structuredClone(city!);
    probe.mesh.vertices.probeA = { id: "probeA", point: [a[0] + offset[0], a[1] + offset[1]], locked: false };
    probe.mesh.vertices.probeB = { id: "probeB", point: [b[0] + offset[0], b[1] + offset[1]], locked: false };
    probe.mesh.edges.probe = { id: "probe", a: "probeA", b: "probeB", leftFace: null, rightFace: null, locked: false };
    expect(castleRoadEdgeAllowed(probe, "probe", 4)).toBe(false);
  }

  const removed = removeGroup(city!, wall.id);
  expect(removed.featureGroups.some(g => g.id === wall.id)).toBe(false);
  expect(validate(removed)).toEqual([]);
});
