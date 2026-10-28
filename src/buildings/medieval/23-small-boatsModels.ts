import * as THREE from "three";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit, type Position } from "./modelKit";

function boat(fishing: boolean) {
  const k = new ModelKit(fishing ? "fishing-boat" : "rowing-boat");
  const length = fishing ? 5.5 : 3.8,
    half = fishing ? 0.95 : 0.72;
  const stations = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12,
      x = (t - 0.5) * length,
      width = Math.sin(Math.PI * t) * half,
      top = 0.85 + 0.22 * Math.abs(t - 0.5) * 2;
    return [
      [x, top, -width],
      [x, 0.28, -width * 0.75],
      [x, 0.08, 0],
      [x, 0.28, width * 0.75],
      [x, top, width]
    ] as Position[];
  });
  for (let row = 0; row < 4; row++) {
    const vertices: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = stations[i][row],
        b = stations[i + 1][row],
        c = stations[i + 1][row + 1],
        d = stations[i][row + 1];
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    k.add("clinker-hull-strake", geo, row % 2 ? "wood" : "oak");
  }
  k.beam("keel", [-length / 2, 0.08, 0], [length / 2, 0.08, 0], 0.16, "oak");
  for (const side of [0, 4])
    k.tube(
      "gunwale",
      stations.map(s => s[side]),
      0.05,
      "wood"
    );
  for (const i of [3, 5, 7, 9]) {
    k.tube("internal-rib", stations[i], 0.035, "wood");
    const x = stations[i][0][0],
      width = Math.abs(stations[i][0][2]);
    k.box("rowing-thwart", [x, 0.73, 0], [0.24, 0.1, width * 1.8], "wood");
  }
  for (const s of [-1, 1]) {
    k.beam("oar-shaft", [-0.3, 0.85, s * 0.4], [1.7, 0.9, s * 1.5], 0.055, "wood", true);
    const blade = k.box("oar-blade", [2, 0.91, s * 1.65], [0.7, 0.055, 0.18], "wood");
    blade.rotation.y = -s * 0.5;
  }
  if (fishing) {
    k.attach(createMedievalContainerModel("basket", "empty"), [-1, 0.3, 0], 0.7);
    for (let i = 0; i < 12; i++) {
      k.beam("net-warp", [-1.6 + i * 0.18, 0.9, 0.1], [-1.6 + i * 0.18, 0.9, 0.7], 0.009, "cloth", true);
    }
    for (let i = 0; i < 5; i++)
      k.beam("net-weft", [-1.6, 0.9, 0.1 + i * 0.15], [0.4, 0.9, 0.1 + i * 0.15], 0.009, "cloth", true);
    for (let i = 0; i < 7; i++) k.sphere("net-float", [-1.6 + i * 0.3, 0.94, 0.7], [0.06, 0.06, 0.04], "wood");
  }
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "small-fishing-boat",
    name: "Small clinker fishing boat",
    task: 23,
    size: [6.2, 3.8, 1.5],
    note: "Open clinker-style hull with ribs, thwarts, two oars, a small fishing net, wooden floats and a catch basket. Hull keel is the display ground datum, not a waterline.",
    create: () => boat(true)
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "open-rowing-boat",
    name: "Open river rowing boat",
    task: 23,
    size: [4.7, 3.8, 1.5],
    note: "Small open rowboat with separate hull strakes, gunwales, ribs, rowing thwarts and oars. Displayed on its keel; no automatic CE water placement.",
    create: () => boat(false)
  }
];
