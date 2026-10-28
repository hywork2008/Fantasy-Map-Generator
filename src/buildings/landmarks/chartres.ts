import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "chartres",
  task: "G02",
  name: "Chartres Cathedral",
  style: "Gothic",
  state: "Present exterior: medieval south spire and 16th-century north spire",
  size: [138, 78, 117],
  dimensions:
    "Approximate 130 m long exterior study; tower profiles and chapel spacing are estimates. Display bounds include projecting porches and buttresses; not a measured survey.",
  note: "Asymmetric spires, broad transepts with three-bay porches, three west portals and a radiating chevet. North spire tracery is schematic. Interior, sculpture and stained-glass scenes are omitted; windows are opaque inlays.",
  sources: [{ title: "UNESCO: Chartres Cathedral", url: "https://whc.unesco.org/en/list/81/" }],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("chartres");
  k.nave("high-nave", -9, 0, 104, 16, 37, 11);
  for (const s of [-1, 1]) {
    k.nave("aisle", -9, s * 13, 104, 10, 15, 4);
    k.crossNave("transept", 7, s * 18, 32, 17, 35, 10);
    k.rose(7, 25, s * 34, 5.5, s > 0 ? 0 : Math.PI);
    k.arcade("transept-porch", -4, s * 37, 22, 3, 0, 9, 0, true);
    k.block("porch-canopy", 7, s * 35.5, 24, 5, 0.7, 9);
    for (const x of [-4, 7, 18]) k.pinnacle(x, 9.7, s * 37, 1, 5);
  }
  k.apse("ambulatory", 43, 0, 18, 15, 4);
  k.apse("high-choir", 43, 0, 8, 37, 11);
  k.radialChapels(43, 18, 5, 5.5, 10);
  k.bays([-45, -36, -27, -18, 24, 33], 8, 37, 18, 15, true, true);
  k.block("royal-portal-screen", -61, 0, 4, 38, 33);
  for (const z of [-12, 0, 12]) k.opening("royal-portal", -63, 0.2, z, 6, 10, -Math.PI / 2, true, true);
  k.rose(-63, 26, 0, 5, -Math.PI / 2);
  k.tower("south-tower", -54, 13, 14, 66, 38, false);
  k.tower("north-tower", -54, -13, 14, 72);
  k.spire("north-open-spire", -54, 72.7, -13, 7.2, 42.3, true);
  for (const z of [-18, -8]) for (const x of [-59, -49]) k.pinnacle(x, 72, z, 0.9, 9);
  return k.finish();
}
