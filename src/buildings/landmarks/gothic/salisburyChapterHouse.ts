import * as THREE from "three";
import type { Position } from "../../medieval/modelKit";
import type { GothicDetailKit } from "./detailKit";

/** Fitted to the existing landmark study, not surveyed dimensions or a generic guild hall. */
export const SALISBURY_CHAPTER_HOUSE = Object.freeze({
  x: -7,
  z: 58,
  radius: 8,
  wallHeight: 12,
  roofRise: 6,
  entranceFace: 5
});

/** Open masonry and recessed four-light glazing using the existing Gothic arch vocabulary. */
export function addSalisburyChapterHouse(k: GothicDetailKit) {
  const { x, z, radius, wallHeight, roofRise, entranceFace } = SALISBURY_CHAPTER_HOUSE;
  const step = Math.PI / 4,
    apothem = radius * Math.cos(step / 2),
    width = 2 * radius * Math.sin(step / 2);
  const at = (angle: number, u: number, y: number, d: number): Position => k.point(x, 0, z, angle, u, y, d);
  const frame = (name: string, angle: number, u: number, base: number, w: number, h: number, d: number, t: number) => {
    // Sample once at model scale instead of using the kit's dense ornamental extrusion default.
    const shape = new THREE.Shape(k.arch(w + t * 2, h + t * 2, base - t, u).getPoints(8));
    shape.holes.push(new THREE.Path(k.arch(w, h, base, u).getPoints(6).reverse()));
    k.panel(name, shape, ...at(angle, 0, 0, d), angle, 0.08, "white");
  };
  const bar = (
    name: string,
    angle: number,
    u: number,
    y: number,
    d: number,
    size: Position,
    surface: "plaster" | "white"
  ) => {
    const mesh = k.box(name, at(angle, u, y, d), size, surface);
    mesh.rotation.y = angle;
  };

  k.cylinder("chapter-plinth", [x, 0.11, z], 8.9, 0.22, "stone", 8.9, 8);
  for (let face = 0; face < 8; face++) {
    const angle = (face + 0.5) * step,
      entrance = face === entranceFace;
    const base = entrance ? 5.0 : 3.1,
      height = entrance ? 5.7 : 7.6,
      openingWidth = entrance ? 4.3 : 4.8;
    const wall = new THREE.Shape([
      new THREE.Vector2(-width / 2, 0.2),
      new THREE.Vector2(width / 2, 0.2),
      new THREE.Vector2(width / 2, wallHeight),
      new THREE.Vector2(-width / 2, wallHeight)
    ]);
    wall.holes.push(new THREE.Path(k.arch(openingWidth, height, base).getPoints(8).reverse()));
    if (entrance) wall.holes.push(new THREE.Path(k.arch(2.0, 3.5, 0.21).getPoints(8).reverse()));
    k.panel("chapter-open-masonry", wall, ...at(angle, 0, 0, apothem - 0.38), angle, 0.38, "plaster");
    frame("chapter-window-surround", angle, 0, base, openingWidth, height, apothem + 0.02, 0.14);
    const pane = k.add(
      "chapter-recessed-glass",
      new THREE.ShapeGeometry(k.arch(openingWidth, height, base), 8),
      "water"
    );
    pane.position.set(...at(angle, 0, 0, apothem - 0.28));
    pane.rotation.y = angle;

    const lightWidth = openingWidth / 4 - 0.12,
      lightHeight = height * 0.58;
    for (let light = 0; light < 4; light++) {
      const u = ((light - 1.5) * openingWidth) / 4;
      frame("chapter-four-light-tracery", angle, u, base + 0.06, lightWidth, lightHeight, apothem - 0.12, 0.045);
    }
    for (const u of [-openingWidth / 4, openingWidth / 4])
      frame(
        "chapter-paired-light-head",
        angle,
        u,
        base + height * 0.51,
        openingWidth * 0.42,
        height * 0.3,
        apothem - 0.1,
        0.045
      );
    const ring = k.add("chapter-tracery-oculus", new THREE.TorusGeometry(openingWidth * 0.105, 0.055, 5, 16), "white");
    ring.position.set(...at(angle, 0, base + height * 0.82, apothem - 0.06));
    ring.rotation.y = angle;
    for (const turn of [0, Math.PI / 2]) {
      const r = openingWidth * 0.09,
        y = base + height * 0.82;
      k.beam(
        "chapter-oculus-cross",
        at(angle, -Math.cos(turn) * r, y - Math.sin(turn) * r, apothem - 0.06),
        at(angle, Math.cos(turn) * r, y + Math.sin(turn) * r, apothem - 0.06),
        0.045,
        "white"
      );
    }
    for (const [y, thickness] of [
      [2.8, 0.16],
      [11.55, 0.2],
      [11.88, 0.18]
    ]) {
      if (entrance && y < 4) {
        for (const side of [-1, 1])
          bar(
            "chapter-broken-stringcourse",
            angle,
            (side * (width / 2 + 1.18)) / 2,
            y,
            apothem,
            [width / 2 - 1.18, thickness, 0.14],
            "white"
          );
      } else bar("chapter-stringcourse", angle, 0, y, apothem, [width, thickness, 0.14], "white");
    }
    if (entrance) frame("chapter-portal-surround", angle, 0, 0.21, 2, 3.5, apothem + 0.01, 0.16);
  }

  // Corner buttresses stand on the plinth and step back below the eaves.
  for (let corner = 0; corner < 8; corner++) {
    const angle = corner * step;
    for (const [bottom, top, depth] of [
      [0.22, 3.0, 1.35],
      [3.0, 7.8, 1.05],
      [7.8, 11.6, 0.72]
    ]) {
      bar(
        "chapter-stepped-buttress",
        angle,
        0,
        (bottom + top) / 2,
        radius + 0.12,
        [0.62, top - bottom, depth],
        "plaster"
      );
      const cap = k.box(
        "chapter-buttress-weathering",
        at(angle, 0, top - 0.05, radius + 0.12),
        [0.72, 0.18, depth + 0.1],
        "white"
      );
      cap.rotation.set(-0.13, angle, 0, "YXZ");
    }
    k.beam(
      "chapter-roof-hip",
      at(angle, 0, wallHeight + 0.03, 8.4),
      [x, wallHeight + roofRise + 0.03, z],
      0.05,
      "stone"
    );
  }
  k.cylinder("chapter-faceted-roof", [x, wallHeight + roofRise / 2, z], 8.4, roofRise, "iron", 0, 8);
  for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
    for (let corner = 0; corner < 8; corner++) {
      k.beam(
        "chapter-roof-seam",
        at(corner * step, 0, wallHeight + roofRise * fraction + 0.03, 8.4 * (1 - fraction)),
        at((corner + 1) * step, 0, wallHeight + roofRise * fraction + 0.03, 8.4 * (1 - fraction)),
        0.035,
        "stone"
      );
    }
  }

  // Basic supporting shafts and ribs; furniture and carved narrative scenes are omitted.
  k.cylinder("chapter-central-base", [x, 0.36, z], 0.68, 0.28, "stone", 0.68, 8);
  k.cylinder("chapter-central-pillar", [x, 4.95, z], 0.24, 9.3, "stone", 0.24, 12);
  k.cylinder("chapter-central-capital", [x, 9.65, z], 0.58, 0.25, "white", 0.58, 8);
  for (let corner = 0; corner < 8; corner++) {
    const angle = corner * step;
    k.cylinder("chapter-clustered-shaft", at(angle, 0, 4.95, 0.34), 0.065, 9.3, "stone", 0.065, 8);
    const rib: Position[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      rib.push(at(angle, 0, 9.78 + 2.3 * Math.sin(t * Math.PI * 0.65), t * 7.5));
    }
    k.tube("chapter-vault-rib", rib, 0.075, "white");
  }

  // A fitted entrance passage reaches the existing east cloister walk without filling its doorway.
  const angle = (entranceFace + 0.5) * step,
    length = 5.6;
  for (const side of [-1, 1])
    bar("chapter-passage-wall", angle, side * 1.0, 1.9, apothem + length / 2, [0.22, 3.4, length + 0.06], "plaster");
  bar("chapter-passage-floor", angle, 0, 0.11, apothem + length / 2, [2.2, 0.22, length + 0.08], "plaster");
  const roof = new THREE.Shape([new THREE.Vector2(-1.2, 3.6), new THREE.Vector2(1.2, 3.6), new THREE.Vector2(0, 4.6)]);
  k.panel("chapter-passage-roof", roof, ...at(angle, 0, 0, apothem - 0.03), angle, length + 0.06, "iron");
}
