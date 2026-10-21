import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "sainteChapelle",
  task: "G06",
  name: "Sainte-Chapelle, Paris",
  style: "Gothic",
  state: "Restored exterior with 15th-century west rose and 19th-century fleche",
  size: [43, 25, 77],
  dimensions:
    "Approximate 36 m by 17 m chapel body and 75 m overall spire study. Buttress projection, window widths and vertical divisions are estimates; not a measured survey.",
  note: "Two-storey palatine chapel, four tall glazed bays per side, seven polygonal apse bays, west rose and two-level west porch. The 15 tall glazing bays follow the CMN description. No nave aisles or transepts. Palace, interior painting and stained-glass narratives are omitted.",
  sources: [
    {
      title: "CMN: history and 15 stained-glass bays",
      url: "https://www.sainte-chapelle.fr/en/discover/history-of-the-sainte-chapelle"
    },
    {
      title: "CMN: 15th-century west rose",
      url: "https://www.sainte-chapelle.fr/en/discover/the-rose-of-the-apocalypse"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id);
    k.nave("upper-chapel", -4, 0, 28, 17, 28, 12);
    k.apse("polygonal-sanctuary", 10, 0, 8.5, 28, 12);
    for (const s of [-1, 1]) {
      for (const x of [-14.5, -7.5, -0.5, 6.5]) {
        k.opening("upper-glazing", x, 9.5, s * 8.5, 5, 15, s > 0 ? 0 : Math.PI);
        k.opening("lower-chapel-window", x, 2, s * 8.5, 2.5, 3, s > 0 ? 0 : Math.PI);
      }
      for (const x of [-18, -11, -4, 3, 10]) {
        k.block("stepped-buttress", x, s * 9.5, 1, 3, 11);
        k.block("upper-buttress", x, s * 9, 0.8, 2, 18, 11);
        k.pinnacle(x, 29, s * 9, 0.55, 5);
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = ((i + 0.5) * Math.PI) / 7;
      k.opening("upper-glazing", 10 + Math.sin(a) * 8.5, 9.5, Math.cos(a) * 8.5, 3.1, 15, a);
      k.block("apse-buttress", 10 + Math.sin(a) * 9.2, Math.cos(a) * 9.2, 0.7, 0.7, 29);
    }
    k.block("west-screen", -18, 0, 0.7, 17, 28);
    k.rose(-18.35, 21, 0, 5.5, -Math.PI / 2);
    k.opening("lower-west-door", -18.35, 0.1, 0, 3, 5, -Math.PI / 2, true, true);
    k.opening("upper-west-door", -18.35, 8, 0, 3, 5, -Math.PI / 2, true, true);
    for (const y of [0, 7.5]) k.arcade("west-porch", -7, -21, 14, 3, y, 6.5, Math.PI / 2, true);
    k.block("porch-upper-floor", -19.5, 0, 4, 15, 0.4, 7.1);
    k.block("porch-canopy", -19.5, 0, 4, 15, 0.5, 14);
    k.tower("fleche-lantern", 0, 0, 3, 8, 0, true, 39);
    k.spire("restored-fleche", 0, 47.7, 0, 2, 27.3);
    return k.finish();
  }
};
