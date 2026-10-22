import { assemblyHall } from "./civicParts";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "glassworkers-guild-hall",
    name: "Glassworkers' guild hall",
    task: 37,
    size: [20, 14, 11],
    note: "Specialist glass-trade assembly hall with a glazed medallion, inspection tables, goblet and bottle samples. It is a guild meeting house; no glass furnace is depicted.",
    create() {
      const k = assemblyHall("glassworkers-guild-hall", 12, 7);
      k.box("glazed-guild-panel", [0, 5.5, 3.7], [1.5, 1.5, 0.08], "dark");
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          k.box(
            "colored-glass-pane",
            [-0.45 + i * 0.45, 5.05 + j * 0.45, 3.76],
            [0.4, 0.4, 0.04],
            (i + j) % 2 ? "water" : "straw"
          );
      k.table(0, 0, 3, 1.2, 0.9);
      for (let i = 0; i < 5; i++) {
        const x = -1 + i * 0.5;
        k.cylinder("glass-foot", [x, 1, 0], 0.13, 0.04, "water");
        k.cylinder("glass-stem", [x, 1.18, 0], 0.025, 0.35, "water");
        k.vessel("goblet-bowl", [x, 1.32, 0], 0.16, 0.25, "water");
      }
      k.box("guild-banner", [-1.8, 5, 3.7], [0.65, 1.6, 0.04], "cloth");
      return k.finish();
    }
  }
];
