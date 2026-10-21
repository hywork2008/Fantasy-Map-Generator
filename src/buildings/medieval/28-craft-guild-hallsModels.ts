import { assemblyHall } from "./civicParts";
import type { MedievalModel } from "./modelKit";

const crafts = [
  {
    id: "leather",
    name: "Leatherworkers' guild hall",
    note: "Leather trade emblem, a hanging hide and leather inspection tables; an assembly hall rather than a tannery."
  },
  {
    id: "woodworking",
    name: "Carpenters' guild hall",
    note: "Timber framing, crossed carpenter's-square and axe emblems, board samples and a meeting loggia; separate from a joiner's workshop."
  },
  {
    id: "masonry",
    name: "Masons' guild hall",
    note: "Masonry meeting house with square-and-compass plaque, dressed stone samples and a substantial entry stair; not a quarry yard."
  },
  {
    id: "metallurgy",
    name: "Smiths' guild hall",
    note: "Guild meeting hall with anvil and hammer emblems, ironwork samples and a public loggia; no forge or furnace."
  }
] as const;
export const models: MedievalModel[] = crafts.map((craft, index) => ({
  id: `${craft.id}-guild-hall`,
  name: craft.name,
  task: 28,
  size: [20, 14, 11],
  note: craft.note,
  create() {
    const k = assemblyHall(`${craft.id}-guild-hall`, 12, 7);
    k.box("guild-emblem-plaque", [0, 5.7, 3.7], [1.6, 1.4, 0.12], index === 2 ? "stone" : "wood");
    k.box("guild-banner", [-1.8, 5, 3.68], [0.7, 1.5, 0.05], "cloth");
    k.table(-2, 0, 2.5, 1.2, 0.9);
    if (craft.id === "leather") {
      k.box("guild-hide-sample", [0, 5.65, 3.8], [0.85, 0.85, 0.04], "leather");
      k.box("inspected-leather", [-2, 1, 0], [1.8, 0.06, 1], "leather");
    }
    if (craft.id === "woodworking") {
      k.beam("carpenters-square-arm", [-0.5, 5.3, 3.82], [-0.5, 6.2, 3.82], 0.1, "wood");
      k.beam("carpenters-square-base", [-0.5, 5.3, 3.82], [0.4, 5.3, 3.82], 0.1, "wood");
      k.beam("axe-emblem-haft", [-0.2, 5.2, 3.84], [0.5, 6.2, 3.84], 0.08);
      k.box("axe-emblem-blade", [0.4, 6.12, 3.84], [0.4, 0.25, 0.06], "iron");
      for (let i = 0; i < 4; i++)
        k.box("wood-grain-sample", [-2.8 + i * 0.5, 1, 0], [0.45, 0.12, 0.9], i % 2 ? "oak" : "wood");
    }
    if (craft.id === "masonry") {
      for (const s of [-1, 1]) k.beam("masons-compass", [0, 6.2, 3.84], [s * 0.5, 5.3, 3.84], 0.065, "iron");
      k.beam("masons-square", [-0.4, 5.7, 3.84], [0.4, 5.7, 3.84], 0.08, "wood");
      for (let i = 0; i < 3; i++) k.box("stone-sample", [-2.7 + i * 0.7, 1.2, 0], [0.55, 0.5, 0.7], "stone");
    }
    if (craft.id === "metallurgy") {
      k.box("anvil-emblem-face", [0, 5.8, 3.84], [1, 0.2, 0.1], "iron");
      k.box("anvil-emblem-waist", [0, 5.55, 3.84], [0.35, 0.4, 0.1], "iron");
      k.box("anvil-emblem-foot", [0, 5.3, 3.84], [0.7, 0.16, 0.1], "iron");
      for (let i = 0; i < 5; i++)
        k.beam("ironwork-sample", [-2.8 + i * 0.4, 1, 0], [-2.8 + i * 0.4, 1, 0.7], 0.055, "iron", true);
    }
    return k.finish();
  }
}));
