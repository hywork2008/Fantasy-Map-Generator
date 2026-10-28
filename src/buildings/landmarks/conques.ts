import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "conques",
  task: "R07",
  name: "Sainte-Foy Abbey Church, Conques",
  style: "Romanesque",
  state: "Present restored exterior, including rebuilt west tower crowns",
  size: [59, 39, 40],
  dimensions:
    "The tourism authority describes a 20.70 m nave and 35 m transept. Overall study length is approximately 56 m; towers, chevet and porch use estimated proportions, not surveyed dimensions.",
  note: "Compact hillside pilgrimage church with a short nave, wide transept, three radiating chapels, crossing lantern and twin west towers. Last Judgment tympanum uses abstract figure markers only. Terrain, exact sculpture, Soulages glazing patterns and interior are omitted.",
  sources: [
    {
      title: "Conques tourism: compact plan and dimensions",
      url: "https://www.tourisme-conques.fr/fr/conques/www.tourisme-conques.fr/fr/conques/abbatiale"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "stone", "iron");
    k.nave("short-nave", -8, 0, 28, 9, 22, 7);
    k.nave("choir", 14, 0, 16, 9, 21, 6);
    for (const s of [-1, 1]) {
      k.nave("aisle", -8, s * 7.5, 28, 6, 11, 4);
      k.crossNave("broad-transept", 5, s * 10, 15, 11, 21, 6);
      for (const x of [-17, -9, -1]) {
        k.opening("nave-round-window", x, 14, s * 4.5, 2.2, 5, s > 0 ? 0 : Math.PI, false);
        k.opening("aisle-round-window", x, 3, s * 10.5, 2, 5, s > 0 ? 0 : Math.PI, false);
      }
      k.tower("west-tower", -17, s * 10, 7, 25, 9, false);
      k.apse("transept-apse", 10, s * 12, 3.2, 10, 3);
    }
    k.apse("ambulatory", 22, 0, 9, 10, 3);
    k.apse("high-apse", 22, 0, 4.5, 21, 6);
    k.radialChapels(22, 8, 3, 3.2, 8);
    k.cylinder("crossing-lantern", [5, 29, 0], 6, 8, "stone", 6, 8);
    k.cylinder("lantern-roof", [5, 35.5, 0], 6.3, 5, "iron", 0, 8);
    k.block("west-screen", -22, 0, 1, 24, 19);
    k.opening("west-portal", -22.5, 0.1, 0, 8, 10, -Math.PI / 2, false, true);
    k.opening("tympanum-field", -22.7, 5, 0, 7, 4, -Math.PI / 2, false, true);
    for (const z of [-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7]) {
      k.block("tympanum-figure-marker", -23, z, 0.22, 0.3, 0.8, 5.5);
      k.sphere("tympanum-head-marker", [-23, 6.5, z], [0.15, 0.18, 0.15], "plaster");
    }
    k.box("tympanum-cross", [-23.1, 7.6, 0], [0.2, 2, 0.2], "white");
    k.box("tympanum-cross-arm", [-23.1, 8, 0], [0.2, 0.2, 1.4], "white");
    k.opening("west-upper-window", -22.5, 12, 0, 4, 5, -Math.PI / 2, false);
    return k.finish();
  }
};
