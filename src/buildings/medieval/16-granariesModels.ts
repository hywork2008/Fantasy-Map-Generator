import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "raised-timber-granary",
    name: "Raised timber granary",
    task: 16,
    size: [9, 9, 7],
    note: "Timber grain store raised on stone supports with broad vermin-discouraging caps, ventilating slats and a removable stair. A northern/western European illustrative form.",
    create() {
      const k = new ModelKit("raised-timber-granary");
      for (const x of [-2, 0, 2])
        for (const z of [-1.6, 1.6]) {
          k.cylinder("granary-support", [x, 0.45, z], 0.22, 0.9, "stone");
          k.cylinder("support-cap", [x, 0.94, z], 0.48, 0.15, "stone");
        }
      const raised = new ModelKit("grain-store");
      raised.hall(0, 0, 5.5, 4.5, 2.7, 1.8, { wall: "wood", roof: "wood", windows: false });
      k.attach(raised.finish(), [0, 1.05, 0]);
      for (const x of [-1.8, 1.8])
        for (let i = 0; i < 4; i++) k.box("ventilation-slot", [x, 2.6 + i * 0.16, 2.28], [0.5, 0.07, 0.035], "dark");
      for (let i = 0; i < 5; i++) k.box("removable-step", [0, 0.1 + i * 0.21, 3.5 - i * 0.24], [1, 0.2, 0.24], "wood");
      return k.finish();
    }
  },
  {
    id: "stone-grain-store",
    name: "Stone grain storage house",
    task: 16,
    size: [10, 9, 8],
    note: "Stone grain store with high ventilators, heavy double doors, loading hoist and bagged grain on a raised receiving apron.",
    create() {
      const k = new ModelKit("stone-grain-store");
      k.hall(0, -0.5, 7, 5, 4.8, 1.8, { wall: "stone", door: 2, storeys: 2 });
      k.box("loading-apron", [0, 0.15, 3], [3, 0.3, 1.8], "stone");
      k.beam("sack-hoist-jib", [0, 4.2, 1.8], [0, 4.2, 3.4], 0.15);
      k.beam("hoist-rope", [0, 4.2, 3.3], [0, 1.2, 3.3], 0.025, "cloth", true);
      k.attach(createMedievalContainerModel("sack", "closed"), [-1, 0.3, 3]);
      return k.finish();
    }
  }
];
