import { createLandscapeTree, TREE_SPECIES } from "../landscape/trees";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = TREE_SPECIES.map(species => ({
  id: species.replaceAll("_", "-"),
  author: species === "garden_parkland" ? "GPT-6.1 Sol" : undefined,
  biomes: species === "garden_parkland" ? ["temperateDeciduousForest", "centralEuropeanGreatForest"] : undefined,
  name:
    species === "garden_parkland"
      ? "Small-leaved lime · Tilia cordata"
      : species.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()),
  task: 43,
  size: species === "garden_parkland" ? [13, 13, 13] : [10, 10, 10],
  note:
    species === "garden_parkland"
      ? "Open-grown summer Tilia cordata, native to western and central Europe. Tapered branching timber, root flare and individually folded heart-shaped leaves; shared with CE park trees. Natural tree for medieval gardens and churchyards; not a modern cultivar. Botanical reference: https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/133243-small-leaved-lime-sli/"
      : "Stylized funerary or park tree with a trunk, branches and a species-specific canopy. Illustrative meter dimensions; not a botanical reconstruction.",
  create: () => createLandscapeTree(species)
}));
