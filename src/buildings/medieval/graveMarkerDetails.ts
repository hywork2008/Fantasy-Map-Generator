import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";

function roundedMarker(k: ModelKit, x: number, z: number, height: number, width: number) {
  const radius = width / 2,
    shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(radius, 0);
  shape.lineTo(radius, height - radius);
  shape.absarc(0, height - radius, radius, 0, Math.PI, false);
  shape.closePath();
  const mesh = k.add(
    "dressed-round-headed-marker",
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.015,
      curveSegments: 16
    }),
    "stone"
  );
  mesh.position.set(x, 0.18, z - 0.08);
  // No modern inscription: narrow weathering veins follow the dressed face.
  for (let i = 0; i < 7; i++) {
    const xx = x - width * 0.35 + i * width * 0.11;
    k.beam(
      "weathered-tool-stroke",
      [xx, 0.36 + (i % 3) * 0.07, z + 0.096],
      [xx + 0.018, 0.57 + (i % 3) * 0.07, z + 0.096],
      0.006,
      "earth"
    );
  }
}

function mound(k: ModelKit, x: number, z: number) {
  const cap = k.add("settled-earth-cap", new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), "earth");
  cap.position.set(x, 0, z);
  cap.scale.set(0.43, 0.14, 0.78);
  k.box("mound-ground", [x, 0.01, z], [0.55, 0.02, 1.1], "earth");
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    k.sphere(
      "loose-grave-pebble",
      [x + Math.cos(a) * 0.37, 0.025, z + Math.sin(a) * 0.69],
      [0.035, 0.025, 0.025],
      "stone"
    );
  }
}

/** Ledger top is split around the cross, leaving the carving physically recessed. */
function ledger(k: ModelKit, x: number, z: number) {
  k.box("ledger-foundation", [x, 0.065, z], [1.12, 0.13, 2.05], "stone");
  const xs = [-0.53, -0.27, -0.018, 0.018, 0.27, 0.53],
    zs = [-0.97, -0.6, -0.218, -0.182, 0.65, 0.97];
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2,
        cz = (zs[j] + zs[j + 1]) / 2;
      if ((Math.abs(cx) < 0.018 && cz > -0.6 && cz < 0.65) || (Math.abs(cx) < 0.27 && cz > -0.218 && cz < -0.182))
        continue;
      k.box("carved-ledger-face", [x + cx, 0.1575, z + cz], [xs[i + 1] - xs[i], 0.055, zs[j + 1] - zs[j]], "stone");
    }
  k.box("recessed-cross-stem", [x, 0.132, z + 0.025], [0.036, 0.004, 1.25], "earth");
  k.box("recessed-cross-arms", [x, 0.132, z - 0.2], [0.54, 0.004, 0.036], "earth");
}

export function createHighGraveMarker(kind: "stone" | "cross" | "ensemble") {
  const k = new ModelKit(`${kind}-grave-high`);
  if (kind === "stone") {
    mound(k, 0, 0.15);
    k.box("marker-socket", [0, 0.09, -0.52], [0.73, 0.18, 0.38], "stone");
    roundedMarker(k, 0, -0.52, 1.35, 0.58);
  } else if (kind === "cross") {
    mound(k, 0, 0.2);
    k.box("buried-timber-post", [0, 0.9, -0.52], [0.14, 1.8, 0.12], "oak");
    k.box("half-lapped-cross-arm", [0, 1.37, -0.49], [0.93, 0.14, 0.1], "wood");
    for (const y of [1.34, 1.4]) k.beam("wedged-joint-peg", [0, y, -0.59], [0, y, -0.425], 0.022, "wood", true);
    for (let i = 0; i < 6; i++) {
      const x = -0.052 + i * 0.02;
      k.beam("upright-grain", [x, 0.23, -0.454], [x + 0.006, 1.75 - (i % 2) * 0.08, -0.454], 0.004, "dark");
      k.beam("arm-grain", [-0.42, 1.32 + i * 0.018, -0.438], [0.42, 1.326 + i * 0.018, -0.438], 0.003, "oak");
    }
  } else {
    const sites = [
      [-2.05, 0.3],
      [0, -0.35],
      [2.05, 0.05]
    ];
    sites.forEach(([x, z], i) => {
      ledger(k, x, z);
      k.box("headstone-socket", [x, 0.09, z - 1.04], [0.76, 0.18, 0.4], "stone");
      roundedMarker(k, x, z - 1.04, 1.1 + i * 0.18, 0.55 + i * 0.05);
      k.box("footstone", [x, 0.17, z + 1.13], [0.4, 0.34, 0.16], "stone");
      for (let p = 0; p < 5; p++)
        k.sphere("edge-moss", [x - 0.55, 0.045, z - 0.8 + p * 0.34], [0.055, 0.025, 0.09], "green");
    });
  }
  return compactModel(k.finish());
}
