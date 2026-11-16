import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { containsRegion, regionArea } from "../../generators/vector/geometry/regions";
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
    scene.group.updateMatrixWorld(true);
    expect(wallMesh).toBeDefined();
    expect(new THREE.Box3().setFromObject(wallMesh!).max.y).toBeGreaterThan(4);
    scene.dispose();
  });
});

describe("meshless stone walls as the mesh editor's BV town walls (feature parity P2d-2)", () => {
  it("replaces the stone curtain, curtain towers and passage gates with BV stonework picked by the wall", () => {
    const data = vectorRenderData(city, "regions"),
      wall = data.structures!.find(s => s.kind === "wall" && s.material === "stone")!,
      scene = createVectorScene(data);
    expect(wall.gates!.length).toBeGreaterThan(0);
    const meshes: THREE.Mesh[] = [];
    scene.group.traverse(o => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const stone = meshes.find(m => m.name === "codex-town-defenses");
    expect(stone).toBeDefined();
    expect(vectorPickOwner(stone!)).toBe(wall.owner);
    // Each gate's flanks and lintel are one BV gatehouse: one replaced lintel per passage.
    const ids = new Set<number>(),
      index = stone!.geometry.getAttribute("buildingIndex");
    for (let i = 0; i < index.count; i++) ids.add(index.getX(i));
    const replaced = [...ids].map(i => wall.parts[i].kind);
    expect(replaced.filter(k => k === "gate")).toHaveLength(wall.gates!.length);
    expect(replaced.filter(k => k === "tower").length).toBeGreaterThan(0);
    expect(replaced.filter(k => k === "wall").length).toBeGreaterThan(0);
    scene.dispose();
  });
});

describe("meshless roads as the mesh editor's wearing-course ribbons (feature parity P2b)", () => {
  it("classifies main roads by the wall, keeps outlines only as hidden pick targets, and leaves water to bridges", () => {
    const data = vectorRenderData(city, "regions"),
      roads = data.roads!;
    expect(roads.ribbons.length).toBeGreaterThan(0);
    expect(new Set(roads.ribbons.map(r => r.surface)).size).toBeGreaterThan(0);
    // Runs end on the bank, so their segment midpoints are dry.
    for (const ribbon of roads.ribbons)
      for (let i = 1; i < ribbon.centerline.length; i++) {
        const a = ribbon.centerline[i - 1],
          b = ribbon.centerline[i],
          mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        expect(roads.water.polygons.some(w => containsRegion([{ outer: w, holes: [] }], mid))).toBe(false);
      }
    const scene = createVectorScene(data),
      meshes: THREE.Mesh[] = [];
    scene.group.traverse(o => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const outlines = meshes.filter(m => m.userData.kind === "road");
    expect(outlines.length).toBeGreaterThan(0);
    expect(outlines.every(m => !m.visible)).toBe(true);
    const road = meshes.find(m => m.name.startsWith("ce-road-"))!;
    scene.group.updateMatrixWorld(true);
    expect(road.visible).toBe(true);
    // Just above the land, as in the mesh editor.
    expect(new THREE.Box3().setFromObject(road).max.y).toBeGreaterThan(0);
    scene.dispose();
  });
});

describe("meshless water as the mesh editor's water and bank meshes (feature parity P2c)", () => {
  it("sinks the river below a ground cut open for it, with banks, and keeps the river outline as a hidden pick target", () => {
    const data = vectorRenderData(city, "regions");
    expect(data.water?.map(w => w.kind)).toEqual(["river"]);
    const scene = createVectorScene(data),
      meshes: THREE.Mesh[] = [];
    scene.group.traverse(o => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    scene.group.updateMatrixWorld(true);
    const top = meshes.find(m => m.name === "ce-water-river")!,
      bank = meshes.find(m => m.name === "ce-bank")!;
    expect(top.visible).toBe(true);
    expect(bank).toBeDefined();
    // One metre below the land at the datum, as the mesh editor's water lies below its land.
    const box = new THREE.Box3().setFromObject(top);
    expect(box.max.y - scene.group.position.y).toBeCloseTo(-1, 5);
    const outline = meshes.find(m => m.userData.kind === "river")!;
    expect(outline.visible).toBe(false);
    expect(vectorPickOwner(outline)).toBe(outline.userData.id);
    // The ground is cut open where the river runs: its area is the window less the water.
    const ground = meshes.find(m => m.geometry.type === "ShapeGeometry" && m.userData.id === undefined)!,
      position = ground.geometry.getAttribute("position"),
      index = ground.geometry.getIndex()!;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)));
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    const water = data.water!.flatMap(w => w.polygons).reduce((n, p) => n + regionArea(p), 0),
      window = regionArea({
        outer: [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ].map(([x, y]) => [(x * data.extentMeters) / 2, (y * data.extentMeters) / 2] as [number, number]),
        holes: []
      });
    expect(water).toBeGreaterThan(0);
    expect(area).toBeLessThan(window - water * 0.9);
    scene.dispose();
  });
});
