import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type AmphitheatreQuality = "low" | "high";

/** Arena and overall size of the amphitheatre at Pompeii, in meters (Mau 1899: 444 × 342 ft; 135 × 104 m). */
const ARENA = { length: 66.7, width: 35.1 };
const OUTER = { length: 135, width: 104 };
/** Radial depth of the seating ring across the short axis, arena wall to outer face. */
const DEPTH = (OUTER.width - ARENA.width) / 2;
/** The long axis grows a little less than the short one, so both overall measurements hold. */
const LONG_GROWTH = (OUTER.length - ARENA.length) / 2 / DEPTH;
/**
 * Ring boundaries measured across the short axis of the plan in Mau (1899), fig. 93, as distances in meters from the
 * arena wall: ima cavea with the first praecinctio, media cavea with the second, summa cavea, then the gallery of boxes
 * and the terrace on the arcaded outer wall.
 */
const RINGS = { ima: 6.9, media: 17.7, summa: 29.5, gallery: 31.1, outer: DEPTH };
/** Rows in each division (Mau: 5, 12 and 18, thirty-five in all). */
const ROWS = { ima: 5, media: 12, summa: 18 };
/** Arena floor below the surrounding ground, and the arena wall (Mau: "about 6½ feet"). */
const ARENA_FLOOR = -6;
const PODIUM = 2;
/**
 * Rise of each row: not given; chosen so that the top row, and the terrace level with it, stands about 6 m above the
 * outside ground as in the transverse section, Mau (1899) fig. 94.
 */
const RISE = 0.3;
const COPING = 0.6;
const WALKWAY = 1;
const PARAPET = { height: 1, thickness: 0.3 };
const GALLERY_RISE = 1.8;
const OUTER_WALL = { thickness: 0.6, parapet: 1, pier: { width: 1.6, depth: 0.6 } };
/** Bays of the outer arcade, and the vaulted vomitoria from the terrace into the summa cavea, one per bay. */
const BAYS = 40;
/** The two broad corridors at the ends of the long axis: clear width, retaining walls and vault height (estimated). */
const CORRIDOR = { width: 4, wall: 0.6, vault: 4 };
const DEATH_GATE = { width: 1.2, height: 1.8 };
/** Seat width allowed per spectator, the usual allowance for estimating Roman seating. */
const SEAT_PER_PERSON = 0.4;
const SITE_MARGIN = 10;

const A0 = ARENA.length / 2,
  B0 = ARENA.width / 2;
const semiX = (d: number) => B0 + d;
const semiZ = (d: number) => A0 + d * LONG_GROWTH;
/** Corridor floor from the arena up to the outside ground. */
const corridorFloor = (d: number) => ARENA_FLOOR + (-ARENA_FLOOR * Math.min(d, DEPTH)) / DEPTH;

type Step = { d0: number; d1: number; y: number; kind: "coping" | "seat" | "walkway" };

/** Radial profile of the seating, from the arena wall to the gallery. */
function seatingProfile(): Step[] {
  const steps: Step[] = [];
  const top = ARENA_FLOOR + PODIUM;
  steps.push({ d0: 0, d1: COPING, y: top, kind: "coping" });
  let row = 0;
  const division = (from: number, to: number, rows: number, walkway: boolean) => {
    const tread = (to - from - (walkway ? WALKWAY : 0)) / rows;
    for (let i = 0; i < rows; i++, row++)
      steps.push({ d0: from + i * tread, d1: from + (i + 1) * tread, y: top + row * RISE, kind: "seat" });
    if (walkway) steps.push({ d0: to - WALKWAY, d1: to, y: top + (row - 1) * RISE, kind: "walkway" });
  };
  division(COPING, RINGS.ima, ROWS.ima, true);
  division(RINGS.ima, RINGS.media, ROWS.media, true);
  division(RINGS.media, RINGS.summa, ROWS.summa, false);
  return steps;
}

const PROFILE = seatingProfile();
const TERRACE = PROFILE[PROFILE.length - 1].y;
/** First step roofed over by the corridors' vaults; the steps before it are cut open over the corridors. */
const CROSS = PROFILE.findIndex(
  (step, i) => i > 0 && PROFILE[i - 1].y >= corridorFloor(step.d0) + CORRIDOR.vault + 0.4
);
const CUT = CORRIDOR.width / 2 + CORRIDOR.wall;

