import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "mariaLaach",
  task: "R09",
  name: "Maria Laach Abbey Church",
  style: "Romanesque",
  state: "Present restored church and west Paradise atrium; monastic ranges excluded",
  size: [97, 44, 48],
  dimensions:
    "Approximate 70 m church body plus west atrium study. Tower heights, round-tower radii, gallery lengths and fountain dimensions are estimates; not a measured survey.",
  note: "Double-ended basilica with six distinct towers: two round east towers, two square west towers, east octagonal crossing and west central tower. Semicircular east and west apses, open Paradise atrium and central fountain. Interiors, sculpture, lake terrain and domestic monastery buildings are omitted.",
  sources: [
    {
      title: "Benedictine abbey: church and monastery",
      url: "https://www.maria-laach.de/unser-kloster/kirche-und-kloster/"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "stone", "iron");
    k.nave("basilica-nave", -1, 0, 54, 11, 20, 7);
    for (const s of [-1, 1]) {
      k.nave("aisle", -1, s * 8, 54, 5, 10, 4);
      k.crossNave("east-transept", 18, s * 11, 19, 13, 20, 7);
      for (const x of [-19, -10, -1, 8])
        k.opening("round-clerestory", x, 12, s * 5.5, 2.3, 5, s > 0 ? 0 : Math.PI, false);
      k.cylinder("east-round-tower", [20, 15, s * 13], 3.2, 30, "stone", 3.2, 16);
      k.spire("east-round-tower-cap", 20, 30, s * 13, 3.6, 9);
      k.tower("west-square-tower", -23, s * 13, 6, 31, 10, false);
    }
    k.apse("east-apse", 26, 0, 8, 16, 5);
    // Rotate the west apse as a complete assembly about the world vertical axis.
    const start = k.pickables.length;
    k.apse("west-apse", 0, 0, 7, 16, 5);
    for (const mesh of k.pickables.slice(start)) {
      mesh.position.x = -28 - mesh.position.x;
      mesh.position.z = -mesh.position.z;
      mesh.rotateOnWorldAxis(k.group.up, Math.PI);
    }
    k.cylinder("east-crossing-tower", [18, 28, 0], 8, 12, "stone", 8, 8);
    k.cylinder("east-crossing-roof", [18, 38, 0], 8.4, 8, "iron", 0, 8);
    k.tower("west-central-tower", -23, 0, 11, 35, 10, false);
    for (const z of [-12, 12]) {
      k.arcade("paradise-side", -56, z, 20, 6, 0, 5);
      k.nave("paradise-side-roof", -46, z, 21, 4, 5, 2, 4.8);
    }
    k.arcade("paradise-west", -12, -56, 24, 7, 0, 5, Math.PI / 2);
    k.crossNave("paradise-west-roof", -56, 0, 27, 4, 5, 2, 4.8);
    k.arcade("paradise-east", -12, -36, 24, 7, 0, 5, Math.PI / 2);
    k.crossNave("paradise-east-roof", -36, 0, 27, 4, 5, 2, 4.8);
    k.cylinder("paradise-fountain-base", [-46, 0.5, 0], 1.8, 1, "stone");
    k.vessel("paradise-fountain-basin", [-46, 1, 0], 1.5, 0.7, "stone", true);
    return k.finish();
  }
};
