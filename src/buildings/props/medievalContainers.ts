import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

export const CONTAINER_KINDS = ["barrel", "crate", "sack", "basket"] as const;
export const CONTAINER_STATES = ["empty", "closed", "loaded"] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];
export type ContainerState = (typeof CONTAINER_STATES)[number];

/** Illustrative envelopes in meters, shared by every state of each prop. */
export const MEDIEVAL_CONTAINERS = {
  barrel: {
    author: "Codex GPT-6.1 Sol",
    name: "Staved wooden barrel",
    width: 0.76,
    depth: 0.76,
    height: 1.02
  },
  crate: {
    author: "Codex GPT-6.1 Sol",
    name: "Planked wooden crate",
    width: 0.92,
    depth: 0.68,
    height: 0.72
  },
  sack: {
    author: "Codex GPT-6.1 Sol",
    name: "Hemp cloth sack",
    width: 0.64,
    depth: 0.64,
    height: 0.86
  },
  basket: {
    author: "Codex GPT-6.1 Sol",
    name: "Woven wicker basket",
    width: 0.86,
    depth: 0.86,
    height: 0.68
  }
} as const;
export const MEDIEVAL_CONTAINER_NOTE =
  "Imagined reusable medieval European storage props; illustrative dimensions, not artifact reconstructions. Empty containers have open interiors; closed sacks are tied. Loaded barrels and sacks contain grain, crates and baskets contain produce. Origin at ground level; units are meters. Barrel and crate models are shared with City Editor harbor cargo.";

