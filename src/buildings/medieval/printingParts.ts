import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { HouseDetailKit } from "./houseDetailKit";
import { ModelKit } from "./modelKit";
import { addPaperStack, fittedPrintingPress } from "./printingEquipment";
import { addCraftBench, addCraftShed } from "./workshopDetailKit";

export function printingWorkshopPartFactories(): ModelPartFactory[] {
  const definitions: [string, () => ReturnType<ModelKit["finish"]>][] = [
    [
      "shelter",
      () => {
        const k = new HouseDetailKit("printing-shelter");
        addCraftShed(k, 0, -0.8, 8, 5);
        return k.finish();
      }
    ],
    ["printing-press", () => fittedPrintingPress(-1.6, -0.4)],
    [
      "composing-station",
      () => {
        const k = new ModelKit("composing-station");
        addCraftBench(k, 2, -0.8, 2.2, 1, 0.95);
        k.box("type-case-bottom", [2, 0.975, -0.8], [1.8, 0.05, 0.8], "wood");
        for (let i = 0; i <= 6; i++) k.box("type-case-divider", [1.1 + i * 0.3, 1.04, -0.8], [0.025, 0.08, 0.8], "oak");
        for (let j = 0; j <= 3; j++)
          k.box("type-case-rail", [2, 1.04, -1.2 + (j * 0.8) / 3], [1.8, 0.08, 0.025], "oak");
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 3; j++)
            for (let n = 0; n < 3; n++)
              k.box("loose-type", [1.18 + i * 0.3 + n * 0.065, 1.027, -1.08 + j * 0.267], [0.045, 0.054, 0.1], "iron");
        k.box("composing-stick", [2, 1.11, -0.38], [0.8, 0.04, 0.05], "iron");
        return k.finish();
      }
    ],
    [
      "paper-storage",
      () => {
        const k = new ModelKit("paper-storage");
        for (const x of [1.85, 3.55])
          for (const z of [-2.98, -2.22]) k.box("paper-shelf-post", [x, 1.2, z], [0.1, 2.4, 0.1], "oak");
        for (const y of [0.4, 1.1, 1.8]) {
          k.box("paper-shelf", [2.7, y, -2.6], [1.9, 0.1, 0.9], "wood");
          addPaperStack(k, 2.7, y + 0.05, -2.6, 1.5);
        }
        k.beam("shelf-cross-brace", [1.85, 0.15, -3.02], [3.55, 2.3, -3.02], 0.06, "oak");
        return k.finish();
      }
    ],
    [
      "drying-rack",
      () => {
        const k = new ModelKit("drying-rack");
        for (const x of [-3.1, 3.1]) {
          k.box("drying-foot", [x, 0.06, 1.6], [0.65, 0.12, 0.65], "oak");
          k.box("drying-post", [x, 1.44, 1.6], [0.08, 2.72, 0.08], "wood");
        }
        k.beam("drying-cord", [-3.1, 2.72, 1.6], [3.1, 2.72, 1.6], 0.016, "cloth", true);
        for (const x of [-2.4, -0.8, 0.8, 2.4]) {
          k.box("drying-sheet", [x, 2.37, 1.6], [0.82, 0.52, 0.014], "white");
          for (const side of [-1, 1]) k.box("sheet-clip", [x + side * 0.28, 2.65, 1.6], [0.035, 0.16, 0.055], "wood");
          for (let row = 0; row < 7; row++)
            k.box("drying-proof-line", [x, 2.19 + row * 0.055, 1.609], [0.61, 0.009, 0.003], "dark");
        }
        return k.finish();
      }
    ]
  ];
  return definitions.map(([role, create]) => ({
    id: `printing-workshop:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  }));
}
