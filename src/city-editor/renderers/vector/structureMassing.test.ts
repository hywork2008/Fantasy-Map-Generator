import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { vectorPickOwner } from "./picking";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

const city = generateVectorSkeleton(syntheticVectorInput("p2-walls", 220, true), {
  ...DEFAULT_VECTOR_GENERATION,
  seed: "p2-walls",
  wall: "ellipse"
}).document;

describe("meshless walls, gates and bridges as the mesh editor's structure massing (feature parity P2)", () => {
  it("builds wall runs cut at every passage gate, curtain towers, gate flanks and lintels, and bridge decks", () => {
    const data = vectorRenderData(city, "regions"),
      walls = data.structures!.filter(s => s.kind === "wall"),
      bridges = data.structures!.filter(s => s.kind === "bridge"),
      passages = Object.values(city.connections.gates).filter(g => g.kind === "passage");
    expect(walls).toHaveLength(1);
    const parts = walls[0].parts;
    expect(parts.filter(p => p.kind === "wall").length).toBe(Object.keys(city.connections.gates).length);
    expect(parts.some(p => p.kind === "tower")).toBe(true);
    for (const gate of passages) {
      expect(parts.filter(p => p.id.startsWith(`gate:${gate.id}:flank:`))).toHaveLength(2);
      expect(parts.some(p => p.id === `gate:${gate.id}:lintel`)).toBe(true);
    }
    // No barbican: a gate is its two flanks and the lintel.
    expect(parts.filter(p => p.kind === "gate")).toHaveLength(passages.length * 3);
    expect(bridges.length).toBe(Object.keys(city.connections.bridges).length);
    expect(bridges.length).toBeGreaterThan(0);
  });
  it("draws them with the shared structure meshes instead of extruded outlines, picked by their owner", () => {
    const data = vectorRenderData(city, "regions"),
      scene = createVectorScene(data),
      wallId = data.structures!.find(s => s.kind === "wall")!.owner;
    const meshes: THREE.Mesh[] = [];
    scene.group.traverse(o => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes.some(m => m.userData.representation === "footprint" && m.userData.kind === "wall")).toBe(false);
    const wallMesh = meshes.find(m => vectorPickOwner(m) === wallId);
    expect(wallMesh).toBeDefined();
    expect(new THREE.Box3().setFromObject(wallMesh!).max.y).toBeGreaterThan(4);
    scene.dispose();
  });
});
