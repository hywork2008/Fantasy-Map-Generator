import { createChurchyardCross, createLychGate } from "../props/churchyardProps";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

/**
 * Furniture of a Christian churchyard (docs/plan/bv-town-church-tiers.md). The churchyard's depth grows with
 * the town (20 / 30 / 40 m, `vectorCivicLayout`). The civic centre places them (`civicFurniture.ts`).
 */
export const models: MedievalModel[] = [
  {
    author: "Claude Sonnet 5.5",
    id: "churchyard-cross",
    name: "Churchyard cross",
    task: 60,
    size: [2.4, 2.4, 5.4],
    note: "A stone cross on three square steps and a socket stone, with a tapering shaft and a knop. Stands south of the church in the churchyard.",
    create: () => createChurchyardCross("low")
  },
  {
    author: "Claude Sonnet 5.5",
    id: "lych-gate",
    name: "Lych-gate",
    task: 60,
    size: [3.3, 5.1, 4.2],
    note: "A timber-framed roofed gate at the churchyard entrance with a bier slab in the middle, benches and two plank gates. The roof ridge runs along the path; the street side is +Z.",
    create: () => createLychGate("low")
  }
];

registerHighVariants(models, {
  "churchyard-cross": () => createChurchyardCross("high"),
  "lych-gate": () => createLychGate("high")
});
