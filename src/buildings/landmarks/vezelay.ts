import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "vezelay",
  task: "R05",
  name: "Vezelay Basilica",
  style: "Romanesque",
  state: "Present restored exterior: Romanesque narthex and nave, Gothic choir",
  size: [128, 52, 45],
  dimensions:
    "Approximate 120 m long church study. Nave, narthex, transept and choir proportions are estimated from the historic layout; not a measured survey.",
  note: "Long Burgundian Romanesque nave, deep narthex, unequal west tower masses and taller Gothic choir with ambulatory. The celebrated striped interior transverse arches and sculptured capitals are outside this exterior-only model. Exact portal sculpture, interior and monastic ranges are omitted.",
  sources: [{ title: "UNESCO: Burgundian Romanesque basilica", url: "https://whc.unesco.org/en/list/84/" }],
  create() {
    const k = new ArchitectureKit(this.id, "plaster", "tile");
    k.nave("narthex", -49, 0, 24, 13, 19, 8);
    k.nave("romanesque-nave", -10, 0, 54, 13, 20, 7);
    k.nave("gothic-choir", 33, 0, 32, 14, 23, 8);
    for (const s of [-1, 1]) {
      k.nave("nave-aisle", -22, s * 10, 78, 7, 10, 4);
      k.crossNave("transept", 17, s * 13, 21, 14, 22, 7);
      k.nave("choir-aisle", 33, s * 10.5, 32, 7, 11, 4);
      for (const x of [-54, -44, -30, -21, -12, -3, 6])
        k.opening("round-nave-window", x, 12, s * 6.5, 2.8, 5, s > 0 ? 0 : Math.PI, false);
      for (const x of [26, 35, 44]) {
        k.opening("gothic-choir-lancet", x, 15, s * 7, 2.3, 6, s > 0 ? 0 : Math.PI);
        k.flyer(x, 7.2, 16, 15, 22, s);
      }
    }
    k.apse("choir-ambulatory", 49, 0, 14, 11, 4);
    k.apse("gothic-apse", 49, 0, 7, 23, 8);
    k.radialChapels(49, 11, 5, 3.5, 9);
    k.tower("south-west-tower", -53, 12, 8, 35, 7, false);
    k.block("north-tower-stump", -53, -12, 8, 8, 20);
    k.block("west-screen", -61, 0, 1.2, 28, 21);
    for (const z of [-9, 0, 9]) k.opening("west-portal", -61.6, 0.1, z, 4, 7, -Math.PI / 2, false, true);
    for (const z of [-4, 0, 4]) k.opening("west-upper-window", -61.6, 12, z, 2.4, 6, -Math.PI / 2, true);
    return k.finish();
  }
};
