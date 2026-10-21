import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  id: "notre-dame-paris",
  task: "G01",
  name: "Notre-Dame de Paris",
  style: "Gothic",
  state: "Restored exterior silhouette, including the 19th-century spire design",
  size: [132, 58, 97],
  dimensions:
    "Metre-scale study: approximately 128 m long; 69 m west towers and 96 m restored spire. Bay spacing, buttress reach and chapel dimensions are estimates, not a measured survey.",
  note: "Five-aisled body, shallow transepts, three west portals, rose windows, open twin belfries, chevet and two tiers of flying buttresses. Sculpture, interior vaults, sacristy, weathering and individual stained-glass scenes are omitted. Window recesses are opaque surface inlays.",
  sources: [
    { title: "Cathedral: plans and elevations", url: "https://www.notredamedeparis.fr/comprendre/architecture/plans/" },
    {
      title: "Cathedral: exterior architecture",
      url: "https://www.notredamedeparis.fr/en/understand/architecture/exterior-architecture/"
    },
    {
      title: "Restoration authority: restored spire, 96 m",
      url: "https://rebatirnotredamedeparis.fr/en/news/the-spire-of-notre-dame-de-paris-is-reborn"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id);
    k.nave("nave-and-choir", -8, 0, 100, 14, 35, 10);
    for (const side of [-1, 1]) {
      k.nave("double-aisle", -8, side * 12, 100, 10, 14, 4);
      k.crossNave("transept", 3, side * 13, 23, 14, 32, 9);
      k.rose(3, 23, side * 24.5, 5.5, side > 0 ? 0 : Math.PI);
    }
    k.apse("outer-ambulatory", 42, 0, 17, 14, 4);
    k.apse("choir-apse", 42, 0, 7, 35, 10);
    k.radialChapels(42, 17, 7, 5, 9);
    k.bays([-44, -36, -28, -20, 18, 26, 34], 7, 35, 17, 14, true, true);
    for (const x of [-41, -33, -25, 21, 29, 37]) for (const s of [-1, 1]) k.flyer(x, 7.2, 20.2, 25, 32, s);
    for (let i = 1; i < 8; i++) {
      const a = (i * Math.PI) / 8;
      k.beam(
        "chevet-flying-buttress",
        [42 + Math.sin(a) * 7, 31, Math.cos(a) * 7],
        [42 + Math.sin(a) * 22, 16, Math.cos(a) * 22],
        1.2,
        "plaster"
      );
      k.block("chevet-pier", 42 + Math.sin(a) * 22, Math.cos(a) * 22, 1.7, 1.7, 17);
    }
    k.block("west-screen", -59, 0, 7, 40, 43);
    for (const z of [-13, 13]) k.tower("west-tower", -54, z, 13, 68.3);
    for (const z of [-13, 0, 13]) k.opening("west-portal", -62.5, 0.1, z, z ? 6 : 7.5, 12, -Math.PI / 2, true, true);
    k.rose(-62.5, 28, 0, 4.5, -Math.PI / 2);
    k.arcade("kings-gallery", -20, -62.9, 40, 28, 15, 4, Math.PI / 2);
    k.arcade("west-gallery", -20, -62.9, 40, 14, 37, 5, Math.PI / 2, true);
    k.tower("crossing-lantern", 3, 0, 6, 12, 0, true, 44);
    k.spire("restored-crossing-spire", 3, 56.7, 0, 4.2, 39.3);
    return k.finish();
  }
};
