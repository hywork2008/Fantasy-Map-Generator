import { createFriary } from "../monasteries/friary";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "mendicant-friary",
    name: "Urban mendicant friary",
    task: 33,
    size: [85, 75, 15],
    note: "A CE-fitted urban friary: preaching nave and choir with apse, open bellcote, three domestic ranges, roofed cloister around an open garth, herb beds, orchard, well and precinct wall with an entrance. BV and CE use the same assembly. Illustrative high/late medieval proportions.",
    create: () => createFriary()
  }
];
