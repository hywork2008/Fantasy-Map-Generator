import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { BuildingAppearanceProfile } from "../appearance/types";
import { ModelKit, type Surface } from "../medieval/modelKit";
import { townWallRoofPalette } from "./townWallRoof";

/**
 * High-detail studies of the three parts CE places when Features → Walls is on:
 * a stone curtain bay, a round mural tower, and a twin-tower town gate.
 * Metres. +Z is the field; −Z is the town. Walk height is 8 m, the editor's
 * stone curtain. Illustrative high-medieval masonry, not a survey of one city.
 * Only the high tier is prepared.
 */
export const TOWN_WALL_AUTHOR = "Grok";
export const TOWN_WALL_RESOLUTIONS = ["high"] as const;
export type TownWallResolution = (typeof TOWN_WALL_RESOLUTIONS)[number];

export interface TownWallModel {
  id: string;
  task: string;
  name: string;
  part: string;
  /** Conservative width (X), depth (Z) and height (Y). */
  size: readonly [number, number, number];
  note: string;
  sources: readonly { title: string; url: string }[];
  create(profile?: BuildingAppearanceProfile): CityStructureMeshes;
  author?: string;
}

const WALK = 8;
const WALL_T = 2.6;
const SOURCES = [
  {
    title: "Cadw · Conwy Town Walls",
    url: "https://cadw.gov.wales/visit/places-to-visit/conwy-town-walls"
  },
  {
    title: "UNESCO · Historic Fortified City of Carcassonne",
    url: "https://whc.unesco.org/en/list/345/"
  }
] as const;

/** Barbican convention: θ = 0 looks toward the field (+Z). */
function outward(theta: number): readonly [number, number] {
  return [Math.sin(theta), Math.cos(theta)];
}

/** Shape angle whose extrude (rotateX −90°) faces the same way as `outward`. */
function shapeAngle(theta: number): number {
  return Math.atan2(-Math.cos(theta), Math.sin(theta));
}

function norm(angle: number): number {
  const turn = angle % (Math.PI * 2);
  return turn < 0 ? turn + Math.PI * 2 : turn;
}

function annularSector(outer: number, inner: number, a0: number, a1: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, a0, a1, false);
  shape.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
  shape.absarc(0, 0, inner, a1, a0, true);
  shape.closePath();
  return shape;
}

function fullRing(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** Solid ring sectors between door gaps. Gap centers are shape-space angles. */
function shellSectors(outer: number, inner: number, gaps: readonly number[], gapAngle: number): THREE.Shape[] {
  if (!gaps.length) return [fullRing(outer, inner)];
  const half = gapAngle / 2;
  const centers = gaps.map(norm).sort((a, b) => a - b);
  const shapes: THREE.Shape[] = [];
  for (let i = 0; i < centers.length; i++) {
    const a0 = centers[i] + half;
    const a1 = (i + 1 < centers.length ? centers[i + 1] : centers[0] + Math.PI * 2) - half;
    if (a1 - a0 < 0.15) continue;
    shapes.push(annularSector(outer, inner, a0, a1));
  }
  return shapes;
}

function extrudeUp(
  kit: ModelKit,
  name: string,
  shape: THREE.Shape,
  y0: number,
  height: number,
  surface: Surface = "stone"
) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 18 });
  geometry.rotateX(-Math.PI / 2);
  const mesh = kit.add(name, geometry, surface);
  mesh.position.y = y0;
  return mesh;
}

