import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "amiens",
  task: "G03",
  name: "Amiens Cathedral",
  style: "Gothic",
  state: "Present restored exterior, including later west towers and crossing fleche",
  size: [152, 78, 114],
  dimensions:
    "Approximate 145 m body, following the plan proportions described by UNESCO. Exterior height, bay spacing and buttress reach are study estimates; the envelope is not a survey.",
  note: "Tall three-aisled nave, broader choir aisles, deep chevet with seven chapels, unequal west towers, three projecting portal gables and slender crossing fleche. Fine sculpture, interior and adjacent buildings are omitted.",
  sources: [{ title: "UNESCO: plan, elevation and construction history", url: "https://whc.unesco.org/en/list/162/" }],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("amiens");
  k.nave("nave-and-choir", -8, 0, 118, 15, 43, 12);
  for (const s of [-1, 1]) {
    k.nave("nave-aisle", -34, s * 12, 66, 9, 18, 4);
    k.nave("choir-double-aisle", 28, s * 15, 44, 15, 18, 4);
    k.crossNave("transept", 4, s * 21, 34, 16, 41, 11);
    k.rose(4, 30, s * 38, 6, s > 0 ? 0 : Math.PI);
  }
  k.apse("outer-chevet", 51, 0, 22.5, 18, 4);
  k.apse("high-chevet", 51, 0, 7.5, 43, 12);
  k.radialChapels(51, 18, 7, 5.5, 12);
  k.bays([-53, -43, -33, -23, 20, 30, 40], 7.5, 43, 16.5, 18, true, true);
  for (const x of [20, 30, 40]) for (const s of [-1, 1]) k.flyer(x, 7.7, 25, 23, 41, s);
  k.block("west-screen", -66, 0, 4, 43, 48);
  k.tower("north-tower", -59, -14, 13, 67.3);
  k.tower("south-tower", -59, 14, 13, 60.3);
  for (const z of [-14, 0, 14]) {
    k.opening("west-portal", -68, 0.1, z, 8, 16, -Math.PI / 2, true, true);
    const gable = k.prism(
      "portal-gable",
      [
        [-5, 0],
        [5, 0],
        [0, -10]
      ],
      0,
      0.6
    );
    gable.rotation.set(0, -Math.PI / 2, 0);
    gable.position.set(-69, 17, z);
  }
  k.rose(-68, 35, 0, 6, -Math.PI / 2);
  k.arcade("west-statue-gallery", -21, -68.4, 42, 21, 21, 5, Math.PI / 2, true);
  k.tower("crossing-lantern", 4, 0, 6, 12, 0, true, 54);
  k.spire("crossing-fleche", 4, 66.7, 0, 3.5, 45.3);
  return k.finish();
}
