import { assemblyHall } from "./civicParts";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "instrument-makers-guild-hall",
    name: "Instrument makers' guild hall",
    task: 39,
    size: [20, 14, 11],
    note: "Specialist urban guild hall with a lute emblem, string-instrument inspection table and a small harp. An assembly and trade building for a suitable specialist town, not a universal village workshop.",
    create() {
      const k = assemblyHall("instrument-makers-guild-hall", 12, 7);
      k.box("lute-emblem-plaque", [0, 5.6, 3.7], [1.4, 1.6, 0.1], "wood");
      k.sphere("lute-emblem-body", [0, 5.35, 3.82], [0.36, 0.45, 0.06], "straw");
      k.box("lute-emblem-neck", [0, 5.95, 3.82], [0.1, 0.6, 0.08], "dark");
      k.table(-1, 0, 3, 1.2, 0.85);
      for (let i = 0; i < 3; i++) {
        const x = -1.8 + i * 0.85;
        k.sphere("lute-body", [x, 1.05, 0], [0.27, 0.12, 0.38], "wood");
        k.box("lute-neck", [x, 1.1, -0.5], [0.1, 0.07, 0.5], "oak");
        for (let j = 0; j < 5; j++)
          k.beam(
            "lute-string",
            [x - 0.04 + j * 0.02, 1.18, -0.7],
            [x - 0.04 + j * 0.02, 1.18, 0.2],
            0.003,
            "cloth",
            true
          );
      }
      k.beam("harp-pillar", [2, 0.2, 0.4], [2, 1.9, 0.4], 0.1);
      k.beam("harp-neck", [2, 1.9, 0.4], [3.2, 1.5, 0.4], 0.1);
      k.beam("harp-soundbox", [2, 0.2, 0.4], [3.2, 1.5, 0.4], 0.16, "wood");
      for (let i = 0; i < 9; i++) {
        const t = (i + 1) / 10;
        k.beam(
          "harp-string",
          [2 + t * 1.2, 0.2 + t * 1.3, 0.4],
          [2 + t * 1.2, 1.9 - t * 0.4, 0.4],
          0.008,
          "cloth",
          true
        );
      }
      return k.finish();
    }
  }
];
