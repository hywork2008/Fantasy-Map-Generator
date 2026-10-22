import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "linen-bleaching-field",
    name: "Linen bleaching ground and drying racks",
    task: 31,
    size: [20, 17, 4],
    note: "Fenced grass bleaching ground with linen lengths laid out in parallel, cloth drying frames and washing tubs. Cloth panels are separate geometry above the ground.",
    create() {
      const k = new ModelKit("linen-bleaching-field");
      k.box("bleaching-meadow", [0, 0.025, 0], [16, 0.05, 12], "green");
      for (const z of [-6, 6]) k.fence([-8, z], [8, z], 0.9);
      k.fence([-8, -6], [-8, 6], 0.9);
      k.fence([8, -6], [8, 3], 0.9);
      for (let i = 0; i < 6; i++) {
        k.box("linen-on-grass", [-6.5 + i * 2.5, 0.065, 0], [1.6, 0.025, 8], "white");
        for (const z of [-4.1, 4.1]) k.box("linen-peg", [-6.5 + i * 2.5, 0.09, z], [0.08, 0.12, 0.08], "wood");
      }
      for (const z of [-3, 0, 3]) {
        for (const x of [9, 11]) k.box("drying-rack-post", [x, 1.2, z], [0.12, 2.4, 0.12]);
        k.beam("drying-rack-top", [9, 2.3, z], [11, 2.3, z], 0.1, "wood");
        k.box("hanging-linen", [10, 1.65, z], [1.8, 1.2, 0.03], "white");
      }
      for (const z of [-4.5, 4.5]) k.vessel("linen-washing-tub", [9, 0, z], 0.65, 0.7, "wood", true);
      return k.finish();
    }
  }
];
