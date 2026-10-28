import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "brugesCityHall",
  task: "G10",
  name: "Bruges City Hall",
  style: "Gothic",
  state: "Present restored street-facing exterior of the 1376-1421 hall",
  size: [35, 23, 34],
  dimensions:
    "Illustrative 32 m wide by 19 m deep civic-hall study. No surveyed dimensions are asserted; roof pitch, turrets and facade rhythm are estimated from the municipal heritage photographs.",
  note: "Secular Gothic hall with steep roof, six tall facade bays, statue niches and three slender street turrets. Front faces south (+Z); adjoining Liberty of Bruges and the Basilica of the Holy Blood are excluded. Interior mural and timber vault, exact statues and rear extensions are omitted.",
  sources: [
    {
      title: "Visit Bruges: City Hall",
      url: "https://www.visitbruges.be/en/things-to-do/culture-and-heritage/stadhuis-city-hall"
    }
  ],
  create() {
    return createModel(ArchitectureKit);
  }
};

model.highDetail = detailedLandmark(model, () => createModel(GothicDetailKit));

function createModel(Kit: typeof ArchitectureKit) {
  const k = new Kit("brugesCityHall");
  k.nave("civic-hall", 0, 0, 32, 19, 16, 11);
  for (const x of [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5]) {
    k.opening("great-hall-window", x, 7.5, 9.5, 3, 7);
    k.opening("ground-window", x, 1.7, 9.5, 2.4, 3.5);
    k.block("facade-mullion", x, 9.7, 0.12, 0.12, 6, 8);
  }
  for (const x of [-15, 0, 15]) {
    k.cylinder("front-turret", [x, x === 0 ? 18 : 10, 10], 1.15, x === 0 ? 4 : 20, "plaster", 1.15, 8);
    k.cylinder("turret-crown", [x, 22.5, 10], 1.4, 5, "plaster", 1.4, 8);
    k.spire("turret-spire", x, 25, 10, 1.6, 8);
  }
  for (const x of [-10, -5, 5, 10])
    for (const y of [5.5, 13]) {
      k.opening("statue-niche", x, y, 9.65, 0.9, 2.1, 0, true, true);
      k.block("statue-marker", x, 9.85, 0.45, 0.35, 1.3, y + 0.2);
      k.pinnacle(x, y + 2.3, 9.8, 0.4, 1.8);
    }
  k.opening("main-door", 0, 0.1, 10.1, 3.2, 5, 0, true, true);
  for (const z of [-9.5, 9.5]) k.block("cornice", 0, z, 32.5, 0.5, 0.7, 15.8);
  for (const x of [-10, -3.5, 3.5, 10])
    for (const s of [-1, 1]) {
      k.nave("roof-dormer", x, s * 5.5, 2.4, 2.6, 23.5, 1.8, 21);
      k.opening("dormer-window", x, 22, s * 6.8, 1, 1.4, s > 0 ? 0 : Math.PI);
    }
  for (const x of [-16, 16])
    for (const z of [-5, 0, 5]) k.opening("end-window", x, 8, z, 2.3, 5, x > 0 ? Math.PI / 2 : -Math.PI / 2);
  return k.finish();
}
