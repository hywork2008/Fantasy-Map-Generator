import * as THREE from "three";
import { ModelKit, type Position, type Surface } from "./modelKit";

export type TradeQuality = "low" | "high";

/** A rectangular hole in a wall, in the wall's own along-axis coordinate and absolute height. */
export interface WallOpening {
  a: number;
  b: number;
  y0: number;
  y1: number;
}

/** Weathered oak framing and ochre limewash, as on surviving fourteenth-century urban timber frames. */
const TOWN_COLORS: Partial<Record<Surface, number>> = { oak: 0x4f3b2c, plaster: 0xdacdab, tile: 0x8a4a38 };

const WALL = 0.18;

/**
 * Construction kit for Opus fourteenth-century town trades. Coordinates are metres with +Z toward the
 * street. Low and High share every envelope, opening and fitting position; High adds the exposed frame,
 * tile courses, joinery and small stock, so CE footprints and entrances never depend on the tier.
 */
export class TradeKit extends ModelKit {
  constructor(
    name: string,
    readonly high: boolean,
    colors: Partial<Record<Surface, number>> = {}
  ) {
    super(name, { ...TOWN_COLORS, ...colors });
  }

  /** Box whose local axes are u (length), n (thickness) and u × n. */
  oriented(name: string, center: THREE.Vector3, u: THREE.Vector3, n: THREE.Vector3, size: Position, surface: Surface) {
    const uu = u.clone().normalize(),
      nn = n.clone().normalize();
    const w = new THREE.Vector3().crossVectors(uu, nn);
    const mesh = this.box(name, [center.x, center.y, center.z], size, surface);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(uu, nn, w));
    return mesh;
  }

  /** Runs `build`, then moves everything it added by `matrix` (rigid transforms only). */
  placed(matrix: THREE.Matrix4, build: () => void) {
    const start = this.pickables.length;
    build();
    for (const mesh of this.pickables.slice(start)) mesh.applyMatrix4(matrix);
  }

  /** Solid wall along X (at z) or Z (at x) with rectangular openings; cells merge vertically per column. */
  wall(
    name: string,
    axis: "x" | "z",
    from: number,
    to: number,
    at: number,
    y0: number,
    y1: number,
    openings: readonly WallOpening[] = [],
    surface: Surface = "plaster",
    thickness = WALL
  ) {
    const clampU = (v: number) => Math.min(to, Math.max(from, v)),
      clampY = (v: number) => Math.min(y1, Math.max(y0, v));
    const us = [...new Set([from, to, ...openings.flatMap(o => [clampU(o.a), clampU(o.b)])])].sort((p, q) => p - q);
    const ys = [...new Set([y0, y1, ...openings.flatMap(o => [clampY(o.y0), clampY(o.y1)])])].sort((p, q) => p - q);
    for (let i = 0; i < us.length - 1; i++) {
      const u = (us[i] + us[i + 1]) / 2,
        du = us[i + 1] - us[i];
      if (du < 1e-4) continue;
      let run: number | undefined;
      const flush = (top: number) => {
        if (run === undefined) return;
        const y = (run + top) / 2,
          dy = top - run;
        if (axis === "x") this.box(name, [u, y, at], [du, dy, thickness], surface);
        else this.box(name, [at, y, u], [thickness, dy, du], surface);
        run = undefined;
      };
      for (let j = 0; j < ys.length - 1; j++) {
        const y = (ys[j] + ys[j + 1]) / 2;
        const open = openings.some(o => u > o.a && u < o.b && y > o.y0 && y < o.y1);
        if (open) flush(ys[j]);
        else run ??= ys[j];
      }
      flush(ys.at(-1)!);
    }
  }

  /** A member lying on a wall face: `u` along the wall, `y` up, `face` the outer surface coordinate. */
  private member(axis: "x" | "z", face: number, out: number, u: number, y: number, du: number, dy: number) {
    const depth = 0.09,
      at = face + out * (depth / 2 - 0.02);
    if (axis === "x") this.box("frame-timber", [u, y, at], [du, dy, depth], "oak");
    else this.box("frame-timber", [at, y, u], [depth, dy, du], "oak");
  }

  /**
   * Exposed close-studded frame of one storey (High only): sill, wall plate, posts at the corners, at each
   * opening and at regular bays, a mid rail broken by openings, head and sill rails, and long tension braces
   * in clear end bays.
   */
  framing(
    axis: "x" | "z",
    from: number,
    to: number,
    face: number,
    out: 1 | -1,
    y0: number,
    y1: number,
    openings: readonly WallOpening[] = [],
    spacing = 1.15
  ) {
    const mid = (from + to) / 2,
      len = to - from;
    this.member(axis, face, out, mid, y0 + 0.1, len, 0.2);
    this.member(axis, face, out, mid, y1 - 0.09, len, 0.18);
    if (!this.high) {
      // Low keeps the storey's principal timbers only: sill, plate and corner posts.
      for (const u of [from + 0.1, to - 0.1]) this.member(axis, face, out, u, (y0 + y1) / 2, 0.18, y1 - y0 - 0.3);
      return;
    }
    const fixed = [from + 0.1, to - 0.1];
    for (const o of openings) {
      if (o.a - 0.08 > from + 0.2) fixed.push(o.a - 0.08);
      if (o.b + 0.08 < to - 0.2) fixed.push(o.b + 0.08);
    }
    fixed.sort((p, q) => p - q);
    const posts: number[] = [];
    for (let i = 0; i < fixed.length; i++) {
      posts.push(fixed[i]);
      const next = fixed[i + 1];
      if (next === undefined) continue;
      const gapCenter = (fixed[i] + next) / 2;
      if (openings.some(o => gapCenter > o.a && gapCenter < o.b)) continue;
      const bays = Math.round((next - fixed[i]) / spacing);
      for (let k = 1; k < bays; k++) posts.push(fixed[i] + ((next - fixed[i]) * k) / bays);
    }
    const blocked = (u: number, y: number) =>
      openings.some(o => u > o.a - 0.01 && u < o.b + 0.01 && y > o.y0 && y < o.y1);
    for (const u of posts) {
      if (blocked(u, (y0 + y1) / 2) && blocked(u, y0 + 0.4)) continue;
      this.member(axis, face, out, u, (y0 + y1) / 2, 0.17, y1 - y0 - 0.3);
    }
    const rail = y0 + (y1 - y0) * 0.48;
    for (let i = 0; i < posts.length - 1; i++) {
      const c = (posts[i] + posts[i + 1]) / 2;
      if (blocked(c, rail)) continue;
      this.member(axis, face, out, c, rail, posts[i + 1] - posts[i], 0.14);
    }
    for (const o of openings) {
      const w = o.b - o.a + 0.32;
      if (o.y1 < y1 - 0.3) this.member(axis, face, out, (o.a + o.b) / 2, o.y1 + 0.07, w, 0.14);
      if (o.y0 > y0 + 0.3) this.member(axis, face, out, (o.a + o.b) / 2, o.y0 - 0.07, w, 0.14);
    }
    const brace = (p: number, q: number) => {
      const c = (p + q) / 2;
      if (openings.some(o => c > o.a - 0.3 && c < o.b + 0.3)) return;
      const at = face + out * 0.025;
      const a: Position = axis === "x" ? [p, y1 - 0.25, at] : [at, y1 - 0.25, p],
        b: Position = axis === "x" ? [q, y0 + 0.25, at] : [at, y0 + 0.25, q];
      this.beam("tension-brace", a, b, 0.13, "oak");
    };
    if (posts.length > 2) {
      brace(posts[0], posts[1]);
      brace(posts.at(-1)!, posts.at(-2)!);
    }
  }

  /** Triangular gable infill between eave and ridge, `t` thick, centered on `at`. */
  gable(
    ridge: "x" | "z",
    at: number,
    c: number,
    half: number,
    eave: number,
    rise: number,
    surface: Surface = "plaster"
  ) {
    const shape = new THREE.Shape([
      new THREE.Vector2(c - half, eave),
      new THREE.Vector2(c + half, eave),
      new THREE.Vector2(c, eave + rise)
    ]);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: WALL, bevelEnabled: false });
    if (ridge === "x") {
      // Shape X becomes world Z; extrusion runs along world X.
      geometry.applyMatrix4(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(1, 0, 0)
        )
      );
      geometry.translate(at - WALL / 2, 0, 0);
    } else geometry.translate(0, 0, at - WALL / 2);
    geometry.computeVertexNormals();
    this.add("gable-infill", geometry, surface);
  }

  /** Gable-end frame on the outer face: verge rafters, collar and king post (High only). */
  gableFrame(ridge: "x" | "z", face: number, out: 1 | -1, c: number, half: number, eave: number, rise: number) {
    if (!this.high) return;
    const at = face + out * 0.03;
    const p = (u: number, y: number): Position => (ridge === "x" ? [at, y, u] : [u, y, at]);
    this.beam("verge-rafter", p(c - half, eave), p(c, eave + rise), 0.16, "oak");
    this.beam("verge-rafter", p(c + half, eave), p(c, eave + rise), 0.16, "oak");
    this.beam("gable-tie", p(c - half, eave + 0.08), p(c + half, eave + 0.08), 0.18, "oak");
    const collar = eave + rise * 0.55,
      reach = half * 0.45;
    this.beam("gable-collar", p(c - reach, collar), p(c + reach, collar), 0.14, "oak");
    this.beam("king-post", p(c, eave + 0.1), p(c, eave + rise - 0.15), 0.15, "oak");
    for (const s of [-1, 1])
      this.beam("gable-strut", p(c, eave + 0.2), p(c + s * half * 0.62, collar - rise * 0.15), 0.12, "oak");
  }

  /**
   * Pitched roof as two slabs. `along` is the ridge extent, `across` the span; the eave overhang drops at
   * the roof pitch. High adds tile courses, a ridge roll and rafter feet under the eaves.
   */
  pitchedRoof(o: {
    ridge: "x" | "z";
    along: readonly [number, number];
    across: readonly [number, number];
    eave: number;
    pitch: number;
    eaveOverhang?: number;
    gableOverhang?: number;
    surface?: Surface;
    thickness?: number;
  }) {
    const half = (o.across[1] - o.across[0]) / 2,
      c = (o.across[0] + o.across[1]) / 2,
      slope = Math.tan((o.pitch * Math.PI) / 180),
      rise = half * slope,
      eo = o.eaveOverhang ?? 0.32,
      go = o.gableOverhang ?? 0.3,
      t = o.thickness ?? 0.14,
      surface = o.surface ?? "tile";
    const a0 = o.along[0] - go,
      a1 = o.along[1] + go,
      length = a1 - a0,
      am = (a0 + a1) / 2;
    const v = (along: number, acr: number, y: number) =>
      o.ridge === "x" ? new THREE.Vector3(along, y, acr) : new THREE.Vector3(acr, y, along);
    const ridgeY = o.eave + rise;
    for (const s of [-1, 1]) {
      const lower = v(am, c + s * (half + eo), o.eave - eo * slope),
        upper = v(am, c, ridgeY);
      const u = upper.clone().sub(lower),
        len = u.length();
      u.normalize();
      const n = (o.ridge === "x" ? new THREE.Vector3(0, -u.z, u.y) : new THREE.Vector3(-u.y, u.x, 0)).normalize();
      if (n.y < 0) n.negate();
      const center = lower
        .clone()
        .add(upper)
        .multiplyScalar(0.5)
        .addScaledVector(n, t / 2);
      // Local w = u × n must run along the ridge; the box is symmetric, so its sign is irrelevant.
      this.oriented("roof-slope", center, u, n, [len + t * 0.6, t, length], surface);
      if (!this.high) continue;
      for (let d = 0.28; d < len - 0.15; d += 0.3) {
        const p = lower
          .clone()
          .addScaledVector(u, d)
          .addScaledVector(n, t + 0.016);
        this.oriented("tile-course", p, u, n, [0.06, 0.035, length], surface);
      }
      for (let a = a0 + 0.35; a < a1 - 0.2; a += 0.62) {
        const foot = v(a, c + s * (half + eo * 0.55), o.eave - eo * 0.55 * slope);
        const pFoot = foot.clone().addScaledVector(n, -0.07);
        this.oriented("rafter-foot", pFoot, u, n, [eo * 1.1, 0.12, 0.1], "oak");
      }
    }
    const cap = this.box(
      "ridge-roll",
      v(am, c, ridgeY + t * 0.85).toArray(),
      o.ridge === "x" ? [length, 0.24, 0.24] : [0.24, 0.24, length],
      surface
    );
    if (o.ridge === "x") cap.rotation.x = Math.PI / 4;
    else cap.rotation.z = Math.PI / 4;
    return { rise, ridgeY };
  }

  /** Lean-to roof slab sloping from a wall line (high side) down to the outer edge. */
  leanTo(
    name: string,
    axis: "x" | "z",
    from: number,
    to: number,
    wallAt: number,
    outerAt: number,
    yHigh: number,
    yLow: number,
    surface: Surface = "tile"
  ) {
    const p = (acr: number, y: number) =>
      axis === "x" ? new THREE.Vector3((from + to) / 2, y, acr) : new THREE.Vector3(acr, y, (from + to) / 2);
    const hi = p(wallAt, yHigh),
      lo = p(outerAt, yLow);
    const u = lo.clone().sub(hi),
      len = u.length();
    u.normalize();
    const n = (axis === "x" ? new THREE.Vector3(0, -u.z, u.y) : new THREE.Vector3(-u.y, u.x, 0)).normalize();
    if (n.y < 0) n.negate();
    this.oriented(
      name,
      hi.clone().add(lo).multiplyScalar(0.5).addScaledVector(n, 0.05),
      u,
      n,
      [len, 0.1, to - from],
      surface
    );
    if (!this.high) return;
    for (let d = 0.25; d < len - 0.1; d += 0.3) {
      const q = hi.clone().addScaledVector(u, d).addScaledVector(n, 0.115);
      this.oriented("tile-course", q, u, n, [0.06, 0.03, to - from], surface);
    }
  }

  /** Window: a cut opening with a dark oiled-cloth pane, lattice and open shutters (High) or a flush dark panel (Low). */
  windowOn(axis: "x" | "z", face: number, out: 1 | -1, u: number, y: number, w = 0.7, h = 0.85) {
    const at = (d: number) => face + out * d;
    if (!this.high) {
      if (axis === "x") this.box("window-panel", [u, y, at(0.01)], [w, h, 0.02], "dark");
      else this.box("window-panel", [at(0.01), y, u], [0.02, h, w], "dark");
      return;
    }
    const pane = (
      name: string,
      uu: number,
      yy: number,
      du: number,
      dy: number,
      d: number,
      depth: number,
      s: Surface
    ) =>
      axis === "x"
        ? this.box(name, [uu, yy, at(d)], [du, dy, depth], s)
        : this.box(name, [at(d), yy, uu], [depth, dy, du], s);
    pane("oiled-cloth-pane", u, y, w, h, -WALL / 2, 0.02, "dark");
    pane("window-mullion", u, y, 0.05, h, -WALL / 2 + 0.04, 0.05, "oak");
    pane("window-transom", u, y + h * 0.1, w, 0.04, -WALL / 2 + 0.04, 0.04, "oak");
    pane("window-sill", u, y - h / 2 - 0.04, w + 0.2, 0.08, 0.06, 0.14, "oak");
    for (const s of [-1, 1]) {
      pane("window-shutter", u + s * (w * 0.75 + 0.02), y, w / 2, h, 0.04, 0.04, "wood");
      pane("shutter-hinge", u + s * (w / 2 + 0.03), y + h * 0.3, 0.1, 0.04, 0.065, 0.02, "iron");
    }
  }

  /** Plank door leaf swung into the building around the hinge at `a` (opening along X on a +Z face). */
  doorLeaf(a: number, b: number, face: number, height: number, angle = 1.2) {
    const w = b - a;
    const hinge = new THREE.Vector3(a + 0.03, 0, face - WALL / 2 - 0.04);
    const dir = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const leaf = this.box(
      "door-leaf",
      [hinge.x + (dir.x * w) / 2, height / 2 + 0.02, hinge.z + (dir.z * w) / 2],
      [w - 0.04, height - 0.04, 0.06],
      "wood"
    );
    leaf.rotation.y = angle;
    if (!this.high) return;
    for (const y of [0.45, height - 0.45]) {
      const strap = this.box(
        "door-strap",
        [hinge.x + dir.x * w * 0.4, y, hinge.z + dir.z * w * 0.4 + 0.04 * Math.cos(angle)],
        [w * 0.75, 0.05, 0.02],
        "iron"
      );
      strap.rotation.y = angle;
    }
  }

  chimneyStack(x: number, z: number, top: number, w = 0.8, d = 0.7, surface: Surface = "stone") {
    this.box("chimney-stack", [x, top / 2, z], [w, top, d], surface);
    this.box("chimney-cap", [x, top + 0.08, z], [w + 0.14, 0.16, d + 0.14], "stone");
    this.box("chimney-flue", [x, top + 0.17, z], [w - 0.32, 0.02, d - 0.3], "dark");
  }

  /** Coped rubble boundary wall with optional gateways. */
  boundary(
    axis: "x" | "z",
    from: number,
    to: number,
    at: number,
    height = 2.2,
    gaps: readonly [number, number][] = []
  ) {
    this.wall(
      "boundary-wall",
      axis,
      from,
      to,
      at,
      0,
      height,
      gaps.map(([a, b]) => ({ a, b, y0: -1, y1: height + 1 })),
      "stone",
      0.4
    );
    const spans: [number, number][] = [];
    let start = from;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > start) spans.push([start, a]);
      start = b;
    }
    if (to > start) spans.push([start, to]);
    for (const [a, b] of spans) {
      const c = (a + b) / 2;
      const cap = this.box(
        "wall-coping",
        axis === "x" ? [c, height + 0.07, at] : [at, height + 0.07, c],
        axis === "x" ? [b - a, 0.14, 0.4] : [0.4, 0.14, b - a],
        this.high ? "tile" : "stone"
      );
      cap.name = "wall-coping";
    }
  }

  /** Timber yard gate posts with two leaves swung inward (gate across X at z). */
  gate(a: number, b: number, z: number, height = 2.3, inward: 1 | -1 = -1) {
    for (const x of [a - 0.12, b + 0.12])
      this.box("gate-post", [x, (height + 0.3) / 2, z], [0.24, height + 0.3, 0.24], "oak");
    if (this.high) this.box("gate-head", [(a + b) / 2, height + 0.4, z], [b - a + 0.7, 0.22, 0.26], "oak");
    const w = (b - a) / 2;
    for (const [hx, s] of [
      [a, 1],
      [b, -1]
    ] as const) {
      const angle = s * (Math.PI / 2 - 0.35);
      const leaf = this.box(
        "gate-leaf",
        [
          hx + s * Math.cos(Math.PI / 2 - 0.35) * (w / 2),
          height / 2,
          z + inward * Math.sin(Math.PI / 2 - 0.35) * (w / 2)
        ],
        [w - 0.05, height - 0.2, 0.07],
        "wood"
      );
      leaf.rotation.y = -inward * angle;
      if (this.high)
        for (const y of [0.5, height - 0.6]) {
          const rail = this.box(
            "gate-ledge",
            [hx + s * Math.cos(Math.PI / 2 - 0.35) * (w / 2), y, z + inward * Math.sin(Math.PI / 2 - 0.35) * (w / 2)],
            [w - 0.15, 0.12, 0.1],
            "oak"
          );
          rail.rotation.y = -inward * angle;
        }
    }
  }

  // ---- Movable stock and fittings -------------------------------------------------------------

  barrel(x: number, z: number, r = 0.3, h = 0.78, y = 0, lying = 0) {
    const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    if (lying)
      matrix
        .multiply(new THREE.Matrix4().makeTranslation(0, r * 1.08, 0))
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, lying, Math.PI / 2)))
        .multiply(new THREE.Matrix4().makeTranslation(0, -h / 2, 0));
    this.placed(matrix, () => {
      if (!this.high) {
        this.cylinder("barrel", [0, h / 2, 0], r, h, "wood", r, 8);
        return;
      }
      const profile = [0, 0.18, 0.5, 0.82, 1].map(
        t => new THREE.Vector2(r * (0.86 + 0.14 * Math.sin(Math.PI * t)), h * t)
      );
      this.add(
        "barrel-staves",
        new THREE.LatheGeometry([new THREE.Vector2(0, 0), ...profile, new THREE.Vector2(0, h)], 14),
        "wood"
      );
      for (const t of [0.1, 0.32, 0.68, 0.9]) {
        const rr = r * (0.86 + 0.14 * Math.sin(Math.PI * t)) + 0.008;
        const hoop = this.add("barrel-hoop", new THREE.CylinderGeometry(rr, rr, 0.045, 14, 1, true), "iron");
        hoop.position.set(0, h * t, 0);
      }
    });
  }

  tub(x: number, z: number, r: number, h: number, contents?: Surface, y = 0) {
    if (this.high) this.vessel("open-tub", [x, y, z], r, h, "wood");
    else this.cylinder("open-tub", [x, y + h / 2, z], r, h, "wood", r, 8);
    if (contents)
      this.cylinder("tub-contents", [x, y + h * 0.78, z], r - 0.08, 0.03, contents, r - 0.08, this.high ? 16 : 8);
    if (this.high)
      for (const t of [0.2, 0.8]) {
        const hoop = this.add("tub-hoop", new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.04, 16, 1, true), "iron");
        hoop.position.set(x, y + h * t, z);
      }
  }

  /** Trestle table: plank top on two splayed trestles. */
  trestleTable(
    x: number,
    z: number,
    w: number,
    d: number,
    top = 0.88,
    surface: Surface = "wood",
    along: "x" | "z" = "x"
  ) {
    const W = along === "x" ? w : d,
      D = along === "x" ? d : w;
    this.box("table-top", [x, top - 0.04, z], [W, 0.08, D], surface);
    const ends =
      along === "x"
        ? [-1, 1].map(s => [x + s * (w / 2 - 0.3), z] as const)
        : [-1, 1].map(s => [x, z + s * (w / 2 - 0.3)] as const);
    for (const [ex, ez] of ends) {
      for (const s of [-1, 1]) {
        const foot: Position =
          along === "x" ? [ex, 0.04, ez + s * (D / 2 - 0.06)] : [ex + s * (D / 2 - 0.06), 0.04, ez];
        this.beam("trestle-leg", foot, [ex, top - 0.1, ez], 0.08, "oak");
      }
      if (this.high)
        this.box(
          "trestle-bar",
          [ex, top - 0.12, ez],
          along === "x" ? [0.1, 0.08, D * 0.85] : [D * 0.85, 0.08, 0.1],
          "oak"
        );
    }
  }

  /** Squared timber block of the butcher or cooper, or a round stump. */
  block(x: number, z: number, r = 0.32, h = 0.78, surface: Surface = "oak") {
    this.cylinder("chopping-block", [x, h / 2, z], r, h, surface, r * 0.96, this.high ? 12 : 7);
  }

  /** Stack of split logs between two pairs of stakes, length along X or Z. */
  woodStack(x: number, z: number, length: number, height: number, along: "x" | "z" = "x") {
    if (!this.high) {
      this.box("log-stack", [x, height / 2, z], along === "x" ? [length, height, 0.6] : [0.6, height, length], "wood");
      return;
    }
    const rows = Math.max(2, Math.round(height / 0.16)),
      per = Math.max(3, Math.round(0.6 / 0.15));
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < per; i++) {
        const off = -0.3 + 0.075 + i * 0.15 + (r % 2 ? 0.04 : 0);
        if (off > 0.3) continue;
        const y = 0.08 + r * 0.155;
        const a: Position = along === "x" ? [x - length / 2, y, z + off] : [x + off, y, z - length / 2],
          b: Position = along === "x" ? [x + length / 2, y, z + off] : [x + off, y, z + length / 2];
        this.beam("split-log", a, b, 0.15, r % 3 ? "wood" : "oak");
      }
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        const p: Position =
          along === "x"
            ? [x + s * (length / 2 + 0.05), height / 2 + 0.1, z + t * 0.36]
            : [x + t * 0.36, height / 2 + 0.1, z + s * (length / 2 + 0.05)];
        this.box("stack-stake", p, [0.08, height + 0.2, 0.08], "oak");
      }
  }

  /** Coarse ellipsoid for small repeated stock (fish, joints, lumps), cheaper than the kit sphere. */
  blob(name: string, p: Position, scale: Position, surface: Surface) {
    const mesh = this.add(name, new THREE.SphereGeometry(1, this.high ? 8 : 5, this.high ? 5 : 3), surface);
    mesh.position.set(...p);
    mesh.scale.set(...scale);
    return mesh;
  }

  /** Dome-shaped heap resting on the ground. */
  heap(name: string, x: number, z: number, rx: number, h: number, rz: number, surface: Surface) {
    const mesh = this.add(
      name,
      new THREE.SphereGeometry(1, this.high ? 14 : 8, this.high ? 6 : 3, 0, Math.PI * 2, 0, Math.PI / 2),
      surface
    );
    mesh.position.set(x, 0, z);
    mesh.scale.set(rx, h, rz);
    return mesh;
  }

  sack(x: number, z: number, y = 0, s = 1) {
    this.sphere("grain-sack", [x, y + 0.3 * s, z], [0.3 * s, 0.32 * s, 0.24 * s], "cloth");
  }

  /** Masonry hearth with a copper on its fire and a smoke hood rising into a stack. */
  hearthWithCopper(x: number, z: number, top: number, contents: Surface, r = 0.5, hoodBack = true) {
    this.box("raised-hearth", [x, 0.4, z], [1.6, 0.8, 1.3], "brick");
    this.box("fire-mouth", [x, 0.35, z + 0.66], [0.6, 0.4, 0.02], "dark");
    if (this.high) this.box("embers", [x, 0.22, z + 0.62], [0.42, 0.06, 0.06], "ember");
    this.vessel("copper", [x, 0.8, z], r, 0.55, "copper");
    this.cylinder("copper-contents", [x, 1.22, z], r - 0.08, 0.03, contents, r - 0.08, this.high ? 16 : 8);
    if (this.high) this.ring("copper-rim", [x, 1.35, z], r, 0.03, "copper");
    if (!hoodBack) return;
    const hoodZ = z - 0.25;
    if (this.high) {
      const hood = this.add("smoke-hood", new THREE.CylinderGeometry(0.35, 0.95, 0.9, 4, 1, true), "plaster");
      hood.position.set(x, 2.25, hoodZ);
      hood.rotation.y = Math.PI / 4;
    } else this.box("smoke-hood", [x, 2.25, hoodZ], [1.3, 0.9, 1.1], "plaster");
    this.chimneyStack(x, hoodZ, top, 0.62, 0.55, "brick");
  }

  /** Two-board leather bellows on a timber frame, nozzle toward +X. */
  bellows(x: number, z: number, y = 0.75, flip = false) {
    const s = flip ? -1 : 1;
    this.box("bellows-frame", [x, y / 2, z], [0.14, y, 0.5], "oak");
    const board = this.box("bellows-board", [x + s * 0.55, y + 0.12, z], [1.2, 0.05, 0.6], "wood");
    board.rotation.z = s * 0.06;
    const body = this.add("bellows-leather", new THREE.CylinderGeometry(0.02, 0.3, 1.0, this.high ? 10 : 6), "leather");
    body.position.set(x + s * 0.5, y + 0.18, z);
    body.rotation.z = (s * Math.PI) / 2;
    body.scale.set(1, 1, 0.45);
    this.beam("bellows-nozzle", [x + s * 1.0, y + 0.18, z], [x + s * 1.35, y + 0.1, z], 0.06, "iron", true);
    if (this.high) this.beam("bellows-rocker", [x - s * 0.1, y + 1.1, z], [x + s * 0.4, y + 0.35, z], 0.06, "oak");
  }

  anvil(x: number, z: number) {
    this.block(x, z, 0.32, 0.55, "oak");
    this.box("anvil-waist", [x, 0.66, z], [0.22, 0.22, 0.18], "iron");
    this.box("anvil-face", [x, 0.82, z], [0.5, 0.12, 0.22], "iron");
    if (this.high) {
      const horn = this.add("anvil-horn", new THREE.ConeGeometry(0.07, 0.3, 8), "iron");
      horn.position.set(x + 0.38, 0.83, z);
      horn.rotation.z = -Math.PI / 2;
    }
  }

  /** Wheel standing on edge in the X-Y plane at (x, z). */
  wheelOnEdge(
    name: string,
    x: number,
    y: number,
    z: number,
    r: number,
    width: number,
    surface: Surface,
    alongX = false
  ) {
    const wheel = this.cylinder(name, [x, y, z], r, width, surface, r, this.high ? 20 : 10);
    if (alongX) wheel.rotation.z = Math.PI / 2;
    else wheel.rotation.x = Math.PI / 2;
    return wheel;
  }

  /** Hanging iron hooks on a rail with whatever `hang(x, yHook)` draws below each hook. */
  hookRail(
    x0: number,
    x1: number,
    y: number,
    z: number,
    count: number,
    hang?: (x: number, y: number, i: number) => void
  ) {
    this.beam("hook-rail", [x0, y, z], [x1, y, z], 0.09, "oak");
    for (let i = 0; i < count; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / count;
      if (this.high) this.beam("s-hook", [x, y - 0.03, z], [x, y - 0.2, z], 0.025, "iron");
      hang?.(x, y - 0.2, i);
    }
  }

  /** Hinged shop window: a drop-down stall-board counter and a propped upper shutter forming a pentice. */
  shopFront(a: number, b: number, face: number, y0: number, y1: number) {
    const w = b - a,
      c = (a + b) / 2,
      board = 0.62;
    this.box("stall-board", [c, y0 - 0.04, face + board / 2], [w - 0.06, 0.07, board], "wood");
    for (const x of [a + 0.2, b - 0.2])
      this.beam("stall-board-leg", [x, 0, face + board - 0.06], [x, y0 - 0.08, face + board - 0.06], 0.07, "oak");
    const lift = 0.75,
      len = (y1 - y0) * 0.5;
    const hinge = new THREE.Vector3(c, y1, face + 0.02);
    const u = new THREE.Vector3(0, Math.sin(lift), Math.cos(lift));
    const n = new THREE.Vector3(0, Math.cos(lift), -Math.sin(lift));
    this.oriented("upper-shutter", hinge.clone().addScaledVector(u, len / 2), u, n, [len, 0.05, w - 0.06], "wood");
    for (const x of [a + 0.15, b - 0.15]) {
      const tip = hinge.clone().addScaledVector(u, len * 0.92);
      this.beam("shutter-stay", [x, y1 - 0.45, face + 0.04], [x, tip.y - 0.02, tip.z], 0.04, "iron");
    }
    if (this.high) {
      this.box("stall-board-edge", [c, y0 - 0.1, face + board - 0.02], [w - 0.06, 0.08, 0.05], "oak");
      for (const x of [a + 0.3, b - 0.3])
        this.box("strap-hinge", [x, y0 - 0.02, face + 0.08], [0.06, 0.03, 0.18], "iron");
    }
  }

  /** Hanging trade sign on a wrought bracket under the jetty, projecting `reach` from the ground-storey face. */
  signBracket(x: number, face: number, y: number, emblem: (cx: number, cy: number, cz: number) => void, reach = 0.75) {
    this.beam("sign-bracket", [x, y, face], [x, y, face + reach], 0.05, "iron");
    if (this.high) this.beam("sign-brace", [x, y - 0.45, face], [x, y - 0.02, face + reach * 0.65], 0.035, "iron");
    const c = face + reach * 0.6;
    this.box("sign-board", [x, y - 0.4, c], [0.05, 0.5, 0.58], "wood");
    if (this.high)
      for (const dz of [-0.22, 0.22]) this.beam("sign-chain", [x, y, c + dz], [x, y - 0.15, c + dz], 0.02, "iron");
    emblem(x, y - 0.4, c);
  }

  /** Wattle hurdles staked in a line: woven panels (High) or a plain rail fence (Low). */
  hurdles(a: readonly [number, number], b: readonly [number, number], h = 1.1) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const panels = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i < panels; i++) {
      const t = (i + 0.5) / panels,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      const panel = this.box(
        "wattle-hurdle",
        [x, h / 2 + 0.05, z],
        [len / panels - 0.06, h - 0.1, 0.07],
        this.high ? "wood" : "oak"
      );
      panel.rotation.y = angle;
      if (!this.high) continue;
      for (const y of [0.25, 0.55, 0.85].filter(v => v < h - 0.1)) {
        const band = this.box("hurdle-weave", [x, y, z], [len / panels - 0.1, 0.06, 0.09], "oak");
        band.rotation.y = angle;
      }
    }
    for (let i = 0; i <= panels; i++) {
      const t = i / panels;
      this.cylinder(
        "hurdle-stake",
        [a[0] + (b[0] - a[0]) * t, (h + 0.15) / 2, a[1] + (b[1] - a[1]) * t],
        0.05,
        h + 0.15,
        "oak",
        0.05,
        this.high ? 8 : 5
      );
    }
  }
}

