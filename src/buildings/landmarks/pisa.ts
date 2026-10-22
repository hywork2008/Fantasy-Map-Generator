import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "pisa",
  task: "R03",
  name: "Pisa Cathedral",
  style: "Romanesque",
  state: "Present cathedral exterior; freestanding campanile and baptistery excluded",
  size: [112, 81, 56],
  dimensions:
    "Approximate 100 m long, 75 m transept-wide cathedral study. Gallery tiers, dome profile and marble banding are illustrative; display dimensions are not a measured survey.",
  note: "Pisan Romanesque five-aisled body with three-aisled transepts, four open facade loggia tiers and an elliptical crossing dome. The Leaning Tower is a separate building and is deliberately excluded. Interior, bronze-door reliefs, mosaic and exact marble pattern are omitted.",
  sources: [{ title: "UNESCO: cathedral precinct and Pisan Romanesque", url: "https://whc.unesco.org/en/list/395/" }],
  create() {
    const k = new ArchitectureKit(this.id, "white", "tile");
    k.nave("central-nave", -2, 0, 88, 12, 25, 6);
    for (const s of [-1, 1]) {
      k.nave("double-aisle", -2, s * 13, 88, 14, 11, 4);
      k.crossNave("central-transept", 14, s * 22, 33, 12, 23, 6);
      for (const dx of [-9, 9]) k.crossNave("transept-aisle", 14 + dx, s * 22, 33, 6, 11, 4);
      for (const x of [-36, -26, -16, -6, 30, 39]) {
        k.opening("clerestory", x, 17, s * 6, 2, 5, s > 0 ? 0 : Math.PI, false);
        k.opening("aisle-round-window", x, 3, s * 20, 2.5, 5, s > 0 ? 0 : Math.PI, false);
      }
      for (const y of [3, 7, 11]) k.box("marble-band", [-2, y, s * 20.03], [88, 0.24, 0.08], "stone");
    }
    for (const side of [-1, 1])
      for (const y of [18, 23]) k.box("upper-marble-band", [-2, y, side * 6.03], [88, 0.24, 0.08], "stone");
    k.apse("apse", 42, 0, 8, 23, 5);
    const drum = k.cylinder("elliptical-drum", [14, 30, 0], 8, 10, "white", 8, 24);
    drum.scale.x = 1.3;
    k.dome("elliptical-dome", 14, 35, 0, 8.5, 14);
    const dome = k.pickables.at(-1)!;
    dome.scale.x *= 1.3;
    k.cylinder("dome-lantern", [14, 51, 0], 1.2, 4, "white", 0.6, 8);
    k.block("lower-west-facade", -46, 0, 2, 42, 12);
    for (const z of [-14, 0, 14]) k.opening("west-door", -47, 0.1, z, 5, 8, -Math.PI / 2, false, true);
    for (const [level, width, count] of [
      [12, 40, 15],
      [16, 34, 13],
      [20, 26, 9],
      [24, 18, 7]
    ]) {
      k.arcade("facade-loggia", -width / 2, -48, width, count, level, 3.5, Math.PI / 2, false);
      k.block("loggia-cornice", -47.8, 0, 0.9, width + 0.6, 0.35, level + 3.5);
    }
    return k.finish();
  }
};
