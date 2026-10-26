import type { LandmarkModel } from "../architectureKit";
import { NotreDameKit } from "../notreDame/details";

/** Shared exterior craftsmanship applied to each landmark's own plan and elevations. */
export class GothicDetailKit extends NotreDameKit {
  override opening(
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
    if (!pointed) {
      super.opening(name, x, base, z, width, height, angle, pointed, door);
      return;
    }
    if (!door) {
      this.window(x, z, base, width, height, angle);
      return;
    }
    this.panel(`${name}-recess`, this.arch(width + 0.5, height + 0.3), x, base, z, angle, 0.08, "dark");
    for (let layer = 0; layer < 3; layer++) {
      this.molding(
        "portal-archivolt",
        ...this.point(x, base, z, angle, 0, 0, 0.12 + layer * 0.1),
        angle,
        width + layer * 0.35,
        height + layer * 0.24,
        0.09,
        this.masonry
      );
    }
    for (const side of [-1, 1]) {
      const leaf = this.box(
        "portal-oak-leaf",
        this.point(x, base, z, angle, side * width * 0.23, height * 0.29, 0.13),
        [width * 0.44, height * 0.56, 0.08],
        "oak"
      );
      leaf.rotation.y = angle;
      for (const f of [0.15, 0.32, 0.49]) {
        this.beam(
          "portal-strap-hinge",
          this.point(x, base, z, angle, side * width * 0.04, height * f, 0.2),
          this.point(x, base, z, angle, side * width * 0.42, height * f, 0.2),
          0.06,
          "iron"
        );
      }
    }
    this.beam(
      "portal-trumeau",
      this.point(x, base, z, angle, 0, 0, 0.24),
      this.point(x, base, z, angle, 0, height * 0.6, 0.24),
      0.18,
      this.masonry
    );
  }

  override rose(x: number, y: number, z: number, radius: number, angle = 0) {
    this.rosette(x, y, z, radius, angle, this.group.name === "chartres" ? 12 : 16);
  }

  override nave(
    name: string,
    x: number,
    z: number,
    length: number,
    width: number,
    eave: number,
    rise: number,
    base = 0
  ) {
    super.nave(name, x, z, length, width, eave, rise, base);
    const pitch = this.roofing === "stone" ? 2 : 2.5;
    for (let u = -length / 2 + pitch / 2; u < length / 2; u += pitch) {
      for (const side of [-1, 1]) {
        this.beam(
          "roof-standing-seam",
          [x + u, eave + rise + 0.04, z],
          [x + u, eave + 0.04, z + (side * width) / 2],
          0.045,
          this.roofing === "stone" ? "white" : "stone"
        );
      }
    }
    this.beam("roof-ridge-cap", [x - length / 2, eave + rise, z], [x + length / 2, eave + rise, z], 0.16, this.roofing);
    for (const side of [-1, 1]) {
      this.box("eave-molding", [x, eave, z + (side * width) / 2], [length, 0.22, 0.22], this.masonry);
    }
  }

