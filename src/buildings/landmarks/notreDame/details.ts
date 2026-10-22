import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../../city3d/three/structureMeshes";
import type { Position, Surface } from "../../medieval/modelKit";
import { ArchitectureKit } from "../architectureKit";

/** Local facade coordinates: U is horizontal, V is height, D points outwards. */
export class NotreDameKit extends ArchitectureKit {
  point(x: number, y: number, z: number, angle: number, u = 0, v = 0, d = 0): Position {
    return [x + Math.cos(angle) * u + Math.sin(angle) * d, y + v, z - Math.sin(angle) * u + Math.cos(angle) * d];
  }

  arch(width: number, height: number, base = 0, center = 0): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(center - width / 2, base);
    s.lineTo(center + width / 2, base);
    s.lineTo(center + width / 2, base + height * 0.62);
    s.bezierCurveTo(
      center + width / 2,
      base + height * 0.8,
      center + width * 0.23,
      base + height * 0.94,
      center,
      base + height
    );
    s.bezierCurveTo(
      center - width * 0.23,
      base + height * 0.94,
      center - width / 2,
      base + height * 0.8,
      center - width / 2,
      base + height * 0.62
    );
    s.closePath();
    return s;
  }

  panel(
    name: string,
    shape: THREE.Shape,
    x: number,
    y: number,
    z: number,
    angle: number,
    depth: number,
    surface: Surface = "plaster"
  ) {
    const m = this.add(
      name,
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }),
      surface
    );
    m.rotation.y = angle;
    m.position.set(x, y, z);
    return m;
  }

  molding(
    name: string,
    x: number,
    y: number,
    z: number,
    angle: number,
    width: number,
    height: number,
    thickness: number,
    surface: Surface = "white"
  ) {
    const points = this.arch(width, height).getPoints(16);
    // Leave the sill open; the two jambs and curved archivolt are continuous.
    this.add(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          points.slice(1).map(p => new THREE.Vector3(...this.point(x, y, z, angle, p.x, p.y, 0.08)))
        ),
        48,
        thickness,
        6,
        false
      ),
      surface
    );
  }

  window(x: number, z: number, y: number, w = 3.2, h = 7.5, angle = 0) {
    this.panel("lancet-recess", this.arch(w + 0.5, h + 0.35), x, y - 0.1, z, angle, 0.05, "dark");
    this.panel("lancet-glass", this.arch(w, h), ...this.point(x, y, z, angle, 0, 0, 0.07), angle, 0.02, "water");
    this.molding("lancet-surround", x, y, z, angle, w + 0.3, h + 0.2, 0.12);
    for (const u of [-w / 4, w / 4]) {
      this.molding(
        "paired-lancet-tracery",
        ...this.point(x, y, z, angle, u, 0, 0.16),
        angle,
        w / 2 - 0.16,
        h * 0.72,
        0.07
      );
    }
    for (const fraction of [0.25, 0.48])
      this.beam(
        "window-transom",
        this.point(x, y, z, angle, -w / 2, h * fraction, 0.19),
        this.point(x, y, z, angle, w / 2, h * fraction, 0.19),
        0.08,
        "white"
      );
    this.rosette(x, y + h * 0.8, z, w * 0.19, angle, 6, false);
  }

  rosette(x: number, y: number, z: number, radius: number, angle: number, petals = 16, detailed = true) {
    const disk = this.add("rose-glass", new THREE.CircleGeometry(radius, 96), "dark");
    disk.position.set(...this.point(x, y, z, angle, 0, 0, 0.05));
    disk.rotation.y = angle;
    const circle = (name: string, u: number, v: number, r: number, t: number) => {
      const rim = this.add(name, new THREE.TorusGeometry(r, t, 6, detailed ? 64 : 24), "white");
      rim.position.set(...this.point(x, y, z, angle, u, v, 0.22));
      rim.rotation.y = angle;
    };
    circle("rose-outer-molding", 0, 0, radius + 0.18, detailed ? 0.18 : 0.055);
    circle("rose-concentric-tracery", 0, 0, radius * 0.31, radius * 0.018);
    circle("rose-concentric-tracery", 0, 0, radius * 0.69, radius * 0.015);
    circle("rose-center", 0, 0, radius * 0.12, radius * 0.02);
    for (let i = 0; i < petals; i++) {
      const a = (i * Math.PI * 2) / petals;
      const b = ((i + 1) * Math.PI * 2) / petals;
      for (const [inner, outer] of [
        [0.14, 0.67],
        [0.72, 0.98]
      ]) {
        const glass = new THREE.Shape();
        glass.moveTo(Math.cos(a + 0.025) * radius * inner, Math.sin(a + 0.025) * radius * inner);
        glass.absarc(0, 0, radius * outer, a + 0.025, b - 0.025, false);
        glass.lineTo(Math.cos(b - 0.025) * radius * inner, Math.sin(b - 0.025) * radius * inner);
        glass.closePath();
        const pane = this.add(
          "rose-colored-pane",
          new THREE.ShapeGeometry(glass, 4),
          i % 3 === 0 ? "tile" : i % 3 === 1 ? "water" : "iron"
        );
        pane.position.set(...this.point(x, y, z, angle, 0, 0, 0.12));
        pane.rotation.y = angle;
      }
      const u = Math.cos(a),
        v = Math.sin(a);
      this.beam(
        "rose-radial-tracery",
        this.point(x, y, z, angle, u * radius * 0.12, v * radius * 0.12, 0.23),
        this.point(x, y, z, angle, u * radius, v * radius, 0.23),
        radius * 0.025,
        "white"
      );
      if (detailed) {
        circle("rose-petal", u * radius * 0.5, v * radius * 0.5, radius * 0.15, radius * 0.014);
        for (let j = 0; j < 3; j++) {
          const t = (j * Math.PI * 2) / 3;
          circle(
            "rose-trefoil",
            u * radius * 0.83 + Math.cos(t) * radius * 0.048,
            v * radius * 0.83 + Math.sin(t) * radius * 0.048,
            radius * 0.066,
            radius * 0.011
          );
        }
      }
    }
  }

  statue(name: string, x: number, base: number, z: number, height: number, surface: Surface = "white") {
    this.cylinder(
      `${name}-robe`,
      [x, base + height * 0.37, z],
      height * 0.16,
      height * 0.74,
      surface,
      height * 0.105,
      10
    );
    this.sphere(`${name}-head`, [x, base + height * 0.86, z], [height * 0.11, height * 0.14, height * 0.11], surface);
    for (const s of [-1, 1])
      this.beam(
        `${name}-arm`,
        [x, base + height * 0.65, z + s * height * 0.1],
        [x - height * 0.12, base + height * 0.4, z + s * height * 0.17],
        height * 0.12,
        surface
      );
  }

  /** Curved, open structural rib in any radial direction, with a stepped outer pier. */
  flying(x: number, z: number, dx: number, dz: number, inner: number, outer: number, spring: number, top: number) {
    const s = new THREE.Shape();
    const points = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      return new THREE.Vector2(inner + (outer - inner) * t, top - (top - spring) * (1 - Math.sqrt(1 - t * t)));
    });
    s.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) s.lineTo(p.x, p.y);
    for (const p of [...points].reverse()) s.lineTo(p.x, p.y - 0.65);
    s.closePath();
    const m = this.panel("flying-buttress", s, x - dz * 0.4, 0, z + dx * 0.4, Math.atan2(-dz, dx), 0.8);
    // The local horizontal axis follows (dx, dz).
    m.userData.structuralRib = true;
    const px = x + dx * outer,
      pz = z + dz * outer;
    for (const [base, h, w] of [
      [0, 10, 2.5],
      [10, spring - 10, 1.8],
      [spring, 1.2, 2.1]
    ])
      this.block("stepped-buttress-pier", px, pz, w, w, h, base);
    this.pinnacle(px, spring + 1.2, pz, 0.7, 4);
    this.beam("gargoyle", [px, spring + 0.8, pz], [px + dx * 1.5, spring + 0.65, pz + dz * 1.5], 0.25, "stone");
  }

  /** Batch by feature and material to keep detailed ornament affordable in BV. */
  override finish(): CityStructureMeshes {
    const owned = super.finish();
    this.group.updateMatrixWorld(true);
    const batches = new Map<string, THREE.Mesh[]>();
    for (const mesh of this.pickables) {
      const material = mesh.material as THREE.Material;
      const key = `${mesh.name}:${material.uuid}`;
      const list = batches.get(key) ?? [];
      list.push(mesh);
      batches.set(key, list);
    }
    const merged: THREE.BufferGeometry[] = [];
    const pickables: THREE.Mesh[] = [];
    for (const meshes of batches.values()) {
      if (meshes.length === 1) {
        pickables.push(meshes[0]);
        continue;
      }
      const parts = meshes.map(m => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        return g.applyMatrix4(m.matrixWorld);
      });
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (!geometry) throw new Error("Unable to batch Notre-Dame geometry");
      merged.push(geometry);
      const mesh = new THREE.Mesh(geometry, meshes[0].material);
      mesh.name = meshes[0].name;
      mesh.userData.instances = meshes.length;
      for (const original of meshes) this.group.remove(original);
      this.group.add(mesh);
      pickables.push(mesh);
    }
    return {
      group: this.group,
      pickables,
      dispose: () => {
        for (const g of merged) g.dispose();
        owned.dispose();
      }
    };
  }
}
