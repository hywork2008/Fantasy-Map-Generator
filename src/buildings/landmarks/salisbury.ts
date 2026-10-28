import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "salisbury",
  task: "G07",
  name: "Salisbury Cathedral",
  style: "Gothic",
  state: "Present exterior: 13th-century body, 14th-century tower and spire",
  size: [146, 110, 125],
  dimensions:
    "Approximate 142 m long body and 123 m spire study. Cloister, chapter house and bay positions are estimated; the envelope includes the monastic appendages and is not a measured survey.",
  note: "Long Early English body with square east end, two pairs of transepts, dominant central spire, south cloister and octagonal chapter house. Lancets and west-front niches are schematic. Interior bracing, sculpture and stained-glass scenes are omitted.",
  sources: [
    {
      title: "Cathedral: building chronology",
      url: "https://www.salisburycathedral.org.uk/discover/history/the-cathedral-through-the-years/"
    }
  ],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("salisbury");
  k.nave("long-nave-and-quire", -10, 0, 118, 14, 25, 10);
  for (const s of [-1, 1]) {
    k.nave("aisle", -10, s * 11, 118, 8, 12, 4);
    k.crossNave("great-transept", -5, s * 19, 28, 15, 24, 10);
    k.crossNave("eastern-transept", 33, s * 14, 20, 13, 23, 9);
    for (const x of [-57, -48, -39, -30, -21, 10, 19, 42]) {
      k.opening("lancet", x, 16, s * 7, 1.6, 7, s > 0 ? 0 : Math.PI);
      k.opening("aisle-lancet", x, 3, s * 15, 2, 7, s > 0 ? 0 : Math.PI);
      k.block("buttress", x + 3, s * 15.7, 0.8, 1.6, 13);
    }
    for (const z of [s * 22, s * 28]) k.opening("transept-lancet", -12.5, 12, z, 1.8, 9, -Math.PI / 2);
  }
  k.nave("east-lady-chapel", 58, 0, 22, 12, 13, 6);
  k.opening("east-triple-lancet", 69, 3, 0, 5, 9, Math.PI / 2);
  k.tower("crossing-tower", -5, 0, 14, 68);
  k.spire("central-spire", -5, 68.7, 0, 7.4, 54.3);
  for (const x of [-11, 1]) for (const z of [-6, 6]) k.pinnacle(x, 68, z, 0.8, 6);
  k.block("west-screen", -69, 0, 1.3, 34, 29);
  for (const z of [-13, 13]) k.tower("west-turret", -67, z, 5, 34, 7);
  for (const z of [-9, 0, 9]) {
    k.opening("west-door", -69.65, 0.1, z, 4, 7, -Math.PI / 2, true, true);
    k.opening("west-lancet", -69.65, 12, z, 3.5, 13, -Math.PI / 2);
  }
  for (const z of [-18, 18]) {
    k.arcade("cloister", -55, 45 + z, 36, 12, 0, 5, 0, true);
    k.nave("cloister-roof", -37, 45 + z, 37, 4, 5, 2, 4.8);
  }
  for (const x of [-55, -19]) {
    k.arcade("cloister", 27, x, 36, 12, 0, 5, Math.PI / 2, true);
    k.crossNave("cloister-roof", x, 45, 37, 4, 5, 2, 4.8);
  }
  k.cylinder("chapter-house", [-7, 6, 58], 8, 12, "plaster", 8, 8);
  k.cylinder("chapter-house-roof", [-7, 15, 58], 8.4, 6, "iron", 0, 8);
  return k.finish();
}
