import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { ModelKit, type Surface } from "../medieval/modelKit";

export interface LandmarkModel {
  id: string;
  task: string;
  name: string;
  style: "Gothic" | "Romanesque";
  state: string;
  /** Conservative display envelope, not a surveyed footprint. X is west to east. */
  size: readonly [number, number, number];
  dimensions: string;
  note: string;
  sources: readonly { title: string; url: string }[];
  /** Optional detailed exterior; the catalogue entry itself remains the default low-resolution model. */
  highDetail?: LandmarkModel;
  create(): CityStructureMeshes;
}

/** Exterior study parts in metres. All geometry and materials belong to the returned assembly. */
export class ArchitectureKit extends ModelKit {
  constructor(
    id: string,
    readonly masonry: Surface = "plaster",
    readonly roofing: Surface = "iron"
  ) {
    super(id);
  }

  block(name: string, x: number, z: number, length: number, width: number, height: number, base = 0) {
    return this.box(name, [x, base + height / 2, z], [length, height, width], this.masonry);
  }

  /** Closed gabled volume, without the exposed timber of the rural model kit. */
  nave(name: string, x: number, z: number, length: number, width: number, eave: number, rise: number, base = 0) {
    this.block(name, x, z, length, width, eave - base, base);
    const section = new THREE.Shape();
    section.moveTo(-width / 2, 0);
    section.lineTo(width / 2, 0);
    section.lineTo(0, rise);
    section.closePath();
    const roof = this.add(
      `${name}-roof`,
      new THREE.ExtrudeGeometry(section, { depth: length, bevelEnabled: false }),
      this.roofing
    );
    roof.rotation.y = Math.PI / 2;
    roof.position.set(x - length / 2, eave, z);
  }

  /** Same gable rotated so that its ridge runs north/south, e.g. a transept arm. */
  crossNave(name: string, x: number, z: number, length: number, width: number, eave: number, rise: number, base = 0) {
    const start = this.pickables.length;
    this.nave(name, 0, 0, length, width, eave, rise, base);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (const mesh of this.pickables.slice(start)) {
      mesh.position.applyQuaternion(rotation).add(new THREE.Vector3(x, 0, z));
      mesh.quaternion.premultiply(rotation);
    }
  }

  /** A polygonal plan extruded upwards; input points are world X/Z. */
  prism(
    name: string,
    points: readonly (readonly [number, number])[],
    base: number,
    height: number,
    surface = this.masonry
  ) {
    const plan = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const mesh = this.add(name, new THREE.ExtrudeGeometry(plan, { depth: height, bevelEnabled: false }), surface);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = base;
    return mesh;
  }

  apse(name: string, x: number, z: number, radius: number, height: number, rise = 3, base = 0) {
    const points = Array.from({ length: 13 }, (_, i): readonly [number, number] => {
      const a = (Math.PI * i) / 12;
      return [x + Math.sin(a) * radius, z + Math.cos(a) * radius];
    });
    this.prism(name, points, base, height);
    const roof = this.add(
      `${name}-roof`,
      new THREE.CylinderGeometry(0, radius + 0.25, rise, 24, 1, false, 0, Math.PI),
      this.roofing
    );
    roof.position.set(x, base + height + rise / 2, z);
  }

