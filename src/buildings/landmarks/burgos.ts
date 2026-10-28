import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "burgos",
  task: "G09",
  name: "Burgos Cathedral",
  style: "Gothic",
  state: "Exterior after the 1567 crossing tower, with later chapels",
  size: [101, 85, 91],
  dimensions:
    "UNESCO describes an 84 m by 59 m Latin-cross plan. The study envelope additionally includes chapels and projecting buttresses. Tower heights, annexes and bay spacing are estimates, not surveyed.",
  note: "Twin open west spires, octagonal crossing lantern, Constable chapel and asymmetric chapel accretions. Main church only: cloister, surrounding palace, interior star vaults, tombs and fine carving are omitted.",
  sources: [{ title: "UNESCO: dimensions and late-Gothic additions", url: "https://whc.unesco.org/en/list/316/" }],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("burgos");
  k.nave("main-nave", -6, 0, 64, 12, 27, 8);
  for (const s of [-1, 1]) {
    k.nave("aisle", -6, s * 10, 64, 8, 12, 4);
    k.crossNave("transept", 3, s * 17, 25, 14, 26, 8);
    k.opening("transept-portal", 3, 0.1, s * 29.5, 6, 11, s > 0 ? 0 : Math.PI, true, true);
    k.rose(3, 20, s * 29.5, 4, s > 0 ? 0 : Math.PI);
  }
  k.apse("ambulatory", 26, 0, 14, 12, 4);
  k.apse("choir", 26, 0, 6, 27, 8);
  k.bays([-30, -22, -14, 16, 24], 6, 27, 14, 12, true, true);
  k.block("west-screen", -39, 0, 3, 35, 33);
  for (const z of [-12, 12]) {
    k.tower("west-tower", -33, z, 11, 53.3);
    k.spire("open-west-spire", -33, 54, z, 5.8, 34, true);
    for (const dx of [-5, 5]) for (const dz of [-5, 5]) k.pinnacle(-33 + dx, 51, z + dz, 0.65, 7);
  }
  for (const z of [-12, 0, 12]) k.opening("west-portal", -40.5, 0.1, z, 6, 10, -Math.PI / 2, true, true);
  k.rose(-40.5, 23, 0, 4.5, -Math.PI / 2);
  k.cylinder("crossing-lantern", [3, 43, 0], 10, 20, "plaster", 10, 8);
  k.cylinder("lantern-cap", [3, 57, 0], 10.2, 8, "iron", 2, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    k.pinnacle(3 + Math.sin(a) * 10, 53, Math.cos(a) * 10, 0.85, 9);
    k.opening("lantern-window", 3 + Math.sin(a) * 10, 39, Math.cos(a) * 10, 3, 9, a);
  }
  k.cylinder("constable-chapel", [43, 13, 0], 10, 26, "plaster", 10, 8);
  k.cylinder("constable-chapel-roof", [43, 29, 0], 10.5, 6, "iron", 0, 8);
  for (const [x, z, l, w, h] of [
    [-20, 21, 18, 12, 11],
    [24, 22, 14, 16, 15],
    [20, -21, 14, 12, 10]
  ])
    k.nave("side-chapel", x, z, l, w, h, 4);
  return k.finish();
}
