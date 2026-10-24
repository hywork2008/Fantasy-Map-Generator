import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { TownWallModel } from "./townWalls";

/** Independent Codex studies: metres, +Z field, -Z town, 8 m connecting wall-walk. */
export const CODEX_TOWN_WALL_PERIOD = "Late medieval / Age of Discovery Europe · c. 1450–1550";
const WALK = 8;
const JOINT = 0.018;
const STONE = [0xaaa28f, 0xb6ad99, 0xa59b87, 0xbdb39e, 0xafa793, 0x9e9787];
const DRESSED = [0xc6bda9, 0xbeb59f, 0xd0c7b3];
const SLATE = [0x4e5a62, 0x59646b, 0x626c70, 0x47545d];
type Vec = readonly [number, number, number];

/** Bake repeated stones into component meshes, retaining vertex colour and real joints.
 * No textures, browser canvas, random state or per-stone draw calls are required.
 */
class Masonry {
  private readonly batches = new Map<string, THREE.BufferGeometry[]>();
  private readonly cube = new THREE.BoxGeometry();
  private index = 0;
  add(name: string, geometry: THREE.BufferGeometry, palette = STONE) {
    const color = new THREE.Color(palette[(this.index++ * 7 + Math.floor(this.index / 5)) % palette.length]);
    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const batch = this.batches.get(name) ?? [];
    batch.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    this.batches.set(name, batch);
  }
  box(name: string, p: Vec, size: Vec, palette = STONE, rotation = 0) {
    const geometry = this.cube.clone();
    geometry.scale(...size);
    geometry.rotateY(rotation);
    geometry.translate(...p);
    this.add(name, geometry, palette);
  }
  /** A closed curved ashlar, with optional battered lower radius. */
  wedge(
    name: string,
    cx: number,
    cz: number,
    ri: number,
    ro: number,
    y: number,
    h: number,
    a: number,
    b: number,
    palette = STONE,
    foot = ro
  ) {
    const positions: number[] = [];
    const point = (r: number, yy: number, angle: number): Vec => [
      cx + Math.sin(angle) * r,
      yy,
      cz + Math.cos(angle) * r
    ];
    const quad = (a: Vec, b: Vec, c: Vec, d: Vec) => positions.push(...a, ...b, ...d, ...b, ...c, ...d);
    const count = Math.max(1, Math.ceil((b - a) * 16));
    for (let i = 0; i < count; i++) {
      const t = a + ((b - a) * i) / count,
        u = a + ((b - a) * (i + 1)) / count;
      quad(point(foot, y, t), point(foot, y, u), point(ro, y + h, u), point(ro, y + h, t));
      quad(point(ri, y, u), point(ri, y, t), point(ri, y + h, t), point(ri, y + h, u));
      quad(point(ri, y + h, t), point(ro, y + h, t), point(ro, y + h, u), point(ri, y + h, u));
      quad(point(ri, y, u), point(foot, y, u), point(foot, y, t), point(ri, y, t));
    }
    quad(point(ri, y, a), point(foot, y, a), point(ro, y + h, a), point(ri, y + h, a));
    quad(point(foot, y, b), point(ri, y, b), point(ri, y + h, b), point(ro, y + h, b));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    this.add(name, geometry, palette);
  }
  radial(name: string, cx: number, cz: number, a: number, r: number, y: number, size: Vec, palette = STONE) {
    this.box(name, [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r], size, palette, a);
  }
  finish(id: string): CityStructureMeshes {
    const group = new THREE.Group();
    group.name = `${id}-codex`;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const pickables: THREE.Mesh[] = [];
    for (const [name, pieces] of this.batches) {
      const geometry = mergeGeometries(pieces, false)!;
      for (const piece of pieces) piece.dispose();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      pickables.push(mesh);
    }
    this.cube.dispose();
    return {
      group,
      pickables,
      dispose() {
        for (const mesh of pickables) mesh.geometry.dispose();
        material.dispose();
      }
    };
  }
}

