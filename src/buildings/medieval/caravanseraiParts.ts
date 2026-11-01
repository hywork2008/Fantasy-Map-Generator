import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { addMonasteryMasonryWall } from "../monasteries/friaryDetails";
import { createExteriorStair, exteriorStairLayout } from "./exteriorStair";
import { ModelKit, type Position } from "./modelKit";
import { createHighFodderTrough, createHighStoneWaterTrough } from "./troughDetails";

export const CARAVAN_STAIR = { rise: 2.84, run: 4.5, width: 1.2, landingDepth: 2, doorWidth: 1.2 };
export const CARAVAN_STAIR_POSITION: Position = [5.7, 0.16, 4.3];
export const CARAVAN_GALLERY_TOP = 3;

type Wing = { x: number; z: number; width: number; depth: number; angle: number; entranceHalfWidth?: number };
const north: Wing = { x: 0, z: -10, width: 26, depth: 5, angle: 0, entranceHalfWidth: 8.75 };
const sides: Wing[] = [-1, 1].map(side => ({
  x: side * 11,
  z: 0.25,
  width: 15.5,
  depth: 4.5,
  angle: (-side * Math.PI) / 2
}));

/** Keep the common continuous roof; course rolls supply detail with a bounded mesh budget. */
function coursedRoof(k: ModelKit, width: number, depth: number, eave: number, rise: number) {
  const w = width + 0.4,
    d = depth + 0.4;
  k.roof(0, 0, w, d, eave, rise, "tile", true);
  for (const side of [-1, 1]) {
    for (let row = 1; row <= 10; row++) {
      const t = row / 10;
      k.beam(
        "tile-course-lap",
        [-w / 2, eave + rise * (1 - t) + 0.018, ((side * d) / 2) * t],
        [w / 2, eave + rise * (1 - t) + 0.018, ((side * d) / 2) * t],
        0.025,
        "tile"
      );
    }
    for (let x = -w / 2 + 0.18; x < w / 2; x += 0.55)
      k.beam("pantile-channel", [x, eave + rise + 0.025, 0], [x, eave + 0.025, (side * d) / 2], 0.035, "tile", true);
  }
}

function lodgingWing(wing: Wing, upper = true) {
  const k = new ModelKit(upper ? "caravan-lodging-wing" : "caravan-service-wing");
  const w = wing.width,
    d = wing.depth,
    h = upper ? 6 : 3.15;
  k.box("wing-ground-floor", [0, 0.12, 0], [w, 0.08, d], "stone");
  if (upper) k.box("wing-upper-floor", [0, 2.91, 0], [w, 0.18, d], "wood");
  const count = Math.floor(w / 3.1);
  for (const side of [-1, 1]) {
    const a: [number, number] = side > 0 ? [-w / 2, -d / 2] : [w / 2, d / 2];
    const b: [number, number] = side > 0 ? [w / 2, -d / 2] : [-w / 2, d / 2];
    const openings = Array.from({ length: count }, (_, i) => {
      const u = ((i + 0.5) * w) / count;
      if (upper && wing.entranceHalfWidth !== undefined && side > 0 && Math.abs(u - w / 2) > wing.entranceHalfWidth)
        return [];
      return [
        {
          u,
          base: side > 0 ? 0.16 : 1.05,
          width: side > 0 ? 1.1 : 0.75,
          height: side > 0 ? 2.15 : 1.2,
          door: side > 0,
          round: true
        },
        ...(upper
          ? [
              {
                u,
                base: side > 0 ? 3 : 4.05,
                width: side > 0 ? 1.05 : 0.75,
                height: side > 0 ? 2.15 : 1.2,
                door: side > 0,
                round: true
              }
            ]
          : [])
      ];
    }).flat();
    addMonasteryMasonryWall(k, a, b, h, 0.08, 0, 1, openings);
  }
  for (const side of [-1, 1])
    addMonasteryMasonryWall(k, [(side * w) / 2, (side * d) / 2], [(side * w) / 2, (-side * d) / 2], h, 0.08, 0, 1, []);
  for (let i = 1; i < count; i++)
    k.box("room-partition", [-w / 2 + (i * w) / count, h / 2 + 0.08, -0.65], [0.12, h - 0.16, d - 1.3], "stone");
  coursedRoof(k, w, d, h, upper ? 1.5 : 1.1);
  const result = new ModelKit("fitted-caravan-wing");
  k.group.rotation.y = wing.angle;
  result.attach(k.finish(), [wing.x, 0, wing.z]);
  return result.finish();
}