export interface MedievalContainerMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Geometry only, suitable for CE instances without generating BV drawings. */
export function createMedievalContainerModel(
  kind: ContainerKind,
  state: ContainerState = "empty"
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = `medieval-${kind}-${state}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.MeshLambertMaterial[] = [];
  function material(color: number) {
    const surface = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    materials.push(surface);
    return surface;
  }
  const wood = [0x987044, 0x805a36, 0xab8252].map(material);
  const iron = material(0x44443c);
  const hemp = material(0xa9956d);
  const seam = material(0x756647);
  const wicker = [0xb29560, 0x947344].map(material);
  const grain = material(0xc9ac66);
  const produce = [0x788344, 0xa16b3f, 0x9b4934].map(material);
  function add(name: string, geometry: THREE.BufferGeometry, surface: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, surface = wood[0]) {
    const mesh = add(name, cube, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function lathe(
    name: string,
    profile: number[][],
    surface: THREE.Material,
    segments = 32,
    start = 0,
    sweep = Math.PI * 2
  ) {
    return add(
      name,
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        segments,
        start,
        sweep
      ),
      surface
    );
  }
  function ring(name: string, radius: number, y: number, thickness: number, surface: THREE.Material) {
    const mesh = add(name, new THREE.TorusGeometry(radius, thickness, 5, 40), surface);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  }
  function tube(name: string, points: THREE.Vector3[], radius: number, surface: THREE.Material) {
    return add(
      name,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, radius, 5, false),
      surface
    );
  }
  function disk(name: string, radius: number, y: number, thickness: number, surface: THREE.Material) {
    const mesh = add(name, new THREE.CylinderGeometry(radius, radius, thickness, 32), surface);
    mesh.position.y = y;
    return mesh;
  }
  if (kind === "barrel") {
    // Each stave has an inner return profile, leaving a thick, genuinely open mouth.
    const outer = [
      [0.3, 0.02],
      [0.335, 0.18],
      [0.365, 0.49],
      [0.335, 0.82],
      [0.3, 1]
    ];
    const profile = [...outer, ...outer.toReversed().map(([r, y]) => [r - 0.026, y]), outer[0]];
    for (let i = 0; i < 18; i++) lathe("barrel-stave", profile, wood[i % 3], 3, (i * Math.PI) / 9, Math.PI / 9 - 0.004);
    disk("container-bottom", 0.283, 0.035, 0.07, wood[1]);
    for (const [y, r] of [
      [0.12, 0.326],
      [0.3, 0.352],
      [0.69, 0.352],
      [0.91, 0.322]
    ]) {
      lathe(
        "barrel-iron-hoop",
        [
          [r, y - 0.024],
          [r + 0.009, y - 0.024],
          [r + 0.009, y + 0.024],
          [r, y + 0.024],
          [r, y - 0.024]
        ],
        iron
      );
    }
    if (state === "closed") {
      // Cut each head board to the same circle, with its edge seated inside the staves.
      const radius = 0.283;
      const boardCount = 7;
      for (let i = 0; i < boardCount; i++) {
        const left = -radius + (2 * radius * i) / boardCount;
        const right = -radius + (2 * radius * (i + 1)) / boardCount;
        const leftAngle = Math.acos(left / radius);
        const rightAngle = Math.acos(right / radius);
        const shape = new THREE.Shape();
        shape.absarc(0, 0, radius, -leftAngle, -rightAngle, false);
        shape.lineTo(right, radius * Math.sin(rightAngle));
        shape.absarc(0, 0, radius, rightAngle, leftAngle, false);
        shape.closePath();
        const board = add(
          "barrel-lid-board",
          new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: false, curveSegments: 24, steps: 1 }),
          wood[i % 3]
        );
        board.rotation.x = Math.PI / 2;
        board.position.y = 0.99;
      }
    }
  } else if (kind === "crate") {
    for (let i = 0; i < 6; i++) box("container-bottom", -0.365 + i * 0.146, 0.04, 0, 0.142, 0.08, 0.66, wood[i % 3]);
    for (let row = 0; row < 5; row++) {
      for (const side of [-1, 1]) {
        box("crate-side-board", 0, 0.14 + row * 0.12, side * 0.32, 0.9, 0.112, 0.04, wood[row % 3]);
        box("crate-end-board", side * 0.43, 0.14 + row * 0.12, 0, 0.04, 0.112, 0.6, wood[(row + 1) % 3]);
      }
    }
    for (const x of [-0.39, 0.39])
      for (const z of [-0.275, 0.275]) box("crate-corner-post", x, 0.36, z, 0.065, 0.64, 0.065, wood[1]);
    if (state === "closed") {
      for (let i = 0; i < 6; i++) box("crate-lid-board", -0.365 + i * 0.146, 0.686, 0, 0.142, 0.035, 0.66, wood[i % 3]);
      for (const x of [-0.28, 0.28]) box("crate-lid-batten", x, 0.711, 0, 0.07, 0.018, 0.64, wood[1]);
    }
  } else if (kind === "sack") {
    const closed = state === "closed";
    const profile = [
      [0, 0],
      [0.19, 0],
      [0.27, 0.08],
      [0.3, 0.3],
      [0.28, 0.55],
      [closed ? 0.055 : 0.22, 0.73],
      [closed ? 0.085 : 0.225, 0.83]
    ];
    const shell = lathe(
      "sack-cloth",
      [...profile, ...profile.toReversed().map(([r, y]) => [Math.max(0, r - 0.012), y + (y === 0 ? 0.018 : 0)])],
      hemp,
      48
    );
    const positions = shell.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        y = positions.getY(i);
      const fold = 1 + 0.035 * Math.cos(Math.atan2(z, x) * 12 + y * 7);
      positions.setXYZ(i, x * fold, y, z * fold);
    }
    shell.geometry.computeVertexNormals();
    tube(
      "sack-seam",
      profile.slice(1).map(([r, y]) => new THREE.Vector3(0, y + 0.006, r * 1.035 + 0.003)),
      0.004,
      seam
    );
    if (closed) {
      disk("sack-gathered-neck", 0.052, 0.735, 0.015, hemp);
      ring("sack-tie", 0.06, 0.735, 0.009, seam);
      tube(
        "sack-knot-tail",
        [new THREE.Vector3(0, 0.735, 0.06), new THREE.Vector3(0.07, 0.7, 0.085), new THREE.Vector3(0.1, 0.62, 0.12)],
        0.008,
        seam
      );
    } else ring("sack-rolled-mouth", 0.225, 0.825, 0.012, hemp);
  } else {
    disk("container-bottom", 0.285, 0.018, 0.036, wicker[1]);
    // Alternating radial offsets carry horizontal weavers over and under the uprights.
    for (let row = 0; row < 20; row++) {
      const y = 0.045 + row * 0.026;
      const points = Array.from({ length: 97 }, (_, i) => {
        const angle = (i * Math.PI) / 48;
        const r = 0.285 + y * 0.19 + 0.007 * Math.cos(angle * 24) * (row % 2 ? -1 : 1);
        return new THREE.Vector3(r * Math.sin(angle), y, r * Math.cos(angle));
      });
      tube("basket-weaver", points, 0.012, wicker[row % 2]);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      tube(
        "basket-upright",
        [0.025, 0.28, 0.56].map(
          y => new THREE.Vector3((0.285 + y * 0.19) * Math.sin(a), y, (0.285 + y * 0.19) * Math.cos(a))
        ),
        0.01,
        wicker[1]
      );
    }
    ring("basket-rim", 0.39, 0.56, 0.023, wicker[0]);
    for (const side of [-1, 1]) {
      tube(
        "basket-handle",
        Array.from({ length: 17 }, (_, i) => {
          const a = (i * Math.PI) / 16;
          return new THREE.Vector3(side * (0.38 + 0.03 * Math.sin(a)), 0.49 + 0.15 * Math.sin(a), 0.105 * Math.cos(a));
        }),
        0.016,
        wicker[1]
      );
    }
    if (state === "closed") {
      disk("basket-lid-base", 0.373, 0.572, 0.018, wicker[1]);
      for (let i = 1; i <= 17; i++) ring("basket-lid-weave", i * 0.021, 0.585, 0.011, wicker[i % 2]);
      ring("basket-lid-rim", 0.378, 0.58, 0.018, wicker[0]);
      tube(
        "basket-lid-loop",
        [new THREE.Vector3(-0.06, 0.59, 0), new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(0.06, 0.59, 0)],
        0.012,
        wicker[1]
      );
    }
  }
  if (state === "loaded") {
    const y = { barrel: 0.9, crate: 0.53, sack: 0.72, basket: 0.47 }[kind];
    if (kind === "barrel" || kind === "sack") {
      const radius = kind === "barrel" ? 0.275 : 0.205;
      disk("grain-fill", radius, y - 0.022, 0.04, grain);
      const kernel = new THREE.SphereGeometry(1, 6, 4);
      for (let i = 0; i < 110; i++) {
        const a = i * 2.39996,
          r = Math.sqrt((i + 0.5) / 110) * (radius - 0.014);
        const mesh = add("grain-kernel", kernel, grain);
        mesh.position.set(r * Math.cos(a), y + 0.025 * (1 - r / radius), r * Math.sin(a));
        mesh.scale.set(0.009, 0.006, 0.017);
        mesh.rotation.y = a;
      }
    } else {
      const fruit = new THREE.SphereGeometry(0.065, 10, 7);
      for (let layer = 0; layer < 5; layer++)
        for (let ix = -2; ix <= 2; ix++)
          for (let iz = -1; iz <= 1; iz++) {
            const x = ix * 0.13,
              z = iz * 0.14 + layer * 0.025;
            if (kind === "basket" && Math.hypot(x, z) + 0.07 > 0.285 + (y - 0.4 + layer * 0.105) * 0.19) continue;
            const mesh = add("produce-load", fruit, produce[(ix + iz + 6) % 3]);
            mesh.position.set(x, y - 0.4 + layer * 0.105, z);
          }
    }
  }
  // cube is allocated even for round props; track it so every allocation is disposed.
  geometries.add(cube);
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
    }
  };
}

export function createMedievalContainer(kind: ContainerKind, state: ContainerState = "empty"): MedievalContainerMeshes {
  const model = createMedievalContainerModel(kind, state);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
