import * as THREE from "three";
import type { BuildingAppearanceProfile } from "../appearance/types";
import { ModelKit, type Surface } from "../medieval/modelKit";
import { townWallRoofPalette } from "./townWallRoof";
import type { TownWallModel } from "./townWalls";

export type GatehouseView = "exterior" | "ground-floor" | "upper-floor";
type Opening = readonly [x: number, y: number, width: number, height: number];
const FLOOR = 5.3;
const EAVE = 9.3;

/** +Z is outside the town. Dimensions and furnishings are interpretive, not surveyed. */
export function createGatehouse(profile: BuildingAppearanceProfile = "legacy", view: GatehouseView = "exterior") {
  const kit = new ModelKit("medieval-town-gatehouse");
  const upper = view !== "ground-floor";
  const exterior = view === "exterior";
  const height = upper ? EAVE : 5.05;

  function panel(
    name: string,
    x: number,
    z: number,
    width: number,
    base: number,
    top: number,
    openings: readonly Opening[] = [],
    side = false,
    thickness = 0.6,
    surface: Surface = "stone",
    arch = false
  ) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, base);
    const doors = openings.filter(([, cy, , h]) => cy - h / 2 <= base + 0.001);
    const notches: { x: number; width: number; top: number; arch?: boolean }[] = doors.map(([cx, cy, w, h]) => ({
      x: cx,
      width: w,
      top: cy + h / 2
    }));
    if (arch) notches.push({ x: 0, width: 3.8, top: 2.8, arch: true });
    for (const notch of notches.sort((a, b) => a.x - b.x)) {
      shape.lineTo(notch.x - notch.width / 2, base);
      shape.lineTo(notch.x - notch.width / 2, notch.top);
      if (notch.arch) shape.absarc(0, 2.8, 1.9, Math.PI, 0, true);
      else shape.lineTo(notch.x + notch.width / 2, notch.top);
      shape.lineTo(notch.x + notch.width / 2, base);
    }
    shape.lineTo(width / 2, base);
    shape.lineTo(width / 2, top);
    shape.lineTo(-width / 2, top);
    shape.closePath();
    for (const [cx, cy, w, h] of openings) {
      if (cy - h / 2 <= base + 0.001) continue;
      const hole = new THREE.Path();
      hole.moveTo(cx - w / 2, cy - h / 2);
      hole.lineTo(cx - w / 2, cy + h / 2);
      hole.lineTo(cx + w / 2, cy + h / 2);
      hole.lineTo(cx + w / 2, cy - h / 2);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 16 });
    geometry.translate(0, 0, -thickness / 2);
    const mesh = kit.add(name, geometry, surface);
    mesh.position.set(x, 0, z);
    if (side) mesh.rotation.y = -Math.PI / 2;
  }

  // Foundations flank the road; no slab or closed door obstructs the cart passage.
  for (const x of [-4.45, 4.45]) kit.box("wing-foundation", [x, 0.1, 0], [5.1, 0.2, 10.6], "stone");
  const upperWindows: Opening[] = upper
    ? [
        [-4.5, 7.15, 1, 1.5],
        [0, 7.15, 1.2, 1.5],
        [4.5, 7.15, 1, 1.5]
      ]
    : [];
  // Ground-reaching openings are notches in the outline, not holes crossing its boundary.
  panel(
    "town-facade",
    0,
    -5,
    14,
    0,
    height,
    [[-4.45, 1.15, 1.2, 2.5], [4.65, 1.15, 1.25, 2.5], ...upperWindows],
    false,
    0.6,
    "stone",
    true
  );
  if (view !== "ground-floor") {
    const frontHeight = exterior ? height : 5.05;
    panel(
      "field-facade",
      0,
      5,
      14,
      0,
      frontHeight,
      [
        [-4.5, 2.2, 0.2, 1.1],
        [4.5, 2.2, 0.2, 1.1],
        ...(exterior
          ? ([
              [-3.8, 7.2, 0.35, 1.1],
              [3.8, 7.2, 0.35, 1.1]
            ] as Opening[])
          : [])
      ],
      false,
      0.6,
      "stone",
      true
    );
  }
  for (const x of [-6.7, 6.7]) {
    const holes: Opening[] = x < 0 && upper ? [[2, 6.45, 0.8, 2.3]] : [];
    panel("side-wall", x, 0, 10, 0.2, height, holes, true);
  }
  panel(
    "porter-passage-wall",
    -2.2,
    0,
    9.4,
    0.2,
    5.05,
    [
      [-2.4, 1.2, 1.1, 2.4],
      [1.3, 1.9, 1, 0.65]
    ],
    true
  );
  panel("stair-passage-wall", 2.2, 0, 9.4, 0.2, 5.05, [], true);
  kit.box("inspection-window-sill", [-2.15, 1.53, 1.3], [0.85, 0.12, 1.2], "oak");
  for (const z of [0.98, 1.3, 1.62]) kit.box("inspection-window-bar", [-2.2, 1.9, z], [0.04, 0.65, 0.04], "iron");

  // Shallow lime mortar joints follow the masonry and stop at every real aperture.
  function coursing(z: number, top: number, windows: readonly Opening[]) {
    const face = z + Math.sign(z) * 0.307;
    for (let row = 0; row < Math.floor(top / 0.45); row++) {
      const y = (row + 1) * 0.45;
      const blocked: [number, number][] = [];
      if (y < 4.7) {
        const half = y <= 2.8 ? 1.9 : Math.sqrt(1.9 ** 2 - (y - 2.8) ** 2);
        blocked.push([-half - 0.02, half + 0.02]);
      }
      for (const [x, cy, w, h] of windows)
        if (Math.abs(y - cy) < h / 2 + 0.03) blocked.push([x - w / 2 - 0.02, x + w / 2 + 0.02]);
      blocked.sort((a, b) => a[0] - b[0]);
      let start = -6.4;
      for (const [a, b] of [...blocked, [6.4, 6.4]]) {
        if (a > start) kit.box("mortar-bed-joint", [(start + a) / 2, y, face], [a - start, 0.018, 0.012], "plaster");
        start = Math.max(start, b);
      }
      for (let x = -6.1 + (row % 2) * 0.48; x < 6.4; x += 0.96) {
        const middle = y - 0.225;
        if (Math.abs(x) < 2.25 && middle < 5.05) continue;
        if (windows.some(([cx, cy, w, h]) => Math.abs(x - cx) < w / 2 + 0.05 && Math.abs(middle - cy) < h / 2 + 0.25))
          continue;
        kit.box("mortar-head-joint", [x, middle, face], [0.018, 0.43, 0.012], "plaster");
      }
    }
  }
  coursing(-5, height, [[-4.45, 1.15, 1.2, 2.5], [4.65, 1.15, 1.25, 2.5], ...upperWindows]);
  if (view !== "ground-floor")
    coursing(5, exterior ? height : 5.05, [
      [-4.5, 2.2, 0.2, 1.1],
      [4.5, 2.2, 0.2, 1.1],
      ...(exterior
        ? ([
            [-3.8, 7.2, 0.35, 1.1],
            [3.8, 7.2, 0.35, 1.1]
          ] as Opening[])
        : [])
    ]);

  // Stone arch rings on both elevations surround the actual curved opening.
  for (const z of [-5.36, 5.36]) {
    if (z > 0 && view === "ground-floor") continue;
    for (let i = 0; i < 15; i++) {
      const a = (i * Math.PI) / 15 + 0.012,
        b = ((i + 1) * Math.PI) / 15 - 0.012;
      const ring = new THREE.Shape();
      ring.absarc(0, 2.8, 2.23, a, b, false);
      ring.lineTo(Math.cos(b) * 1.91, 2.8 + Math.sin(b) * 1.91);
      ring.absarc(0, 2.8, 1.91, b, a, true);
      ring.closePath();
      const geometry = new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 4 });
      const stone = kit.add("arch-voussoir", geometry, i % 3 === 0 ? "plaster" : "stone");
      stone.position.z = z - 0.06;
    }
  }
  // Dressed corner quoins and a string course articulate the thick masonry.
  for (let row = 0; row < Math.floor(height / 0.45); row++) {
    for (const x of [-6.72, 6.72])
      for (const z of [-5.02, 5.02]) {
        if (z > 0 && (view === "ground-floor" || (!exterior && row * 0.45 > 4.9))) continue;
        kit.box(
          "corner-quoin",
          [x, row * 0.45 + 0.225, z],
          [row % 2 ? 0.65 : 0.9, 0.42, 0.66],
          row % 3 ? "stone" : "plaster"
        );
      }
  }
  // The oak leaves fold along the passage walls on the town side of the portcullis.
  for (const x of [-1.78, 1.78]) {
    for (let i = 0; i < 9; i++) kit.box("open-gate-plank", [x, 1.6, 1.45 + i * 0.2], [0.13, 3.2, 0.19], "oak");
    for (const y of [0.5, 1.6, 2.7])
      kit.box("gate-iron-strap", [x - Math.sign(x) * 0.08, y, 2.25], [0.035, 0.12, 1.8], "iron");
    for (const y of [0.5, 2.7]) kit.cylinder("gate-hinge", [x, y, 3.13], 0.1, 0.28, "iron");
  }
  for (let i = 0; i < 11; i++)
    kit.box("raised-portcullis", [-1.65 + i * 0.33, upper ? 6.5 : 4.7, 3.85], [0.075, upper ? 4.3 : 0.7, 0.09], "iron");
  for (let i = 0; i < (upper ? 11 : 2); i++)
    kit.box("portcullis-crossrail", [0, 4.4 + i * 0.42, 3.85], [3.55, 0.075, 0.1], "iron");
  for (const x of [-1.92, 1.92])
    kit.box("portcullis-guide", [x, upper ? 4.4 : 2.525, 3.85], [0.12, upper ? 8.8 : 5.05, 0.24], "stone");

  // A 1.25 m wide straight stair rises from the town entrance to the upper landing.
  for (let i = 0; i < 26; i++) {
    const y = 0.2 + ((i + 1) * 5.1) / 26,
      z = -3.9 + i * 0.3;
    kit.box("stair-tread", [4.65, y - 0.09, z], [1.35, 0.18, 0.3], "oak");
    if (i % 3 === 0) kit.box("stair-baluster", [3.99, y + 0.45, z], [0.07, 0.9, 0.07], "oak");
  }
  for (const x of [4, 5.3]) {
    kit.beam("stair-stringer", [x, 0.12, -4.05], [x, 5.16, 3.8], 0.2);
    kit.beam("stair-handrail", [x, 1.25, -4.05], [x, 6.3, 3.8], 0.09);
  }
  function table(name: string, x: number, z: number, floor: number) {
    kit.box(name, [x, floor + 0.8, z], [1.6, 0.13, 0.8], "wood");
    for (const dx of [-0.65, 0.65])
      for (const dz of [-0.27, 0.27]) kit.box("table-leg", [x + dx, floor + 0.4, z + dz], [0.09, 0.8, 0.09], "oak");
  }
  table("porter-desk", -4.1, 1.3, 0.2);
  kit.box("toll-chest", [-5.75, 0.52, 3.5], [0.9, 0.64, 0.65], "oak");
  for (const x of [-6, -5.5]) kit.box("chest-strap", [x, 0.85, 3.5], [0.05, 0.04, 0.65], "iron");
  kit.box("guard-bench-seat", [-5.8, 0.68, -1], [0.55, 0.12, 2.3], "wood");
  for (const z of [-1.9, -0.1]) kit.box("bench-leg", [-5.8, 0.41, z], [0.45, 0.5, 0.12], "oak");
  kit.box("weapon-rack", [-6.32, 1.6, 1], [0.12, 0.14, 2.5], "oak");
  for (const z of [0, 0.7, 1.4]) {
    kit.beam("spear-shaft", [-6.12, 0.2, z], [-6.12, 2.7, z + 0.2], 0.04, "wood");
    kit.cylinder("spearhead", [-6.12, 2.85, z + 0.21], 0.08, 0.3, "iron", 0, 4);
  }

  if (upper) {
    // Real gaps accommodate both the stair flight and the raised portcullis.
    kit.box("upper-floor", [-1.6, FLOOR - 0.12, -0.55], [9.6, 0.24, 8.3], "wood");
    kit.box("upper-field-floor", [-1.6, FLOOR - 0.12, 4.35], [9.6, 0.24, 0.9], "wood");
    kit.box("stair-landing", [4.8, FLOOR - 0.12, 4.35], [3.6, 0.24, 0.9], "wood");
    kit.box("stairwell-rail", [3.15, FLOOR + 0.95, -0.4], [0.1, 0.12, 8], "oak");
    for (const z of [-4.3, -2, 0, 2, 3.5]) kit.box("stairwell-post", [3.15, FLOOR + 0.5, z], [0.1, 1, 0.1], "oak");
    panel("lodging-partition", -2.4, -0.7, 7.6, FLOOR, EAVE, [[-2.4, 6.45, 1, 2.3]], true, 0.15, "plaster");
    for (const z of [-1.3, 1.6]) {
      kit.box("bed-frame", [-4.9, FLOOR + 0.3, z], [1.25, 0.25, 2], "oak");
      kit.box("straw-mattress", [-4.9, FLOOR + 0.5, z], [1.15, 0.2, 1.9], "straw");
      kit.box("wool-blanket", [-4.9, FLOOR + 0.62, z + 0.15], [1.16, 0.06, 1.5], "cloth");
      kit.box("bed-pillow", [-4.9, FLOOR + 0.65, z - 0.65], [0.8, 0.16, 0.4], "white");
      for (const dz of [-0.85, 0.85])
        for (const dx of [-0.5, 0.5]) kit.box("bed-leg", [-4.9 + dx, FLOOR + 0.18, z + dz], [0.1, 0.36, 0.1], "oak");
    }
    table("watch-room-table", 0, -2.8, FLOOR);
    kit.box("watch-room-bench", [0, FLOOR + 0.5, -1.8], [1.6, 0.12, 0.4], "oak");
    for (const x of [-0.6, 0.6]) kit.box("bench-leg", [x, FLOOR + 0.25, -1.8], [0.12, 0.5, 0.35], "oak");
    // Masonry fireplace has an open hearth rather than a painted black rectangle.
    for (const x of [-1.25, 0.25]) kit.box("fireplace-jamb", [x, FLOOR + 0.7, -4.4], [0.3, 1.4, 0.65], "stone");
    kit.box("hearth", [-0.5, FLOOR + 0.06, -4.25], [1.9, 0.12, 1], "stone");
    kit.box("fireplace-lintel", [-0.5, FLOOR + 1.5, -4.4], [1.9, 0.25, 0.7], "stone");
    for (const x of [-0.8, -0.3])
      kit.beam("hearth-log", [x, FLOOR + 0.2, -4.55], [x + 0.15, FLOOR + 0.2, -3.95], 0.15, "dark", true);
    kit.box("chimney-breast", [-0.5, 8.1, -4.55], [1.6, 2.25, 0.7], "stone");
    kit.box("chimney-stack", [-0.5, 10.35, -4.55], [0.8, 2.5, 0.75], "stone");
    kit.box("chimney-cap", [-0.5, 11.65, -4.55], [1, 0.16, 0.95], "stone");
    kit.box("chimney-flue", [-0.5, 11.74, -4.55], [0.5, 0.03, 0.45], "dark");

    // The winding drum is behind the raised grille; ropes run over overhead pulleys.
    kit.beam("windlass-drum", [-1.15, 6.6, 2.9], [1.15, 6.6, 2.9], 0.35, "oak", true);
    for (const x of [-1.1, 1.1]) {
      kit.box("windlass-post", [x, 5.95, 2.9], [0.2, 1.3, 0.3], "oak");
      kit.beam("windlass-foot", [x, FLOOR, 2.3], [x, FLOOR, 3.4], 0.22);
    }
    kit.beam("windlass-crank", [1.25, 6.6, 2.9], [1.25, 7.15, 2.9], 0.09, "iron");
    kit.beam("windlass-handle", [1.25, 7.15, 2.9], [1.65, 7.15, 2.9], 0.1, "wood");
    for (const x of [-0.65, 0.65]) {
      kit.beam("lifting-rope", [x, 6.65, 2.9], [x, 8.95, 3.85], 0.035, "cloth", true);
      kit.beam("lifting-rope", [x, 8.95, 3.85], [x, 8.65, 3.85], 0.035, "cloth", true);
      kit.ring("lifting-pulley", [x, 8.92, 3.8], 0.13, 0.035, "iron", true);
    }
    kit.beam("pulley-support", [-2, 9.1, 3.85], [2, 9.1, 3.85], 0.22);
    // A small projecting garderobe is reached through an opening in the side wall.
    // The waste opening continues through the floor below the open seat.
    for (const [x, width] of [
      [-7.825, 0.55],
      [-6.875, 0.75]
    ])
      kit.box("garderobe-floor", [x, FLOOR - 0.12, 2], [width, 0.24, 1.8], "stone");
    for (const z of [1.425, 2.575]) kit.box("garderobe-floor", [-7.4, FLOOR - 0.12, z], [0.3, 0.24, 0.65], "stone");
    panel("garderobe-outer-wall", -8, 2, 1.8, FLOOR, 8, [[0, 7.2, 0.16, 0.5]], true, 0.3);
    for (const z of [1.2, 2.8]) kit.box("garderobe-return", [-7.35, 6.65, z], [1.6, 2.7, 0.25], "stone");
    for (const x of [-7.75, -7.05]) kit.box("latrine-seat", [x, FLOOR + 0.5, 2], [0.45, 0.1, 0.8], "oak");
    for (const z of [1.65, 2.35]) kit.box("latrine-seat", [-7.4, FLOOR + 0.5, z], [0.4, 0.1, 0.12], "oak");
    for (const z of [1.3, 2.7]) kit.beam("garderobe-corbel", [-6.7, 4.35, z], [-7.8, 5.15, z], 0.35, "stone");
    if (exterior) {
      kit.roof(0, 0, 14.8, 11.3, EAVE, 3.1, "tile", true);
      kit.roof(-7.35, 2, 2, 2.2, 8, 0.65, "tile", true);
      // Fine staggered seams make the slate courses legible at viewer scale.
      for (const side of [-1, 1])
        for (let row = 0; row < 18; row++) {
          const t = row / 18;
          const y = EAVE + 3.1 * t + 0.015,
            z = side * 5.65 * (1 - t);
          kit.beam("roof-course-joint", [-7.4, y, z], [7.4, y, z], 0.018, "dark");
          for (let x = -7.3 + (row % 2) * 0.27; x < 7.3; x += 0.54) {
            const next = (row + 1) / 18;
            kit.beam(
              "slate-end-joint",
              [x, y, z],
              [x, EAVE + 3.1 * next + 0.015, side * 5.65 * (1 - next)],
              0.012,
              "dark"
            );
          }
        }
      const palette = townWallRoofPalette(profile);
      for (const mesh of kit.pickables)
        if (mesh.name === "pitched-roof" || mesh.name === "ridge-cap")
          (mesh.material as THREE.MeshLambertMaterial).color.setHex(palette[1]);
      for (const z of [-5.35, 5.35]) kit.box("string-course", [0, 5.5, z], [14.15, 0.18, 0.2], "plaster");
    }
    for (const [x, y, w, h] of upperWindows) {
      kit.box("window-mullion", [x, y, -5.02], [0.07, h, 0.15], "oak");
      kit.box("window-sill", [x, y - h / 2, -5.35], [w + 0.2, 0.12, 0.35], "stone");
      for (const sign of [-1, 1])
        kit.box("open-window-shutter", [x + sign * (w / 2 + 0.23), y, -5.35], [0.4, h, 0.07], "oak");
    }
  }
  return kit.finish();
}

