import { assemblyHall } from "./civicParts";
import { type MedievalModel, ModelKit } from "./modelKit";

function press(k: ModelKit, x: number, z: number) {
  for (const s of [-1, 1]) k.box("press-upright", [x + s * 0.8, 1.5, z], [0.23, 3, 0.23]);
  k.box("press-head", [x, 2.8, z], [2, 0.3, 0.45]);
  k.cylinder("wooden-press-screw", [x, 2.1, z], 0.13, 1.2, "wood");
  const points = Array.from({ length: 97 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return [x + Math.cos(a) * 0.14, 1.65 + i * 0.01, z + Math.sin(a) * 0.14] as const;
  });
  k.tube("screw-thread", points, 0.025, "oak");
  k.beam("press-bar", [x - 0.75, 2.05, z], [x + 0.85, 2.05, z], 0.07, "wood", true);
  k.box("press-platen", [x, 1.45, z], [1.35, 0.18, 0.85], "wood");
  k.table(x, z + 0.55, 1.7, 1.8, 0.8);
  k.box("sliding-type-bed", [x, 0.96, z + 0.55], [1.3, 0.15, 1.5], "dark");
  k.box("printed-sheet", [x, 1.05, z + 0.65], [1.05, 0.012, 0.8], "white");
  for (let i = 0; i < 6; i++) k.box("type-row", [x, 1.06, z + 0.38 + i * 0.1], [0.8, 0.008, 0.02], "dark");
}
export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "early-printing-workshop",
    name: "Early printing workshop",
    task: 38,
    size: [11, 10, 7],
    note: "Mid-fifteenth-century or later wooden screw press with platen, sliding type bed, paper shelves, type cases and drying sheets. An open workshop distinct from the printers' guild hall.",
    create() {
      const k = new ModelKit("early-printing-workshop");
      k.hall(0, -1, 8, 5, 3.4, 1.4, { open: true, roof: "wood" });
      press(k, -1, 0);
      for (const x of [2, 3.5]) k.box("paper-shelf-upright", [x, 1.5, -2.6], [0.12, 3, 0.12]);
      for (const y of [0.5, 1.3, 2.1]) {
        k.box("paper-shelf", [2.75, y, -2.6], [1.8, 0.1, 0.8], "wood");
        k.box("paper-stack", [2.75, y + 0.15, -2.6], [1.5, 0.2, 0.65], "white");
      }
      for (let i = 0; i < 4; i++) k.box("drying-sheet", [-2.5 + i * 1.3, 2.7, 1.7], [0.8, 0.6, 0.015], "white");
      k.beam("drying-cord", [-3.2, 3, 1.7], [2.8, 3, 1.7], 0.015, "cloth", true);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "printers-guild-hall",
    name: "Printers' guild hall",
    task: 38,
    size: [20, 14, 11],
    note: "Late-fifteenth/sixteenth-century printers' assembly hall with book and press emblems, paper inspection table and a demonstration screw press under the loggia. Not an early medieval model.",
    create() {
      const k = assemblyHall("printers-guild-hall", 12, 7);
      press(k, -2, 0);
      k.box("book-emblem-left", [-0.32, 5.5, 3.78], [0.6, 0.8, 0.06], "white");
      k.box("book-emblem-right", [0.32, 5.5, 3.78], [0.6, 0.8, 0.06], "white");
      k.beam("book-spine", [0, 5.05, 3.82], [0, 5.95, 3.82], 0.06, "wood");
      k.table(2, 0, 2.3, 1.2, 0.85);
      k.box("guild-paper-stack", [2, 1, 0], [1.5, 0.2, 0.8], "white");
      return k.finish();
    }
  }
];