/** Split course intervals at actual openings instead of covering stone with dark decals. */
function subtract(a: number, b: number, gaps: readonly (readonly [number, number])[]): [number, number][] {
  let spans: [number, number][] = [[a, b]];
  for (const [lo, hi] of gaps)
    spans = spans.flatMap(([x, y]) =>
      hi <= x || lo >= y
        ? [[x, y]]
        : ([
            [x, Math.min(y, lo)],
            [Math.max(x, hi), y]
          ].filter(([l, r]) => r - l > 0.025) as [number, number][])
    );
  return spans;
}

function blocks(
  m: Masonry,
  name: string,
  x0: number,
  x1: number,
  y: number,
  h: number,
  z: number,
  depth: number,
  row: number,
  palette = STONE,
  gaps: readonly (readonly [number, number])[] = []
) {
  const pitch = 0.88;
  for (let x = x0 - ((row % 2) * pitch) / 2; x < x1; x += pitch) {
    for (const [a, b] of subtract(Math.max(x, x0), Math.min(x + pitch, x1), gaps)) {
      if (b - a <= JOINT) continue;
      m.box(name, [(a + b) / 2, y + h / 2, z], [b - a - JOINT, h - JOINT, depth], palette);
    }
  }
}

function curtain(m: Masonry, x0: number, x1: number) {
  // Sloping field plinth, a vertical town face, and coursed limestone above it.
  for (let row = 0; row < 20; row++) {
    const y = row * 0.4;
    const depth = 2.6 + Math.max(0, 1 - y / 1.6) * 0.55;
    const slots: [number, number][] =
      row >= 11 && row <= 13 ? [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7].map(x => [x - 0.1, x + 0.1]) : [];
    blocks(
      m,
      "curtain-ashlar",
      x0,
      x1,
      y + (row ? JOINT / 2 : -JOINT / 2),
      0.4,
      (depth - 2.6) / 2,
      depth,
      row,
      STONE,
      slots
    );
  }
  for (const y of [1.6, 7.7]) blocks(m, "curtain-string-course", x0, x1, y, 0.16, 0, 2.72, 0, DRESSED);
  blocks(m, "wall-walk-paving", x0, x1, WALK, 0.14, -0.08, 1.85, 0, DRESSED);
  for (let row = 0; row < 2; row++) {
    blocks(m, "outer-parapet", x0, x1, 8.12 + row * 0.32, 0.32, 1.08, 0.64, row);
    blocks(m, "town-parapet", x0, x1, 8.12 + row * 0.28, 0.28, -1.1, 0.4, row);
  }
  const count = Math.max(1, Math.round((x1 - x0) / 1.5));
  for (let i = 0; i < count; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / count;
    for (let row = 0; row < 3; row++) {
      // Narrow open crossbow slit through each merlon, with an intact head stone.
      const gaps: [number, number][] = row < 2 ? [[x - 0.045, x + 0.045]] : [];
      blocks(m, "curtain-merlons", x - 0.46, x + 0.46, 8.76 + row * 0.32, 0.32, 1.08, 0.64, row, STONE, gaps);
    }
    m.box("curtain-coping", [x, 9.78, 1.08], [1.02, 0.14, 0.8], DRESSED);
  }
  const brackets = Math.ceil((x1 - x0) / 1.05);
  for (let i = 0; i < brackets; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / brackets;
    for (let step = 0; step < 3; step++)
      m.box("curtain-corbel", [x, 7.48 + step * 0.17, 1.3 + step * 0.08], [0.3, 0.17, 0.25 + step * 0.16], DRESSED);
  }
}

