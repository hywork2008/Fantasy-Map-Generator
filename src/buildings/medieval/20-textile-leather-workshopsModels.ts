import { type MedievalModel, ModelKit } from "./modelKit";

function workshop(kind: "weaver" | "tailor" | "cobbler") {
  const k = new ModelKit(`${kind}-workshop`);
  k.hall(0, -1, 6, 4, 2.9, 1.3, { open: true, roof: "wood" });
  if (kind === "weaver") {
    for (const x of [-1.1, 1.1]) for (const z of [-0.9, 0.8]) k.box("loom-upright", [x, 1.1, z], [0.13, 2.2, 0.13]);
    for (const z of [-0.9, 0.8]) k.beam("loom-crossbeam", [-1.1, 2.15, z], [1.1, 2.15, z], 0.16);
    for (let i = 0; i < 30; i++)
      k.beam("warp-thread", [-0.95 + i * 0.065, 1.85, -0.85], [-0.95 + i * 0.065, 0.85, 0.8], 0.012, "white", true);
    k.box("woven-cloth", [0, 0.89, 0.6], [1.9, 0.025, 0.5], "cloth");
    k.beam("cloth-beam", [-1.1, 0.9, 0.9], [1.1, 0.9, 0.9], 0.15, "wood", true);
    for (const x of [-0.6, 0.6]) k.beam("loom-treadle", [x, 0.2, 0.9], [x, 0.3, -0.6], 0.08);
    k.box("weavers-bench", [0, 0.45, 1.7], [2, 0.15, 0.35], "wood");
  } else {
    k.table(0, 0, 3.1, 1.4, 0.85);
    k.box("cutting-material", [0, 0.93, 0], [1.8, 0.025, 1], kind === "tailor" ? "cloth" : "leather");
    if (kind === "tailor") {
      for (const s of [-1, 1]) k.beam("shears-blade", [0.2, 0.97, 0], [0.7, 0.97, s * 0.22], 0.035, "iron");
      for (let i = 0; i < 6; i++)
        k.box("folded-textiles", [-2, 0.45 + i * 0.18, -1.3], [1, 0.15, 0.65], i % 2 ? "white" : "cloth");
      k.box("garment-rail", [1.9, 2.2, -1.5], [1.6, 0.1, 0.1]);
      for (let i = 0; i < 3; i++) k.box("hanging-garment", [1.3 + i * 0.5, 1.6, -1.5], [0.4, 1.1, 0.04], "cloth");
    } else {
      for (let i = 0; i < 5; i++) k.sphere("shoe-last", [-1 + i * 0.5, 1.02, 0.25], [0.2, 0.1, 0.1], "wood");
      k.box("leather-hide", [-1, 0.98, -0.3], [0.65, 0.03, 0.5], "leather");
      k.box("cobblers-stool", [0, 0.4, 1.5], [0.65, 0.15, 0.55], "wood");
      for (const x of [-0.25, 0.25]) k.box("stool-foot", [x, 0.2, 1.5], [0.12, 0.4, 0.4]);
      k.beam("cobblers-awl", [0.7, 0.99, -0.2], [1, 0.99, -0.2], 0.04, "iron", true);
    }
  }
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id: "weavers-workshop",
    name: "Weaver workshop and treadle loom",
    task: 20,
    size: [9, 8, 6],
    note: "Open workshop with a four-post treadle loom, individually modeled warp, cloth beam, treadles and a weaver's bench.",
    create: () => workshop("weaver")
  },
  {
    id: "tailors-workshop",
    name: "Tailor workshop and cutting table",
    task: 20,
    size: [9, 8, 6],
    note: "Tailor's cutting table, shears, folded cloth and a garment rail under a small workshop roof. Distinct from a cloth guild hall.",
    create: () => workshop("tailor")
  },
  {
    id: "cobblers-workshop",
    name: "Cobbler workshop and shoe lasts",
    task: 20,
    size: [9, 8, 6],
    note: "Leather cutting bench, wooden shoe lasts, awl, leather pieces and a low cobbler's stool. A small workshop rather than a guild meeting house.",
    create: () => workshop("cobbler")
  }
];
