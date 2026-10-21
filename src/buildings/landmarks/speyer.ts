import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "speyer",
  task: "R01",
  name: "Speyer Cathedral",
  style: "Romanesque",
  state: "Present exterior, explicitly including the 1854-1858 westwork",
  size: [143, 65, 76],
  dimensions:
    "Approximate 134 m long basilica study. Four tower envelopes, octagonal roof heights and dwarf-gallery spacing are estimated; no measured survey is claimed.",
  note: "Imperial basilica with four towers, east and west octagonal crossing masses, semicircular apse and repeated round-arched dwarf galleries. Present westwork is 19th century, not an 11th-century reconstruction. Crypt, interior vaults, sculpture and adjoining buildings are omitted.",
  sources: [
    { title: "UNESCO: Romanesque structure and westwork restoration", url: "https://whc.unesco.org/en/list/168/" }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "plaster", "tile");
    k.nave("imperial-nave", -9, 0, 106, 15, 32, 10);
    for (const s of [-1, 1]) {
      k.nave("aisle", -9, s * 12, 106, 9, 15, 4);
      k.crossNave("eastern-transept", 32, s * 18, 27, 18, 30, 9);
      for (const x of [-50, -39, -28, -17, -6, 5, 16]) {
        k.opening("round-clerestory", x, 23, s * 7.5, 3.2, 6, s > 0 ? 0 : Math.PI, false);
        k.opening("round-aisle-window", x, 5, s * 16.5, 2.5, 6, s > 0 ? 0 : Math.PI, false);
      }
      k.arcade("nave-dwarf-gallery", -61, s * 7.8, 103, 35, 29, 2.7);
    }
    k.apse("eastern-apse", 44, 0, 13, 22, 6);
    for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) * Math.PI) / 9;
      k.opening("apse-round-window", 44 + Math.sin(a) * 13, 10, Math.cos(a) * 13, 2, 6, a, false);
    }
    for (const [x, z, h] of [
      [-56, -16, 59],
      [-56, 16, 59],
      [33, -17, 65],
      [33, 17, 65]
    ])
      k.tower("imperial-tower", x, z, 9, h, 8, false);
    for (const [x, h] of [
      [-56, 45],
      [32, 43]
    ]) {
      k.cylinder("octagonal-crossing", [x, h, 0], 11, 16, "plaster", 11, 8);
      k.cylinder("crossing-pyramid", [x, h + 14, 0], 11.5, 12, "tile", 0, 8);
    }
    k.block("neo-romanesque-westwork", -64, 0, 9, 29, 28);
    k.arcade("west-porch", -12, -69, 24, 3, 0, 10, Math.PI / 2, false);
    for (const z of [-8, 0, 8]) k.opening("west-portal", -68.5, 0.1, z, 4.5, 8, -Math.PI / 2, false, true);
    k.arcade("west-dwarf-gallery", -13, -68.8, 26, 13, 24, 3, Math.PI / 2, false);
    return k.finish();
  }
};
