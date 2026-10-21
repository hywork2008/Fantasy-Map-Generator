import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

function brewery(large: boolean) {
  const k = new ModelKit(large ? "town-brewery" : "ale-brewhouse");
  const hallWidth = large ? 8 : 5.5;
  k.hall(-2, -1, hallWidth, 5, large ? 4.7 : 2.8, 1.5, { wall: "stone", storeys: large ? 2 : 1 });
  const shelter = new ModelKit("copper-shelter");
  shelter.hall(0, 0, 4, 5, 3, 1.1, { open: true, roof: "wood" });
  shelter.box("brewing-furnace", [-0.5, 0.5, 0], [1.8, 1, 1.8], "stone");
  shelter.box("furnace-mouth", [-0.5, 0.35, 0.92], [0.6, 0.5, 0.04], "dark");
  shelter.vessel("brewing-copper", [-0.5, 1, 0], 0.85, 0.65, "tile", true);
  shelter.vessel("mash-tun", [1.5, 0, 1], 0.7, 1.2, "wood", true);
  for (const y of [0.2, 1]) shelter.ring("tun-hoop", [1.5, y, 1], 0.71, 0.035);
  shelter.chimney(-1, -1.8, 4.7);
  shelter.beam("mash-paddle", [1, 1.5, 1], [1.6, 0.8, 1], 0.06, "wood", true);
  // Allow for both 0.3 m roof overhangs and a 0.6 m gap between the roofs.
  k.attach(shelter.finish(), [-2 + hallWidth / 2 + 2 + 0.6 + 0.6, 0, 0]);
  k.table(0, 3, 2.2, 1, 0.85);
  k.box("malt-cooling-tray", [0, 0.97, 3], [2, 0.1, 0.8], "straw");
  for (let i = 0; i < 3; i++) k.attach(createMedievalContainerModel("barrel", "closed"), [-3 + i, 0, 2.2]);
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id: "town-brewery",
    name: "Town brewery and copper yard",
    task: 15,
    size: [15, 12, 8],
    note: "Masonry brewery, open copper shelter, firebox, chimney, mash tun, cooling tray, paddle and casks. Gravity and hand work replace modern brewing machinery.",
    create: () => brewery(true)
  },
  {
    id: "ale-brewhouse",
    name: "Small ale brewhouse",
    task: 15,
    size: [14, 12, 6],
    note: "Small brewing house for an inn or communal use, with heated copper, staved mash tun and casks. Regional use of rural brewing varied.",
    create: () => brewery(false)
  }
];