export const WALL_THICKNESS = WALL;

/** A two-storey burgage house: stone plinth, timber-framed walls, front jetty, gable or eaves to the street. */
export interface TownHouse {
  x0: number;
  x1: number;
  /** Back and front wall lines of the ground storey; the street front is z1. */
  z0: number;
  z1: number;
  ridge: "x" | "z";
  ground: number;
  upper: number;
  jetty: number;
  pitch: number;
  shop?: { a: number; b: number; y0?: number; y1?: number };
  door?: { a: number; b: number };
  backDoor?: { a: number; b: number };
  upperWindows?: readonly number[];
  sideWindows?: { left?: readonly number[]; right?: readonly number[] };
  chimney?: { x: number; z: number };
  roof?: Surface;
}

export function townHouse(k: TradeKit, h: TownHouse) {
  const { x0, x1, z0, z1, ground, upper, jetty } = h;
  const t = WALL,
    top = ground + upper,
    front = z1 + jetty;
  const shopY0 = h.shop?.y0 ?? 0.8,
    shopY1 = h.shop?.y1 ?? 2.15,
    doorH = Math.min(2.15, ground - 0.4);
  k.box("house-floor", [(x0 + x1) / 2, 0.03, (z0 + z1) / 2], [x1 - x0, 0.06, z1 - z0], "wood");
  // Stone sill walls carry the frame clear of the street mud.
  const plinth = 0.42;
  const frontOpenings: WallOpening[] = [
    ...(h.shop ? [{ a: h.shop.a, b: h.shop.b, y0: shopY0, y1: shopY1 }] : []),
    ...(h.door ? [{ a: h.door.a, b: h.door.b, y0: -1, y1: doorH }] : [])
  ];
  const backOpenings: WallOpening[] = h.backDoor ? [{ a: h.backDoor.a, b: h.backDoor.b, y0: -1, y1: doorH }] : [];
  k.wall(
    "stone-plinth",
    "x",
    x0,
    x1,
    z1 - t / 2,
    0,
    plinth,
    frontOpenings.filter(o => o.y0 < plinth),
    "stone",
    t + 0.06
  );
  k.wall("stone-plinth", "x", x0, x1, z0 + t / 2, 0, plinth, backOpenings, "stone", t + 0.06);
  for (const x of [x0 + t / 2, x1 - t / 2])
    k.wall("stone-plinth", "z", z0 + t, z1 - t, x, 0, plinth, [], "stone", t + 0.06);
  // Ground storey.
  k.wall("ground-wall", "x", x0, x1, z1 - t / 2, plinth, ground, frontOpenings);
  k.wall("ground-wall", "x", x0, x1, z0 + t / 2, plinth, ground, backOpenings);
  const sideOpen = (list?: readonly number[], y = 1.6): WallOpening[] =>
    (list ?? []).map(u => ({ a: u - 0.35, b: u + 0.35, y0: y - 0.42, y1: y + 0.42 }));
  k.wall("ground-wall", "z", z0 + t, z1 - t, x0 + t / 2, plinth, ground, k.high ? sideOpen(h.sideWindows?.left) : []);
  k.wall("ground-wall", "z", z0 + t, z1 - t, x1 - t / 2, plinth, ground, k.high ? sideOpen(h.sideWindows?.right) : []);
  for (const u of h.sideWindows?.left ?? []) k.windowOn("z", x0, -1, u, 1.6);
  for (const u of h.sideWindows?.right ?? []) k.windowOn("z", x1, 1, u, 1.6);
  k.framing("x", x0, x1, z1, 1, plinth, ground, frontOpenings);
  k.framing("x", x0, x1, z0, -1, plinth, ground, backOpenings);
  k.framing("z", z0, z1, x0, -1, plinth, ground, sideOpen(h.sideWindows?.left));
  k.framing("z", z0, z1, x1, 1, plinth, ground, sideOpen(h.sideWindows?.right));
  if (h.shop) k.shopFront(h.shop.a, h.shop.b, z1, shopY0, shopY1);
  if (h.door) {
    k.doorLeaf(h.door.a, h.door.b, z1, doorH);
    k.box("door-step", [(h.door.a + h.door.b) / 2, 0.06, z1 + 0.18], [h.door.b - h.door.a + 0.2, 0.12, 0.36], "stone");
  }
  if (h.backDoor)
    k.box(
      "back-door-leaf",
      [(h.backDoor.a + h.backDoor.b) / 2, doorH / 2, z0 - 0.02],
      [h.backDoor.b - h.backDoor.a, doorH, 0.05],
      "wood"
    );
  // Upper floor: joists run front-to-back and cantilever over the front wall.
  k.box("upper-floor", [(x0 + x1) / 2, ground + 0.1, (z0 + front) / 2], [x1 - x0, 0.2, front - z0], "wood");
  if (k.high && jetty > 0) {
    for (let x = x0 + 0.2; x <= x1 - 0.15; x += 0.45)
      k.box("jetty-joist-end", [x, ground - 0.02, z1 + jetty / 2], [0.14, 0.16, jetty + 0.1], "oak");
    k.box("jetty-bressumer", [(x0 + x1) / 2, ground + 0.12, front - 0.05], [x1 - x0, 0.24, 0.16], "oak");
    for (const x of [x0 + 0.1, x1 - 0.1])
      k.beam("jetty-bracket", [x, ground - 0.75, z1 + 0.05], [x, ground - 0.05, front - 0.1], 0.13, "oak");
  }
  if (upper > 0) {
    const yb = ground + 0.22;
    const windows = h.upperWindows ?? [];
    const upperOpen: WallOpening[] = k.high
      ? windows.map(u => ({ a: u - 0.38, b: u + 0.38, y0: yb + 0.85, y1: yb + 1.8 }))
      : [];
    k.wall("upper-wall", "x", x0, x1, front - t / 2, yb, top, upperOpen);
    const backWindows = windows.filter(u => !h.chimney || Math.abs(u - h.chimney.x) > 1);
    const backOpen: WallOpening[] = k.high
      ? backWindows.map(u => ({ a: u - 0.3, b: u + 0.3, y0: yb + 0.95, y1: yb + 1.7 }))
      : [];
    k.wall("upper-wall", "x", x0, x1, z0 + t / 2, yb, top, backOpen);
    for (const u of backWindows) k.windowOn("x", z0, -1, u, yb + 1.32, 0.6, 0.75);
    for (const x of [x0 + t / 2, x1 - t / 2]) k.wall("upper-wall", "z", z0 + t, front - t, x, yb, top);
    for (const u of windows) k.windowOn("x", front, 1, u, yb + 1.32, 0.76, 0.95);
    k.framing("x", x0, x1, front, 1, yb, top, upperOpen, 0.6);
    k.framing("x", x0, x1, z0, -1, yb, top, backOpen, 0.9);
    k.framing("z", z0, front, x0, -1, yb, top, [], 0.9);
    k.framing("z", z0, front, x1, 1, yb, top, [], 0.9);
  }
  // Roof over the upper storey; gables carry framed infill.
  const roofed =
    h.ridge === "x"
      ? k.pitchedRoof({ ridge: "x", along: [x0, x1], across: [z0, front], eave: top, pitch: h.pitch, surface: h.roof })
      : k.pitchedRoof({
          ridge: "z",
          along: [z0, front],
          across: [x0, x1],
          eave: top,
          pitch: h.pitch,
          surface: h.roof,
          gableOverhang: 0.25
        });
  if (h.ridge === "x") {
    const half = (front - z0) / 2,
      c = (front + z0) / 2;
    for (const [x, out] of [
      [x0 + t / 2, -1],
      [x1 - t / 2, 1]
    ] as const) {
      k.gable("x", x, c, half, top, roofed.rise);
      k.gableFrame("x", x + (out * t) / 2, out, c, half, top, roofed.rise);
    }
  } else {
    const half = (x1 - x0) / 2,
      c = (x0 + x1) / 2;
    for (const [z, out] of [
      [z0 + t / 2, -1],
      [front - t / 2, 1]
    ] as const) {
      k.gable("z", z, c, half, top, roofed.rise);
      k.gableFrame("z", z + (out * t) / 2, out, c, half, top, roofed.rise);
    }
    if (k.high) {
      // The gable infill is not cut, so the loft window shows a flush dark pane between its shutters.
      k.box("loft-window-pane", [c, top + roofed.rise * 0.38, front + 0.01], [0.55, 0.7, 0.02], "dark");
      k.windowOn("x", front, 1, c, top + roofed.rise * 0.38, 0.55, 0.7);
    }
  }
  if (h.chimney) k.chimneyStack(h.chimney.x, h.chimney.z, roofed.ridgeY + 0.9);
  return { front, top, ridgeY: roofed.ridgeY };
}