  radialChapels(x: number, radius: number, count: number, chapelRadius: number, height: number) {
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) * Math.PI) / count;
      const xx = x + Math.sin(a) * radius;
      const zz = Math.cos(a) * radius;
      this.cylinder("radiating-chapel", [xx, height / 2, zz], chapelRadius, height, this.masonry, chapelRadius, 12);
      this.cylinder("radiating-chapel-roof", [xx, height + 1.8, zz], chapelRadius + 0.2, 3.6, this.roofing, 0, 12);
    }
  }

  /** Facade normal = (sin(angle), 0, cos(angle)); west facade uses -PI/2. */
  opening(
    name: string,
    x: number,
    base: number,
    z: number,
    width: number,
    height: number,
    angle = 0,
    pointed = true,
    door = false
  ) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.5, 0.65);
    if (pointed) {
      shape.quadraticCurveTo(0.45, 0.87, 0, 1);
      shape.quadraticCurveTo(-0.45, 0.87, -0.5, 0.65);
    } else {
      shape.absellipse(0, 0.65, 0.5, 0.35, 0, Math.PI, false, 0);
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 10);
    for (const [out, w, h, y, surface] of [
      [0.04, width + 0.55, height + 0.35, base - 0.08, this.masonry],
      [0.09, width, height, base + 0.12, door ? "dark" : "water"]
    ] as const) {
      const face = this.add(name, geometry, surface);
      face.rotation.y = angle;
      face.position.set(x + Math.sin(angle) * out, y, z + Math.cos(angle) * out);
      face.scale.set(w, h, 1);
    }
    if (!door && pointed) {
      const mullion = this.box(
        `${name}-mullion`,
        [x + Math.sin(angle) * 0.14, base + height * 0.42, z + Math.cos(angle) * 0.14],
        [0.14, height * 0.7, 0.14],
        "white"
      );
      mullion.rotation.y = angle;
    }
  }

  rose(x: number, y: number, z: number, radius: number, angle = 0) {
    const disk = this.add("rose-glass", new THREE.CircleGeometry(radius, 24), "water");
    disk.position.set(x + Math.sin(angle) * 0.12, y, z + Math.cos(angle) * 0.12);
    disk.rotation.y = angle;
    const rim = this.ring(
      "rose-frame",
      [x + Math.sin(angle) * 0.18, y, z + Math.cos(angle) * 0.18],
      radius,
      0.18,
      "white",
      true
    );
    rim.rotation.y = angle;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const u = Math.cos(a) * radius;
      const v = Math.sin(a) * radius;
      this.beam(
        "rose-tracery",
        [x + Math.sin(angle) * 0.2, y, z + Math.cos(angle) * 0.2],
        [x + Math.cos(angle) * u + Math.sin(angle) * 0.2, y + v, z - Math.sin(angle) * u + Math.cos(angle) * 0.2],
        0.12,
        "white"
      );
    }
  }

  /** Open arch band, rather than a solid triangular slab over the aisle. */
  flyer(x: number, inner: number, outer: number, spring: number, top: number, side: number) {
    const shape = new THREE.Shape();
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      profile.push(new THREE.Vector2(inner + (outer - inner) * t, top - (top - spring) * (1 - Math.sqrt(1 - t * t))));
    }
    shape.moveTo(profile[0].x, profile[0].y);
    for (const p of profile.slice(1)) shape.lineTo(p.x, p.y);
    for (const p of [...profile].reverse()) shape.lineTo(p.x, p.y - 0.85);
    shape.closePath();
    const mesh = this.add(
      "flying-buttress",
      new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: false }),
      this.masonry
    );
    // Local profile X maps to signed world Z; extrusion maps to world X.
    mesh.rotation.y = (-side * Math.PI) / 2;
    mesh.position.x = x - side * 0.425;
    this.block("buttress-pier", x, side * outer, 1.8, 2, spring + 0.8);
    this.pinnacle(x, spring + 0.8, side * outer, 0.8, 4);
  }

  bays(
    xs: readonly number[],
    halfWidth: number,
    eave: number,
    aisleEdge: number,
    aisleHeight: number,
    pointed = true,
    flying = false
  ) {
    for (const x of xs)
      for (const side of [-1, 1]) {
        const angle = side > 0 ? 0 : Math.PI;
        this.opening("clerestory-window", x, eave - 9, side * halfWidth, 3.1, 7, angle, pointed);
        this.opening("aisle-window", x, 3, side * aisleEdge, 3, Math.max(3, aisleHeight - 4.5), angle, pointed);
        if (flying) this.flyer(x + 3, halfWidth + 0.2, aisleEdge + 3.2, aisleHeight + 2, eave - 2, side);
        else this.block("wall-buttress", x + 3, side * (aisleEdge + 0.45), 0.9, 1.2, aisleHeight + 0.8);
      }
  }

  pinnacle(x: number, base: number, z: number, radius = 0.7, height = 4) {
    this.cylinder("pinnacle-base", [x, base + height * 0.18, z], radius, height * 0.36, this.masonry, radius, 4);
    const cap = this.cylinder(
      "pinnacle-tip",
      [x, base + height * 0.68, z],
      radius * 1.1,
      height * 0.64,
      this.masonry,
      0,
      4
    );
    cap.rotation.y = Math.PI / 4;
  }

  /** Masonry tower with an open belfry and either a flat parapet or a spire. */
  tower(name: string, x: number, z: number, width: number, height: number, spire = 0, pointed = true, base = 0) {
    const bellH = Math.min(12, height * 0.23);
    this.block(`${name}-shaft`, x, z, width, width, height - bellH, base);
    const tier = base + height - bellH;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        this.block(
          `${name}-belfry-pier`,
          x + sx * (width / 2 - 0.65),
          z + sz * (width / 2 - 0.65),
          1.3,
          1.3,
          bellH,
          tier
        );
    for (const side of [-1, 1]) {
      this.arcade(
        `${name}-belfry`,
        x - width / 2 + 0.6,
        (side * width) / 2 + z,
        width - 1.2,
        2,
        tier,
        bellH,
        0,
        pointed
      );
      this.arcade(
        `${name}-belfry`,
        z - width / 2 + 0.6,
        x + (side * width) / 2,
        width - 1.2,
        2,
        tier,
        bellH,
        Math.PI / 2,
        pointed
      );
    }
    this.block(`${name}-cornice`, x, z, width + 0.5, width + 0.5, 0.7, base + height);
    for (const y of [height * 0.32, height * 0.63])
      this.block(`${name}-stringcourse`, x, z, width + 0.3, width + 0.3, 0.45, base + y);
    if (spire) this.spire(`${name}-spire`, x, base + height + 0.7, z, width * 0.52, spire);
  }

  spire(name: string, x: number, base: number, z: number, radius: number, height: number, open = false) {
    if (!open) this.cylinder(name, [x, base + height / 2, z], radius, height, this.roofing, 0, 8);
    else {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        this.beam(
          name,
          [x + Math.cos(a) * radius, base, z + Math.sin(a) * radius],
          [x, base + height, z],
          0.4,
          this.masonry
        );
      }
      for (const f of [0, 0.2, 0.4, 0.6, 0.8])
        this.ring(`${name}-tracery-ring`, [x, base + f * height, z], radius * (1 - f), 0.22, this.masonry);
    }
  }

  /** Arcade along world X, or along Z when angle is PI/2. Genuine voids between piers. */
  arcade(
    name: string,
    start: number,
    offset: number,
    length: number,
    count: number,
    base: number,
    height: number,
    angle = 0,
    pointed = false
  ) {
    const pitch = length / count;
    const pierW = Math.min(0.65, pitch * 0.15);
    for (let i = 0; i <= count; i++) {
      const u = start + pitch * i;
      this.block(
        `${name}-pier`,
        angle ? offset : u,
        angle ? u : offset,
        angle ? 0.65 : pierW,
        angle ? pierW : 0.65,
        height,
        base
      );
    }
    for (let i = 0; i < count; i++) {
      const cx = start + (i + 0.5) * pitch;
      const r = (pitch - pierW) / 2;
      const rise = Math.min(r * (pointed ? 1.3 : 1), height * 0.45);
      const arch = new THREE.Shape();
      arch.moveTo(-r, height);
      arch.lineTo(r, height);
      arch.lineTo(r, height - rise);
      if (pointed) {
        arch.quadraticCurveTo(r * 0.8, height - rise * 0.3, 0, height - 0.25);
        arch.quadraticCurveTo(-r * 0.8, height - rise * 0.3, -r, height - rise);
      } else {
        for (let j = 0; j <= 16; j++) {
          const a = (j * Math.PI) / 16;
          arch.lineTo(Math.cos(a) * r, height - rise + Math.sin(a) * (rise - 0.25));
        }
      }
      arch.closePath();
      const mesh = this.add(
        `${name}-arch`,
        new THREE.ExtrudeGeometry(arch, { depth: 0.65, bevelEnabled: false }),
        this.masonry
      );
      mesh.position.set(angle ? offset + 0.325 : cx, base, angle ? cx : offset - 0.325);
      mesh.rotation.y = angle ? -Math.PI / 2 : 0;
    }
  }

  dome(name: string, x: number, base: number, z: number, radius: number, rise: number) {
    const mesh = this.add(name, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.roofing);
    mesh.position.set(x, base, z);
    mesh.scale.set(radius, rise, radius);
  }
}
