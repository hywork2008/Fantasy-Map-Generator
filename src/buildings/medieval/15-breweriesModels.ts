import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

function brewery(large: boolean) {
  const k = new ModelKit(large ? "town-brewery" : "ale-brewhouse");
  k.hall(-2, -1, large ? 8 : 5.5, 5, large ? 4.7 : 2.8, 1.5, { wall: "stone", storeys: large ? 2 : 1 });
  k.hall(3, 0, 4, 5, 3, 1.1, { open: true, roof: "wood" });
  k.box("brewing-furnace", [2.5, 0.5, 0], [1.8, 1, 1.8], "stone");
  k.box("furnace-mouth", [2.5, 0.35, 0.92], [0.6, 0.5, 0.04], "dark");
  k.vessel("brewing-copper", [2.5, 1, 0], 0.85, 0.65, "tile", true);
  k.vessel("mash-tun", [4.5, 0, 1], 0.7, 1.2, "wood", true);
  for (const y of [0.2, 1]) k.ring("tun-hoop", [4.5, y, 1], 0.71, 0.035);
  k.chimney(2, -1.8, 4.7);
  k.table(0, 3, 2.2, 1, 0.85);
  k.box("malt-cooling-tray", [0, 0.97, 3], [2, 0.1, 0.8], "straw");
  for (let i = 0; i < 3; i++) k.attach(createMedievalContainerModel("barrel", "closed"), [-3 + i, 0, 2.2]);
  k.beam("mash-paddle", [4, 1.5, 1], [4.6, 0.8, 1], 0.06, "wood", true);
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
