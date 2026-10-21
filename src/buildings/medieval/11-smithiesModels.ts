import { type MedievalModel, ModelKit } from "./modelKit";

function smithy(shoeing: boolean) {
  const k = new ModelKit(shoeing ? "farrier" : "smithy");
  k.hall(-1, -1, 7, 5, 3, 1.4, { open: true, roof: "tile" });
  k.box("forge-hearth", [-2, 0.55, -1.8], [2, 1.1, 1.5], "stone");
  k.box("coal-bed", [-2, 1.12, -1.5], [1.1, 0.06, 0.8], "dark");
  k.sphere("hearth-embers", [-2, 1.17, -1.5], [0.35, 0.04, 0.25], "tile");
  k.chimney(-2, -2, 5.4);
  k.sphere("leather-bellows", [-0.2, 1.08, -1.9], [0.8, 0.25, 0.42], "leather");
  for (const y of [0.9, 1.25]) k.box("bellows-board", [-0.2, y, -1.9], [1.5, 0.08, 0.8], "wood");
  k.beam("bellows-nozzle", [-1, 1.1, -1.9], [-1.7, 1.1, -1.9], 0.12, "iron", true);
  k.beam("bellows-lever", [-0.6, 1.6, -1.9], [1, 1.3, -1.9], 0.09);
  k.cylinder("anvil-stump", [0, 0.35, 1], 0.35, 0.7, "wood");
  k.box("anvil-foot", [0, 0.78, 1], [0.55, 0.16, 0.4], "iron");
  k.box("anvil-waist", [0, 0.94, 1], [0.26, 0.25, 0.26], "iron");
  k.box("anvil-face", [0, 1.09, 1], [0.7, 0.15, 0.38], "iron");
  k.beam("anvil-horn", [0.32, 1.08, 1], [0.72, 1.08, 1], 0.18, "iron", true);
  k.table(2.2, 0, 1.4, 0.7, 0.85);
  for (let i = 0; i < 5; i++)
    k.beam("smith-tongs", [1.7 + i * 0.18, 0.94, -0.2], [1.7 + i * 0.18, 0.94, 0.3], 0.025, "iron", true);
  if (shoeing) {
    for (const x of [2.4, 4]) for (const z of [1.6, 3]) k.box("shoeing-stock-post", [x, 1.1, z], [0.15, 2.2, 0.15]);
    for (const x of [2.4, 4]) k.beam("stock-crossrail", [x, 1.6, 1.6], [x, 1.6, 3], 0.12);
    for (let i = 0; i < 4; i++) {
      const points = Array.from({ length: 13 }, (_, j): readonly [number, number, number] => {
        const a = (j * Math.PI) / 8;
        return [1.9 + i * 0.22 + Math.cos(a) * 0.09, 1.4 + Math.sin(a) * 0.12, 1];
      });
      k.tube("horseshoe", points, 0.018, "iron");
    }
  }
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id: "open-smithy",
    name: "Open forge and smithy",
    task: 11,
    size: [10, 9, 6],
    note: "Open working forge with masonry hearth, chimney, lever-operated leather bellows, stump-mounted anvil, horn, workbench and tongs.",
    create: () => smithy(false)
  },
  {
    id: "farriers-workshop",
    name: "Farrier workshop and shoeing stock",
    task: 11,
    size: [11, 9, 6],
    note: "Forge and shoeing yard, including bellows, anvil, iron horseshoes and a four-post restraint stock. No animal is included.",
    create: () => smithy(true)
  }
];