function gallery(k: ModelKit, wing: Wing, width: number, gaps: readonly [number, number][]) {
  const frame = new ModelKit("caravan-gallery"),
    back = wing.depth / 2,
    front = back + 2.3;
  frame.box("gallery-continuous-deck", [0, 2.92, (back + front) / 2], [width, 0.16, 2.3], "wood");
  const count = Math.ceil(width / 3.1);
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + (i * width) / count;
    frame.box("gallery-post-foot", [x, 0.24, front], [0.32, 0.16, 0.32], "stone");
    frame.box("gallery-load-bearing-post", [x, 2.91, front], [0.17, 5.34, 0.17], "oak");
    frame.beam("gallery-floor-joist", [x, 2.78, back - 0.1], [x, 2.78, front + 0.08], 0.16, "oak");
    for (const side of [-1, 1])
      if (i > 0 && i < count)
        frame.beam("gallery-knee-brace", [x, 4.85, front], [x + side * 0.5, 5.5, front], 0.1, "wood");
  }
  for (const z of [back, front])
    frame.beam(
      "gallery-roof-plate",
      [-width / 2, z === back ? 6.1 : 5.5, z],
      [width / 2, z === back ? 6.1 : 5.5, z],
      0.16,
      "oak"
    );
  const roof = new THREE.BufferGeometry();
  roof.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -width / 2 - 0.1,
        6.1,
        back - 0.1,
        width / 2 + 0.1,
        6.1,
        back - 0.1,
        width / 2 + 0.1,
        5.5,
        front + 0.12,
        -width / 2 - 0.1,
        6.1,
        back - 0.1,
        width / 2 + 0.1,
        5.5,
        front + 0.12,
        -width / 2 - 0.1,
        5.5,
        front + 0.12
      ],
      3
    )
  );
  roof.computeVertexNormals();
  frame.add("continuous-gallery-lean-roof", roof, "tile");
  for (let x = -width / 2; x <= width / 2 + 0.01; x += 0.6)
    frame.beam("gallery-rafter", [x, 6.04, back], [x, 5.44, front], 0.07, "oak");
  const cuts = [...new Set([-width / 2, width / 2, ...gaps.flat()])].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i],
      hi = cuts[i + 1],
      mid = (lo + hi) / 2;
    if (gaps.some(([a, b]) => mid > a && mid < b)) continue;
    for (const y of [3.12, 3.95]) frame.beam("gallery-guard-rail", [lo, y, front], [hi, y, front], 0.07, "oak");
    const n = Math.ceil((hi - lo) / 0.28);
    for (let j = 0; j <= n; j++)
      frame.box("gallery-guard-baluster", [lo + (j * (hi - lo)) / n, 3.54, front], [0.045, 0.84, 0.045], "wood");
  }
  frame.group.rotation.y = wing.angle;
  k.attach(frame.finish(), [wing.x, 0, wing.z]);
}