/** Field-face talus. Town face stays vertical at z = −thickness/2. */
function talus(kit: ModelKit, x0: number, x1: number, height: number, toe: number) {
  const zTown = -WALL_T / 2;
  const zTop = WALL_T / 2;
  const zToe = zTop + toe;
  const y1 = height;
  const positions = [
    x0,
    0,
    zTown,
    x1,
    0,
    zTown,
    x1,
    0,
    zToe,
    x0,
    0,
    zTown,
    x1,
    0,
    zToe,
    x0,
    0,
    zToe,
    x0,
    y1,
    zTown,
    x1,
    y1,
    zTop,
    x1,
    y1,
    zTown,
    x0,
    y1,
    zTown,
    x0,
    y1,
    zTop,
    x1,
    y1,
    zTop,
    x0,
    0,
    zTown,
    x1,
    y1,
    zTown,
    x1,
    0,
    zTown,
    x0,
    0,
    zTown,
    x0,
    y1,
    zTown,
    x1,
    y1,
    zTown,
    x0,
    0,
    zToe,
    x1,
    0,
    zToe,
    x1,
    y1,
    zTop,
    x0,
    0,
    zToe,
    x1,
    y1,
    zTop,
    x0,
    y1,
    zTop,
    x0,
    0,
    zTown,
    x0,
    0,
    zToe,
    x0,
    y1,
    zTop,
    x0,
    0,
    zTown,
    x0,
    y1,
    zTop,
    x0,
    y1,
    zTown,
    x1,
    0,
    zTown,
    x1,
    y1,
    zTop,
    x1,
    0,
    zToe,
    x1,
    0,
    zTown,
    x1,
    y1,
    zTown,
    x1,
    y1,
    zTop
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  kit.add("curtain-talus", geometry, "stone");
}

/** One stone curtain run along X, field to +Z. Ends may sink into a tower. */
function addCurtain(kit: ModelKit, x0: number, x1: number) {
  const length = x1 - x0;
  const mid = (x0 + x1) / 2;
  const face = WALL_T / 2;
  talus(kit, x0, x1, 1.65, 0.7);
  kit.box("curtain-wall", [mid, (1.5 + WALK) / 2, 0], [length, WALK - 1.5, WALL_T], "stone");
  for (const y of [3.35, 6.7]) kit.box("string-course", [mid, y, face - 0.02], [length + 0.04, 0.22, 0.34], "white");
  kit.box("wall-walk", [mid, WALK + 0.08, -0.15], [length, 0.16, WALL_T - 0.85], "stone");
  kit.box("outer-parapet", [mid, WALK + 0.38, face - 0.28], [length, 0.6, 0.62], "stone");
  kit.box("inner-parapet", [mid, WALK + 0.5, -face + 0.22], [length, 1.0, 0.4], "stone");
  const pitch = 1.55;
  const count = Math.max(1, Math.round(length / pitch));
  const span = count * pitch;
  const origin = mid - span / 2;
  for (let i = 0; i < count; i++) {
    const x = origin + (i + 0.5) * pitch;
    kit.box("curtain-merlon", [x, WALK + 1.15, face - 0.28], [0.86, 0.95, 0.58], "stone");
    kit.box("merlon-coping", [x, WALK + 1.68, face - 0.26], [0.98, 0.14, 0.7], "white");
  }
  if (length > 4.5) {
    const slits = Math.max(1, Math.round(length / 4.8));
    for (let i = 0; i < slits; i++) {
      const x = x0 + ((i + 0.5) * length) / slits;
      kit.box("arrow-slit", [x, 4.7, face + 0.02], [0.14, 1.25, 0.1], "dark");
      kit.box("slit-splay", [x, 4.7, face + 0.01], [0.42, 1.45, 0.06], "stone");
    }
  }
  const corbels = Math.max(2, Math.round(length / 1.15));
  for (let i = 0; i < corbels; i++) {
    const x = x0 + ((i + 0.5) * length) / corbels;
    kit.box("parapet-corbel", [x, WALK - 0.05, face + 0.18], [0.28, 0.36, 0.46], "stone");
  }
  if (length > 8) {
    for (const x of [mid - length * 0.22, mid + length * 0.22]) {
      kit.box("drain-spout", [x, WALK + 0.22, face + 0.45], [0.22, 0.16, 0.7], "stone");
      kit.box("spout-bore", [x, WALK + 0.26, face + 0.78], [0.1, 0.08, 0.12], "dark");
    }
  }
}

function radial(
  kit: ModelKit,
  name: string,
  center: readonly [number, number],
  theta: number,
  radius: number,
  y: number,
  size: readonly [number, number, number],
  surface: Surface
) {
  const [x, z] = outward(theta);
  const mesh = kit.box(name, [center[0] + x * radius, y, center[1] + z * radius], size, surface);
  mesh.rotation.y = theta;
  return mesh;
}

function addDrum(
  kit: ModelKit,
  center: readonly [number, number],
  outer: number,
  inner: number,
  platform: number,
  doors: readonly number[]
) {
  const [cx, cz] = center;
  const gap = 1.25 / ((outer + inner) / 2);
  const shapeGaps = doors.map(shapeAngle);
  const skirt = new THREE.LatheGeometry(
    [
      new THREE.Vector2(outer + 0.62, 0),
      new THREE.Vector2(outer + 0.08, 1.55),
      new THREE.Vector2(outer - 0.12, 1.55),
      new THREE.Vector2(outer + 0.2, 0)
    ],
    28
  );
  kit.add("tower-talus", skirt, "stone").position.set(cx, 0, cz);
  const place = (shapes: THREE.Shape[], name: string, y0: number, height: number) => {
    for (const shape of shapes) {
      const mesh = extrudeUp(kit, name, shape, y0, height);
      mesh.position.x = cx;
      mesh.position.z = cz;
    }
  };
  place(shellSectors(outer, inner, [], 0), "tower-shell", 0, WALK);
  place(shellSectors(outer, inner, shapeGaps, gap), "tower-shell", WALK, 2.15);
  place(shellSectors(outer, inner, [], 0), "tower-shell", WALK + 2.15, platform - (WALK + 2.15));
  kit.cylinder("tower-floor", [cx, 0.08, cz], inner - 0.08, 0.16, "stone");
  kit.cylinder("tower-platform", [cx, platform - 0.08, cz], inner - 0.06, 0.16, "stone");
  kit.cylinder("door-landing", [cx, WALK + 0.08, cz], inner - 0.12, 0.16, "oak");
  for (const y of [3.4, WALK - 0.35, platform - 0.55]) {
    for (const shape of [
      annularSector(outer + 0.16, outer - 0.08, 0, Math.PI),
      annularSector(outer + 0.16, outer - 0.08, Math.PI, Math.PI * 2)
    ]) {
      const ring = extrudeUp(kit, "tower-string", shape, y, 0.2, "white");
      ring.position.x = cx;
      ring.position.z = cz;
    }
  }
  const slits = [0, 0.7, 1.4, 2.2, 2.9, 3.6, 4.4, 5.2];
  for (const y of [4.4, WALK + 1.05])
    for (const theta of slits) {
      if (doors.some(door => Math.abs(Math.atan2(Math.sin(theta - door), Math.cos(theta - door))) < 0.45)) continue;
      radial(kit, "tower-slit", center, theta, outer + 0.02, y, [0.14, y > WALK ? 0.9 : 1.15, 0.12], "dark");
    }
  for (let i = 0; i < 16; i++) {
    const theta = (i * Math.PI) / 8;
    radial(kit, "tower-corbel", center, theta, outer + 0.12, platform - 0.15, [0.32, 0.34, 0.42], "stone");
  }
  for (let i = 0; i < 12; i++) {
    const theta = ((i + 0.5) * Math.PI) / 6;
    radial(kit, "tower-merlon", center, theta, outer - 0.22, platform + 0.62, [0.72, 1.05, 0.55], "stone");
    radial(kit, "tower-coping", center, theta, outer - 0.18, platform + 1.2, [0.84, 0.14, 0.66], "white");
  }
  const rise = 3.5;
  kit.cylinder("tower-roof", [cx, platform + 0.35 + rise / 2, cz], outer - 0.85, rise, "tile", 0, 20);
  kit.cylinder("roof-eave", [cx, platform + 0.28, cz], outer - 0.55, 0.16, "tile", outer - 0.85, 20);
  kit.cylinder("roof-finial", [cx, platform + rise + 0.57, cz], 0.14, 0.44, "iron", 0, 8);
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const theta = i * 0.55 + Math.PI;
    if (doors.some(door => Math.abs(Math.atan2(Math.sin(theta - door), Math.cos(theta - door))) < 0.4)) continue;
    const [x, z] = outward(theta);
    const tread = kit.box(
      "tower-stair",
      [cx + x * (inner * 0.58), 0.35 + i * 0.42, cz + z * (inner * 0.58)],
      [0.7, 0.14, 0.42],
      "oak"
    );
    tread.rotation.y = theta;
  }
}

