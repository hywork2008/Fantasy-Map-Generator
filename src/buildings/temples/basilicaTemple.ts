import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

export const BASILICA_TEMPLE = {
  name: "Basilica temple",
  author: "Claude Opus 5.5",
  width: 64,
  depth: 30,
  height: 46,
  note: "Detailed Romanesque reading of the catalogue basilica footprint: aisled nave with clerestory, twin-towered westwork, transepts, octagonal crossing lantern, apsed choir with ambulatory and three radiating chapels. Lesenes, Lombard bands, round-arched windows, rose windows, a recessed archivolt portal and coursed tile roofs are modelled; dimensions follow the catalogue plan, heights are illustrative."
} as const;

export const BASILICA_QUALITIES = ["high", "low"] as const;
export type BasilicaQuality = (typeof BASILICA_QUALITIES)[number];

/** Plan follows the catalogue record: long axis east–west on X, west front at negative X, Y up. */
export function createBasilicaTemple(quality: BasilicaQuality = "high"): CityStructureMeshes {
  // Low quality keeps every mass and opening but drops mouldings, tile courses and small ornament.
  const detailed = quality === "high";
  const arcSegments = detailed ? 10 : 3;
  const wall = new THREE.MeshLambertMaterial({ color: 0xd6ccb4 });
  const dressed = new THREE.MeshLambertMaterial({ color: 0xe8dfc8 });
  const plinth = new THREE.MeshLambertMaterial({ color: 0xa99d85 });
  const tile = new THREE.MeshLambertMaterial({ color: 0xa65b3d, side: THREE.DoubleSide });
  const ridge = new THREE.MeshLambertMaterial({ color: 0x8a4630 });
  const slate = new THREE.MeshLambertMaterial({ color: 0x59606a, side: THREE.DoubleSide });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2c3a44 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5b3b25 });
  const metal = new THREE.MeshLambertMaterial({ color: 0xb59a52 });
  const materials = [wall, dressed, plinth, tile, ridge, slate, glass, wood, metal];
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(materials.map(material => [material, []]));
  const cache = new Map<string, THREE.BufferGeometry>();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  /** Shared primitives are cloned into per-material buckets and merged into one mesh each. */
  function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = cache.get(key);
    if (!geometry) {
      geometry = build();
      cache.set(key, geometry);
    }
    return geometry;
  }
  function put(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ): void {
    euler.set(rotation[0], rotation[1], rotation[2], "YXZ");
    quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.deleteAttribute("uv");
    copy.applyMatrix4(matrix);
    buckets.get(material)?.push(copy);
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material = wall, angle = 0): void {
    put(unitBox, material, [x, y + h / 2, z], [0, angle, 0], [w, h, d]);
  }
  /** Places a geometry drawn in a facade's local frame: U along the wall, outward normal on local +Z. */
  function onFacade(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    angle: number,
    u = 0,
    out = 0,
    scale: [number, number, number] = [1, 1, 1],
    roll = 0
  ): void {
    put(
      geometry,
      material,
      [x + Math.cos(angle) * u + Math.sin(angle) * out, y, z - Math.sin(angle) * u + Math.cos(angle) * out],
      [0, angle, roll],
      scale
    );
  }

  function archShape(w: number, h: number, y0 = 0): THREE.Shape {
    const shape = new THREE.Shape();
    const spring = y0 + Math.max(h - w / 2, 0);
    shape.moveTo(-w / 2, y0);
    shape.lineTo(w / 2, y0);
    shape.lineTo(w / 2, spring);
    shape.absarc(0, spring, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, y0);
    return shape;
  }
  function archRing(w: number, h: number, band: number, depth: number): THREE.BufferGeometry {
    return cached(`ring:${w}:${h}:${band}:${depth}`, () => {
      const outer = archShape(w + band * 2, h + band, -band * 0.6);
      const hole = new THREE.Path();
      const spring = Math.max(h - w / 2, 0);
      hole.moveTo(-w / 2, 0);
      hole.lineTo(-w / 2, spring);
      hole.absarc(0, spring, w / 2, Math.PI, 0, true);
      hole.lineTo(w / 2, 0);
      hole.lineTo(-w / 2, 0);
      outer.holes.push(hole);
      return new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: arcSegments });
    });
  }
  function archPane(w: number, h: number): THREE.BufferGeometry {
    return cached(`pane:${w}:${h}`, () => new THREE.ShapeGeometry(archShape(w, h), arcSegments));
  }

  /** Round-arched window: splayed dark opening, dressed surround and a sill. */
  function window(x: number, y: number, z: number, w: number, h: number, angle: number, u = 0): void {
    onFacade(archPane(w, h), glass, x, y, z, angle, u, 0.03);
    if (!detailed) return;
    onFacade(archRing(w, h, 0.22, 0.16), dressed, x, y, z, angle, u, 0);
    onFacade(unitBox, dressed, x, y - 0.12, z, angle, u, 0.1, [w + 0.6, 0.14, 0.24]);
  }
  /** Twin belfry opening divided by a colonnette under a relieving arch. */
  function bifora(x: number, y: number, z: number, w: number, h: number, angle: number, u = 0): void {
    if (!detailed) {
      onFacade(archPane(w * 0.85, h), glass, x, y, z, angle, u, 0.03);
      return;
    }
    const light = w * 0.42;
    for (const side of [-1, 1]) {
      onFacade(archPane(light, h * 0.82), glass, x, y, z, angle, u + side * w * 0.25, 0.03);
      onFacade(archRing(light, h * 0.82, 0.08, 0.1), dressed, x, y, z, angle, u + side * w * 0.25, 0.02);
    }
    onFacade(archRing(w, h, 0.24, 0.16), dressed, x, y, z, angle, u, 0);
    const shaft = cached("colonnette", () => new THREE.CylinderGeometry(0.09, 0.09, 1, 8));
    onFacade(shaft, dressed, x, y + h * 0.3, z, angle, u, 0.06, [1, h * 0.6, 1]);
    onFacade(unitBox, dressed, x, y + h * 0.62, z, angle, u, 0.06, [0.3, 0.12, 0.3]);
    onFacade(unitBox, dressed, x, y - 0.1, z, angle, u, 0.1, [w + 0.6, 0.14, 0.26]);
  }
  /** Wheel window: dark disc, moulded rim, spokes and a central boss. */
  function rose(x: number, y: number, z: number, r: number, angle: number): void {
    const disc = cached(`disc:${r}`, () => new THREE.CircleGeometry(r, detailed ? 28 : 10));
    onFacade(disc, glass, x, y, z, angle, 0, 0.03);
    if (!detailed) return;
    const rim = cached(`rim:${r}`, () => {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, r + 0.32, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, r, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 28 });
    });
    onFacade(rim, dressed, x, y, z, angle);
    for (let i = 0; i < 6; i++)
      onFacade(unitBox, dressed, x, y, z, angle, 0, 0.1, [r * 2, 0.1, 0.12], (i * Math.PI) / 6);
    const boss = cached(`boss`, () => new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16));
    put(boss, dressed, [x + Math.sin(angle) * 0.12, y, z + Math.cos(angle) * 0.12], [Math.PI / 2, angle, 0]);
  }
  /** Lombard band: a row of small blind arches hanging from the cornice, on a straight wall. */
  function lombard(x: number, y: number, z: number, length: number, angle: number): void {
    if (!detailed) return;
    const count = Math.max(2, Math.round(length / 0.9));
    const pitch = length / count;
    for (let i = 0; i < count; i++) {
      const u = -length / 2 + pitch * (i + 0.5);
      onFacade(archRing(pitch - 0.18, 0.5, 0.09, 0.12), dressed, x, y - 0.62, z, angle, u, 0);
    }
    onFacade(unitBox, dressed, x, y + 0.1, z, angle, 0, 0.12, [length + 0.3, 0.26, 0.3]);
  }
  /** Same band wrapped around a curved wall, centred on (cx, cz). */
  function lombardRound(cx: number, cz: number, r: number, y: number, from: number, to: number): void {
    if (!detailed) return;
    const count = Math.max(3, Math.round((r * (to - from)) / 0.9));
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const phi = from + step * (i + 0.5);
      put(
        archRing(r * step - 0.18, 0.5, 0.09, 0.12),
        dressed,
        [cx + Math.sin(phi) * r, y - 0.62, cz + Math.cos(phi) * r],
        [0, phi, 0]
      );
    }
    const cornice = cached(
      `cornice:${r}:${from}:${to}`,
      () => new THREE.CylinderGeometry(r + 0.18, r + 0.18, 0.26, 32, 1, true, from, to - from)
    );
    put(cornice, dressed, [cx, y + 0.1, cz]);
  }

  /** Coursed tile cross-section: each course stands proud at its butt, flush at its head. */
  function slopeProfile(points: THREE.Vector2[], eave: THREE.Vector2, top: THREE.Vector2, courses: number): void {
    const along = top.clone().sub(eave);
    const normal = new THREE.Vector2(-along.y, along.x).normalize();
    if (normal.y < 0) normal.negate();
    if (!detailed) {
      points.push(eave.clone().addScaledVector(normal, 0.05), top.clone().addScaledVector(normal, 0.05));
      return;
    }
    for (let k = 0; k < courses; k++) {
      const a = eave.clone().addScaledVector(along, k / courses);
      const b = eave.clone().addScaledVector(along, (k + 1) / courses);
      points.push(a.clone().addScaledVector(normal, 0.14), b.clone().addScaledVector(normal, 0.03));
    }
  }
  /** Gable roof over a rectangle, ridge along the extrusion axis; returns the ridge height. */
  function gableRoof(
    start: number,
    length: number,
    centre: number,
    halfSpan: number,
    eave: number,
    pitch: number,
    alongX: boolean,
    material = tile
  ): number {
    const overhang = 0.55;
    const run = halfSpan + overhang;
    const rise = Math.tan(pitch) * run;
    const section = cached(`gable:${run}:${rise}:${length}`, () => {
      const points: THREE.Vector2[] = [];
      const courses = Math.max(4, Math.round(Math.hypot(run, rise) / 0.42));
      slopeProfile(points, new THREE.Vector2(-run, 0), new THREE.Vector2(0, rise), courses);
      const right: THREE.Vector2[] = [];
      slopeProfile(right, new THREE.Vector2(run, 0), new THREE.Vector2(0, rise), courses);
      points.push(new THREE.Vector2(0, rise + 0.14), ...right.reverse());
      points.push(new THREE.Vector2(run, -0.18), new THREE.Vector2(0, rise - 0.3), new THREE.Vector2(-run, -0.18));
      return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: length, bevelEnabled: false });
    });
    const y = eave - Math.tan(pitch) * overhang;
    if (alongX) put(section, material, [start, y, centre], [0, Math.PI / 2, 0]);
    else put(section, material, [centre, y, start]);
    if (!detailed) return y + rise;
    const cap = cached("ridge-cap", () => new THREE.CylinderGeometry(0.2, 0.2, 1, 8));
    if (alongX) put(cap, ridge, [start + length / 2, y + rise + 0.12, centre], [0, 0, Math.PI / 2], [1, length, 1]);
    else put(cap, ridge, [centre, y + rise + 0.12, start + length / 2], [Math.PI / 2, 0, 0], [1, length, 1]);
    return y + rise;
  }
  /** Lean-to aisle roof falling from the nave wall (z = inner) to the outer wall. */
  function leanTo(x0: number, x1: number, inner: number, outer: number, low: number, high: number): void {
    const overhang = 0.5;
    const span = Math.abs(outer - inner);
    const run = span + overhang;
    const slope = (high - low) / span;
    const section = cached(`leanto:${run}:${slope}:${x1 - x0}`, () => {
      const points: THREE.Vector2[] = [];
      const courses = Math.max(4, Math.round(Math.hypot(run, run * slope) / 0.42));
      slopeProfile(points, new THREE.Vector2(run, 0), new THREE.Vector2(0, run * slope), courses);
      points.push(new THREE.Vector2(0, run * slope - 0.3), new THREE.Vector2(run, -0.2));
      return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: x1 - x0, bevelEnabled: false });
    });
    // Local +U runs toward the outer wall; mirror sides by turning the section, never by negative scale.
    const y = low - slope * overhang;
    if (outer > inner) put(section, tile, [x1, y, inner], [0, -Math.PI / 2, 0]);
    else put(section, tile, [x0, y, inner], [0, Math.PI / 2, 0]);
  }
  /** Lathe roof: coursed cone (or annular lean-to) swept between two azimuths. */
  function latheRoof(
    cx: number,
    cz: number,
    y: number,
    rOuter: number,
    rInner: number,
    rise: number,
    from: number,
    sweep: number,
    material = tile,
    segments = 24,
    turn = 0
  ): void {
    // Round roofs coarsen in low quality; square and octagonal spires keep their facet count.
    const facets = detailed || segments <= 8 ? segments : Math.max(6, Math.round(segments / 3));
    const geometry = cached(`lathe:${rOuter}:${rInner}:${rise}:${from}:${sweep}:${facets}`, () => {
      const points: THREE.Vector2[] = [
        new THREE.Vector2(Math.max(rInner, 0.01), -0.2),
        new THREE.Vector2(rOuter, -0.2)
      ];
      const courses = detailed ? Math.max(4, Math.round(Math.hypot(rOuter - rInner, rise) / 0.45)) : 1;
      const eave = new THREE.Vector2(rOuter, 0);
      const top = new THREE.Vector2(rInner, rise);
      const along = top.clone().sub(eave);
      const normal = new THREE.Vector2(along.y, -along.x).normalize();
      if (normal.y < 0) normal.negate();
      for (let k = 0; k < courses; k++) {
        points.push(
          eave
            .clone()
            .addScaledVector(along, k / courses)
            .addScaledVector(normal, 0.14),
          eave
            .clone()
            .addScaledVector(along, (k + 1) / courses)
            .addScaledVector(normal, 0.03)
        );
      }
      if (rInner === 0) points.push(new THREE.Vector2(0, rise + 0.05));
      return new THREE.LatheGeometry(points, facets, from, sweep);
    });
    put(geometry, material, [cx, y, cz], [0, turn, 0]);
  }
  function curveFacets(r: number): number {
    return detailed ? Math.max(12, Math.round(r * 5)) : Math.max(6, Math.round(r * 1.5));
  }
  function curvedWall(cx: number, cz: number, r: number, y0: number, h: number, from: number, sweep: number, turn = 0) {
    const geometry = cached(
      `curve:${r}:${h}:${from}:${sweep}`,
      () => new THREE.CylinderGeometry(r, r, h, curveFacets(r), 1, true, from, sweep)
    );
    put(geometry, wall, [cx, y0 + h / 2, cz], [0, turn, 0]);
    const base = cached(
      `curve-plinth:${r}:${from}:${sweep}`,
      () => new THREE.CylinderGeometry(r + 0.22, r + 0.22, 0.7, curveFacets(r), 1, true, from, sweep)
    );
    put(base, plinth, [cx, 0.35, cz], [0, turn, 0]);
  }
  /** Gable-end wall triangle on a facade (outward normal along the facade angle). */
  function gableWall(x: number, y: number, z: number, halfSpan: number, rise: number, angle: number): void {
    const geometry = cached(`gable-wall:${halfSpan}:${rise}`, () => {
      const shape = new THREE.Shape([
        new THREE.Vector2(-halfSpan, 0),
        new THREE.Vector2(halfSpan, 0),
        new THREE.Vector2(0, rise)
      ]);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });
    });
    onFacade(geometry, wall, x, y, z, angle, 0, -0.8);
    if (!detailed) return;
    // Raking coping stones follow both edges of the gable.
    const slope = Math.atan2(rise, halfSpan);
    const edge = Math.hypot(halfSpan, rise) + 0.3;
    for (const side of [-1, 1]) {
      onFacade(
        unitBox,
        dressed,
        x,
        y + rise / 2,
        z,
        angle,
        (side * halfSpan) / 2,
        0.02,
        [edge, 0.3, 0.5],
        -side * slope
      );
    }
  }
  /** Rectangular hall walls with plinth, corner lesenes and a top cornice. */
  function hall(x0: number, x1: number, z0: number, z1: number, h: number): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    box(x, 0, z, w, h, d);
    box(x, 0, z, w + 0.44, 0.7, d + 0.44, plinth);
    if (detailed) for (const cx of [x0, x1]) for (const cz of [z0, z1]) box(cx, 0.7, cz, 0.7, h - 0.7, 0.7, dressed);
  }
  function lesene(x: number, z: number, h: number, angle: number, y0 = 0.7): void {
    if (!detailed) return;
    box(
      x,
      y0,
      z,
      angle === 0 || Math.abs(angle) === Math.PI ? 0.55 : 0.3,
      h - y0,
      angle === 0 || Math.abs(angle) === Math.PI ? 0.3 : 0.55,
      dressed
    );
  }
  function finial(x: number, y: number, z: number, scale = 1): void {
    if (!detailed) return;
    const ball = cached("finial-ball", () => new THREE.SphereGeometry(0.28, 12, 8));
    const rod = cached("finial-rod", () => new THREE.CylinderGeometry(0.05, 0.05, 1, 6));
    put(rod, metal, [x, y + 0.6 * scale, z], [0, 0, 0], [scale, 1.2 * scale, scale]);
    put(ball, metal, [x, y + 1.2 * scale, z], [0, 0, 0], [scale, scale, scale]);
  }

  const pitch = THREE.MathUtils.degToRad(40);
  const north = 0;
  const south = Math.PI;
  const east = Math.PI / 2;
  const west = -Math.PI / 2;
  const nave = { x0: -21.3, x1: 0.3, half: 5.6, eave: 15 };
  const aisle = { outer: 10.4, eave: 7, high: 9.4 };
  const westwork = { x0: -29.4, x1: -21.3 };
  const transept = { x0: 0.3, x1: 9.5, end: 13.7, eave: 15 };
  const choir = { x0: 9.5, x1: 17.1 };
  const apse = { r: 5.6, eave: 13 };
  const ambulatory = { r: 9.3, eave: 6.5, high: 9.2 };

  // Nave and clerestory: six bays between lesenes, Lombard band below the eaves.
  hall(nave.x0, nave.x1, -nave.half, nave.half, nave.eave);
  gableRoof(nave.x0, nave.x1 - nave.x0, 0, nave.half, nave.eave, pitch, true);
  const bay = (nave.x1 - nave.x0) / 6;
  for (const [side, angle] of [
    [1, north],
    [-1, south]
  ] as const) {
    lombard(-10.5, nave.eave - 0.25, side * nave.half, nave.x1 - nave.x0, angle);
    for (let i = 0; i < 6; i++) {
      const x = nave.x0 + bay * (i + 0.5);
      window(x, 10.3, side * nave.half, 1.1, 2.5, angle);
      if (i > 0) lesene(nave.x0 + bay * i, side * (nave.half + 0.1), nave.eave - 0.4, angle, aisle.high);
    }
    // Aisle: lean-to roof, buttressing lesenes and one window per bay.
    hall(nave.x0, nave.x1, side > 0 ? nave.half : -aisle.outer, side > 0 ? aisle.outer : -nave.half, aisle.eave);
    leanTo(nave.x0, nave.x1, side * nave.half, side * aisle.outer, aisle.eave, aisle.high);
    lombard(-10.5, aisle.eave - 0.25, side * aisle.outer, nave.x1 - nave.x0, angle);
    for (let i = 0; i < 6; i++) {
      window(nave.x0 + bay * (i + 0.5), 2.6, side * aisle.outer, 1.15, 2.7, angle);
      if (detailed && i > 0)
        box(nave.x0 + bay * i, 0.7, side * (aisle.outer + 0.35), 0.75, aisle.eave - 1.6, 0.7, dressed);
    }
  }

  // Westwork: gabled centre with portal and wheel window between two four-stage towers.
  hall(westwork.x0, westwork.x1, -5, 5, nave.eave);
  const westRidge = gableRoof(westwork.x0 - 0.2, westwork.x1 - westwork.x0 + 0.2, 0, 5, nave.eave, pitch, true);
  gableWall(westwork.x0, nave.eave, 0, 5.4, westRidge - nave.eave - 0.2, west);
  lombard(westwork.x0, nave.eave - 0.25, 0, 10, west);
  rose(westwork.x0 - 0.05, 11, 0, 1.9, west);
  window(westwork.x0, 16.4, 0, 0.7, 1.5, west);
  // Recessed portal: four stepped archivolts, tympanum, jamb shafts and twin doors.
  for (const side of [-1, 1]) box(westwork.x0 - 0.7, 0, side * 3.1, 1.4, 6.6, 1.0);
  box(westwork.x0 - 0.7, 5.9, 0, 1.4, 0.7, 7.2);
  gableWall(westwork.x0 - 1.4, 6.6, 0, 3.6, 1.2, west);
  gableRoof(westwork.x0 - 1.6, 1.6, 0, 3.6, 6.6, Math.atan2(1.2, 3.6), true);
  for (let k = 0; k < (detailed ? 4 : 0); k++) {
    const w = 2.6 + k * 0.62;
    onFacade(
      archRing(w, 4.6 + k * 0.31, 0.3, 0.3),
      k % 2 ? wall : dressed,
      westwork.x0 - 1.4 + (3 - k) * 0.33,
      0,
      0,
      west,
      0,
      0
    );
  }
  onFacade(archPane(2.6, 4.6), dressed, westwork.x0 - 0.35, 0, 0, west, 0, 0);
  for (const u of [-0.66, 0.66]) onFacade(unitBox, wood, westwork.x0 - 0.42, 1.65, 0, west, u, 0, [1.28, 3.3, 0.12]);
  onFacade(unitBox, dressed, westwork.x0 - 0.42, 3.3, 0, west, 0, 0.02, [2.6, 0.32, 0.2]);
  const shaft = cached("jamb-shaft", () => new THREE.CylinderGeometry(0.16, 0.16, 1, 10));
  for (let k = 0; k < (detailed ? 3 : 0); k++) {
    for (const side of [-1, 1]) {
      onFacade(shaft, dressed, westwork.x0 - 0.5 - k * 0.33, 2, 0, west, side * (1.62 + k * 0.31), 0, [1, 3.4, 1]);
    }
  }
  // Entrance steps widen as they descend.
  for (let i = 0; i < 4; i++)
    box(westwork.x0 - 1.4 - (i + 1) * 0.25, 0, 0, (i + 1) * 0.5, 0.6 - i * 0.15, 6 + i * 0.8, plinth);
  for (const side of [-1, 1]) {
    const tz = side * 8.95;
    const top = 32;
    hall(westwork.x0, westwork.x1, tz - 3.95, tz + 3.95, top);
    // String courses mark the stages; each stage opens wider toward the bells.
    for (const y of [8, 16, 24]) box(-25.35, y, tz, 8.3, 0.32, 8.3, dressed);
    for (const [angle, fx, fz] of [
      [west, westwork.x0, tz],
      [north, -25.35, tz + 3.95],
      [south, -25.35, tz - 3.95],
      [east, westwork.x1, tz]
    ] as const) {
      if (angle === (side > 0 ? south : north)) continue;
      if (angle !== east) window(fx, 3.4, fz, 0.8, 2.1, angle);
      window(fx, 11, fz, 0.9, 2.4, angle);
      bifora(fx, 17.6, fz, 2.4, 3.6, angle);
      for (const u of [-1.5, 1.5]) bifora(fx, 25.4, fz, 2.2, 4, angle, u);
      lombard(fx, top - 0.25, fz, 7.9, angle);
    }
    latheRoof(-25.35, tz, top + 0.2, 4.4 * Math.SQRT2, 0, 10.5, Math.PI / 4, Math.PI * 2, slate, 4);
    finial(-25.35, top + 10.6, tz, 1.3);
  }

  // Transepts: gabled ends with portal, paired windows and an oculus.
  for (const [side, angle] of [
    [1, north],
    [-1, south]
  ] as const) {
    const z0 = side > 0 ? nave.half : -transept.end;
    const z1 = side > 0 ? transept.end : -nave.half;
    hall(transept.x0, transept.x1, z0, z1, transept.eave);
    const tx = (transept.x0 + transept.x1) / 2;
    const half = (transept.x1 - transept.x0) / 2;
    const start = side > 0 ? 5.7 : -transept.end - 0.2;
    const ridgeY = gableRoof(start, transept.end - 5.5, tx, half, transept.eave, pitch, false);
    const face = side * transept.end;
    gableWall(tx, transept.eave, face, half + 0.35, ridgeY - transept.eave - 0.2, angle);
    lombard(tx, transept.eave - 0.25, face, transept.x1 - transept.x0, angle);
    rose(tx, 12.2, face + side * 0.05, 1.2, angle);
    for (const u of [-2.1, 2.1]) window(tx, 6.4, face, 1.2, 3, angle, u);
    if (detailed) onFacade(archRing(1.8, 3.4, 0.35, 0.3), dressed, tx, 0.7, face, angle);
    onFacade(unitBox, wood, tx, 0.7 + 1.35, face, angle, 0, 0.05, [1.7, 2.7, 0.1]);
    onFacade(archPane(1.8, 3.4), wall, tx, 0.7, face, angle, 0, 0.04);
    for (const x of [transept.x0, transept.x1]) {
      for (const along of [0.3, 0.7]) {
        const z = side * (nave.half + (transept.end - nave.half) * along + 1.2);
        if (Math.abs(z) > aisle.outer + 0.8) window(x, 8.6, z, 1.1, 2.6, x < tx ? west : east);
      }
    }
  }

  // Crossing: square base rising above the roofs, then an arcaded octagonal lantern.
  const cx = (transept.x0 + transept.x1) / 2;
  box(cx, 0, 0, 9.4, 23, 11.6);
  box(cx, 23, 0, 9.8, 0.36, 12, dressed);
  for (const [angle, fz] of [
    [north, 5.8],
    [south, -5.8]
  ] as const) {
    window(cx, 20.2, fz, 1.0, 2.0, angle, -2);
    window(cx, 20.2, fz, 1.0, 2.0, angle, 2);
  }
  const lantern = cached("lantern", () => new THREE.CylinderGeometry(4.4, 4.4, 7.4, 8, 1, false, Math.PI / 8));
  put(lantern, wall, [cx, 23.36 + 3.7, 0]);
  const apothem = 4.4 * Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const phi = (i * Math.PI) / 4 + Math.PI / 2;
    const fx = cx + Math.sin(phi) * apothem;
    const fz = Math.cos(phi) * apothem;
    bifora(fx, 25.6, fz, 2.2, 3.4, phi);
    const corner = phi + Math.PI / 8;
    if (detailed) box(cx + Math.sin(corner) * 4.35, 23.4, Math.cos(corner) * 4.35, 0.36, 7.3, 0.36, dressed, corner);
  }
  const lanternCornice = cached(
    "lantern-cornice",
    () => new THREE.CylinderGeometry(4.75, 4.75, 0.34, 8, 1, false, Math.PI / 8)
  );
  put(lanternCornice, dressed, [cx, 30.75, 0]);
  latheRoof(cx, 0, 30.9, 4.9, 0, 7.4, Math.PI / 8, Math.PI * 2, slate, 8);
  finial(cx, 38.3, 0, 1.1);

  // Choir and apse: clerestory above the ambulatory, apse arcade under a half cone.
  hall(choir.x0, choir.x1, -nave.half, nave.half, nave.eave);
  const choirRidge = gableRoof(choir.x0, choir.x1 - choir.x0, 0, nave.half, nave.eave, pitch, true);
  box(choir.x1 - 0.4, apse.eave, 0, 0.8, nave.eave - apse.eave, nave.half * 2);
  gableWall(choir.x1, nave.eave, 0, nave.half + 0.3, choirRidge - nave.eave - 0.2, east);
  for (const [side, angle] of [
    [1, north],
    [-1, south]
  ] as const) {
    lombard(13.3, nave.eave - 0.25, side * nave.half, choir.x1 - choir.x0, angle);
    for (const x of [11.4, 15.2]) window(x, 10.4, side * nave.half, 1.1, 2.6, angle);
  }
  curvedWall(choir.x1, 0, apse.r, 0, apse.eave, 0, Math.PI);
  lombardRound(choir.x1, 0, apse.r, apse.eave - 0.25, 0, Math.PI);
  latheRoof(choir.x1, 0, apse.eave + 0.05, apse.r + 0.55, 0, Math.tan(pitch) * (apse.r + 0.55) - 0.8, 0, Math.PI);
  for (let i = 0; i < 5; i++) {
    const phi = (Math.PI * (i + 0.5)) / 5;
    window(choir.x1 + Math.sin(phi) * apse.r, 9.6, Math.cos(phi) * apse.r, 1.0, 2.4, phi);
    const corner = (Math.PI * i) / 5;
    if (detailed && i > 0)
      box(
        choir.x1 + Math.sin(corner) * (apse.r + 0.1),
        ambulatory.high,
        Math.cos(corner) * (apse.r + 0.1),
        0.5,
        apse.eave - ambulatory.high - 0.4,
        0.5,
        dressed,
        corner
      );
  }

  // Ambulatory: straight flanks and a half ring under a curved lean-to roof.
  for (const [side, angle] of [
    [1, north],
    [-1, south]
  ] as const) {
    hall(
      choir.x0,
      choir.x1,
      side > 0 ? nave.half : -ambulatory.r,
      side > 0 ? ambulatory.r : -nave.half,
      ambulatory.eave
    );
    leanTo(choir.x0, choir.x1, side * nave.half, side * ambulatory.r, ambulatory.eave, ambulatory.high);
    lombard(13.3, ambulatory.eave - 0.25, side * ambulatory.r, choir.x1 - choir.x0, angle);
    window(13.3, 2.4, side * ambulatory.r, 1.1, 2.5, angle);
  }
  curvedWall(choir.x1, 0, ambulatory.r, 0, ambulatory.eave, 0, Math.PI);
  lombardRound(choir.x1, 0, ambulatory.r, ambulatory.eave - 0.25, 0, Math.PI);
  latheRoof(
    choir.x1,
    0,
    ambulatory.eave - 0.4,
    ambulatory.r + 0.5,
    apse.r,
    ambulatory.high - ambulatory.eave + 0.4,
    0,
    Math.PI
  );
  for (const phi of [Math.PI / 8, (Math.PI * 3) / 8, (Math.PI * 5) / 8, (Math.PI * 7) / 8]) {
    window(choir.x1 + Math.sin(phi) * ambulatory.r, 2.4, Math.cos(phi) * ambulatory.r, 1.0, 2.3, phi);
  }

  // Three radiating chapels on the ambulatory, each a little apse with its own half cone.
  for (const phi of [Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4]) {
    const r = 3;
    const px = choir.x1 + Math.sin(phi) * ambulatory.r;
    const pz = Math.cos(phi) * ambulatory.r;
    // Slightly more than a half circle tucks both ends inside the ambulatory wall.
    const turn = phi - Math.PI / 2;
    curvedWall(px, pz, r, 0, 5.2, -0.3, Math.PI + 0.6, turn);
    latheRoof(px, pz, 5.15, r + 0.45, 0, 2.6, -0.3, Math.PI + 0.6, tile, 18, turn);
    for (const offset of [-0.9, 0, 0.9]) {
      const a = phi + offset;
      window(px + Math.sin(a) * r, 1.9, pz + Math.cos(a) * r, 0.7, 1.9, a);
    }
    box(px + Math.sin(phi) * (r + 0.05), 4.8, pz + Math.cos(phi) * (r + 0.05), 1.4, 0.3, 0.35, dressed, phi);
  }

  const group = new THREE.Group();
  group.name = "basilica-temple";
  const pickables: THREE.Mesh[] = [];
  const merged: THREE.BufferGeometry[] = [];
  for (const [material, parts] of buckets) {
    if (!parts.length) continue;
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    merged.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `basilica-${(material as THREE.MeshLambertMaterial).color.getHexString()}`;
    group.add(mesh);
    pickables.push(mesh);
  }
  for (const geometry of cache.values()) geometry.dispose();
  unitBox.dispose();
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of merged) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
