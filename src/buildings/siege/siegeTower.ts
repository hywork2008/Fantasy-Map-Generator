import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Illustrative medieval belfry, in meters, with the assault bridge facing positive X. */
export const SIEGE_TOWER = {
  name: "Medieval European siege tower",
  length: 8.5,
  width: 5.6,
  height: 11.7,
  note: "Interpretive medieval belfry informed by Viollet-le-Duc, Engin, fig. 32. Lower ladders connect by short switchback landings; the archer ladder ascends towards the enemy. The circulation layout, common-shaft windlass and dimensions are modeling interpretations. A separate archer deck covers the assault bridge, shown resting on an implied castle wall."
} as const;

// Positive X faces the wall. Lower flights are transverse; the roof flight ascends towards the wall.
export const SIEGE_TOWER_LAYOUT = {
  decks: [1.65, 4.55, 7.45, 10.35],
  ladderX: [-1.08, 0, -1.08],
  ladderDirection: [1, -1, 1],
  boardingZ: -1.1,
  roofLadderZ: -0.62,
  roofLadderExitX: -0.9,
  hatchHalfWidth: 0.48,
  hatchRear: -1.1,
  hatchFront: 0.62,
  ladderFootZ: -0.88,
  ladderExitZ: 0.08,
  bridgeLength: 2.6,
  passageHalfWidth: 1.05
} as const;

