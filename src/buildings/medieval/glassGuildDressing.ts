import * as THREE from "three";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";
import { ModelKit, type Surface } from "./modelKit";
import { addCraftBench } from "./workshopDetailKit";

function glassVessel(
  k: ModelKit,
  kind: "goblet" | "beaker" | "bottle",
  x: number,
  z: number,
  radius: number,
  height: number,
  surface: Surface
) {
  // Outer wall, lip, inner wall and floor form one open vessel; no disk closes the mouth.
  const profiles = {
    goblet: [
      [0, 0],
      [0.8, 0],
      [0.9, 0.07],
      [0.72, 0.1],
      [0.19, 0.13],
      [0.15, 0.42],
      [0.24, 0.5],
      [0.8, 0.6],
      [1, 0.84],
      [0.95, 1],
      [0.85, 1],
      [0.89, 0.84],
      [0.71, 0.63],
      [0, 0.55],
      [0, 0]
    ],
    beaker: [
      [0, 0],
      [0.72, 0],
      [0.84, 0.08],
      [0.96, 0.9],
      [1, 1],
      [0.9, 1],
      [0.86, 0.9],
      [0.74, 0.13],
      [0.6, 0.08],
      [0, 0.08]
    ],
    bottle: [
      [0, 0],
      [0.72, 0],
      [0.95, 0.1],
      [1, 0.35],
      [0.95, 0.52],
      [0.62, 0.67],
      [0.25, 0.74],
      [0.24, 0.94],
      [0.32, 0.96],
      [0.32, 1],
      [0.18, 1],
      [0.18, 0.76],
      [0.55, 0.69],
      [0.85, 0.53],
      [0.89, 0.35],
      [0.8, 0.14],
      [0, 0.06],
      [0, 0]
    ]
  };
  const mesh = k.add(
    `glass-sample-${kind}`,
    new THREE.LatheGeometry(
      profiles[kind].map(([r, y]) => new THREE.Vector2(r * radius, y * height)),
      20
    ),
    surface
  );
  mesh.position.set(x, 0.95, z);
}

/** Trade-specific additions only: the hall shell and stair belong to the shared guild factory. */
export function createGlassGuildDressing() {
  const k = new ModelKit("glassworking-guild-trade-dressing"),
    front = GUILD_HALL_PROFILE.depth / 2;
  k.box("guild-trade-plaque", [0, 6.12, front + 0.14], [1.4, 0.65, 0.12], "wood");
  for (let sector = 0; sector < 4; sector++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(0, 0, 0.285, (sector * Math.PI) / 2, ((sector + 1) * Math.PI) / 2, false);
    shape.closePath();
    const glass = k.add("guild-medallion-glass", new THREE.ShapeGeometry(shape, 5), sector % 2 ? "water" : "straw");
    glass.position.set(0, 6.12, front + 0.201);
  }
  const rim = k.add("medallion-lead-rim", new THREE.TorusGeometry(0.293, 0.016, 4, 24), "iron");
  rim.position.set(0, 6.12, front + 0.215);
  for (const angle of [0, Math.PI / 2])
    k.beam(
      "medallion-lead-division",
      [-Math.cos(angle) * 0.28, 6.12 - Math.sin(angle) * 0.28, front + 0.216],
      [Math.cos(angle) * 0.28, 6.12 + Math.sin(angle) * 0.28, front + 0.216],
      0.016,
      "iron"
    );
  for (const side of [-1, 1]) {
    k.beam(
      "goblet-emblem-bowl",
      [side * 0.43, 6.32, front + 0.215],
      [side * 0.57, 6.13, front + 0.215],
      0.025,
      "white"
    );
    k.beam(
      "goblet-emblem-bowl",
      [side * 0.69, 6.32, front + 0.215],
      [side * 0.57, 6.13, front + 0.215],
      0.025,
      "white"
    );
    k.beam(
      "goblet-emblem-stem",
      [side * 0.57, 6.13, front + 0.215],
      [side * 0.57, 5.96, front + 0.215],
      0.025,
      "white"
    );
    k.box("goblet-emblem-foot", [side * 0.57, 5.96, front + 0.215], [0.19, 0.025, 0.025], "white");
  }

  const benchX = GUILD_HALL_PROFILE.width * 0.2;
  for (const x of [-benchX, benchX]) addCraftBench(k, x, -0.65, 2.5, 1.1, 0.95);
  glassVessel(k, "goblet", -benchX - 0.9, -0.5, 0.12, 0.34, "water");
  glassVessel(k, "goblet", -benchX - 0.3, -0.5, 0.12, 0.38, "water");
  glassVessel(k, "beaker", -benchX + 0.3, -0.5, 0.11, 0.27, "water");
  glassVessel(k, "beaker", -benchX + 0.9, -0.5, 0.11, 0.3, "water");
  for (let i = 0; i < 3; i++) glassVessel(k, "bottle", benchX - 0.8 + i * 0.7, -0.45, 0.125, 0.38 + i * 0.03, "green");
  // The sample board brings its own rack; changing the dressing never cuts the shared host wall.
  for (const dx of [-0.72, 0.72]) {
    k.box("sample-rack-foot", [benchX + dx, 0.985, -1.01], [0.12, 0.07, 0.26], "oak");
    k.box("sample-rack-upright", [benchX + dx, 1.16, -1.01], [0.08, 0.35, 0.08], "oak");
  }
  k.box("inspection-panel-backing", [benchX, 1.32, -1.01], [1.65, 0.56, 0.055], "wood");
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 2; row++) {
      const x = benchX - 0.57 + column * 0.38,
        y = 1.2 + row * 0.24;
      k.box("inspection-glass-pane", [x, y, -0.975], [0.36, 0.22, 0.018], (column + row) % 2 ? "water" : "straw");
    }
  for (const dx of [-0.76, -0.38, 0, 0.38, 0.76])
    k.box("panel-lead-mullion", [benchX + dx, 1.32, -0.957], [0.022, 0.5, 0.022], "iron");
  for (const y of [1.08, 1.32, 1.56]) k.box("panel-lead-transom", [benchX, y, -0.957], [1.56, 0.022, 0.022], "iron");
  k.beam("glass-inspection-rule", [-benchX - 1.1, 0.964, -0.13], [-benchX + 1.1, 0.964, -0.13], 0.025, "wood");
  return k.finish();
}
