import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "reims",
  task: "G04",
  name: "Reims Cathedral",
  style: "Gothic",
  state: "Present restored cathedral exterior; excludes Saint-Remi and the Palace of Tau",
  size: [153, 70, 83],
  dimensions:
    "Approximate 149 m long, 81 m west tower study. Nave width, chapel sizes and bay positions are estimated from the overall plan and external form, not surveyed.",
  note: "Twin flat-topped towers, three deeply projecting portal gables with glazed tympana, west rose, kings gallery and five-chapel chevet. Sculptures are represented by small massing markers; detailed carving and interiors are omitted.",
  sources: [{ title: "UNESCO: Reims cathedral and related monuments", url: "https://whc.unesco.org/en/list/601/" }],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("reims");
  k.nave("high-nave", -7, 0, 122, 15, 38, 12);
  for (const s of [-1, 1]) {
    k.nave("aisle", -7, s * 13, 122, 11, 17, 4);
    k.crossNave("transept", 9, s * 17, 30, 18, 37, 11);
    k.rose(9, 27, s * 32, 5.5, s > 0 ? 0 : Math.PI);
    for (const x of [-56, -46, -36, -26, 26, 36, 46]) k.pinnacle(x, 22, s * 20, 1, 7);
  }
  k.apse("ambulatory", 54, 0, 18.5, 17, 4);
  k.apse("choir-apse", 54, 0, 7.5, 38, 12);
  k.radialChapels(54, 15, 5, 5.5, 13);
  k.bays([-55, -45, -35, -25, 26, 36, 46], 7.5, 38, 18.5, 17, true, true);
  k.block("west-front", -67, 0, 3, 45, 47);
  for (const z of [-15, 15]) k.tower("west-tower", -60, z, 14, 80.3);
  for (const z of [-15, 0, 15]) {
    k.block("portal-projection", -70, z, 5, 12, 18);
    k.opening("west-portal", -72.5, 0.1, z, 8, 14, -Math.PI / 2, true, true);
    k.rose(-72.5, 18, z, 3.5, -Math.PI / 2);
    // Upright triangular gables, not cones, crown the three porch bays.
    const mesh = k.prism(
      "portal-gable",
      [
        [-5, 0],
        [5, 0],
        [0, -10]
      ],
      0,
      0.6
    );
    mesh.rotation.set(0, -Math.PI / 2, 0);
    mesh.position.set(-72.7, 22, z);
  }
  k.rose(-68.5, 35, 0, 6.5, -Math.PI / 2);
  k.arcade("kings-gallery", -21, -69, 42, 21, 44, 6, Math.PI / 2, true);
  for (let z = -20; z <= 20; z += 2) k.block("king-massing", -69.2, z, 0.6, 0.6, 2.5, 45);
  return k.finish();
}