export function createSiegeTowerModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-siege-tower";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = [0x80603e, 0x957148, 0xa37d50, 0x896541].map(color => new THREE.MeshLambertMaterial({ color }));
  const dark = new THREE.MeshLambertMaterial({ color: 0x4c3827 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x343b3c });
  const rope = new THREE.MeshLambertMaterial({ color: 0xc4ad7b });
  const hides = [0x8c7960, 0xa18d70, 0x97836a, 0xb09a7a].map(color => new THREE.MeshLambertMaterial({ color }));
  const materials = [...wood, dark, iron, rope, ...hides];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = wood[0]) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = wood[0], round = false) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), width);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  function ring(inner: number, outer: number, depth: number) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  const felloe = ring(0.66, 0.87, 0.32);
  const tire = ring(0.87, 0.9, 0.35);
  for (const x of [-1.85, 1.85]) {
    beam("axle", v(x, 0.9, -2.7), v(x, 0.9, 2.7), 0.22, dark, true);
    box("axle-bolster", x, 1.16, 0, 0.5, 0.4, 4.2, dark);
    for (const side of [-1, 1]) {
      const z = side * 2.42;
      add("wheel-felloe", felloe, wood[0]).position.set(x, 0.9, z);
      add("wheel-iron-tire", tire, iron).position.set(x, 0.9, z);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        beam("wheel-spoke", v(x, 0.9, z), v(x + Math.cos(a) * 0.77, 0.9 + Math.sin(a) * 0.77, z), 0.1, wood[i % 4]);
      }
      beam("wheel-hub", v(x, 0.9, z - 0.24), v(x, 0.9, z + 0.24), 0.24, dark, true);
      beam("axle-linchpin", v(x, 0.72, side * 2.7), v(x, 1.08, side * 2.7), 0.045, iron, true);
    }
  }
  for (const z of [-1.8, 1.8]) box("chassis-rail", 0, 1.4, z, 5.5, 0.45, 0.4, dark);
  const half = (y: number) => 2.12 - (y - 1.5) * 0.045;
  const levels = SIEGE_TOWER_LAYOUT.decks;
  const layout = SIEGE_TOWER_LAYOUT;
  // Slightly battered posts carry the floors; the rear remains open to reveal the joinery and ladders.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      beam("corner-post", v(sx * half(1.5), 1.5, sz * 1.8), v(sx * half(10.5), 10.5, sz * 1.8), 0.28);
      for (const y of levels) box("post-iron-collar", sx * half(y), y + 0.2, sz * 1.8, 0.32, 0.13, 0.32, iron);
    }
  for (let level = 0; level < levels.length; level++) {
    const y = levels[level],
      h = half(y);
    const hatchX = level > 0 ? layout.ladderX[level - 1] : null;
    const incomingDirection = level > 0 ? layout.ladderDirection[level - 1] : 1;
    const roof = level === 3;
    const hatchMinX = roof ? -1.5 : (hatchX ?? 0) - layout.hatchHalfWidth;
    const hatchMaxX = roof ? -0.45 : (hatchX ?? 0) + layout.hatchHalfWidth;
    const hatchRear = roof
      ? layout.roofLadderZ - layout.hatchHalfWidth
      : incomingDirection > 0
        ? layout.hatchRear
        : -layout.hatchFront;
    const hatchFront = roof
      ? layout.roofLadderZ + layout.hatchHalfWidth
      : incomingDirection > 0
        ? layout.hatchFront
        : -layout.hatchRear;
    // Joists stay outside the openings; transverse headers and trimmers carry the cut deck.
    for (const z of [-1.56, 1.56]) box("floor-joist", 0, y - 0.17, z, h * 2 + 0.25, 0.22, 0.18, dark);
    if (hatchX !== null) {
      for (const z of [hatchRear - 0.09, hatchFront + 0.09])
        box(
          "hatch-header",
          roof ? (hatchMinX + hatchMaxX) / 2 : 0,
          y - 0.17,
          z,
          roof ? hatchMaxX - hatchMinX : h * 2,
          0.22,
          0.16,
          dark
        );
      for (const x of [hatchMinX - 0.08, hatchMaxX + 0.08])
        box("hatch-trimmer", x, y - 0.17, (hatchRear + hatchFront) / 2, 0.14, 0.22, hatchFront - hatchRear, dark);
    }
    // Split every affected plank at the exact hatch boundary, rather than cutting a cosmetic hole.
    for (let i = 0; i < 20; i++) {
      const left = -h + (i * h * 2) / 20;
      const right = left + (h * 2) / 20;
      const cuts = [left, right];
      if (hatchX !== null) for (const edge of [hatchMinX, hatchMaxX]) if (edge > left && edge < right) cuts.push(edge);
      if (roof) for (const edge of [0.32, 1.48]) if (edge > left && edge < right) cuts.push(edge);
      cuts.sort((a, b) => a - b);
      for (let j = 0; j < cuts.length - 1; j++) {
        const x = (cuts[j] + cuts[j + 1]) / 2;
        const width = cuts[j + 1] - cuts[j] - 0.006;
        if (width <= 0) continue;
        const overHatch = hatchX !== null && x > hatchMinX && x < hatchMaxX;
        const spans = overHatch
          ? [
              [-1.77, hatchRear],
              [hatchFront, 1.77]
            ]
          : [[-1.77, 1.77]];
        for (const [start, end] of spans) {
          // The operating rope wheel rises through a narrow outer-edge slot at the archer deck.
          const deckEnd = roof && x > 0.32 && x < 1.48 ? Math.min(end, 1.66) : end;
          box("floor-plank", x, y, (start + deckEnd) / 2, width, 0.12, deckEnd - start, wood[i % 4]);
        }
      }
    }
    // Side guards stop before the landing at the incoming flight's exit end.
    if (hatchX !== null && !roof)
      for (const side of [-1, 1]) {
        const x = hatchX + side * (layout.hatchHalfWidth + 0.08);
        for (const z of [hatchRear - incomingDirection * 0.08, hatchFront - incomingDirection * 0.08])
          box("hatch-guard-post", x, y + 0.55, z, 0.07, 1.05, 0.07);
        beam(
          "hatch-guard-rail",
          v(x, y + 1.05, hatchRear - incomingDirection * 0.08),
          v(x, y + 1.05, hatchFront - incomingDirection * 0.08),
          0.065
        );
      }
    if (roof)
      for (const z of [hatchRear - 0.08, hatchFront + 0.08]) {
        for (const x of [hatchMinX, hatchMaxX - 0.08]) box("hatch-guard-post", x, y + 0.55, z, 0.07, 1.05, 0.07);
        beam("hatch-guard-rail", v(hatchMinX, y + 1.05, z), v(hatchMaxX - 0.08, y + 1.05, z), 0.065);
      }
    for (const side of [-1, 1]) {
      const z = side * 1.8;
      box("level-tie", 0, y - 0.16, z, h * 2, 0.22, 0.22);
      if (level === levels.length - 1) continue;
      beam("side-diagonal-brace", v(-h + 0.1, y + 0.2, z), v(half(y + 2.7) - 0.1, y + 2.7, z), 0.16, dark);
      beam("side-diagonal-brace", v(h - 0.1, y + 0.2, z), v(-half(y + 2.7) + 0.1, y + 2.7, z), 0.16, dark);
      // Individually laid side planks and hide tiles leave narrow arrow slits in the middle tier.
      for (let row = 0; row < 9; row++) {
        const py = y + 0.36 + row * 0.27;
        const ph = half(py);
        for (const section of [-1, 1]) {
          const slit = row >= 4 && row <= 6;
          const gap = slit ? 0.15 : 0.012;
          box(
            "side-cladding",
            section * (ph / 2 + gap / 2),
            py,
            z + side * 0.12,
            ph - gap,
            0.257,
            0.08,
            wood[(row + level) % 4]
          );
        }
      }
      for (let col = 0; col < 4; col++)
        for (let row = 0; row < 3; row++) {
          if (col === 1 && row === 1) continue;
          const py = y + 0.61 + row * 0.78;
          const x = (-1.5 + col) * ((half(py) * 2) / 4);
          box(
            "hide-panel",
            x,
            py,
            z + side * 0.18,
            (half(py) * 2) / 4 - 0.04,
            0.73,
            0.035,
            hides[(col + row + level) % 4]
          );
          for (const dx of [-0.32, 0.32])
            box("hide-fastener", x + dx, py + 0.29, z + side * 0.205, 0.035, 0.035, 0.025, iron);
        }
    }
    // Front protection stops at the bridge deck to leave a full-height assault doorway.
    if (level < 2)
      for (let row = 0; row < 10; row++) {
        const py = y + 0.3 + row * 0.26;
        box("front-plank", half(py) + 0.1, py, 0, 0.1, 0.25, 3.5, wood[row % 4]);
        for (let col = 0; col < 4; col++)
          box("front-hide-panel", half(py) + 0.17, py, -1.3 + col * 0.87, 0.035, 0.245, 0.83, hides[(row + col) % 4]);
      }
    if (level < levels.length - 1) {
      const x = layout.ladderX[level];
      const upperY = levels[level + 1];
      const directionZ = layout.ladderDirection[level];
      const roofFlight = level === 2;
      const bottom = roofFlight
        ? v(layout.roofLadderExitX - 0.2, y + 0.1, layout.roofLadderZ)
        : v(x, y + 0.1, directionZ * layout.ladderFootZ);
      const exit = roofFlight
        ? v(layout.roofLadderExitX, upperY + 0.06, layout.roofLadderZ)
        : v(x, upperY + 0.06, directionZ * layout.ladderExitZ);
      const rungOffset = roofFlight ? v(0, 0, 0.35) : v(0.35, 0, 0);
      const direction = exit.clone().sub(bottom);
      const top = exit.clone().addScaledVector(direction, 0.85 / direction.y);
      // Lower flights are transverse; the exposed roof ascent faces the enemy (+X).
      for (const side of [-1, 1])
        beam(
          "ladder-stile",
          bottom.clone().addScaledVector(rungOffset, side),
          top.clone().addScaledVector(rungOffset, side),
          0.075,
          wood[2]
        );
      for (let i = 0; i < 11; i++) {
        const p = bottom.clone().lerp(exit, i / 11);
        beam("ladder-rung", p.clone().sub(rungOffset), p.clone().add(rungOffset), 0.055, wood[1], true);
      }
      // Lower flights meet at adjacent landings; the roof flight keeps archers facing the enemy.
    }
    // Rear safety rails frame the open access side.
    if (level < levels.length - 1)
      for (const z of level === 0 ? [0.45, 1.1] : [-1.1, 1.1])
        box("rear-rail", -half(y + 1), y + 1, z, 0.12, 0.15, 1.15);
  }
  // Rear boarding ladder reaches the otherwise elevated chassis deck from ground level.
  const entryFoot = v(-3.45, 0.1, layout.boardingZ);
  const entryTop = v(-1.95, levels[0] + 0.06, layout.boardingZ);
  box("boarding-foot", -3.45, 0.06, layout.boardingZ, 0.3, 0.12, 1.05, dark);
  for (const side of [-1, 1])
    beam(
      "boarding-stile",
      entryFoot.clone().add(v(0, 0, side * 0.43)),
      entryTop.clone().add(v(0, 0, side * 0.43)),
      0.08
    );
  for (let i = 1; i <= 7; i++) {
    const p = entryFoot.clone().lerp(entryTop, i / 7);
    beam("boarding-rung", p.clone().add(v(0, 0, -0.43)), p.clone().add(v(0, 0, 0.43)), 0.055, wood[1], true);
  }
  // A distinct upper shooting deck follows fig. 32: archers cover the assault from above.
  for (const side of [-1, 1]) {
    box("upper-parapet", 0, 10.89, side * 1.88, 3.55, 1.08, 0.14);
    for (let i = 0; i < 6; i++)
      box("parapet-merlon", -1.5 + i * 0.6, 11.54, side * 1.88, 0.38, 0.28, 0.16, wood[i % 4]);
  }
  box("archer-rear-parapet", -half(10.35), 10.89, 0, 0.16, 1.08, 3.6);
  box("archer-front-parapet", half(10.35), 10.89, 0, 0.16, 1.08, 3.6);
  for (const z of [-1.55, -0.93, -0.31, 0.31, 0.93, 1.55])
    box("archer-front-merlon", half(10.35), 11.54, z, 0.18, 0.28, 0.4);
  // The lowered bridge rests on the target wall in use. Its hoists run outside the walking width.
  const hingeX = half(7.45) + 0.08;
  box("bridge-threshold", hingeX - 0.1, 7.45, 0, 0.45, 0.12, 2.55);
  for (const side of [-1, 1])
    beam("bridge-hinge", v(hingeX, 7.4, side * 1.29), v(hingeX, 7.4, side * 1.52), 0.09, iron, true);
  for (const z of [-1.1, 1.1])
    box("bridge-stringer", hingeX + layout.bridgeLength / 2, 7.28, z, layout.bridgeLength, 0.22, 0.2, dark);
  for (let i = 0; i < 16; i++)
    box(
      "bridge-plank",
      hingeX + ((i + 0.5) * layout.bridgeLength) / 16,
      7.45,
      0,
      layout.bridgeLength / 16 - 0.006,
      0.12,
      2.55,
      wood[i % 4]
    );
  // A single overhead shaft winds both bridge ropes together. The operating loop stays at the side.
  const shaftX = 0.9,
    shaftY = 10.02;
  beam("winch-common-shaft", v(shaftX, shaftY, -1.67), v(shaftX, shaftY, 1.8), 0.085, iron, true);
  for (const side of [-1, 1]) {
    const z = side * 1.48;
    box("assault-door-jamb", hingeX, 8.9, side * 1.63, 0.22, 2.8, 0.2);
    box("front-cheek", hingeX, 8.7, side * 1.48, 0.12, 2.4, 0.22);
    box("bridge-lifting-lug", hingeX + layout.bridgeLength - 0.08, 7.44, side * 1.37, 0.14, 0.1, 0.32, iron);
    const sheave = v(hingeX, 10.2, z);
    beam("bridge-hoist-rope", v(hingeX + layout.bridgeLength - 0.08, 7.51, z), sheave, 0.035, rope, true);
    beam("winch-rope", sheave, v(shaftX + 0.13, shaftY, z), 0.035, rope, true);
    const pulley = add("hoist-pulley", new THREE.TorusGeometry(0.13, 0.035, 6, 16), iron);
    pulley.position.copy(sheave);
    box("pulley-cheek", hingeX, 10.2, z + side * 0.07, 0.36, 0.4, 0.04, dark);
    beam("pulley-axle", sheave.clone().add(v(0, 0, -0.12)), sheave.clone().add(v(0, 0, 0.12)), 0.045, iron, true);
    box("winch-bearing", shaftX, shaftY, side * 1.73, 0.32, 0.36, 0.16, dark);
    beam("winch-drum", v(shaftX, shaftY, z - 0.14), v(shaftX, shaftY, z + 0.14), 0.12, dark, true);
    for (let i = 0; i < 8; i++) {
      const coil = add("winch-rope-coil", new THREE.TorusGeometry(0.14, 0.018, 5, 12), rope);
      coil.position.set(shaftX, shaftY, z - 0.105 + i * 0.03);
    }
  }
  const wheelZ = 1.75,
    radius = 0.5;
  const wheel = add("winch-operating-wheel", new THREE.TorusGeometry(radius, 0.045, 8, 24), wood[1]);
  wheel.position.set(shaftX, shaftY, wheelZ);
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    beam(
      "winch-wheel-spoke",
      v(shaftX, shaftY, wheelZ),
      v(shaftX + Math.cos(angle) * radius, shaftY + Math.sin(angle) * radius, wheelZ),
      0.045
    );
  }
  // One continuous hand-rope loop operates the common shaft without a waist-high crossbar.
  const loop = new THREE.CurvePath<THREE.Vector3>();
  const lowerY = 8.35;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const angle = (i * Math.PI) / 16;
    points.push(v(shaftX + radius * Math.cos(angle), shaftY + radius * Math.sin(angle), wheelZ));
  }
  points.push(v(shaftX - radius, lowerY, wheelZ));
  for (let i = 0; i <= 16; i++) {
    const angle = Math.PI + (i * Math.PI) / 16;
    points.push(v(shaftX + radius * Math.cos(angle), lowerY + radius * Math.sin(angle), wheelZ));
  }
  points.push(points[0]);
  for (let i = 1; i < points.length; i++) loop.add(new THREE.LineCurve3(points[i - 1], points[i]));
  add("winch-hand-rope", new THREE.TubeGeometry(loop, 80, 0.025, 6, true), rope);
  const ratchet = add("winch-ratchet", new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), iron);
  ratchet.rotation.x = Math.PI / 2;
  ratchet.position.set(shaftX, shaftY, 1.35);
  beam("winch-pawl", v(shaftX - 0.3, shaftY + 0.1, 1.35), v(shaftX - 0.1, shaftY + 0.18, 1.35), 0.05, iron);
  beam("pawl-release-cord", v(shaftX - 0.3, shaftY + 0.1, 1.35), v(shaftX - 0.3, 8.4, 1.35), 0.018, rope, true);
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createSiegeTower() {
  const model = createSiegeTowerModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
