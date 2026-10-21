import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "permanent-town-gallows",
    name: "Permanent timber gallows",
    task: 36,
    size: [8, 7, 6],
    note: "Unoccupied permanent gallows for the outskirts of a town with judicial rights: stone post sockets, braced timber frame, suspended ropes and an access ladder. No people or remains.",
    create() {
      const k = new ModelKit("permanent-town-gallows");
      for (const x of [-2.4, 2.4]) {
        k.box("post-stone-socket", [x, 0.2, 0], [0.75, 0.4, 0.75], "stone");
        k.box("gallows-upright", [x, 2.2, 0], [0.28, 4.2, 0.28]);
        k.beam("gallows-knee-brace", [x, 3.2, 0], [x - Math.sign(x) * 1, 4.2, 0], 0.18);
      }
      k.box("gallows-crossbeam", [0, 4.3, 0], [5.6, 0.3, 0.3]);
      for (const x of [-1, 1]) {
        k.beam("hanging-rope", [x, 4.15, 0], [x, 2.7, 0], 0.025, "cloth", true);
        const loop = k.ring("empty-rope-loop", [x, 2.35, 0], 0.22, 0.024, "cloth", true);
        loop.scale.y = 1.4;
      }
      for (const x of [1.6, 2.15]) k.beam("ladder-rail", [x, 0.12, 2.3], [x, 4.1, 0.3], 0.08, "wood");
      for (let i = 0; i < 10; i++)
        k.beam(
          "ladder-rung",
          [1.6, 0.25 + i * 0.39, 2.23 - i * 0.196],
          [2.15, 0.25 + i * 0.39, 2.23 - i * 0.196],
          0.06,
          "wood",
          true
        );
      return k.finish();
    }
  }
];