function drum(m: Masonry, cx: number, cz: number, platform: number, doors: readonly number[]) {
  const outer = 3.3,
    inner = 2.16,
    course = 0.4;
  for (let row = 0; row < Math.round(platform / course); row++) {
    const y = row * course;
    const gaps: [number, number][] = [];
    for (const a of doors) if (y >= WALK && y < WALK + 2) gaps.push([a - 0.24, a + 0.24]);
    if ((y >= 4.4 && y < 5.6) || (y >= 9.2 && y < 10.4)) {
      for (let i = -4; i <= 4; i++) {
        const a = (i * Math.PI) / 4;
        if (doors.some(door => Math.abs(a - door) < 0.4) && y >= WALK) continue;
        gaps.push([a - 0.029, a + 0.029]);
      }
    }
    const count = 26,
      pitch = (2 * Math.PI) / count;
    for (let i = 0; i <= count; i++) {
      const a = -Math.PI + (i - (row % 2) / 2) * pitch;
      const b = Math.min(Math.PI, a + pitch);
      for (const [lo, hi] of subtract(Math.max(-Math.PI, a), b, gaps)) {
        if (hi - lo < 0.008) continue;
        const toe = Math.max(0, 1 - y / 1.6) * 0.55;
        const topToe = Math.max(0, 1 - (y + course) / 1.6) * 0.55;
        m.wedge(
          "tower-ashlar",
          cx,
          cz,
          inner,
          outer + topToe,
          y + (row ? JOINT / 2 : 0),
          course - JOINT / 2,
          lo + 0.003,
          hi - 0.003,
          STONE,
          outer + toe
        );
      }
    }
  }
  for (const y of [1.6, 7.7, platform - 0.7])
    for (let i = 0; i < 26; i++)
      m.wedge(
        "tower-belt-course",
        cx,
        cz,
        outer - 0.08,
        outer + 0.12,
        y,
        0.16,
        (i * 2 * Math.PI) / 26 + 0.003,
        ((i + 1) * 2 * Math.PI) / 26 - 0.003,
        DRESSED
      );
  for (const y of [WALK, platform - 0.18]) {
    const geometry = new THREE.CylinderGeometry(inner, inner, 0.18, 48);
    geometry.translate(cx, y, cz);
    m.add("tower-floor", geometry, y === WALK ? [0x796044, 0x866b4e] : DRESSED);
  }
  // A genuinely open machicolation gallery: projecting breastwork on stepped corbels.
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    for (let step = 0; step < 3; step++)
      m.radial(
        "tower-machicolation-corbel",
        cx,
        cz,
        a,
        outer + step * 0.15,
        platform - 0.62 + step * 0.2,
        [0.3, 0.2, 0.4 + step * 0.16],
        DRESSED
      );
    m.wedge("tower-parapet", cx, cz, 3.49, 3.93, platform + 0.02, 0.65, a + 0.002, a + Math.PI / 12 - 0.002);
    // Radial lintels bridge the drop slots without sealing them from below.
    m.radial("machicolation-lintel", cx, cz, a, 3.5, platform + 0.06, [0.34, 0.16, 0.94], DRESSED);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i * 2 * Math.PI) / 14,
      half = 0.115;
    for (let row = 0; row < 3; row++)
      m.wedge("tower-merlons", cx, cz, 3.49, 3.93, platform + 0.67 + row * 0.3, 0.29, a - half, a + half);
    m.wedge("tower-coping", cx, cz, 3.42, 4.01, platform + 1.57, 0.14, a - half - 0.013, a + half + 0.013, DRESSED);
  }
  // Raised central cap leaves a usable annular fighting walk below the crenels.
  const eave = platform + 1.7,
    rise = 3.8,
    radius = 2.48;
  const roof = new THREE.ConeGeometry(radius, rise, 64);
  roof.translate(cx, eave + rise / 2, cz);
  m.add("tower-roof-underlay", roof, [0x39444c]);
  for (let row = 0; row < 19; row++) {
    const y = (row * rise) / 19;
    const bottom = radius * (1 - y / rise) + 0.035;
    const top = Math.max(0.025, radius * (1 - (y + rise / 19 + 0.035) / rise));
    const count = Math.max(6, Math.round((2 * Math.PI * bottom) / 0.3));
    for (let i = 0; i < count; i++) {
      const a = ((i + (row % 2) / 2) * 2 * Math.PI) / count;
      const geometry = new THREE.CylinderGeometry(
        top,
        bottom,
        rise / 19 + 0.035,
        1,
        1,
        true,
        a + 0.008,
        (2 * Math.PI) / count - 0.016
      );
      geometry.translate(cx, eave + y + (rise / 19 + 0.035) / 2, cz);
      m.add("individual-slate-shingles", geometry, SLATE);
    }
  }
  const finial = new THREE.ConeGeometry(0.095, 0.62, 12);
  finial.translate(cx, eave + rise + 0.23, cz);
  m.add("roof-finial", finial, [0x55544b]);
  // Windowed lantern supports the cap and makes its bearing legible.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    m.radial("roof-bearing-post", cx, cz, a, 1.96, platform + 0.85, [0.17, 1.7, 0.17], [0x64513e]);
  }
}

