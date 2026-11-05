import * as THREE from "three";
import { ModelKit, type Position, type Surface } from "./modelKit";

export interface HouseOpening {
  u: number;
  base: number;
  width: number;
  height: number;
  kind: "door" | "window" | "shop";
  /** Named assemblies can fold leaves flat and omit a step at a level landing. */
  doorAngle?: number;
  thresholdHeight?: number;
}

/** Exterior construction with actual facade openings, in metres. Local +Z faces the street. */
export class HouseDetailKit extends ModelKit {
  point(x: number, z: number, angle: number, u: number, y: number, out = 0): Position {
    return [x + Math.cos(angle) * u + Math.sin(angle) * out, y, z - Math.sin(angle) * u + Math.cos(angle) * out];
  }

  facade(
    name: string,
    x: number,
    z: number,
    width: number,
    height: number,
    angle: number,
    openings: readonly HouseOpening[],
    surface: Surface = "plaster"
  ) {
    const us = [
      ...new Set([-width / 2, width / 2, ...openings.flatMap(o => [o.u - o.width / 2, o.u + o.width / 2])])
    ].sort((a, b) => a - b);
    const ys = [...new Set([0, height, ...openings.flatMap(o => [o.base, o.base + o.height])])].sort((a, b) => a - b);
    for (let i = 0; i < us.length - 1; i++)
      for (let j = 0; j < ys.length - 1; j++) {
        const u = (us[i] + us[i + 1]) / 2,
          y = (ys[j] + ys[j + 1]) / 2;
        if (openings.some(o => Math.abs(u - o.u) < o.width / 2 && y > o.base && y < o.base + o.height)) continue;
        const mesh = this.box(
          name,
          this.point(x, z, angle, u, y, -0.09),
          [us[i + 1] - us[i], ys[j + 1] - ys[j], 0.18],
          surface
        );
        mesh.rotation.y = angle;
      }
    for (const opening of openings) {
      const { u, base, width: w, height: h, kind } = opening;
      for (const side of [-1, 1]) {
        const jamb = this.box(
          `${kind}-jamb`,
          this.point(x, z, angle, u + side * (w / 2 + 0.045), base + h / 2, 0.015),
          [0.09, h + 0.16, 0.23],
          "oak"
        );
        jamb.rotation.y = angle;
      }
      for (const y of [base, base + h]) {
        if (kind === "door" && opening.thresholdHeight === 0 && y === base) continue;
        const rail = this.box(
          `${kind}-lintel-sill`,
          this.point(x, z, angle, u, y, 0.035),
          [w + 0.18, 0.1, 0.29],
          "oak"
        );
        rail.rotation.y = angle;
      }
      if (kind === "window") this.casement(x, z, angle, opening);
      if (kind === "door") this.openDoor(x, z, angle, opening);
    }
  }

  private casement(x: number, z: number, angle: number, o: HouseOpening) {
    const { u, base, width: w, height: h } = o;
    const glass = this.box(
      "recessed-glazing",
      this.point(x, z, angle, u, base + h / 2, -0.105),
      [w - 0.05, h - 0.04, 0.012],
      "water"
    );
    glass.rotation.y = angle;
    this.beam(
      "casement-mullion",
      this.point(x, z, angle, u, base, -0.07),
      this.point(x, z, angle, u, base + h, -0.07),
      0.045,
      "wood"
    );
    this.beam(
      "casement-transom",
      this.point(x, z, angle, u - w / 2, base + h * 0.6, -0.07),
      this.point(x, z, angle, u + w / 2, base + h * 0.6, -0.07),
      0.04,
      "wood"
    );
    for (let row = 0; row < 4; row++) {
      const y = base + 0.1 + (row * (h - 0.2)) / 3;
      this.beam(
        "leaded-light",
        this.point(x, z, angle, u - w * 0.43, y, -0.075),
        this.point(x, z, angle, u + w * 0.43, Math.min(base + h - 0.05, y + 0.22), -0.075),
        0.009,
        "iron"
      );
    }
    for (const side of [-1, 1]) {
      const centre = u + side * (w * 0.76 + 0.05);
      for (let board = 0; board < 3; board++) {
        const shutter = this.box(
          "open-shutter-board",
          this.point(x, z, angle, centre + (board - 1) * w * 0.15, base + h / 2, 0.1),
          [w * 0.14, h, 0.055],
          "wood"
        );
        shutter.rotation.y = angle;
      }
      for (const y of [base + 0.18, base + h - 0.18]) {
        const strap = this.box(
          "shutter-strap",
          this.point(x, z, angle, centre, y, 0.135),
          [w * 0.44, 0.035, 0.025],
          "iron"
        );
        strap.rotation.y = angle;
      }
    }
  }