/** Length of the ring at `d`, by Ramanujan's approximation. */
function perimeter(d: number) {
  const a = semiZ(d),
    b = semiX(d);
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function seatingLength() {
  let length = 0;
  for (const [i, step] of PROFILE.entries())
    if (step.kind === "seat") length += perimeter((step.d0 + step.d1) / 2) - (i < CROSS ? 4 * CUT : 0);
  return length;
}

/**
 * The amphitheatre at Pompeii (c. 70 BC), the oldest stone amphitheatre known, in meters: outside ground at y = 0,
 * the arena sunk below it, the long axis along Z (north toward −Z) and the Death Gate on the west (−X).
 */
export const AMPHITHEATRE = {
  author: "Claude Opus 5.5" as Author,
  name: "Pompeii amphitheatre (c. 70 BC)",
  arena: ARENA,
  outer: OUTER,
  rings: RINGS,
  rows: ROWS,
  arenaFloor: ARENA_FLOOR,
  podium: PODIUM,
  rise: RISE,
  terrace: TERRACE,
  bays: BAYS,
  corridor: CORRIDOR,
  profile: PROFILE as readonly Step[],
  /** Index of the first seating step that passes over the corridors. */
  cross: CROSS,
  cut: CUT,
  seatingLength: seatingLength(),
  seatPerPerson: SEAT_PER_PERSON,
  recordedCapacity: 20000,
  scale: "A. Mau, Pompeii: Its Life and Art (1899), figs. 93 (plan, scale bar 0–20 m) and 94 (transverse section)",
  note: "Schematic amphitheatre after the one at Pompeii, built about 70 BC by the duumvirs C. Quinctius Valgus and M. Porcius at their own expense and the oldest stone amphitheatre known; Rome had none until 29 BC. Mau gives it as 444 by 342 feet (135 × 104 m) overall, with an arena of 66.7 × 35.1 m sunk about 6 m below the ground and the spoil heaped into the bank that carries the seats, so that its outside stands low. A wall about 6½ feet high with a travertine coping surrounds the arena; there are no chambers beneath it. Thirty-five rows of grey tufa seats rise in three divisions of 5, 12 and 18 rows (ima, media and summa cavea), separated by walkways, the upper one behind a low parapet. Above the top row runs a gallery of small boxes over vaulted vomitoria, and outside it a terrace on the arcaded outer wall, reached by two large double stairways on the west. Two broad corridors lead down to the ends of the arena and a narrow one, from the Death Gate, to the middle of the west side. The ring widths are measured from Mau's plan; the row height is chosen to put the top row about 6 m above the ground, as the section shows; corridor and box sizes, the arcade's bay count and the arena paintings are proportioned. The real south corridor bends to clear the city wall, which also bounds the south and east sides; here the building stands free with both corridors straight, without the single stairways at the city wall. About 20,000 spectators.",
  highNote:
    "High tier: the arena wall's painted panels in alternate broad and narrow fields, the iron grating along its coping, the partitions of the gallery's boxes, arch rings over the outer bays, and the doorway of the Death Gate."
} as const;

export interface AmphitheatreMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Quads collected into one geometry, each wound to face a chosen direction. */
class Faces {
  readonly positions: number[] = [];
  quad(corners: THREE.Vector3[], facing: THREE.Vector3) {
    const [a, b, c] = corners;
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const ordered = normal.dot(facing) < 0 ? [...corners].reverse() : corners;
    const [p, q, r, s] = ordered;
    for (const point of [p, q, r, p, r, s]) this.positions.push(point.x, point.y, point.z);
  }
  box(centre: THREE.Vector3, size: THREE.Vector3, angle: number) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    geometry.rotateY(angle);
    geometry.translate(centre.x, centre.y, centre.z);
    const flat = geometry.toNonIndexed();
    this.positions.push(...(flat.getAttribute("position").array as Float32Array));
    geometry.dispose();
    flat.dispose();
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

const point = (d: number, theta: number, y: number) =>
  new THREE.Vector3(semiX(d) * Math.cos(theta), y, semiZ(d) * Math.sin(theta));
/** Outward normal of the ring at `theta`, in the ground plane. */
const outward = (d: number, theta: number) =>
  new THREE.Vector3(Math.cos(theta) / semiX(d), 0, Math.sin(theta) / semiZ(d)).normalize();

/**
 * Angle ranges round a ring: the whole ring, or the east and west arcs left between the corridors when `cut`.
 * Each range is sampled so that its ends sit exactly on the corridor walls at any radius.
 */
function arcs(cut: boolean, segments: number): ((d: number) => number[])[] {
  if (!cut) return [() => Array.from({ length: segments + 1 }, (_, i) => (2 * Math.PI * i) / segments)];
  const half = Math.round(segments / 2);
  const range = (centre: number) => (d: number) => {
    const phi = Math.acos(CUT / semiX(d));
    return Array.from({ length: half + 1 }, (_, i) => centre - phi + (2 * phi * i) / half);
  };
  return [range(0), range(Math.PI)];
}

/** Positions at equal steps of length round the ring at `d`, starting at angle 0 (east). */
function byLength(d: number, count: number, offset: number) {
  const samples = 2048;
  const lengths = [0];
  for (let i = 1; i <= samples; i++) {
    const a = point(d, (2 * Math.PI * (i - 1)) / samples, 0),
      b = point(d, (2 * Math.PI * i) / samples, 0);
    lengths.push(lengths[i - 1] + a.distanceTo(b));
  }
  const total = lengths[samples];
  const thetas: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = ((k + offset) / count) * total;
    while (j < samples - 1 && lengths[j + 1] < target) j++;
    const t = (target - lengths[j]) / (lengths[j + 1] - lengths[j]);
    thetas.push((2 * Math.PI * (j + t)) / samples);
  }
  return thetas;
}

export function createAmphitheatreModel(quality: AmphitheatreQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const segments = high ? 240 : 128;
  const group = new THREE.Group();
  group.name = `amphitheatre-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const tufa = new THREE.MeshLambertMaterial({ color: 0x938c7d });
  const travertine = new THREE.MeshLambertMaterial({ color: 0xd9d1bd });
  const masonry = new THREE.MeshLambertMaterial({ color: 0xb4a07e });
  const sand = new THREE.MeshLambertMaterial({ color: 0xd6c193 });
  const earth = new THREE.MeshLambertMaterial({ color: 0xa79e84 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x231d19, side: THREE.DoubleSide });
  const iron = new THREE.MeshLambertMaterial({ color: 0x33373a });
  const red = new THREE.MeshLambertMaterial({ color: 0x9b3b2b });
  const ochre = new THREE.MeshLambertMaterial({ color: 0xc9a86a });
  const green = new THREE.MeshLambertMaterial({ color: 0x4a5a44 });
  const materials = [tufa, travertine, masonry, sand, earth, dark, iron, red, ochre, green];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const up = new THREE.Vector3(0, 1, 0);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  /** Horizontal band between two rings. */
  function tread(faces: Faces, d0: number, d1: number, y: number, cut: boolean) {
    for (const range of arcs(cut, segments)) {
      const inner = range(d0),
        outer = range(d1);
      for (let i = 0; i < inner.length - 1; i++)
        faces.quad(
          [point(d0, inner[i], y), point(d0, inner[i + 1], y), point(d1, outer[i + 1], y), point(d1, outer[i], y)],
          up
        );
    }
  }
  /** Upright band on the ring at `d`, facing out (+1) or toward the arena (−1). */
  function riser(faces: Faces, d: number, y0: number, y1: number, facing: 1 | -1, cut: boolean) {
    if (y1 - y0 < 1e-6) return;
    for (const range of arcs(cut, segments)) {
      const thetas = range(d);
      for (let i = 0; i < thetas.length - 1; i++) {
        const mid = (thetas[i] + thetas[i + 1]) / 2;
        faces.quad(
          [point(d, thetas[i], y0), point(d, thetas[i + 1], y0), point(d, thetas[i + 1], y1), point(d, thetas[i], y1)],
          outward(d, mid).multiplyScalar(facing)
        );
      }
    }
  }
  /** A flat shape standing on the ring at `d` at angle `theta`, facing out (+1) or in (−1). */
  function onRing(
    name: string,
    shape: THREE.BufferGeometry,
    material: THREE.Material,
    d: number,
    theta: number,
    y: number,
    facing: 1 | -1
  ) {
    const normal = outward(d, theta).multiplyScalar(facing);
    const mesh = add(name, shape, material);
    mesh.position.copy(point(d, theta, y)).addScaledVector(normal, 0.03);
    mesh.rotation.y = Math.atan2(normal.x, normal.z);
    return mesh;
  }
  function archShape(width: number, height: number) {
    const shape = new THREE.Shape();
    const r = width / 2,
      spring = height - r;
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, spring);
    shape.absarc(0, spring, r, 0, Math.PI, false);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 8);
    geometries.add(geometry);
    return geometry;
  }

  // Arena floor and its wall.
  const arena = new THREE.Shape();
  arena.absellipse(0, 0, B0, A0, 0, 2 * Math.PI, false, 0);
  const arenaGeometry = new THREE.ShapeGeometry(arena, 64);
  arenaGeometry.rotateX(-Math.PI / 2);
  add("arena", arenaGeometry, sand).position.y = ARENA_FLOOR;
  const podium = new Faces();
  riser(podium, 0, ARENA_FLOOR, ARENA_FLOOR + PODIUM, -1, true);
  add("podium", podium.geometry(), masonry);

  // Seats, walkways and the coping, with the parapet before the summa cavea.
  const seats = new Faces(),
    coping = new Faces(),
    parapet = new Faces();
  for (const [i, step] of PROFILE.entries()) {
    const cut = i < CROSS;
    tread(step.kind === "coping" ? coping : seats, step.d0, step.d1, step.y, cut);
    if (i > 0) riser(seats, step.d0, PROFILE[i - 1].y, step.y, -1, cut);
  }
  const lastMedia = PROFILE.findIndex(step => step.d1 === RINGS.media);
  const walkway = PROFILE[lastMedia];
  const parapetCut = lastMedia < CROSS;
  riser(parapet, walkway.d0, walkway.y, walkway.y + PARAPET.height, -1, parapetCut);
  riser(parapet, walkway.d0 + PARAPET.thickness, walkway.y, walkway.y + PARAPET.height, 1, parapetCut);
  tread(parapet, walkway.d0, walkway.d0 + PARAPET.thickness, walkway.y + PARAPET.height, parapetCut);
  add("seats", seats.geometry(), tufa);
  add("coping", coping.geometry(), travertine);
  add("praecinctio-parapet", parapet.geometry(), masonry);

  // Gallery of boxes over the vomitoria, the terrace and the outer wall.
  const galleryTop = TERRACE + GALLERY_RISE;
  const gallery = new Faces();
  riser(gallery, RINGS.summa, TERRACE, galleryTop, -1, false);
  tread(gallery, RINGS.summa, RINGS.gallery, galleryTop, false);
  riser(gallery, RINGS.gallery, TERRACE, galleryTop, 1, false);
  add("gallery", gallery.geometry(), masonry);
  const terrace = new Faces();
  const wallFace = RINGS.outer - OUTER_WALL.pier.depth;
  const parapetInner = wallFace - OUTER_WALL.thickness;
  tread(terrace, RINGS.gallery, parapetInner, TERRACE, false);
  add("terrace", terrace.geometry(), earth);
  const outerWall = new Faces();
  const wallTop = TERRACE + OUTER_WALL.parapet;
  riser(outerWall, parapetInner, TERRACE, wallTop, -1, false);
  tread(outerWall, parapetInner, wallFace, wallTop, false);
  riser(outerWall, wallFace, 0, wallTop, 1, false);
  add("outer-wall", outerWall.geometry(), masonry);
  const vomitorium = archShape(1, Math.min(1.4, GALLERY_RISE - 0.3));
  for (const theta of byLength(RINGS.summa, BAYS, 0))
    onRing("vomitorium", vomitorium, dark, RINGS.summa, theta, TERRACE, -1);
  const pierDepth = OUTER_WALL.pier.depth;
  for (const theta of byLength(RINGS.outer, BAYS, 0.5)) {
    const normal = outward(wallFace, theta);
    const pier = add("pier", cube, masonry);
    pier.position.copy(point(wallFace, theta, wallTop / 2)).addScaledVector(normal, pierDepth / 2);
    pier.rotation.y = Math.atan2(normal.x, normal.z);
    pier.scale.set(OUTER_WALL.pier.width, wallTop, pierDepth + 0.1);
  }

  // Corridors at both ends of the long axis: the open cut through the lower seats, the vault mouth beyond it, the
  // ramp down to the arena and the portal in the outer wall.
  const dCross = PROFILE[CROSS].d0;
  const halfWidth = CORRIDOR.width / 2;
  const zAt = (d: number, x: number) => semiZ(d) * Math.sqrt(1 - (x / semiX(d)) ** 2);
  const corridorFaces = new Faces(),
    corridorWalls = new Faces();
  for (const end of [-1, 1]) {
    const facing = new THREE.Vector3(0, 0, -end);
    for (let i = 0; i < 12; i++) {
      const d0 = (dCross * i) / 12,
        d1 = (dCross * (i + 1)) / 12;
      const corner = (d: number, x: number) => new THREE.Vector3(x, corridorFloor(d), end * zAt(d, x));
      corridorFaces.quad(
        [corner(d0, -halfWidth), corner(d0, halfWidth), corner(d1, halfWidth), corner(d1, -halfWidth)],
        up
      );
    }
    for (const [i, step] of PROFILE.slice(0, CROSS).entries()) {
      const d1 = i === CROSS - 1 ? dCross : step.d1;
      for (const side of [-1, 1]) {
        const x = side * (halfWidth + CORRIDOR.wall / 2);
        const z0 = zAt(step.d0, x),
          z1 = zAt(d1, x);
        const bottom = corridorFloor(step.d0);
        corridorWalls.box(
          new THREE.Vector3(x, (bottom + step.y) / 2, (end * (z0 + z1)) / 2),
          new THREE.Vector3(CORRIDOR.wall, step.y - bottom, Math.abs(z1 - z0) + 0.02),
          0
        );
      }
    }
    // Wall over the vault mouth, up to the seats it carries.
    const top = PROFILE[CROSS - 1].y;
    const floor = corridorFloor(dCross);
    const z = end * (zAt(dCross, 0) - 0.3);
    corridorWalls.box(new THREE.Vector3(0, (floor + top) / 2, z), new THREE.Vector3(2 * CUT, top - floor, 0.6), 0);
    const mouth = add("corridor-vault", archShape(CORRIDOR.width, CORRIDOR.vault), dark);
    mouth.position.set(0, floor, z - end * 0.32);
    mouth.rotation.y = Math.atan2(facing.x, facing.z);
    onRing(
      "entrance-portal",
      archShape(CORRIDOR.width, CORRIDOR.vault + 0.5),
      dark,
      wallFace,
      (end * Math.PI) / 2,
      0,
      1
    );
  }
  add("corridor-floor", corridorFaces.geometry(), sand);
  add("corridor-wall", corridorWalls.geometry(), masonry);
  onRing("death-gate", archShape(DEATH_GATE.width, DEATH_GATE.height), dark, 0, Math.PI, ARENA_FLOOR, -1);

  // Two double stairways up the west side to the terrace.
  const stairs = new Faces();
  const flightSteps = Math.ceil(TERRACE / 0.25);
  const stepRise = TERRACE / flightSteps,
    stepRun = 0.3,
    stairWidth = 2,
    landing = 2.4;
  const bayCentres = byLength(RINGS.outer, BAYS, 0);
  for (const bay of [BAYS / 2 - 4, BAYS / 2 + 4]) {
    const theta = bayCentres[bay];
    const normal = outward(RINGS.outer, theta);
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const angle = Math.atan2(normal.x, normal.z);
    const base = point(RINGS.outer, theta, 0).addScaledVector(normal, stairWidth / 2);
    stairs.box(base.clone().setY(TERRACE / 2), new THREE.Vector3(landing, TERRACE, stairWidth), angle);
    for (const side of [-1, 1])
      for (let i = 0; i < flightSteps; i++) {
        const along = landing / 2 + (flightSteps - i - 0.5) * stepRun;
        const height = (i + 1) * stepRise;
        stairs.box(
          base
            .clone()
            .addScaledVector(tangent, side * along)
            .setY(height / 2),
          new THREE.Vector3(stepRun, height, stairWidth),
          angle
        );
      }
  }
  add("stairway", stairs.geometry(), masonry);

  // The ground round the building.
  const site = new Faces();
  tread(site, RINGS.outer, RINGS.outer + SITE_MARGIN, 0, false);
  add("site-ground", site.geometry(), earth);

  if (high) {
    // Paintings on the arena wall: broad fields, alternately a pattern and a scene of the games, between narrow ones.
    const panels = { scene: new Faces(), pattern: new Faces(), herm: new Faces() };
    const arenaLength = perimeter(0);
    const unit = 4.2;
    const count = Math.floor(arenaLength / unit);
    const starts = byLength(0, count * 2, 0);
    for (let k = 0; k < count * 2; k++) {
      const t0 = starts[k],
        t1 = k + 1 < starts.length ? starts[k + 1] : starts[0] + 2 * Math.PI;
      const span = t1 - t0;
      const broad = k % 2 === 0;
      const [from, to] = broad ? [0.03, 0.72] : [0.76, 0.97];
      const a = t0 + span * from,
        b = t0 + span * to;
      const x0 = semiX(0) * Math.cos(a),
        x1 = semiX(0) * Math.cos(b);
      if (Math.abs(x0) < CUT + 0.2 || Math.abs(x1) < CUT + 0.2) continue;
      const nearGate = (s: number) => Math.cos(s) < 0 && Math.abs(semiZ(0) * Math.sin(s)) < DEATH_GATE.width;
      if (nearGate(a) || nearGate(b) || (Math.cos(a) < 0 && Math.sin(a) * Math.sin(b) < 0)) continue;
      const target = broad ? (k % 4 === 0 ? panels.scene : panels.pattern) : panels.herm;
      for (let i = 0; i < 4; i++) {
        const s0 = a + ((b - a) * i) / 4,
          s1 = a + ((b - a) * (i + 1)) / 4;
        const p = (s: number, y: number) => point(0, s, y).addScaledVector(outward(0, s), -0.03);
        target.quad(
          [p(s0, ARENA_FLOOR + 0.4), p(s1, ARENA_FLOOR + 0.4), p(s1, ARENA_FLOOR + 1.6), p(s0, ARENA_FLOOR + 1.6)],
          outward(0, (s0 + s1) / 2).negate()
        );
      }
    }
    add("fresco-scene", panels.scene.geometry(), red);
    add("fresco-pattern", panels.pattern.geometry(), ochre);
    add("fresco-herm", panels.herm.geometry(), green);

    // Iron grating set into the joints of the coping.
    const grating = new Faces();
    const postRing = COPING / 2;
    const posts = byLength(postRing, Math.round(perimeter(postRing) / 1.6), 0);
    const height = 1.2;
    const y0 = ARENA_FLOOR + PODIUM;
    let previous: THREE.Vector3 | null = null;
    for (const theta of posts) {
      const p = point(postRing, theta, y0);
      if (Math.abs(p.x) < CUT + 0.1) {
        previous = null;
        continue;
      }
      grating.box(p.clone().setY(y0 + height / 2), new THREE.Vector3(0.05, height, 0.05), 0);
      if (previous) {
        const mid = previous
          .clone()
          .add(p)
          .multiplyScalar(0.5)
          .setY(y0 + height - 0.05);
        const dir = p.clone().sub(previous);
        grating.box(mid, new THREE.Vector3(dir.length(), 0.04, 0.04), Math.atan2(-dir.z, dir.x));
      }
      previous = p;
    }
    add("iron-grating", grating.geometry(), iron);

    // Partitions of the gallery's boxes, about 4 ft square.
    const boxes = new Faces();
    const boxRing = (RINGS.summa + RINGS.gallery) / 2;
    for (const theta of byLength(boxRing, Math.round(perimeter(boxRing) / 1.25), 0)) {
      const normal = outward(boxRing, theta);
      boxes.box(
        point(boxRing, theta, galleryTop + 0.5),
        new THREE.Vector3(0.15, 1, RINGS.gallery - RINGS.summa - 0.4),
        Math.atan2(normal.x, normal.z)
      );
    }
    for (const d of [RINGS.summa + 0.4]) riser(boxes, d, galleryTop, galleryTop + 0.9, -1, false);
    add("gallery-box-wall", boxes.geometry(), masonry);

    // Arch rings over the outer bays, between the piers.
    const span = perimeter(wallFace) / BAYS - OUTER_WALL.pier.width;
    const archRing = new THREE.TorusGeometry(span / 2, 0.2, 6, 18, Math.PI);
    geometries.add(archRing);
    for (const theta of byLength(wallFace, BAYS, 0)) {
      if (Math.abs(Math.cos(theta)) < 0.02) continue;
      onRing("blind-arch", archRing, travertine, wallFace, theta, wallTop - 0.5 - span / 2, 1);
    }

    // Doorway of the Death Gate.
    const frame = new Faces();
    const gate = point(0, Math.PI, 0);
    for (const side of [-1, 1])
      frame.box(
        new THREE.Vector3(gate.x + 0.12, ARENA_FLOOR + DEATH_GATE.height / 2, side * (DEATH_GATE.width / 2 + 0.12)),
        new THREE.Vector3(0.25, DEATH_GATE.height, 0.24),
        0
      );
    add("death-gate-frame", frame.geometry(), travertine);
  }

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createAmphitheatre(quality: AmphitheatreQuality = "low"): AmphitheatreMeshes {
  const model = createAmphitheatreModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