  override pinnacle(x: number, base: number, z: number, radius = 0.7, height = 4) {
    super.pinnacle(x, base, z, radius, height);
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        this.beam(
          "pinnacle-edge-rib",
          [x + dx * radius * 0.7, base + height * 0.36, z + dz * radius * 0.7],
          [x, base + height, z],
          radius * 0.12,
          this.masonry
        );
        for (const t of [0.25, 0.5, 0.75]) {
          const r = radius * (1 - t) * 0.8;
          this.sphere(
            "pinnacle-crocket",
            [x + dx * r, base + height * (0.36 + 0.64 * t), z + dz * r],
            [radius * 0.15, height * 0.035, radius * 0.15],
            this.masonry
          );
        }
      }
    }
  }

  override spire(name: string, x: number, base: number, z: number, radius: number, height: number, open = false) {
    super.spire(name, x, base, z, radius, height, open);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const point = (t: number, angle = a): [number, number, number] => [
        x + Math.cos(angle) * radius * (1 - t),
        base + height * t,
        z + Math.sin(angle) * radius * (1 - t)
      ];
      this.beam("spire-hip-rib", point(0), point(0.998), 0.12, this.masonry);
      for (let j = 1; j < 10; j++) {
        const t = j / 10;
        if (open) {
          this.beam("spire-openwork-diagonal", point(t), point(t + 0.1, a + Math.PI / 4), 0.1, this.masonry);
          this.beam("spire-openwork-diagonal", point(t, a + Math.PI / 4), point(t + 0.1), 0.1, this.masonry);
        }
        const [px, py, pz] = point(t);
        this.sphere("spire-crocket", [px, py, pz], [0.14, 0.22, 0.14], this.masonry);
      }
    }
  }

  override flyer(x: number, inner: number, outer: number, spring: number, top: number, side: number) {
    super.flyer(x, inner, outer, spring, top, side);
    const curve = Array.from({ length: 25 }, (_, i): [number, number, number] => {
      const t = i / 24;
      return [x, top - (top - spring) * (1 - Math.sqrt(1 - t * t)) + 0.08, side * (inner + (outer - inner) * t)];
    });
    this.tube("buttress-weathering-cap", curve, 0.14, this.masonry);
    for (const y of [spring * 0.45, spring * 0.75]) {
      this.block("buttress-setback-course", x, side * outer, 2.05, 2.15, 0.25, y);
    }
    this.beam(
      "buttress-gargoyle",
      [x, spring + 0.55, side * outer],
      [x, spring + 0.4, side * (outer + 1.15)],
      0.22,
      this.masonry
    );
  }

  override apse(name: string, x: number, z: number, radius: number, height: number, rise = 3, base = 0) {
    super.apse(name, x, z, radius, height, rise, base);
    // Radial seams follow the conical half-roof rather than crossing its glazing.
    for (let i = 0; i <= 12; i++) {
      const a = (i * Math.PI) / 12;
      this.beam(
        "apse-roof-rib",
        [x, base + height + rise + 0.03, z],
        [x + Math.sin(a) * (radius + 0.25), base + height + 0.03, z + Math.cos(a) * (radius + 0.25)],
        0.06,
        this.roofing === "stone" ? "white" : "stone"
      );
    }
  }

  override radialChapels(x: number, radius: number, count: number, chapelRadius: number, height: number) {
    super.radialChapels(x, radius, count, chapelRadius, height);
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) * Math.PI) / count;
      const cx = x + Math.sin(a) * radius;
      const cz = Math.cos(a) * radius;
      for (const delta of [-Math.PI / 6, 0, Math.PI / 6]) {
        const angle = a + delta;
        // The base chapel has twelve facets: place glazing on the facet planes.
        const faceAngle = ((Math.floor(angle / (Math.PI / 6)) + 0.5) * Math.PI) / 6;
        const r = chapelRadius * Math.cos(Math.PI / 12) + 0.01;
        this.opening(
          "radiating-chapel-lancet",
          cx + Math.sin(faceAngle) * r,
          2,
          cz + Math.cos(faceAngle) * r,
          Math.min(1.8, chapelRadius * 0.4),
          height - 3.5,
          faceAngle
        );
      }
    }
  }

  override block(name: string, x: number, z: number, length: number, width: number, height: number, base = 0) {
    const mesh = super.block(name, x, z, length, width, height, base);
    if (name === "king-massing" || name === "statue-marker") {
      // Keep the original plinth but give civic niches and the Reims gallery human silhouettes.
      mesh.scale.y = 0.15;
      mesh.position.y = base + 0.075;
      this.statue(
        "facade-sculpture",
        x - (name === "king-massing" ? 0.15 : 0),
        base + 0.15,
        z,
        height - 0.15,
        this.masonry
      );
    }
    return mesh;
  }

  override tower(
    name: string,
    x: number,
    z: number,
    width: number,
    height: number,
    spire = 0,
    pointed = true,
    base = 0
  ) {
    super.tower(name, x, z, width, height, spire, pointed, base);
    // Keep the belfry open: ornament is confined to the solid shaft below it.
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const tier of [0.34, 0.55]) {
        const p = this.point(x, base + height * tier, z, angle, 0, 0, width / 2 + 0.02);
        this.opening("tower-blind-lancet", p[0], p[1], p[2], width * 0.24, height * 0.13, angle, pointed);
      }
      for (const side of [-1, 1]) {
        this.beam(
          "tower-shaft-shafts",
          this.point(x, base, z, angle, side * width * 0.43, 0.3, width / 2 + 0.08),
          this.point(x, base, z, angle, side * width * 0.43, height * 0.7, width / 2 + 0.08),
          0.18,
          this.masonry
        );
      }
    }
  }
}

export function detailedLandmark(low: LandmarkModel, create: LandmarkModel["create"]): LandmarkModel {
  return {
    ...low,
    highDetail: undefined,
    name: `${low.name} · high detail`,
    note: "Detailed procedural exterior with molded window surrounds, paired lancet tracery, colored rose glazing where present, portal archivolts and ironwork, roof seams, ribbed spires, crocketed pinnacles, chapel lancets and buttress weathering caps. The shell, plan and construction phase follow the low-resolution study; ornament is illustrative. Interiors, exact sculpture and individual stained-glass scenes are omitted.",
    create
  };
}
