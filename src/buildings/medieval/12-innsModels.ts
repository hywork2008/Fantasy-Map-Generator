import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

function inn(large: boolean) {
  const k = new ModelKit(large ? "courtyard-inn" : "roadside-inn");
  k.hall(0, -3, large ? 13 : 9, 5, 5.2, 2, { storeys: 2 });
  k.chimney(-2, -3, 6.9);
  k.box("courtyard-paving", [0, 0.035, 2], [large ? 14 : 10, 0.07, 7], "stone");
  k.hall(-6, 2, 3, 5, 2.7, 1.1, { open: true, roof: "wood" });
  for (const z of [0.2, 1.8, 3.4]) k.box("stable-partition", [-6, 0.7, z], [2.7, 1.4, 0.08], "wood");
  k.table(0, 2, 2.5, 1, 0.8);
  for (const z of [1.15, 2.85]) {
    k.box("yard-bench", [0, 0.5, z], [2.7, 0.15, 0.3], "wood");
    for (const x of [-1, 1]) k.box("bench-leg", [x, 0.23, z], [0.12, 0.46, 0.24]);
  }
  k.attach(createMedievalContainerModel("barrel", "closed"), [3, 0, 0.5]);
  k.beam("inn-sign-arm", [2, 3, -0.3], [2, 3, 1], 0.08, "iron");
  k.box("inn-signboard", [2, 2.55, 1], [0.75, 0.65, 0.09], "wood");
  k.ring("inn-sign-symbol", [2, 2.55, 1.06], 0.18, 0.035, "straw", true);
  if (large) {
    k.hall(6, 2, 3, 5, 4.6, 1.5, { storeys: 2 });
    k.fence([-4.3, 5.2], [-1.5, 5.2]);
    k.fence([1.5, 5.2], [4.3, 5.2]);
  }
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "roadside-inn",
    name: "Roadside inn with stable court",
    task: 12,
    size: [19, 14, 9],
    note: "Two-storey lodging hall, stone-paved court, detached horse shelter, benches, barrel and hanging inn sign. Imagined roadside establishment.",
    create: () => inn(false)
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "courtyard-hostelry",
    name: "Courtyard hostelry",
    task: 12,
    size: [19, 15, 9],
    note: "Larger U-shaped lodging and stable ensemble around an open court, with a street entrance, service wing and outdoor tables.",
    create: () => inn(true)
  }
];
