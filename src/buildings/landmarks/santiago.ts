import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "santiago",
  task: "R08",
  name: "Santiago de Compostela Cathedral, Romanesque study",
  style: "Romanesque",
  state: "Interpretive c. 1211 core study; west tower silhouettes are conjectural",
  size: [104, 73, 47],
  dimensions:
    "Approximate 97 m long by 65 m transept-wide medieval core study. Bay spacing, tower heights, west front and chapel dimensions are estimates; this is not a measured or archaeological reconstruction.",
  note: "Romanesque pilgrimage plan with transept aisles, ambulatory, radiating chapels and paired Platerias portals. The three-arched west narthex evokes the Portico of Glory without reproducing its sculpture. Excludes the Baroque Obradoiro facade, Renaissance cloister, later clock tower and monumental stairs. Uncertain medieval west towers use deliberately plain conjectural massing.",
  sources: [
    {
      title: "Cathedral: medieval core and surviving Platerias facade",
      url: "https://catedraldesantiago.es/en/cathedral/"
    },
    {
      title: "Cathedral: Portico of Glory and replacement west facade",
      url: "https://catedraldesantiago.es/en/portico-de-la-gloria/"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "stone", "tile");
    k.nave("romanesque-core", -7, 0, 80, 11, 23, 8);
    for (const s of [-1, 1]) {
      k.nave("nave-aisle", -7, s * 9, 80, 7, 11, 4);
      k.crossNave("transept", 8, s * 19, 30, 12, 22, 7);
      for (const dx of [-9, 9]) k.crossNave("transept-aisle", 8 + dx, s * 19, 30, 6, 11, 4);
      for (const x of [-38, -29, -20, -11, 24])
        k.opening("round-clerestory", x, 15, s * 5.5, 2.2, 5, s > 0 ? 0 : Math.PI, false);
      k.tower("conjectural-west-tower", -40, s * 14, 8, 35, 7, false);
    }
    k.apse("ambulatory", 33, 0, 15, 11, 4);
    k.apse("high-apse", 33, 0, 5.5, 23, 8);
    k.radialChapels(33, 12, 5, 4, 8);
    for (const z of [-23, 23]) k.apse("transept-apsidiole", 17, z, 3.5, 9, 3);
    k.block("west-screen", -47, 0, 1, 31, 21);
    k.arcade("mateo-west-narthex", -10, -49, 20, 3, 0, 10, Math.PI / 2, false);
    for (const z of [-7, 0, 7]) k.opening("west-narthex-portal", -47.5, 0.1, z, 5, 9, -Math.PI / 2, false, true);
    k.block("platerias-screen", 8, 34, 23, 1, 17);
    for (const x of [3, 13]) {
      k.opening("platerias-portal", x, 0.1, 34.5, 6.5, 9, 0, false, true);
      k.opening("platerias-upper-window", x, 11, 34.5, 3, 4, 0, false);
    }
    for (const x of [-2, 8, 18]) k.block("platerias-relief-panel", x, 34.6, 1, 0.25, 3.3, 6);
    k.cylinder("crossing-roof", [8, 33, 0], 7, 6, "tile", 0, 8);
    return k.finish();
  }
};
