import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { createHighHandCart } from "./handCartDetails";
import { HouseDetailKit } from "./houseDetailKit";
import { ModelKit, type Surface } from "./modelKit";
import { addCraftShed } from "./workshopDetailKit";

/** A bounded, closed pile with an irregular slope, without buried sphere geometry. */
export function addSandPile(k: ModelKit, x: number, surface: Surface) {
  const vertices: number[] = [],
    segments = 40,
    rings = 8;
  const point = (ring: number, segment: number) => {
    const r = ring / rings,
      a = (segment * Math.PI * 2) / segments;
    return new THREE.Vector3(
      x + Math.cos(a) * r * 1.64,
      0.14 + 1.25 * (1 - r) ** 0.85 * (1 + 0.06 * r * Math.sin(a * 3)),
      -1 + Math.sin(a) * r * 1.64
    );
  };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (let i = 0; i < segments; i++) {
    triangle(point(0, 0), point(1, i + 1), point(1, i));
    for (let ring = 1; ring < rings; ring++) {
      triangle(point(ring, i), point(ring, i + 1), point(ring + 1, i));
      triangle(point(ring + 1, i), point(ring, i + 1), point(ring + 1, i + 1));
    }
    triangle(new THREE.Vector3(x, 0.14, -1), point(rings, i), point(rings, i + 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  k.add("sand-stockpile", geometry, surface);
}

export function sandYardPartFactories(): ModelPartFactory[] {
  const high = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `sand-yard:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  });
  return [
    high("shelter", () => {
      const k = new HouseDetailKit("sand-dry-material-shelter");
      addCraftShed(k, -3, -1, 4.5, 4.5);
      return k.finish();
    }),
    high("retaining-bays", () => {
      const k = new ModelKit("sand-retaining-bays");
      k.box("yard-hardstanding", [-0.5, 0.04, 0.4], [11, 0.08, 8.5], "earth");
      for (const x of [-3, 2]) {
        k.box("sand-bay-floor", [x, 0.11, -1], [3.8, 0.06, 4], "stone");
        for (const side of [-1, 1]) {
          for (const z of [-3, -1, 1]) {
            k.box("retaining-post", [x + side * 1.9, 0.65, z], [0.16, 1.14, 0.16], "oak");
            k.box("post-foot-shoe", [x + side * 1.9, 0.2, z], [0.19, 0.24, 0.19], "iron");
          }
          for (let row = 0; row < 5; row++) {
            const y = 0.24 + row * 0.19;
            k.box("retaining-side-plank", [x + side * 1.9, y, -1], [0.08, 0.2, 4.1], "wood");
            for (const z of [-2.95, -1, 0.95])
              k.box("retaining-board-pin", [x + side * 1.95, y, z], [0.025, 0.025, 0.025], "iron");
          }
        }
        for (let row = 0; row < 5; row++)
          k.box("retaining-back-plank", [x, 0.24 + row * 0.19, -3], [3.9, 0.2, 0.08], "wood");
        for (const xx of [x - 1.9, x, x + 1.9]) {
          k.box("rear-post", [xx, 0.65, -3.09], [0.16, 1.14, 0.16], "oak");
          k.beam("retaining-back-stay", [xx, 0.1, -3.65], [xx, 0.92, -3.1], 0.1, "oak");
        }
      }
      return k.finish();
    }),
    high("sand-stock", () => {
      const k = new ModelKit("separated-sand-stock");
      addSandPile(k, -3, "plaster");
      addSandPile(k, 2, "straw");
      return k.finish();
    }),
    {
      ...high("wheelbarrow", () => {
        const k = new ModelKit("sand-yard-wheelbarrow");
        k.attach(createHighHandCart("wooden-wheelbarrow"), [2, 0.08, 3]);
        return k.finish();
      }),
      basedOn: [variantId("medieval.wooden-wheelbarrow", "high", DEFAULT_AUTHOR)]
    },
    high("loading-tools", () => {
      const k = new ModelKit("sand-loading-tools");
      for (const x of [-1.35, -0.35]) {
        k.box("tool-rack-foot", [x, 0.14, 2.5], [0.32, 0.12, 0.7], "oak");
        k.box("tool-rack-post", [x, 0.83, 2.5], [0.1, 1.38, 0.1], "wood");
      }
      k.box("tool-rack-foot", [-0.85, 0.14, 2.75], [1.2, 0.12, 0.12], "oak");
      k.box("tool-rack-crossbar", [-0.85, 1.23, 2.5], [1.2, 0.1, 0.12], "oak");
      k.box("shovel-blade", [-1, 0.29, 2.6], [0.26, 0.42, 0.055], "iron");
      k.beam("shovel-socket", [-1, 0.35, 2.6], [-1, 0.65, 2.6], 0.07, "iron", true);
      k.beam("shovel-haft", [-1, 0.47, 2.6], [-1, 1.75, 2.6], 0.045, "wood", true);
      k.beam("shovel-grip", [-1.15, 1.75, 2.6], [-0.85, 1.75, 2.6], 0.05, "oak", true);
      k.beam("tool-retaining-peg", [-1, 1.4, 2.5], [-1, 1.4, 2.68], 0.04, "oak", true);
      // The sieve rests on the rack feet and leans back onto the crossbar.
      const sieve = new ModelKit("sand-sieve");
      for (const x of [-0.28, 0.28]) sieve.box("sieve-frame-side", [x, 0.55, 0], [0.05, 1.1, 0.06], "wood");
      for (const y of [0.025, 1.075]) sieve.box("sieve-frame-end", [0, y, 0], [0.61, 0.05, 0.06], "wood");
      for (let i = 0; i < 9; i++)
        sieve.beam("sieve-warp", [-0.25 + i * 0.0625, 0.05, 0], [-0.25 + i * 0.0625, 1.05, 0], 0.008, "cloth");
      for (let i = 0; i < 17; i++)
        sieve.beam("sieve-weft", [-0.25, 0.05 + i * 0.0625, 0], [0.25, 0.05 + i * 0.0625, 0], 0.008, "cloth");
      const screen = sieve.finish();
      screen.group.rotation.x = -0.17;
      k.attach(screen, [-0.55, 0.2, 2.72]);
      return k.finish();
    }),
    {
      id: "sand-yard:barrel",
      role: "barrel",
      quality: "low",
      author: DEFAULT_AUTHOR,
      basedOn: [variantId("container.barrel-empty", "default", DEFAULT_AUTHOR)],
      create: () => {
        const k = new ModelKit("sand-yard-reusable-barrel");
        k.attach(createMedievalContainerModel("barrel", "empty"), [-2.4, 0.08, 2.7]);
        return k.finish();
      }
    }
  ];
}
