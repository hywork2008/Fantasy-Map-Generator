import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "santAmbrogio",
  task: "R10",
  name: "Basilica of Sant'Ambrogio, Milan",
  style: "Romanesque",
  state: "Present restored Romanesque exterior with unequal bell towers",
  size: [104, 46, 44],
  dimensions:
    "Illustrative approximately 95 m overall church-and-atrium study. Tower heights, court size and bay spacing are estimated from the official plan and photographs; no measured survey is claimed.",
  note: "Red-brick Lombard basilica with nave twice the aisle width, three apses, octagonal tiburium, two levels of west arcades, four-sided open atrium and unequal bell towers. Ancient foundation is distinct from the 11th-12th-century rebuilding. Interiors, mosaics, altar, sculpture and surrounding later courtyards are omitted.",
  sources: [
    { title: "Basilica: architectural complex", url: "https://www.basilicasantambrogio.it/en/complesso-monumentale" },
    { title: "Basilica: plan and building parts", url: "https://www.basilicasantambrogio.it/en/mappa-della-basilica" }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "tile", "tile");
    k.nave("central-nave", 6, 0, 54, 13, 20, 7);
    for (const s of [-1, 1]) {
      k.nave("aisle", 6, s * 9.75, 54, 6.5, 10, 4);
      k.apse("side-apse", 33, s * 9.75, 3.25, 9, 3);
      for (const x of [-14, -1, 12, 25])
        k.opening("round-aisle-window", x, 3, s * 13, 2.4, 5, s > 0 ? 0 : Math.PI, false);
      k.arcade("atrium-side", -53, s * 15, 32, 8, 0, 5);
      k.nave("atrium-side-roof", -37, s * 15, 33, 4, 5, 2, 4.8);
    }
    k.apse("central-apse", 33, 0, 6.5, 16, 5);
    k.cylinder("octagonal-tiburium", [21, 25, 0], 8, 10, "tile", 8, 8);
    k.cylinder("tiburium-roof", [21, 33, 0], 8.4, 6, "tile", 0, 8);
    k.tower("canons-bell-tower", -16, -18, 6.5, 39, 3, false);
    k.tower("monks-bell-tower", -15, 17, 5, 25, 5, false);
    k.arcade("atrium-west", -15, -53, 30, 8, 0, 5, Math.PI / 2);
    k.crossNave("atrium-west-roof", -53, 0, 34, 4, 5, 2, 4.8);
    k.arcade("lower-west-portico", -13, -23, 26, 5, 0, 6, Math.PI / 2);
    k.crossNave("lower-portico-roof", -23, 0, 28, 4, 6, 2, 5.8);
    k.arcade("upper-west-loggia", -12, -22, 24, 5, 8, 8, Math.PI / 2);
    for (const z of [-8, 0, 8]) k.opening("west-door", -21, 0.1, z, 3.5, 5, -Math.PI / 2, false, true);
    k.block("west-cornice", -21.5, 0, 0.7, 26, 0.5, 17);
    for (const x of [-18, -10, -2, 6, 14, 22, 30])
      for (const s of [-1, 1]) k.block("lombard-band", x, s * 13.1, 0.4, 0.2, 8.5, 1);
    return k.finish();
  }
};