function pointedArch(half: number, spring: number, rise: number, top: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-half, top);
  shape.lineTo(half, top);
  shape.lineTo(half, spring);
  shape.quadraticCurveTo(half * 0.78, spring + rise, 0, spring + rise);
  shape.quadraticCurveTo(-half * 0.78, spring + rise, -half, spring);
  shape.closePath();
  return shape;
}

function addGate(kit: ModelKit) {
  const half = 1.85;
  const spring = 4.05;
  const rise = 2.15;
  const z0 = -2.55;
  const z1 = 2.75;
  const depth = z1 - z0;
  const arch = new THREE.ExtrudeGeometry(pointedArch(half, spring, rise, WALK + 0.1), {
    depth,
    bevelEnabled: false,
    curveSegments: 14
  });
  arch.translate(0, 0, z0);
  kit.add("gate-arch", arch, "stone");
  for (const side of [-1, 1] as const) {
    kit.box("gate-pier", [side * 3.15, (WALK + 0.24) / 2, 0.1], [2.6, WALK + 0.24, depth], "stone");
    kit.box("jamb-groove", [side * (half + 0.08), 4.1, z1 - 0.42], [0.16, 7.4, 0.28], "dark");
  }
  kit.box("gate-bridge", [0, WALK + 0.12, 0.05], [half * 2 + 3.2, 0.22, 2.4], "stone");
  kit.box("field-parapet", [0, WALK + 0.7, 1.15], [8.2, 0.85, 0.55], "stone");
  for (let i = 0; i < 5; i++) {
    const x = -1.6 + i * 0.8;
    kit.box("gate-merlon", [x, WALK + 1.45, 1.15], [0.48, 0.7, 0.5], "stone");
  }
  for (let i = 0; i < 6; i++) {
    kit.box("machicolation-corbel", [-1.25 + i * 0.5, WALK + 0.28, z1 + 0.28], [0.28, 0.5, 0.7], "stone");
  }
  kit.box("machicolation-floor", [0, WALK + 0.62, z1 + 0.32], [3.2, 0.2, 0.85], "stone");
  kit.box("machicolation-breast", [0, WALK + 1.15, z1 + 0.62], [3.2, 0.9, 0.28], "stone");
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const x = -1.35 + (i * 2.7) / (bars - 1);
    kit.box("portcullis-bar", [x, 6.15, z1 - 0.28], [0.08, 2.5, 0.08], "iron");
  }
  for (const y of [5.15, 6.15, 7.05]) kit.box("portcullis-rail", [0, y, z1 - 0.28], [2.7, 0.07, 0.07], "iron");
  for (const side of [-1, 1] as const) {
    const leaf = kit.box("gate-door", [side * 1.68, 1.7, z0 + 0.95], [0.12, 3.25, 1.35], "oak");
    leaf.rotation.y = side * 0.35;
    for (const y of [0.7, 2.6]) kit.box("door-strap", [side * 1.68, y, z0 + 0.95], [0.05, 0.1, 1.2], "iron");
    kit.box("door-hinge", [side * (half - 0.02), 1.7, z0 + 0.35], [0.16, 0.28, 0.2], "iron");
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i * Math.PI) / 8;
    const radius = half + 0.58;
    const voussoir = kit.box(
      "archivolt",
      [Math.cos(a) * radius, spring + Math.sin(a) * (rise + 0.45), z1 + 0.06],
      [0.4, 0.32, 0.26],
      "white"
    );
    voussoir.rotation.z = a - Math.PI / 2;
  }
  for (const side of [-1, 1] as const) {
    const center: readonly [number, number] = [side * 5.55, 0.35];
    addDrum(kit, center, 3.15, 2.25, 12.4, [side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    addCurtain(kit, side > 0 ? 8.2 : -13.6, side > 0 ? 13.6 : -8.2);
  }
}

export const TOWN_WALLS: readonly TownWallModel[] = [
  {
    author: TOWN_WALL_AUTHOR,
    id: "town-curtain-wall",
    task: "W01",
    name: "Stone curtain wall",
    part: "Wall face",
    size: [14.2, 4.8, 10],
    note: "One bay of a stone town curtain: battered plinth, arrow slits, string courses, corbel table, paved wall-walk, outer merlons and a lower inner parapet. Ends are a cut through a longer circuit.",
    sources: SOURCES,
    create(profile = "legacy") {
      const kit = new ModelKit(this.id);
      addCurtain(kit, -7, 7);
      if (profile !== "legacy") {
        const color = townWallRoofPalette(profile)[1];
        for (const mesh of kit.pickables) {
          if (mesh.name === "tower-roof" || mesh.name === "roof-eave") {
            (mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
          }
        }
      }
      return kit.finish();
    }
  },
  {
    author: TOWN_WALL_AUTHOR,
    id: "town-mural-tower",
    task: "W02",
    name: "Round mural tower",
    part: "Tower",
    size: [17.2, 9.2, 16.6],
    note: "Round tower bonded into the curtain and projecting toward the field. Hollow drum, wall-walk doors on both returns, arrow slits, corbelled crenellations and a conical tiled roof. A timber stair stands inside.",
    sources: SOURCES,
    create(profile = "legacy") {
      const kit = new ModelKit(this.id);
      addDrum(kit, [0, 0.55], 3.35, 2.45, 11.35, [Math.PI / 2, -Math.PI / 2]);
      addCurtain(kit, -8.3, -2.15);
      addCurtain(kit, 2.15, 8.3);
      if (profile !== "legacy") {
        const color = townWallRoofPalette(profile)[1];
        for (const mesh of kit.pickables) {
          if (mesh.name === "tower-roof" || mesh.name === "roof-eave") {
            (mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
          }
        }
      }
      return kit.finish();
    }
  },
  {
    author: TOWN_WALL_AUTHOR,
    id: "town-gate",
    task: "W03",
    name: "Twin-tower town gate",
    part: "Gate",
    size: [28, 12, 17.2],
    note: "Twin round towers flank a pointed passage. The portcullis is raised into the arch, the oak leaves are folded open against the jambs, and a machicolation projects over the field arch. The passage stays clear for a cart.",
    sources: SOURCES,
    create(profile = "legacy") {
      const kit = new ModelKit(this.id);
      addGate(kit);
      if (profile !== "legacy") {
        const color = townWallRoofPalette(profile)[1];
        for (const mesh of kit.pickables) {
          if (mesh.name === "tower-roof" || mesh.name === "roof-eave") {
            (mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
          }
        }
      }
      return kit.finish();
    }
  }
];
