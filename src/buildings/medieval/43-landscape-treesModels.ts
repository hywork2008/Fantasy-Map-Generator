import { createLandscapeTree, TREE_SPECIES } from "../landscape/trees";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = TREE_SPECIES.map(species => ({
  id: species.replaceAll("_", "-"),
  author: [
    "date_palm",
    "umbrella_thorn",
    "saxaul",
    "kapok",
    "western_red_cedar",
    "black_alder",
    "olive",
    "silver_fir",
    "red_mangrove",
    "tamarisk"
  ].includes(species)
    ? "Claude Opus 5.5"
    : ["garden_parkland", "sacred_yew", "norway_spruce", "silver_birch"].includes(species)
      ? "GPT-6.1 Sol"
      : undefined,
  biomes:
    species === "garden_parkland" || species === "sacred_yew"
      ? ["temperateDeciduousForest", "centralEuropeanGreatForest"]
      : species === "norway_spruce" || species === "silver_birch"
        ? ["taiga", "temperateDeciduousForest"]
        : species === "red_mangrove"
          ? ["mangrove"]
          : species === "tamarisk"
            ? ["xericShrubland", "hotDesert", "coldSteppe"]
            : species === "olive"
              ? ["mediterraneanWoodlandScrub"]
              : species === "silver_fir"
                ? ["montaneForest"]
                : species === "western_red_cedar"
                  ? ["temperateRainforest", "temperateConiferousForest"]
                  : species === "black_alder"
                    ? ["wetland", "floodedForest", "borealPeatland"]
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
    species === "red_mangrove"
      ? "Red mangrove · Rhizophora mangle"
      : species === "tamarisk"
        ? "Tamarisk · Tamarix gallica"
        : species === "olive"
          ? "Olive · Olea europaea"
          : species === "silver_fir"
            ? "Silver fir · Abies alba"
            : species === "western_red_cedar"
              ? "Western red cedar · Thuja plicata"
              : species === "black_alder"
                ? "Black alder · Alnus glutinosa"
                : species === "saxaul"
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
    species === "red_mangrove"
      ? [10, 10, 8]
      : species === "tamarisk"
        ? [8, 8, 6]
        : species === "olive"
          ? [9, 9, 7]
          : species === "silver_fir"
            ? [8, 8, 20]
            : species === "western_red_cedar"
              ? [10, 10, 19]
              : species === "black_alder"
                ? [9, 9, 14]
                : species === "saxaul"
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
    species === "red_mangrove"
      ? "Tidal Rhizophora mangle: a short bole raised above the mud on arching, branching prop roots, aerial drop roots from spreading limbs, rosettes of thick glossy elliptic leaves and hanging pencil-like propagules. Prop roots sink just below ground level. Shared with CE mangrove-coast parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Rhizophora_mangle"
      : species === "tamarisk"
        ? "Dry-scrub Tamarix gallica: slender reddish-brown stems arching from one root crown into a loose weeping dome of grey-green, scale-leaved feathery plumes tipped with pink flower spikes. Salt and drought tolerant; shared with CE xeric-shrubland, oasis and steppe parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Tamarix_gallica"
        : species === "olive"
          ? "Aged Mediterranean Olea europaea: a short ridged bole splitting into twisting, spiralling stems, a broad open crown of narrow lance leaves that are grey-green above and silvery beneath, and scattered olives ripening from green to black. Shared with CE Mediterranean parks, cloister gardens and cemeteries. Illustrative dimensions; not a pruned grove cultivar. Botanical reference: https://en.wikipedia.org/wiki/Olea_europaea"
          : species === "silver_fir"
            ? "Montane Abies alba with a smooth whitish-grey trunk, regular whorls of level branches carrying flat two-ranked needle sprays, a columnar crown rounding off at the top and upright cones on the highest branches. Shared with CE mountain-forest parks and cemeteries. Illustrative summer tree. Botanical reference: https://forest.jrc.ec.europa.eu/media/atlas/Abies_alba.pdf"
            : species === "western_red_cedar"
              ? "Temperate-rainforest Thuja plicata with a flared, fluted base, long reddish fibrous bark strips, J-shaped limbs that droop and turn up at the tips, flat hanging fern-like sprays of scale leaves and a gently nodding leader. Shared with CE temperate-rainforest parks and cemeteries; scaled down from old-growth giants. Botanical reference: https://en.wikipedia.org/wiki/Thuja_plicata"
              : species === "black_alder"
                ? "Wetland Alnus glutinosa grown as a carr stool: three coppice-like stems over arched, partly exposed roots, a narrow oval crown of rounded leaves with notched tips, and persistent dark woody cones. Shared with CE wetland and riparian parks and cemeteries. Illustrative dimensions. Botanical reference: https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/alder/"
                : species === "saxaul"
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
