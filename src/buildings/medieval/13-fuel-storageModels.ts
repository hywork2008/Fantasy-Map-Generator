import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "covered-firewood-stack",
    name: "Covered split-firewood stack",
    task: 13,
    size: [5, 4, 3.5],
    note: "Split firewood on raised sleepers, end retainers and a board shelter. Alternating courses leave drying air gaps.",
    create() {
      const k = new ModelKit("covered-firewood-stack");
      for (const x of [-1.5, 1.5]) k.box("stack-sleeper", [x, 0.12, 0], [0.25, 0.24, 1.8]);
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 10; col++)
          k.beam(
            "split-firewood",
            [-1.55 + col * 0.34, 0.35 + row * 0.19, -0.65],
            [-1.55 + col * 0.34, 0.35 + row * 0.19, 0.65],
            0.16,
            row % 2 ? "wood" : "oak"
          );
      for (const x of [-1.85, 1.85])
        for (const z of [-1, 1]) k.box("fuel-shelter-post", [x, 1.25, z], [0.12, 2.5, 0.12]);
      k.roof(0, 0, 4.2, 2.7, 2.5, 0.55, "wood");
      return k.finish();
    }
  },
  {
    id: "brushwood-faggots",
    name: "Bound brushwood faggots",
    task: 13,
    size: [4, 3, 2],
    note: "Bundles of small branches tied with flexible withies, stacked on a timber rack. Fuel for domestic ovens and small furnaces.",
    create() {
      const k = new ModelKit("brushwood-faggots");
      for (const z of [-0.55, 0.55]) k.box("brushwood-sleeper", [0, 0.1, z], [3.3, 0.2, 0.2]);
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < 4; i++) {
          const x = -1.2 + i * 0.8,
            y = 0.405 + row * 0.42;
          for (let j = 0; j < 7; j++)
            k.beam(
              "brushwood-branch",
              [x + Math.cos((j * Math.PI) / 3.5) * 0.18, y + Math.sin((j * Math.PI) / 3.5) * 0.18, -0.8],
              [x + Math.cos((j * Math.PI) / 3.5) * 0.18, y + Math.sin((j * Math.PI) / 3.5) * 0.18, 0.8],
              0.055,
              "wood",
              true
            );
          for (const z of [-0.45, 0.45]) {
            const hoop = k.ring("faggot-binding", [x, y, z], 0.24, 0.025, "cloth", true);
            hoop.scale.y = 0.85;
          }
        }
      return k.finish();
    }
  },
  {
    id: "charcoal-bin",
    name: "Covered charcoal store",
    task: 13,
    size: [5, 4, 4],
    note: "Dry charcoal heap in a boarded bay under a lean shelter; low partitions and a loading shovel distinguish it from a woodpile.",
    create() {
      const k = new ModelKit("charcoal-bin");
      k.hall(0, 0, 3.8, 2.5, 2.6, 0.8, { open: true, roof: "wood" });
      for (const x of [-1.7, 1.7]) k.box("bin-side", [x, 0.65, 0], [0.1, 1.3, 2.2], "wood");
      k.box("bin-back", [0, 0.65, -1.1], [3.5, 1.3, 0.1], "wood");
      k.box("charcoal-bed", [0, 0.08, 0], [3.2, 0.16, 1.9], "dark");
      for (let i = 0; i < 28; i++)
        k.sphere(
          "charcoal-lump",
          [-1.3 + (i % 7) * 0.42, 0.25 + Math.floor(i / 7) * 0.18, -0.7 + Math.floor(i / 7) * 0.43],
          [0.27, 0.2, 0.26],
          "dark"
        );
      k.beam("shovel-handle", [2, 0.2, 0.8], [2, 1.6, 0.2], 0.05, "wood", true);
      k.box("shovel-blade", [2, 0.15, 0.8], [0.35, 0.25, 0.05], "iron");
      return k.finish();
    }
  }
];