  private openDoor(x: number, z: number, angle: number, o: HouseOpening) {
    const a = o.doorAngle ?? 1.18,
      w = o.width - 0.08;
    const point = (u: number, y: number, out = 0) =>
      this.point(
        x,
        z,
        angle,
        o.u - o.width / 2 + u * Math.cos(a) + out * Math.sin(a),
        y,
        -u * Math.sin(a) + out * Math.cos(a)
      );
    for (let i = 0; i < 6; i++) {
      const board = this.box(
        "open-oak-door-plank",
        point(((i + 0.5) * w) / 6, o.base + o.height / 2),
        [w / 6 - 0.008, o.height - 0.07, 0.055],
        "wood"
      );
      board.rotation.y = angle + a;
    }
    for (const y of [o.base + 0.35, o.base + o.height - 0.35]) {
      this.beam("door-strap-hinge", point(0.02, y, 0.04), point(w * 0.85, y, 0.04), 0.045, "iron");
      for (const u of [w * 0.2, w * 0.6]) this.sphere("door-rivet", point(u, y, 0.055), [0.018, 0.018, 0.018], "iron");
    }
    this.beam(
      "door-diagonal-ledger",
      point(0.05, o.base + 0.2, -0.06),
      point(w - 0.05, o.base + o.height - 0.2, -0.06),
      0.08
    );
    const threshold = o.thresholdHeight ?? 0.2;
    if (threshold > 0) {
      const step = this.box(
        "doorstep",
        this.point(x, z, angle, o.u, threshold / 2, 0.2),
        [o.width + 0.35, threshold, 0.55],
        "stone"
      );
      step.rotation.y = angle;
    }
  }