/** Gothic arch follows two circular arcs with their centres on the spring line. */
function archPoint(t: number, half: number, spring: number): THREE.Vector2 {
  const radius = half * 2;
  if (t <= 0.5) {
    const a = Math.PI - (t * 2 * Math.PI) / 3;
    return new THREE.Vector2(half + radius * Math.cos(a), spring + radius * Math.sin(a));
  }
  const a = Math.PI / 3 - ((t - 0.5) * 2 * Math.PI) / 3;
  return new THREE.Vector2(-half + radius * Math.cos(a), spring + radius * Math.sin(a));
}

function gate(m: Masonry) {
  const half = 1.9,
    spring = 3.75,
    depth = 5.6,
    crown = spring + Math.sqrt(3) * half;
  const shape = new THREE.Shape();
  shape.moveTo(-3.6, 8);
  shape.lineTo(3.6, 8);
  shape.lineTo(3.6, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, spring);
  for (let i = 24; i >= 0; i--) {
    const p = archPoint(i / 24, half, spring);
    shape.lineTo(p.x, p.y);
  }
  shape.lineTo(-half, 0);
  shape.lineTo(-3.6, 0);
  shape.closePath();
  const vault = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  vault.translate(0, 0, -depth / 2);
  m.add("gate-vault", vault);
  // Raised facing blocks expose the structural vault in the passage.
  for (const z of [-depth / 2 - 0.08, depth / 2 + 0.08]) {
    for (let row = 0; row < 20; row++) {
      const y = row * 0.4;
      let opening = half;
      if (y >= spring && y <= crown) {
        const dy = y - spring;
        opening = Math.max(0, Math.sqrt(Math.max(0, 4 * half * half - dy * dy)) - half);
      } else if (y > crown) opening = 0;
      blocks(
        m,
        "gate-facing-ashlar",
        -3.6,
        3.6,
        y,
        0.4,
        z,
        0.18,
        row,
        STONE,
        opening > 0 ? [[-opening - 0.46, opening + 0.46]] : []
      );
    }
    for (const side of [-1, 1])
      for (let row = 0; row < 9; row++)
        m.box(
          "gate-jamb-stones",
          [side * (half + 0.21), (row * spring) / 9 + spring / 18, z],
          [0.42, spring / 9 - JOINT, 0.34],
          DRESSED
        );
    // Individually jointed voussoirs follow the same circular curves as the void.
    for (let i = 0; i < 24; i++) {
      const a = archPoint((i + 0.025) / 24, half, spring),
        b = archPoint((i + 0.975) / 24, half, spring);
      const center = i < 12 ? half : -half;
      const outerA = a
        .clone()
        .sub(new THREE.Vector2(center, spring))
        .multiplyScalar(1.12)
        .add(new THREE.Vector2(center, spring));
      const outerB = b
        .clone()
        .sub(new THREE.Vector2(center, spring))
        .multiplyScalar(1.12)
        .add(new THREE.Vector2(center, spring));
      const stone = new THREE.Shape([a, b, outerB, outerA]);
      const geometry = new THREE.ExtrudeGeometry(stone, {
        depth: 0.34,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 1
      });
      geometry.translate(0, 0, z - 0.17);
      m.add("pointed-arch-voussoirs", geometry, DRESSED);
    }
  }
  // Open oak leaves, with planks, their iron straps and rivets transformed together.
  for (const side of [-1, 1]) {
    const hingeX = side * 1.84,
      hingeZ = -1.85,
      angle = side * 0.16;
    const place = (name: string, x: number, y: number, z: number, size: Vec, palette: number[]) => {
      m.box(
        name,
        [hingeX + x * Math.cos(angle) + z * Math.sin(angle), y, hingeZ - x * Math.sin(angle) + z * Math.cos(angle)],
        size,
        palette,
        angle
      );
    };
    for (let i = 0; i < 9; i++)
      place("gate-oak-planks", 0, 1.72, 0.1 + i * 0.19, [0.16, 3.4, 0.184], [0x765637, 0x896743, 0x80603c]);
    for (const y of [0.55, 1.75, 2.95]) {
      place("gate-door-straps", -side * 0.095, y, 0.86, [0.045, 0.1, 1.62], [0x454644]);
      for (let i = 0; i < 6; i++)
        place("gate-door-rivets", -side * 0.125, y, 0.13 + i * 0.28, [0.025, 0.045, 0.045], [0x62625a]);
    }
  }
  // Raised grid is tucked behind the arch, leaving 3.6 m of clear passage below.
  for (let i = 0; i < 11; i++) {
    const x = -1.65 + i * 0.33;
    m.box("raised-portcullis-bars", [x, 5.55, 2.4], [0.075, 3.8, 0.085], [0x454743]);
  }
  for (let i = 0; i < 9; i++) m.box("portcullis-crossrails", [0, 3.85 + i * 0.42, 2.4], [3.55, 0.07, 0.09], [0x494a43]);
  // Covered gate machinery chamber between the tower drums.
  for (let row = 0; row < 9; row++) {
    const y = 8 + row * 0.4;
    const gaps: [number, number][] =
      row >= 2 && row <= 5
        ? [
            [-1.25, -0.75],
            [0.75, 1.25]
          ]
        : [];
    for (const z of [-2.5, 2.5]) blocks(m, "gatehouse-upper-chamber", -3.65, 3.65, y, 0.4, z, 0.55, row, STONE, gaps);
  }
  blocks(m, "gatehouse-cornice", -3.7, 3.7, 11.6, 0.18, 0, 5.4, 0, DRESSED);
  // Continuous hipped slopes: each slate follows the pitch, rather than a stack of flat terraces.
  for (let row = 0; row < 16; row++) {
    const t0 = row / 16,
      t1 = (row + 1) / 16;
    const corner = (sx: number, sz: number, t: number): THREE.Vector3 =>
      new THREE.Vector3(sx * (4.025 - 3.025 * t), 11.78 + 2.75 * t, sz * 3.025 * (1 - t));
    const faces = [
      [corner(-1, 1, t0), corner(1, 1, t0), corner(-1, 1, t1), corner(1, 1, t1)],
      [corner(1, -1, t0), corner(-1, -1, t0), corner(1, -1, t1), corner(-1, -1, t1)],
      [corner(1, 1, t0), corner(1, -1, t0), corner(1, 1, t1), corner(1, -1, t1)],
      [corner(-1, -1, t0), corner(-1, 1, t0), corner(-1, -1, t1), corner(-1, 1, t1)]
    ];
    for (const [a, b, c, d] of faces) {
      const count = Math.max(1, Math.round(a.distanceTo(b) / 0.3));
      for (let tile = 0; tile < count; tile++) {
        const u = (tile + 0.008) / count,
          v = (tile + 0.992) / count;
        const p = a.clone().lerp(b, u),
          q = a.clone().lerp(b, v);
        const r = c.clone().lerp(d, u),
          s = c.clone().lerp(d, v);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute([...p, ...q, ...r, ...q, ...s, ...r], 3));
        g.computeVertexNormals();
        m.add("gatehouse-hipped-slate-roof", g, SLATE);
      }
    }
  }
  m.box("gatehouse-roof-ridge", [0, 14.55, 0], [2.12, 0.13, 0.18], SLATE);
  // Projecting murder-hole gallery above the field entrance.
  for (let i = 0; i < 7; i++) {
    const x = -1.8 + i * 0.6;
    for (let step = 0; step < 3; step++)
      m.box(
        "gate-machicolation-corbel",
        [x, 7.1 + step * 0.2, 2.88 + step * 0.16],
        [0.28, 0.2, 0.4 + step * 0.25],
        DRESSED
      );
  }
  for (let row = 0; row < 3; row++)
    blocks(m, "gate-machicolation-breast", -2.1, 2.1, 7.7 + row * 0.3, 0.3, 3.55, 0.4, row);
  blocks(m, "gate-gallery-coping", -2.16, 2.16, 8.6, 0.14, 3.55, 0.56, 0, DRESSED);
  for (const side of [-1, 1]) {
    drum(m, side * 5.2, 0.45, 12.4, [side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    curtain(m, side > 0 ? 8.3 : -13.5, side > 0 ? 13.5 : -8.3);
  }
}

const sources = [
  { title: "Cadw · Conwy Town Walls", url: "https://cadw.gov.wales/visit/places-to-visit/conwy-town-walls" },
  {
    title: "English Heritage · Dunstanburgh Castle: description",
    url: "https://www.english-heritage.org.uk/visit/places/dunstanburgh-castle/history/description/"
  }
] as const;

export const CODEX_TOWN_WALLS: readonly TownWallModel[] = [
  {
    id: "town-curtain-wall",
    task: "W01",
    name: "Stone curtain wall",
    part: "Wall face",
    size: [14, 3.3, 10],
    note: "Coursed limestone curtain with staggered joints, battered foot, open arrow loops, paved 8 m wall-walk, stepped corbels, slit merlons and dressed coping. Field faces +Z. Illustrative c. 1450–1550 circuit surviving from medieval construction.",
    sources,
    create() {
      const m = new Masonry();
      curtain(m, -7, 7);
      return m.finish(this.id);
    }
  },
  {
    id: "town-mural-tower",
    task: "W02",
    name: "Round mural tower",
    part: "Tower",
    size: [17, 8.5, 18],
    note: "Hollow, battered ashlar drum with actual arrow loops and two wall-walk doorways. Open drop slots sit between stepped machicolation corbels. Curved crenellations surround a raised cap with individually modelled slate courses and a metal finial. Illustrative c. 1450–1550.",
    sources,
    create() {
      const m = new Masonry();
      drum(m, 0, 0.55, 11.6, [Math.PI / 2, -Math.PI / 2]);
      curtain(m, -8.4, -3.25);
      curtain(m, 3.25, 8.4);
      return m.finish(this.id);
    }
  },
  {
    id: "town-gate",
    task: "W03",
    name: "Twin-tower town gate",
    part: "Gate",
    size: [27.2, 8.5, 19],
    note: "Twin slate-capped mural towers frame a vaulted Gothic cart passage, with jointed arch stones on both faces, raised iron portcullis, open planked oak doors and riveted straps. A hipped gatehouse chamber and projecting machicolation defend the entry. Illustrative c. 1450–1550; not a reconstruction of one monument.",
    sources,
    create() {
      const m = new Masonry();
      gate(m);
      return m.finish(this.id);
    }
  }
];