function gateway() {
  const k = new ModelKit("caravan-vaulted-gateway"),
    shape = new THREE.Shape();
  shape.moveTo(-3.1, 0.16);
  shape.lineTo(-3.1, 6.2);
  shape.lineTo(3.1, 6.2);
  shape.lineTo(3.1, 0.16);
  shape.lineTo(1.6, 0.16);
  shape.lineTo(1.6, 2.86);
  shape.absarc(0, 2.86, 1.6, 0, Math.PI, false);
  shape.lineTo(-1.6, 0.16);
  shape.closePath();
  k.add(
    "continuous-vaulted-gateway",
    new THREE.ExtrudeGeometry(shape, { depth: 3.6, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, 8.4),
    "stone"
  );
  for (const z of [8.28, 12]) {
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 12 + 0.008,
        b = ((i + 1) * Math.PI) / 12 - 0.008;
      const block = new THREE.Shape();
      block.absarc(0, 2.86, 1.87, a, b, false);
      block.absarc(0, 2.86, 1.6, b, a, true);
      block.closePath();
      k.add(
        "gateway-arch-voussoir",
        new THREE.ExtrudeGeometry(block, { depth: 0.12, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, z),
        "white"
      );
    }
    for (const x of [-1.74, 1.74])
      for (let row = 0; row < 8; row++)
        k.box("gateway-jamb-course", [x, 0.33 + row * 0.335, z + 0.06], [0.28, 0.325, 0.12], "white");
  }
  k.box("gateway-coping", [0, 6.25, 10.2], [6.5, 0.18, 3.9], "white");
  return k.finish();
}

export function caravanseraiPartFactories(): ModelPartFactory[] {
  const part = (role: string, create: ModelPartFactory["create"], basedOn?: string[]): ModelPartFactory => ({
    id: `caravanserai:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create,
    basedOn
  });
  return [
    part("courtyard", () => {
      const k = new ModelKit("caravan-court-high");
      k.box("continuous-courtyard-paving", [0, 0.08, 0], [27, 0.16, 25], "stone");
      for (const x of [-3, 3]) k.box("court-drain-bottom", [x, 0.162, 0], [0.15, 0.004, 20], "dark");
      return k.finish();
    }),
    part("lodging", () => {
      const k = new ModelKit("caravan-lodging-high");
      for (const wing of [north, ...sides]) k.attach(lodgingWing(wing), [0, 0, 0]);
      return k.finish();
    }),
    part("front-service", () => {
      const k = new ModelKit("caravan-front-service-high");
      for (const side of [-1, 1])
        k.attach(lodgingWing({ x: side * 7, z: 10, width: 8, depth: 4, angle: Math.PI }, false), [0, 0, 0]);
      return k.finish();
    }),
    part("gateway", gateway),
    part("galleries", () => {
      const k = new ModelKit("caravan-court-galleries");
      gallery(k, north, 12.9, []);
      gallery(k, sides[0], 15.5, [[5.45, 7.75]]);
      gallery(k, sides[1], 15.5, [
        [-7.75, -5.45],
        [3.45, 4.65]
      ]);
      return k.finish();
    }),
    part("exterior-stair", () => {
      const k = new ModelKit("caravan-upper-gallery-stair"),
        stair = createExteriorStair(CARAVAN_STAIR);
      stair.group.rotation.y = Math.PI;
      k.attach(stair, CARAVAN_STAIR_POSITION);
      return k.finish();
    }),
    part("animal-equipment", () => {
      const k = new ModelKit("caravan-animal-equipment");
      for (const side of [-1, 1]) {
        for (const z of [-3.5, 2]) {
          const manger = createHighFodderTrough({ filled: false });
          manger.group.rotation.y = Math.PI / 2;
          k.attach(manger, [side * 7.8, 0.16, z]);
        }
        for (const z of [-4, 3]) k.box("tethering-post", [side * 6.85, 0.81, z], [0.13, 1.3, 0.13], "oak");
        k.beam("animal-tethering-rail", [side * 6.85, 1.25, -4], [side * 6.85, 1.25, 3], 0.1, "oak");
        for (const z of [-3, 0, 2]) k.ring("tether-ring", [side * 6.85, 1.25, z], 0.07, 0.012, "iron", true);
      }
      return k.finish();
    }, [variantId("medieval.fodder-trough", "high", DEFAULT_AUTHOR)]),
    part("water-trough", () => {
      const k = new ModelKit("caravan-shared-water-trough");
      k.attach(createHighStoneWaterTrough(), [0, 0.16, -0.5]);
      return k.finish();
    }, [variantId("medieval.stone-water-trough", "high", DEFAULT_AUTHOR)])
  ];
}

/** The landing's open wall edge meets the east gallery at X=6.45. */
export const caravanStairLayout = () => exteriorStairLayout(CARAVAN_STAIR);
