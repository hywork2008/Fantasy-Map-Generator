import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "modena",
  task: "R04",
  name: "Modena Cathedral",
  style: "Romanesque",
  state: "Present cathedral exterior, including the later west rose; civic tower excluded",
  size: [72, 30, 32],
  dimensions:
    "Approximate 66 m long by 25 m wide study. Portico, rose, loggia and apses use estimated proportions; not a measured survey. The Ghirlandina civic tower is not included in these bounds.",
  note: "Three-aisled basilica without a projecting transept, three east apses, west rose and two-storey projecting porch with stylized lion supports. Sculpture, exact marble carving and interior are omitted.",
  sources: [{ title: "UNESCO: cathedral and separate civic tower", url: "https://whc.unesco.org/en/list/827/" }],
  create() {
    const k = new ArchitectureKit(this.id, "white", "tile");
    k.nave("central-nave", -1, 0, 56, 11, 20, 8);
    for (const s of [-1, 1]) {
      k.nave("aisle", -1, s * 9, 56, 7, 10, 4);
      k.apse("side-apse", 27, s * 9, 3.5, 10, 3);
      k.arcade("side-loggia", -27, s * 12.7, 52, 13, 7, 3);
      for (const x of [-23, -13, -3, 7, 17])
        k.opening("clerestory-window", x, 13, s * 5.5, 2, 5, s > 0 ? 0 : Math.PI, false);
    }
    k.apse("central-apse", 27, 0, 5.5, 19, 6);
    k.block("west-screen", -29, 0, 1, 25, 18);
    k.rose(-29.5, 18, 0, 4.6, -Math.PI / 2);
    for (const z of [-9, 0, 9]) k.opening("west-door", -29.5, 0.1, z, 3.8, 7, -Math.PI / 2, false, true);
    for (const z of [-3, 3]) {
      k.sphere("lion-plinth", [-34, 0.55, z], [1.4, 0.55, 0.65], "stone");
      k.cylinder("porch-column", [-34, 3.6, z], 0.3, 5.2, "white");
    }
    k.arcade("porch-arch", -3, -34, 6, 1, 1, 5.5, Math.PI / 2, false);
    k.nave("porch-upper-canopy", -32, 0, 6, 7, 7, 2, 6.5);
    k.arcade("porch-upper-loggia", -3, -34.5, 6, 3, 7, 3.5, Math.PI / 2, false);
    k.nave("porch-top-canopy", -32, 0, 6, 7, 10.5, 2.5, 10.3);
    k.arcade("west-loggia", -12, -29.7, 24, 8, 8, 3, Math.PI / 2, false);
    return k.finish();
  }
};