export const GATEHOUSE: TownWallModel = {
  id: "medieval-town-gatehouse",
  task: "W04",
  name: "Gatehouse with guard quarters",
  part: "Inhabited town gate",
  author: "Codex GPT-6.1 Sol",
  period: "14th–15th-century England (interpretive)",
  scope:
    "BV study in metres; not automatically placed in CE. +Z faces the field, −Z the town. Cutaways remove roofs and field-facing masonry; ground-floor view also omits the upper storey.",
  size: [16, 12, 13],
  note: "A 3.8 m cart passage, open oak gates and raised portcullis; adjacent porter’s lodge with inspection window, desk, chest and bench. A separate town-side stair reaches the winding gear, watch room and two furnished sleeping places, with fireplace, chimney and projecting garderobe. Building dimensions, room arrangement and furniture are conjectural. Walmgate supplies the urban toll/residential precedent; Wetheral and Steeton supply comparative porter-room and domestic details, not urban plans. No later Walmgate timber extension or seventeenth-century watch house is reproduced.",
  sources: [
    {
      title: "City of York HER · Walmgate Bar: tolls (1280), house rent (1376), gates and portcullis",
      url: "https://her.york.gov.uk/monument/MYO4228"
    },
    {
      title:
        "English Heritage · Wetheral: porter’s lodge, stair, domestic chambers, fireplaces and garderobes (monastic comparison)",
      url: "https://www.english-heritage.org.uk/visit/places/wetheral-priory-gatehouse/history/"
    },
    {
      title: "English Heritage · Steeton Hall: porter’s room overlooking the passage (manorial comparison)",
      url: "https://www.english-heritage.org.uk/visit/places/steeton-hall-gateway/history/"
    }
  ],
  create: profile => createGatehouse(profile),
  views: [
    { name: "Ground floor cutaway", create: profile => createGatehouse(profile, "ground-floor") },
    { name: "Upper floor cutaway", create: profile => createGatehouse(profile, "upper-floor") }
  ]
};
