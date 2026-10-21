import { type MedievalModel, ModelKit } from "./modelKit";

function oven(k: ModelKit, x: number, z: number) {
  k.box("oven-stone-plinth", [x, 0.45, z], [2.2, 0.9, 2], "stone");
  k.sphere("masonry-oven-dome", [x, 0.95, z], [1, 0.85, 0.9], "stone");
  k.box("baking-mouth", [x, 0.95, z + 0.91], [0.68, 0.55, 0.08], "dark");
  k.box("oven-landing", [x, 0.65, z + 1.08], [1.1, 0.13, 0.5], "stone");
  k.chimney(x + 0.7, z - 0.4, 2.6);
  for (let i = 0; i < 7; i++)
    k.beam(
      "stacked-oven-fuel",
      [x - 0.7 + i * 0.18, 0.1, z + 1.6],
      [x - 0.7 + i * 0.18, 0.1, z + 2.1],
      0.15,
      "wood",
      true
    );
}
export const models: MedievalModel[] = [
  {
    id: "bread-bakehouse",
    name: "Detached bread bakehouse",
    task: 10,
    size: [10, 10, 6],
    note: "Detached stone bakehouse with a domed masonry oven, chimney, long bread peel, cooling table and fuel pile, separating the fire from a dwelling.",
    create() {
      const k = new ModelKit("bread-bakehouse");
      k.hall(-1, -1, 6, 4.5, 2.7, 1.4, { wall: "stone", door: 1.4 });
      oven(k, 3, 0);
      k.table(-1, 2.5, 2.5, 0.8, 0.85);
      k.beam("bread-peel-handle", [-2, 1, 2.5], [0, 1, 2.5], 0.045, "wood", true);
      k.box("bread-peel-blade", [0.3, 1, 2.5], [0.6, 0.04, 0.4], "wood");
      return k.finish();
    }
  },
  {
    id: "town-bakery",
    name: "Bakery and bread shop",
    task: 10,
    size: [12, 11, 8],
    note: "Two-storey bakery dwelling with street display, shuttered upper windows, a side oven and bread cooling on wooden boards.",
    create() {
      const k = new ModelKit("town-bakery");
      k.hall(-1, -1, 7, 5, 4.7, 1.8, { storeys: 2 });
      oven(k, 4, -0.5);
      k.table(-1, 2.8, 3, 0.9, 0.9);
      for (let i = 0; i < 8; i++)
        k.sphere(
          "bread-loaf",
          [-2.2 + (i % 4) * 0.75, 1.1, 2.6 + Math.floor(i / 4) * 0.4],
          [0.28, 0.14, 0.15],
          "straw"
        );
      return k.finish();
    }
  },
  {
    id: "communal-bread-oven",
    name: "Communal bread oven shelter",
    task: 10,
    size: [7, 8, 5],
    note: "Shared village oven under an open timber shelter, with baking landing, fuel, chimney and a long-handled peel. Illustrative regional form.",
    create() {
      const k = new ModelKit("communal-bread-oven");
      k.hall(0, 0, 5, 4, 2.8, 1.2, { open: true, roof: "wood" });
      oven(k, 0, -0.5);
      k.beam("shared-bread-peel", [-2.2, 0.8, 1.3], [-2.2, 0.8, 3], 0.055, "wood", true);
      k.box("peel-head", [-2.2, 0.8, 3.2], [0.5, 0.04, 0.5], "wood");
      return k.finish();
    }
  }
];
