import { type MedievalModel, ModelKit } from "./modelKit";

function wheel(k: ModelKit, x: number, y: number, z: number, r: number) {
  k.ring("wheel-iron-tyre", [x, y, z], r, 0.035, "iron", true);
  k.ring("wooden-wheel-rim", [x, y, z], r - 0.045, 0.045, "wood", true);
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    k.beam("wheel-spoke", [x, y, z], [x + Math.cos(a) * (r - 0.08), y + Math.sin(a) * (r - 0.08), z], 0.055, "wood");
  }
  k.beam("wheel-hub", [x, y, z - 0.1], [x, y, z + 0.1], 0.16, "oak", true);
}
export const models: MedievalModel[] = [
  {
    id: "two-wheel-farm-cart",
    name: "Two-wheel farm cart",
    task: 9,
    size: [5.5, 2.5, 2.5],
    note: "Single-axle farm cart, spoked wheels, boarded cargo bed, removable side boards and paired draught shafts. No animal included.",
    create() {
      const k = new ModelKit("two-wheel-farm-cart");
      for (const z of [-0.9, 0.9]) wheel(k, 0, 0.685, z, 0.65);
      k.beam("cart-axle", [0, 0.685, -1.1], [0, 0.685, 1.1], 0.14, "iron", true);
      k.box("cart-bed", [0, 0.95, 0], [2.4, 0.12, 1.4], "wood");
      for (const z of [-0.7, 0.7]) {
        for (let i = 0; i < 3; i++) k.box("side-board", [0, 1.15 + i * 0.2, z], [2.4, 0.17, 0.06], "wood");
        k.beam("draught-shaft", [0.8, 0.7, z], [3.4, 0.8, z], 0.11);
      }
      k.box("tailboard", [-1.2, 1.3, 0], [0.08, 0.65, 1.4], "wood");
      return k.finish();
    }
  },
  {
    id: "wooden-wheelbarrow",
    name: "Single-wheel wooden barrow",
    task: 9,
    size: [3.9, 1.7, 1.5],
    note: "Medieval plank wheelbarrow with a single small wheel, splayed load tray, two handles and parking legs; no modern pressed-metal tub.",
    create() {
      const k = new ModelKit("wooden-wheelbarrow");
      wheel(k, 1, 0.385, 0, 0.35);
      k.beam("wheel-axle", [1, 0.385, -0.45], [1, 0.385, 0.45], 0.1, "iron", true);
      for (const z of [-0.4, 0.4]) {
        k.beam("barrow-frame-handle", [-1.8, 0.8, z], [1.2, 0.5, z], 0.1);
        k.box("parking-leg", [-0.65, 0.3, z], [0.1, 0.6, 0.1]);
        const wall = k.box("tray-side", [0, 0.9, z], [1.6, 0.5, 0.08], "wood");
        wall.rotation.x = Math.sign(z) * 0.3;
      }
      k.box("barrow-tray-floor", [0, 0.65, 0], [1.6, 0.1, 0.75], "wood");
      for (const x of [-0.8, 0.8]) k.box("tray-end", [x, 0.9, 0], [0.08, 0.5, 0.9], "wood");
      return k.finish();
    }
  },
  {
    id: "two-person-handbarrow",
    name: "Two-person carrying barrow",
    task: 9,
    size: [3.8, 1.4, 1],
    note: "Wheel-less handbarrow for two bearers, slatted deck, four projecting grips and short feet; a small site and market carrying platform.",
    create() {
      const k = new ModelKit("two-person-handbarrow");
      for (const z of [-0.45, 0.45]) {
        k.box("carrying-pole", [0, 0.65, z], [3.6, 0.09, 0.09]);
        for (const x of [-0.7, 0.7]) k.box("barrow-foot", [x, 0.32, z], [0.1, 0.64, 0.1]);
      }
      for (let i = 0; i < 9; i++) k.box("deck-slat", [-0.8 + i * 0.2, 0.73, 0], [0.17, 0.08, 1.05], "wood");
      return k.finish();
    }
  }
];
