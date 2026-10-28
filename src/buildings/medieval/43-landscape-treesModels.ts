import { createLandscapeTree, TREE_SPECIES } from "../landscape/trees";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = TREE_SPECIES.map(species => ({
  id: species.replaceAll("_", "-"),
  author: ["garden_parkland", "sacred_yew", "norway_spruce", "silver_birch"].includes(species)
    ? "GPT-6.1 Sol"
    : "Codex GPT-6.1 Sol",
  biomes:
    species === "garden_parkland" || species === "sacred_yew"
      ? ["temperateDeciduousForest", "centralEuropeanGreatForest"]
      : species === "norway_spruce" || species === "silver_birch"
        ? ["taiga", "temperateDeciduousForest"]
        : undefined,
  name:
    species === "norway_spruce"
      ? "Norway spruce · Picea abies"
      : species === "silver_birch"
        ? "Silver birch · Betula pendula"
        : species === "garden_parkland"
          ? "Small-leaved lime · Tilia cordata"
          : species === "sacred_yew"
            ? "European yew · Taxus baccata"
            : species.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()),
  task: 43,
  size:
    species === "norway_spruce"
      ? [7, 7, 13]
      : species === "silver_birch"
        ? [9, 9, 12]
        : species === "garden_parkland"
          ? [13, 13, 13]
          : species === "sacred_yew"
            ? [12, 12, 9]
            : [10, 10, 10],
  note:
    species === "norway_spruce"
      ? "Boreal Picea abies with a tapered trunk, whorled drooping branches, an upright leader and abstract evergreen needle sprays. Shared with CE cold-climate parks and cemeteries. Illustrative summer tree, not a measured specimen. Botanical reference: https://forest.jrc.ec.europa.eu/media/atlas/Picea_abies.pdf"
      : species === "silver_birch"
        ? "Summer Betula pendula with pale bark, dark basal fissures, small leaves and pendulous outer twigs. Shared with CE boreal parks. Illustrative dimensions; not a cultivar. Botanical reference: https://www.forestryengland.uk/tree-species/silver-birch"
        : species === "garden_parkland"
          ? "Open-grown summer Tilia cordata, native to western and central Europe. Tapered branching timber, root flare and individually folded heart-shaped leaves; shared with CE park trees. Natural tree for medieval gardens and churchyards; not a modern cultivar. Botanical reference: https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/133243-small-leaved-lime-sli/"
          : species === "sacred_yew"
            ? "Mature untrimmed European yew (Taxus baccata), shared with CE churchyards. Broad evergreen crown, fluted reddish-brown trunk, spreading branches and folded serrated sprays abstracting two-ranked needles. Needle groups are abstracted for responsive viewing and city instancing. No modern columnar cultivar or topiary; no seasonal arils. Botanical reference: https://www.forestryengland.uk/tree-species/yew"
            : "Stylized funerary or park tree with a trunk, branches and a species-specific canopy. Illustrative meter dimensions; not a botanical reconstruction.",
  create: () => createLandscapeTree(species)
}));