  frameWall(
    x: number,
    z: number,
    width: number,
    height: number,
    angle: number,
    openings: readonly HouseOpening[],
    floor = 2.6
  ) {
    const point = (u: number, y: number) => this.point(x, z, angle, u, y, 0.04);
    for (const u of [
      -width / 2 + 0.07,
      width / 2 - 0.07,
      ...openings.flatMap(o => [o.u - o.width / 2 - 0.12, o.u + o.width / 2 + 0.12])
    ]) {
      // Split studs around the apertures rather than letting framing close them again.
      const cuts = [0, height, ...openings.flatMap(o => [o.base, o.base + o.height])].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const y = (cuts[i] + cuts[i + 1]) / 2;
        if (
          cuts[i + 1] - cuts[i] < 0.01 ||
          openings.some(o => Math.abs(u - o.u) < o.width / 2 + 0.04 && y > o.base && y < o.base + o.height)
        )
          continue;
        this.beam("oak-wall-stud", point(u, cuts[i]), point(u, cuts[i + 1]), 0.11);
      }
    }
    for (const y of [0.2, floor, height]) {
      const breaks = [
        -width / 2,
        width / 2,
        ...openings
          .filter(o => y > o.base && y < o.base + o.height)
          .flatMap(o => [o.u - o.width / 2, o.u + o.width / 2])
      ].sort((a, b) => a - b);
      for (let i = 0; i < breaks.length - 1; i++) {
        const u = (breaks[i] + breaks[i + 1]) / 2;
        if (openings.some(o => Math.abs(u - o.u) < o.width / 2 && y > o.base && y < o.base + o.height)) continue;
        this.beam("oak-wall-rail", point(breaks[i], y), point(breaks[i + 1], y), 0.14);
      }
    }
    for (const side of [-1, 1]) {
      const a = side * (width / 2 - 0.14),
        b = side * (width / 2 - 0.85);
      if (
        !openings.some(
          o =>
            Math.max(Math.min(a, b), o.u - o.width / 2) < Math.min(Math.max(a, b), o.u + o.width / 2) &&
            o.base < floor + 0.65 &&
            o.base + o.height > floor + 0.16
        )
      )
        this.beam(
          "pegged-diagonal-brace",
          point(a, floor + 0.16),
          point(b, Math.min(height - 0.12, floor + 0.65)),
          0.12
        );
    }
  }

  roofCover(
    x: number,
    z: number,
    width: number,
    depth: number,
    eave: number,
    rise: number,
    cover: "tile" | "thatch" | "wood" = "tile",
    detail: "low" | "high" = "high"
  ) {
    const w = width + 0.6,
      half = (depth + 0.6) / 2;
    for (const side of [-1, 1]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            x - w / 2,
            eave + rise,
            z,
            x + w / 2,
            eave + rise,
            z,
            x + w / 2,
            eave,
            z + side * half,
            x - w / 2,
            eave,
            z + side * half
          ],
          3
        )
      );
      geo.setIndex(side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      this.add("roof-underlay", geo, cover);
      for (let row = 0; row < (detail === "high" ? 14 : 0); row++) {
        const t = 0.04 + row * 0.07,
          y = eave + rise * (1 - t) + 0.035,
          zz = z + side * half * t;
        if (cover === "thatch") {
          this.beam("thatch-ligger", [x - w / 2, y, zz], [x + w / 2, y, zz], 0.045, "wood", true);
          for (let xx = x - w / 2 + 0.15; xx < x + w / 2; xx += 0.25)
            this.beam(
              "thatch-straw-fibre",
              [xx, y + 0.025, zz],
              [xx + 0.025, y - rise * 0.055, zz + side * half * 0.055],
              0.012,
              "straw",
              true
            );
        } else {
          for (let xx = x - w / 2 + 0.15 + (row % 2) * 0.13; xx < x + w / 2 - 0.1; xx += 0.28) {
            const tile = this.box(
              cover === "tile" ? "overlapping-roof-tile" : "split-roof-shingle",
              [xx, y, zz],
              [0.265, 0.045, half * 0.09],
              cover
            );
            tile.rotation.x = side * Math.atan2(rise, half);
          }
        }
      }
      for (const xx of [x - w / 2, x + w / 2])
        this.beam("roof-verge-board", [xx, eave + rise + 0.06, z], [xx, eave, z + side * half], 0.13, "oak");
      this.beam("eaves-fascia", [x - w / 2, eave, z + side * half], [x + w / 2, eave, z + side * half], 0.12, "oak");
    }
    this.beam("ridge-roll", [x - w / 2, eave + rise + 0.09, z], [x + w / 2, eave + rise + 0.09, z], 0.17, cover, true);
    for (const side of [-1, 1]) {
      const gable = new THREE.Shape();
      gable.moveTo(-depth / 2, 0);
      gable.lineTo(depth / 2, 0);
      gable.lineTo(0, rise);
      gable.closePath();
      const mesh = this.add(
        "gable-infill",
        new THREE.ExtrudeGeometry(gable, { depth: 0.14, bevelEnabled: false }),
        "plaster"
      );
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(x + (side * width) / 2 - (side < 0 ? 0 : 0.14), eave, z);
      this.beam("gable-king-post", [x + (side * width) / 2, eave, z], [x + (side * width) / 2, eave + rise, z], 0.13);
    }
  }

  chimneyStack(x: number, z: number, top: number, start: number) {
    this.box("chimney-shaft", [x, (start + top - 0.65) / 2, z], [0.65, top - start - 0.65, 0.6], "stone");
    for (let y = start + 0.2; y < top - 0.65; y += 0.27) {
      this.box("chimney-course", [x, y, z + 0.305], [0.65, 0.018, 0.018], "white");
      this.box("chimney-side-course", [x + 0.33, y, z], [0.018, 0.018, 0.6], "white");
    }
    for (const side of [-1, 1]) {
      this.box("open-flue-side", [x, top - 0.325, z + side * 0.25], [0.7, 0.65, 0.14], "stone");
      this.box("open-flue-end", [x + side * 0.28, top - 0.325, z], [0.14, 0.65, 0.38], "stone");
      this.box("chimney-cap-side", [x, top + 0.02, z + side * 0.27], [0.8, 0.12, 0.15], "stone");
      this.box("chimney-cap-end", [x + side * 0.325, top + 0.02, z], [0.15, 0.12, 0.4], "stone");
    }
  }
}
