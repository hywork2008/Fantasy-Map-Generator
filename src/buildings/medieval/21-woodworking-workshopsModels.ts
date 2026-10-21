import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "coopers-workshop",
    name: "Cooper workshop and assembly stand",
    task: 21,
    size: [10, 9, 6],
    note: "Cooper's staving stand, unfinished open barrel, loose staves, separate hoops, drawknife bench and completed cask under an open work shed.",
    create() {
      const k = new ModelKit("coopers-workshop");
      k.hall(0, -1, 7, 4.5, 3, 1.3, { open: true, roof: "wood" });
      k.table(-1, 0, 1.4, 1.2, 0.65);
      k.attach(createMedievalContainerModel("barrel", "empty"), [-1, 0.71, 0]);
      k.attach(createMedievalContainerModel("barrel", "closed"), [2, 0, 0]);
      for (let i = 0; i < 6; i++)
        k.beam("loose-barrel-stave", [-2.5 + i * 0.12, 0.1, 1.5], [-2.5 + i * 0.12, 0.1, 2.6], 0.08, "wood");
      for (let i = 0; i < 3; i++) k.ring("loose-coopering-hoop", [0.5, 0.04 + i * 0.06, 1.6], 0.36, 0.025, "iron");
      k.table(-2, -1.7, 1.7, 0.6, 0.85);
      k.beam("drawknife", [-2.4, 0.96, -1.7], [-1.6, 0.96, -1.7], 0.04, "iron");
      return k.finish();
    }
  },
  {
    id: "joiners-workshop",
    name: "Joiner workshop and woodworking bench",
    task: 21,
    size: [10, 9, 6],
    note: "Joiner's heavy bench, wooden screw vice, frame saw, hand plane, chisels and dressed boards. Fine woodworking, separate from a lumber yard.",
    create() {
      const k = new ModelKit("joiners-workshop");
      k.hall(0, -1, 7, 4.5, 3, 1.3, { open: true, roof: "wood" });
      k.table(0, 0, 3, 1, 0.85);
      k.box("bench-vice-jaw", [-1.3, 0.7, 0.67], [0.45, 0.5, 0.15], "wood");
      k.beam("wooden-vice-screw", [-1.3, 0.7, 0.5], [-1.3, 0.7, 0.95], 0.08, "wood", true);
      k.box("hand-plane", [0.5, 1, 0], [0.45, 0.17, 0.16], "wood");
      for (let i = 0; i < 4; i++)
        k.beam("bench-chisel", [-0.8 + i * 0.22, 0.96, -0.2], [-0.8 + i * 0.22, 0.96, 0.2], 0.035, "iron", true);
      for (const x of [-1.3, 1.3]) k.box("saw-rack-post", [x, 1.2, -1.9], [0.1, 2.4, 0.1]);
      k.box("saw-rack-rail", [0, 2.4, -1.9], [2.7, 0.12, 0.12]);
      for (const x of [-1, 1]) {
        k.beam("saw-hanger", [x, 2.36, -1.9], [x, 2.28, -1.78], 0.04, "iron", true);
        k.beam("frame-saw-upright", [x, 1.3, -1.8], [x, 2.3, -1.8], 0.08, "wood");
      }
      k.beam("frame-saw-stretcher", [-1, 1.8, -1.8], [1, 1.8, -1.8], 0.08);
      k.beam("frame-saw-blade", [-1, 1.35, -1.8], [1, 1.35, -1.8], 0.025, "iron");
      for (let i = 0; i < 5; i++) k.box("dressed-boards", [2.4, 0.15 + i * 0.13, 1], [0.7, 0.1, 2.5], "wood");
      return k.finish();
    }
  }
];
