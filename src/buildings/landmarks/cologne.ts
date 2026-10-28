import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "cologne",
  task: "G05",
  name: "Cologne Cathedral",
  style: "Gothic",
  state: "Completed exterior after 1880, including 19th-century west towers",
  size: [151, 91, 159],
  dimensions:
    "UNESCO gives 144.5 m length, 86.25 m transept width and 157.22 m facade towers. Component widths and bay spacing are approximate; the conservative envelope includes buttresses.",
  note: "Five-aisled basilica, projecting transepts, open-tracery twin spires, dark slate roofs, radiating choir chapels and two levels of flying buttresses. Not a reconstruction of the unfinished medieval cathedral. Interior, sculpture and exact tracery are omitted.",
  sources: [{ title: "UNESCO: dimensions and construction phases", url: "https://whc.unesco.org/en/list/292/" }],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("cologne", "stone", "iron");
  k.nave("high-nave-and-choir", -6, 0, 116, 16, 44, 13);
  for (const s of [-1, 1]) {
    k.nave("double-aisle", -6, s * 15, 116, 14, 19, 5);
    k.crossNave("transept", 7, s * 24, 38, 21, 43, 13);
    k.opening("transept-great-window", 7, 22, s * 43, 12, 19, s > 0 ? 0 : Math.PI);
    for (const x of [-52, -42, -32, -22, 24, 34, 44]) {
      k.flyer(x, 8.2, 26, 23, 42, s);
      k.flyer(x, 8.2, 26, 32, 43, s);
    }
  }
  k.apse("choir-ambulatory", 52, 0, 22, 19, 5);
  k.apse("high-choir-apse", 52, 0, 8, 44, 13);
  k.radialChapels(52, 18, 7, 5, 14);
  k.bays([-55, -45, -35, -25, 24, 34, 44], 8, 44, 22, 19);
  k.block("west-front", -64, 0, 5, 57, 53);
  for (const z of [-18, 18]) {
    k.tower("west-tower", -57, z, 19, 94.3);
    k.spire("open-west-spire", -57, 95, z, 10, 62.22, true);
    for (const dx of [-8, 8]) for (const dz of [-8, 8]) k.pinnacle(-57 + dx, 90, z + dz, 1.1, 17);
  }
  for (const z of [-18, 0, 18]) k.opening("west-portal", -66.5, 0.1, z, 9, 18, -Math.PI / 2, true, true);
  k.opening("great-west-window", -66.5, 24, 0, 12, 24, -Math.PI / 2);
  k.tower("crossing-turret", 7, 0, 7, 10, 0, true, 56);
  k.spire("crossing-spire", 7, 66.7, 0, 4, 38);
  return k.finish();
}
