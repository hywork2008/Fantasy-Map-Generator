import { createLandscapeTree, TREE_SPECIES } from "../landscape/trees";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = TREE_SPECIES.map(species => ({
  id: species.replaceAll("_", "-"),
  author: ["date_palm", "umbrella_thorn", "saxaul", "kapok"].includes(species)
    ? "Claude Opus 5.5"
    : ["garden_parkland", "sacred_yew", "norway_spruce", "silver_birch"].includes(species)
      ? "GPT-6.1 Sol"
      : undefined,
  biomes:
    species === "garden_parkland" || species === "sacred_yew"
      ? ["temperateDeciduousForest", "centralEuropeanGreatForest"]
      : species === "norway_spruce" || species === "silver_birch"
        ? ["taiga", "temperateDeciduousForest"]
        : species === "saxaul"
          ? ["coldDesert", "coldSteppe"]
          : species === "kapok"
            ? ["tropicalRainforest", "cloudForest", "floodedForest"]
            : species === "date_palm"
              ? ["hotDesert", "xericShrubland"]
              : species === "umbrella_thorn"
                ? ["savanna", "tropicalSeasonalForest", "tropicalDryForest"]
                : undefined,
  name:
    species === "saxaul"
      ? "Black saxaul · Haloxylon ammodendron"
      : species === "kapok"
        ? "Kapok · Ceiba pentandra"
        : species === "date_palm"
          ? "Date palm · Phoenix dactylifera"
          : species === "umbrella_thorn"
            ? "Umbrella thorn acacia · Vachellia tortilis"
            : species === "norway_spruce"
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
    species === "saxaul"
      ? [6, 6, 5]
      : species === "kapok"
        ? [22, 22, 19]
        : species === "date_palm"
          ? [10, 10, 12]
          : species === "umbrella_thorn"
            ? [12, 12, 8]
            : species === "norway_spruce"
              ? [7, 7, 13]
              : species === "silver_birch"
                ? [9, 9, 12]
                : species === "garden_parkland"
                  ? [13, 13, 13]
                  : species === "sacred_yew"
                    ? [12, 12, 9]
                    : [10, 10, 10],
  note:
    species === "saxaul"
      ? "Cold-desert Haloxylon ammodendron: a low gnarled trunk splitting into crooked, pale fibrous stems and a sparse crown of leafless, jointed green shoots hanging in tassels. Shared with CE Central Asian desert and steppe parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Haloxylon_ammodendron"
      : species === "kapok"
        ? "Tropical Ceiba pentandra of the kind planted in town squares: sinuous plank buttresses, a tall smooth grey bole and near-horizontal tiered limbs carrying flat layers of palmately compound leaves. Shared with CE rainforest parks and cemeteries; scaled down from forest emergents. Trunk spines and seed floss are omitted. Botanical reference: https://en.wikipedia.org/wiki/Ceiba_pentandra"
        : species === "date_palm"
          ? "Cultivated oasis Phoenix dactylifera with a slightly leaning, leaf-base-scarred trunk, basal offshoots, a crown of glaucous pinnate fronds with V-raised leaflets, a few hanging dead fronds and unripe date strands. Shared with CE hot-desert parks and cemeteries. Illustrative dimensions; not a measured specimen. Botanical reference: https://www.kew.org/plants/date-palm"
          : species === "umbrella_thorn"
            ? "Savanna Vachellia tortilis with a short fissured trunk forking low into ascending limbs and a flat parasol crown of tiny bipinnate leaf pads. Shared with CE savanna and dry tropical parks. Thorns and pods are below viewing scale. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Vachellia_tortilis"
            : species === "norway_spruce"
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
