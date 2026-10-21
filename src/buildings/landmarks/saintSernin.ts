import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "saintSernin",
  task: "R06",
  name: "Basilica of Saint-Sernin, Toulouse",
  style: "Romanesque",
  state: "Present exterior, including later upper stages of the crossing belfry",
  size: [129, 70, 66],
  dimensions:
    "Approximate 115 m church body and 64 m belfry study. Chapel positions, bay widths and brick/stone bands are estimates; the envelope includes projecting chapels and is not a survey.",
  note: "Brick-and-stone five-aisled pilgrimage basilica, broad transepts, ambulatory and five radiating chapels. The stepped octagonal belfry has round-headed lower openings and pointed later upper openings. Sculpture, crypt, vaults and exact masonry courses are omitted.",
  sources: [
    {
      title: "Toulouse tourism: Saint-Sernin basilica",
      url: "https://www.toulouse-tourisme.com/en/activite/saint-sernin-basilica/"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "tile", "tile");
    k.nave("pilgrimage-nave", -8, 0, 100, 12, 23, 8);
    for (const s of [-1, 1]) {
      k.nave("double-aisle", -8, s * 13, 100, 14, 11, 4);
      k.crossNave("transept", 18, s * 20, 28, 15, 22, 7);
      k.opening("transept-round-window", 18, 13, s * 34, 4, 6, s > 0 ? 0 : Math.PI, false);
      k.opening("south-and-north-door", 3, 0.1, s * 20, 4.5, 7, s > 0 ? 0 : Math.PI, false, true);
      for (const x of [-48, -38, -28, -18, -8, 32]) {
        k.opening("clerestory", x, 15, s * 6, 2.5, 5, s > 0 ? 0 : Math.PI, false);
        k.opening("aisle-window", x, 3, s * 20, 2.2, 5, s > 0 ? 0 : Math.PI, false);
      }
      for (const y of [6, 10]) k.box("stone-band", [-8, y, s * 20.03], [100, 0.3, 0.08], "white");
    }
    k.apse("ambulatory", 42, 0, 20, 11, 4);
    k.apse("high-apse", 42, 0, 6, 23, 8);
    k.radialChapels(42, 17, 5, 5, 8);
    let base = 31;
    const tiers = [
      [7.5, 6],
      [6.8, 6],
      [6, 5],
      [5, 5],
      [4, 4]
    ];
    for (let i = 0; i < tiers.length; i++) {
      const [r, h] = tiers[i];
      k.cylinder("octagonal-belfry-tier", [18, base + h / 2, 0], r, h, "tile", r, 8);
      for (let j = 0; j < 8; j++) {
        const a = (j * Math.PI) / 4;
        k.opening("belfry-opening", 18 + Math.sin(a) * r, base + 0.7, Math.cos(a) * r, 2.1, h - 1.2, a, i >= 3);
      }
      k.cylinder("belfry-stone-cornice", [18, base + h, 0], r + 0.3, 0.35, "white", r + 0.3, 8);
      base += h;
    }
    k.spire("belfry-spire", 18, 57, 0, 4.2, 7);
    k.block("west-front", -58, 0, 0.8, 39, 18);
    for (const z of [-6, 6]) k.opening("west-door", -58.4, 0.1, z, 4.5, 8, -Math.PI / 2, false, true);
    k.rose(-58.4, 15, 0, 3, -Math.PI / 2);
    return k.finish();
  }
};
