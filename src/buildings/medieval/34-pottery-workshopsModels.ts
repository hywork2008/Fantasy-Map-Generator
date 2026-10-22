import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "potters-workshop",
    name: "Potter workshop, kiln, and drying shelves",
    task: 34,
    size: [15, 13, 7],
    note: "Open pottery workshop with a foot-powered wheel, clay stock, vessel drying shelves and a separate domed firing kiln. Pottery profiles have open mouths and inner walls.",
    create() {
      const k = new ModelKit("potters-workshop");
      k.hall(-2, -1, 7, 5, 3, 1.3, { open: true, roof: "wood" });
      k.cylinder("potters-wheel-pedestal", [-2, 0.4, 0], 0.18, 0.8, "wood");
      k.cylinder("kick-wheel", [-2, 0.25, 0], 0.65, 0.12, "wood");
      k.cylinder("wheel-head", [-2, 0.95, 0], 0.35, 0.1, "wood");
      k.vessel("pot-on-wheel", [-2, 1, 0], 0.22, 0.4, "tile");
      for (const x of [-4.5, -0.5]) k.box("shelf-upright", [x, 1.3, -2.8], [0.12, 2.6, 0.12]);
      for (const y of [0.5, 1.3, 2.1]) {
        k.box("pottery-drying-shelf", [-2.5, y, -2.8], [4.4, 0.1, 0.8], "wood");
        for (let i = 0; i < 6; i++) k.vessel("drying-pot", [-4.1 + i * 0.65, y + 0.05, -2.8], 0.2, 0.35, "tile");
      }
      k.box("kiln-base", [4, 0.35, 0], [3, 0.7, 3], "stone");
      k.sphere("pottery-kiln-dome", [4, 1.6, 0], [1.4, 1.1, 1.4], "tile");
      k.box("kiln-firemouth", [4, 0.65, 1.43], [0.7, 0.75, 0.05], "dark");
      k.chimney(4, -0.5, 3.1);
      k.sphere("covered-clay-stock", [-4, 0.4, 2.8], [1, 0.4, 0.8], "earth");
      return k.finish();
    }
  }
];
