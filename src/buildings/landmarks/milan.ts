import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "milan",
  task: "G08",
  name: "Duomo di Milano",
  style: "Gothic",
  state: "Present exterior, including early-modern main spire and later facade",
  size: [166, 99, 111],
  dimensions:
    "Approximate 158 m long, 93 m wide body and 108.5 m main-spire study. Terrace heights, finial count and spacing are illustrative; this is not a survey or a complete inventory of the 135 spires.",
  note: "White-marble five-aisled cathedral, stepped roof terraces, dense pinnacles, octagonal tiburium and three tall apse windows. The present outline includes post-medieval work. Statues, exact tracery, interior and individual terrace stairs are omitted.",
  sources: [
    {
      title: "Veneranda Fabbrica: construction phases",
      url: "https://www.duomomilano.it/en/art-and-culture/the-cathedral/"
    },
    {
      title: "Veneranda Fabbrica: terraces and spires",
      url: "https://www.duomomilano.it/en/art-and-culture/the-terraces/"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "white", "stone");
    k.nave("central-nave", -10, 0, 134, 18, 46, 7);
    for (const s of [-1, 1]) {
      k.nave("inner-aisle", -10, s * 15, 134, 12, 35, 5);
      k.nave("outer-aisle", -10, s * 26, 134, 10, 25, 4);
      k.crossNave("transept", 17, s * 27, 39, 24, 43, 8);
      for (const x of [-66, -54, -42, -30, -18, -6, 39, 51]) {
        k.opening("outer-window", x, 7, s * 31, 5, 15, s > 0 ? 0 : Math.PI);
        k.flyer(x + 4, 9.2, 34, 30, 44, s);
        for (const z of [15, 26, 34]) k.pinnacle(x + 4, z === 15 ? 40 : 29, s * z, 1, 13);
      }
    }
    k.apse("polygonal-choir", 57, 0, 26, 35, 5);
    k.apse("high-apse", 57, 0, 9, 46, 7);
    for (const a of [Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4])
      k.opening("great-apse-window", 57 + Math.sin(a) * 26, 8, Math.cos(a) * 26, 8, 23, a);
    k.cylinder("octagonal-tiburium", [17, 58, 0], 12, 20, "white", 12, 8);
    k.cylinder("tiburium-cap", [17, 72, 0], 12, 8, "stone", 4, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      k.pinnacle(17 + Math.cos(a) * 11, 68, Math.sin(a) * 11, 1.1, 15);
    }
    k.spire("main-spire", 17, 76, 0, 4, 32.5, true);
    k.sphere("madonnina-marker", [17, 108.7, 0], [0.45, 0.5, 0.45], "straw");
    // Five stepped facade bays follow the five aisle widths.
    for (const [z, w, h] of [
      [0, 18, 55],
      [-15, 12, 43],
      [15, 12, 43],
      [-26, 10, 34],
      [26, 10, 34]
    ]) {
      k.block("facade-bay", -77, z, 1, w, h);
      k.opening("facade-door", -77.5, 0.1, z, 4.2, 10, -Math.PI / 2, true, true);
      k.opening("facade-window", -77.5, 16, z, 4.5, 10, -Math.PI / 2);
      k.pinnacle(-77, h, z, w * 0.1, 10);
    }
    return k.finish();
  }
};
