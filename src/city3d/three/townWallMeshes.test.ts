import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { collectCityStructures } from "../../city-editor/renderers/structureMassing";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { CityDocument } from "../../city-editor/types/document";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownWalls } from "./townWallMeshes";

function town(): CityDocument {
  return {
    appearance: "town",
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 30 },
    mesh: {
      vertices: {
        a: { id: "a", point: [-40, 0], locked: false },
        b: { id: "b", point: [0, 0], locked: false },
        c: { id: "c", point: [40, 0], locked: false }
      },
      edges: {
        ab: { id: "ab", a: "a", b: "b", leftFace: null, rightFace: null, locked: false },
        bc: { id: "bc", a: "b", b: "c", leftFace: null, rightFace: null, locked: false }
      },
      faces: {}
    },
    featureGroups: [
      {
        id: "town-wall",
        kind: "wall",
        segments: [
          { edgeId: "ab", forward: true },
          { edgeId: "bc", forward: true }
        ],
        style: { widthMeters: 4, color: "#888888" },
        wallMaterial: "stone",
        walkway: "walkway",
        locked: false
      }
    ],
    gates: [{ id: "entry", vertexId: "b", locked: false }],
    elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, -40], locked: false }]
  } as CityDocument;
}

function cast(layer: ReturnType<typeof createTownWalls>, origin: THREE.Vector3, direction: THREE.Vector3) {
  layer.group.updateMatrixWorld(true);
  return new THREE.Raycaster(origin, direction, 0, 100).intersectObjects(layer.pickables);
}

describe("CE Codex town defenses", () => {
  it.each(["low", "standard"] as const)("keeps %s on the existing massing without acquiring prototypes", quality => {
    const city = town(),
      cache = createBvPrototypeCache();
    const layer = createTownWalls(city, collectCityStructures(city), cache, quality);
    expect(layer.replaced.size).toBe(0);
    expect(layer.pickables).toHaveLength(0);
    expect(cache.size).toBe(0);
    layer.dispose();
  });

  it.each([
    { angle: 0, walkway: "walkway" as const },
    { angle: Math.PI / 3, walkway: "walkway" as const },
    { angle: 0, walkway: "none" as const }
  ])("keeps the complete gate opening clear (angle: $angle, walkway: $walkway)", ({ angle, walkway }) => {
    const city = town();
    city.featureGroups[0].walkway = walkway;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    for (const vertex of Object.values(city.mesh.vertices)) {
      const [x, y] = vertex.point;
      vertex.point = [x * c - y * s, x * s + y * c];
    }
    city.elements[0].point = [40 * s, -40 * c];
    const parts = collectCityStructures(city),
      cache = createBvPrototypeCache();
    const layer = createTownWalls(city, parts, cache, "high");
    try {
      expect(layer.pickables).toHaveLength(1);
      expect(parts.filter(p => p.kind === "tower").length).toBeGreaterThan(0);
      expect(layer.replaced).toEqual(new Set(parts.map(p => p.id)));
      // The CE opening is wider than the BV study: road clearance must remain intact.
      for (const x of [-2.5, 0, 2.5])
        for (const y of [0.5, 2.8])
          expect(
            cast(layer, new THREE.Vector3(x * c - 15 * s, y, -x * s - 15 * c), new THREE.Vector3(s, 0, c)),
            `${x}, ${y}; opening: ${JSON.stringify(parts.find(p => p.id === "gate:entry:lintel")?.centerline)}`
          ).toHaveLength(0);
      const hit = cast(layer, new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0))[0];
      expect(layer.resolve(hit)?.id).toBe("gate:entry:lintel");
      const geometry = layer.pickables[0].geometry;
      expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
    } finally {
      layer.dispose();
    }
    expect(cache.size).toBe(0);
  });

  it("retains wooden defenses and castle circuits", () => {
    const city = town();
    const parts = collectCityStructures(city);
    city.featureGroups[0].wallMaterial = "wood";
    const wood = createTownWalls(
      city,
      parts.map(part => ({ ...part, material: "wood" })),
      createBvPrototypeCache(),
      "high"
    );
    expect(wood.replaced.size).toBe(0);
    wood.dispose();
    city.featureGroups[0].wallMaterial = "stone";
    city.defenseCircuits = [
      {
        id: "castle",
        scope: "castle",
        state: "standing",
        areaFaceIds: [],
        wallGroupIds: ["town-wall"],
        naturalBarriers: [],
        locked: false
      }
    ];
    city.gates[0].ownerCastleId = "castle";
    const castle = createTownWalls(city, parts, createBvPrototypeCache(), "high");
    expect(castle.replaced.size).toBe(0);
    castle.dispose();
  });

  it("conforms masonry to sampled footing and walk levels at a mitered bend", () => {
    const city = town();
    city.gates = [];
    const part: StructureMassing = {
      id: "wall:town-wall:0",
      kind: "wall",
      material: "stone",
      widthMeters: 2.6,
      centerline: [
        [0, 0],
        [14, 0],
        [14, 14]
      ],
      ribbonOffsets: [
        [0, 1],
        [-1, 1],
        [-1, 0]
      ],
      baseElevationsMeters: [1, 3, 4],
      topElevationsMeters: [9, 12, 14],
      baseElevationMeters: 4,
      heightMeters: 8,
      roof: "none",
      parapet: "outer",
      parapetMeters: 1.1,
      parapetWidthMeters: 0.6,
      spire: false,
      anchor: [7, 7]
    };
    const layer = createTownWalls(city, [part], createBvPrototypeCache(), "high");
    try {
      expect(layer.replaced.has(part.id)).toBe(true);
      const bounds = new THREE.Box3().setFromObject(layer.group);
      expect(bounds.min.y).toBeCloseTo(1, 1);
      expect(bounds.max.y).toBeGreaterThan(15);
      expect(bounds.max.y).toBeLessThan(16);
      // Ribbon mapping reaches both legs instead of placing straight study wings over the corner.
      expect(cast(layer, new THREE.Vector3(7, 20, 0), new THREE.Vector3(0, -1, 0)).length).toBeGreaterThan(0);
      expect(cast(layer, new THREE.Vector3(14, 20, -7), new THREE.Vector3(0, -1, 0)).length).toBeGreaterThan(0);
    } finally {
      layer.dispose();
    }
  });

  it("releases source leases and final geometry once when a quality switch removes the layer", () => {
    const city = town(),
      cache = createBvPrototypeCache(),
      parts = collectCityStructures(city);
    const first = createTownWalls(city, parts, cache, "high");
    const next = createTownWalls(city, parts, cache, "high");
    const geometry = first.pickables[0].geometry,
      material = first.pickables[0].material as THREE.Material;
    const freeGeometry = vi.spyOn(geometry, "dispose"),
      freeMaterial = vi.spyOn(material, "dispose");
    first.dispose();
    first.dispose();
    expect(freeGeometry).toHaveBeenCalledOnce();
    expect(freeMaterial).toHaveBeenCalledOnce();
    expect(cache.size).toBeGreaterThan(0);
    next.dispose();
    expect(cache.size).toBe(0);
  });
});
