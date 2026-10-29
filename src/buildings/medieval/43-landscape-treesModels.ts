import { createLandscapeTree, hasTreeQualityLevels, TREE_SPECIES, type TreeSpecies } from "../landscape/trees";
import { TREE_AUTHORS, TREE_VARIANTS, treeFamily } from "../landscape/treeVariants";
import type { MedievalModel } from "./modelKit";

type TreeEntry = Pick<MedievalModel, "biomes" | "name" | "size" | "note">;

/** Biome labels describe current CE woodland selection, including temperature branches. */
const TREES: Record<TreeSpecies, TreeEntry> = {
  domestic_apple: {
    name: "Domestic apple · Malus domestica",
    size: [8.1, 7.6, 6.2],
    note: "Free-standing cultivated Malus domestica with a short grey-brown bole, low spreading scaffold limbs, folded serrated oval leaves and blushed apples on short fruiting spurs. Illustrative mature orchard tree, not a measured specimen, named cultivar or modern dwarf spindle. Static leafy fruiting display; flower, harvest and seasonal changes are omitted. Small fruit is simplified at medium and omitted at low quality. BV registration does not place orchards in CE or change crop production. Botanical references: https://www.rhs.org.uk/plants/60558/malus-domestica-f/details and https://www.rhs.org.uk/fruit/apples/grow-your-own and https://publications.naturalengland.org.uk/publication/23006"
  },
  scots_pine: {
    biomes: ["centralEuropeanGreatForest"],
    name: "Scots pine · Pinus sylvestris",
    size: [11, 11, 21],
    note: "Mature woodland Pinus sylvestris with a dark fissured lower bole, orange-red upper bark, short dead lower stubs and an irregular upper crown of paired blue-green needles. Needles are abstracted for viewing. Illustrative 21 m tree, not a measured mature maximum or a cultivar. Cones and seasonal changes are omitted. Mixed into explicit Central European great forest woodland; existing boreal, park, cemetery and volcanic pine choices remain unchanged. Botanical references: https://www.forestryengland.uk/article/scots-pine and https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/131589-scots-pine-sp-2/ and https://forestryandland.gov.scot/living-and-working/learning-and-education/trees/scots-pine"
  },
  european_hornbeam: {
    biomes: ["centralEuropeanGreatForest"],
    name: "European hornbeam · Carpinus betulus",
    size: [10, 10, 16.5],
    note: "Summer woodland Carpinus betulus with a fluted grey bole, long ascending branches, a dense ovoid crown and folded toothed leaves abstracting prominent parallel veins. Illustrative woodland dimensions, not a measured mature maximum, hedge, pollard or columnar cultivar. Fruit clusters and seasonal changes are omitted. Mixed with oak, beech and lime in the explicit Central European great forest biome; existing park and cemetery preferences remain unchanged. Botanical references: https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/hornbeam-hbm-2/ and https://www.rhs.org.uk/plants/3136/carpinus-betulus/details and https://www.keele.ac.uk/arboretum/ourtrees/speciesaccounts/hornbeam/"
  },
  pedunculate_oak: {
    biomes: ["temperateDeciduousForest", "centralEuropeanGreatForest"],
    name: "Pedunculate oak · Quercus robur",
    size: [16, 16, 18],
    note: "Summer Quercus robur with a stout furrowed grey-brown bole, crooked spreading forks, a broad irregular crown and folded lobed leaves. Illustrative woodland dimensions, not a measured mature maximum, cultivar or a model for all oak species. Acorns and seasonal changes are omitted. Mixed with beech and lime in explicit European woodland biomes; existing park and cemetery preferences remain unchanged. Botanical references: https://www.forestryengland.uk/tree-species/english-oak and https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/131559-pedunculate-oak-pok-2/"
  },
  european_beech: {
    biomes: ["temperateDeciduousForest", "centralEuropeanGreatForest"],
    name: "European beech · Fagus sylvatica",
    size: [13, 13, 20],
    note: "Summer woodland Fagus sylvatica with a clear smooth grey bole, ascending limbs, a domed crown and folded oval green leaves. Illustrative 20 m tree, not a measured mature maximum or a cultivar. Mixed with oak and lime in explicit European woodland biomes; existing park and cemetery preferences remain unchanged. Botanical references: https://www.forestryengland.uk/tree-species/beech and https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/beech-be/"
  },
  garden_parkland: {
    biomes: ["grassland", "temperateDeciduousForest", "centralEuropeanGreatForest"],
    name: "Small-leaved lime · Tilia cordata",
    size: [13, 13, 13],
    note: "Open-grown summer Tilia cordata, native to western and central Europe. Tapered branching timber, root flare and individually folded heart-shaped leaves; shared with CE park trees. Natural tree for medieval gardens and churchyards; not a modern cultivar. Botanical reference: https://www.forestresearch.gov.uk/tools-and-resources/tree-species-database/133243-small-leaved-lime-sli/"
  },
  norway_spruce: {
    biomes: [
      "temperateDeciduousForest",
      "taiga",
      "centralEuropeanGreatForest",
      "temperateConiferousForest",
      "borealPeatland"
    ],
    name: "Norway spruce · Picea abies",
    size: [7, 7, 13],
    note: "Boreal Picea abies with a tapered trunk, whorled drooping branches, an upright leader and abstract evergreen needle sprays. Shared with CE cold-climate parks and cemeteries. Illustrative summer tree, not a measured specimen. Botanical reference: https://forest.jrc.ec.europa.eu/media/atlas/Picea_abies.pdf"
  },
  silver_birch: {
    biomes: [
      "temperateDeciduousForest",
      "taiga",
      "centralEuropeanGreatForest",
      "temperateConiferousForest",
      "borealPeatland"
    ],
    name: "Silver birch · Betula pendula",
    size: [9, 9, 12],
    note: "Summer Betula pendula with pale bark, dark basal fissures, small leaves and pendulous outer twigs. Shared with CE boreal parks. Illustrative dimensions; not a cultivar. Botanical reference: https://www.forestryengland.uk/tree-species/silver-birch"
  },
  sacred_yew: {
    name: "European yew · Taxus baccata",
    size: [12, 12, 9],
    note: "Mature untrimmed European yew (Taxus baccata), shared with CE churchyards. Broad evergreen crown, fluted reddish-brown trunk, spreading branches and folded serrated sprays abstracting two-ranked needles. Needle groups are abstracted for responsive viewing and city instancing. No modern columnar cultivar or topiary; no seasonal arils. Botanical reference: https://www.forestryengland.uk/tree-species/yew"
  },
  date_palm: {
    biomes: ["hotDesert", "savanna", "tropicalSeasonalForest", "xericShrubland", "tropicalDryForest"],
    name: "Date palm · Phoenix dactylifera",
    size: [10, 10, 12],
    note: "Cultivated oasis Phoenix dactylifera with a slightly leaning, leaf-base-scarred trunk, basal offshoots, a crown of glaucous pinnate fronds with V-raised leaflets, a few hanging dead fronds and unripe date strands. Shared with CE hot-desert parks and cemeteries. Illustrative dimensions; not a measured specimen. Botanical reference: https://www.kew.org/plants/date-palm"
  },
  umbrella_thorn: {
    biomes: ["savanna", "tropicalSeasonalForest", "tropicalDryForest"],
    name: "Umbrella thorn acacia · Vachellia tortilis",
    size: [12, 12, 8],
    note: "Savanna Vachellia tortilis with a short fissured trunk forking low into ascending limbs and a flat parasol crown of tiny bipinnate leaf pads. Shared with CE savanna and dry tropical parks. Thorns and pods are below viewing scale. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Vachellia_tortilis"
  },
  saxaul: {
    biomes: ["coldDesert", "coldSteppe"],
    name: "Black saxaul · Haloxylon ammodendron",
    size: [6, 6, 5],
    note: "Cold-desert Haloxylon ammodendron: a low gnarled trunk splitting into crooked, pale fibrous stems and a sparse crown of leafless, jointed green shoots hanging in tassels. Shared with CE Central Asian desert and steppe parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Haloxylon_ammodendron"
  },
  kapok: {
    biomes: ["tropicalRainforest", "cloudForest", "floodedForest"],
    name: "Kapok · Ceiba pentandra",
    size: [22, 22, 19],
    note: "Tropical Ceiba pentandra of the kind planted in town squares: sinuous plank buttresses, a tall smooth grey bole and near-horizontal tiered limbs carrying flat layers of palmately compound leaves. Shared with CE rainforest parks and cemeteries; scaled down from forest emergents. Trunk spines and seed floss are omitted. Botanical reference: https://en.wikipedia.org/wiki/Ceiba_pentandra"
  },
  western_red_cedar: {
    biomes: ["temperateRainforest", "temperateConiferousForest"],
    name: "Western red cedar · Thuja plicata",
    size: [10, 10, 19],
    note: "Temperate-rainforest Thuja plicata with a flared, fluted base, long reddish fibrous bark strips, J-shaped limbs that droop and turn up at the tips, flat hanging fern-like sprays of scale leaves and a gently nodding leader. Shared with CE temperate-rainforest parks and cemeteries; scaled down from old-growth giants. Botanical reference: https://en.wikipedia.org/wiki/Thuja_plicata"
  },
  black_alder: {
    biomes: ["wetland", "floodedForest"],
    name: "Black alder · Alnus glutinosa",
    size: [9, 9, 14],
    note: "Wetland Alnus glutinosa grown as a carr stool: three coppice-like stems over arched, partly exposed roots, a narrow oval crown of rounded leaves with notched tips, and persistent dark woody cones. Shared with CE wetland and riparian parks and cemeteries. Illustrative dimensions. Botanical reference: https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/alder/"
  },
  olive: {
    biomes: ["mediterraneanWoodlandScrub"],
    name: "Olive · Olea europaea",
    size: [9, 9, 7],
    note: "Aged Mediterranean Olea europaea: a short ridged bole splitting into twisting, spiralling stems, a broad open crown of narrow lance leaves that are grey-green above and silvery beneath, and scattered olives ripening from green to black. Shared with CE Mediterranean parks, cloister gardens and cemeteries. Illustrative dimensions; not a pruned grove cultivar. Botanical reference: https://en.wikipedia.org/wiki/Olea_europaea"
  },
  silver_fir: {
    biomes: ["montaneForest"],
    name: "Silver fir · Abies alba",
    size: [8, 8, 20],
    note: "Montane Abies alba with a smooth whitish-grey trunk, regular whorls of level branches carrying flat two-ranked needle sprays, a columnar crown rounding off at the top and upright cones on the highest branches. Shared with CE mountain-forest parks and cemeteries. Illustrative summer tree. Botanical reference: https://forest.jrc.ec.europa.eu/media/atlas/Abies_alba.pdf"
  },
  red_mangrove: {
    biomes: ["mangrove"],
    name: "Red mangrove · Rhizophora mangle",
    size: [10, 10, 8],
    note: "Tidal Rhizophora mangle: a short bole raised above the mud on arching, branching prop roots, aerial drop roots from spreading limbs, rosettes of thick glossy elliptic leaves and hanging pencil-like propagules. Prop roots sink just below ground level. Shared with CE mangrove-coast parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Rhizophora_mangle"
  },
  tamarisk: {
    biomes: ["xericShrubland"],
    name: "Tamarisk · Tamarix gallica",
    size: [8, 8, 6],
    note: "Dry-scrub Tamarix gallica: slender reddish-brown stems arching from one root crown into a loose weeping dome of grey-green, scale-leaved feathery plumes tipped with pink flower spikes. Salt and drought tolerant; shared with CE xeric-shrubland, oasis and steppe parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Tamarix_gallica"
  },
  rowan: {
    biomes: ["alpineTundra", "heathMoorland"],
    name: "Rowan · Sorbus aucuparia",
    size: [7, 7, 10],
    note: "Upland Sorbus aucuparia of heath and moor edges: a short smooth grey-brown stem, ascending limbs in a light oval crown, pinnate leaves of paired toothed leaflets and flat-topped clusters of scarlet late-summer berries. Shared with CE heath, moorland and upland parks and churchyards. Illustrative dimensions. Botanical reference: https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/rowan/"
  },
  canary_pine: {
    biomes: ["volcanicBarrens", "volcanicSoil"],
    name: "Canary Island pine · Pinus canariensis",
    size: [10, 10, 17],
    note: "Pinus canariensis of volcanic slopes: thick, plated russet bark, epicormic needle tufts sprouting from the trunk after fire, irregular upturned limbs in loose tiers, long drooping needle tufts and hanging glossy brown cones. Shared with CE volcanic-barrens and volcanic-soil parks and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Pinus_canariensis"
  },
  mediterranean_cypress: {
    name: "Italian cypress · Cupressus sempervirens",
    size: [3, 3, 15],
    note: "Funerary Cupressus sempervirens of Mediterranean churchyards: a slim spindle-shaped column of tight, steeply ascending scale-leaf sprays around a fibrous red-brown trunk, with small round grey-brown cones set close in the foliage. Shared with CE Mediterranean cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Cupressus_sempervirens"
  },
  oriental_evergreen: {
    name: "Chinese arborvitae · Platycladus orientalis",
    size: [6, 6, 10],
    note: "Old temple and tomb Platycladus orientalis of East Asia: a short fibrous trunk forking into several upright, slightly twisting leaders and an irregular ovoid-conical crown of flat foliage fans held vertically, edge-on to the trunk. Shared with CE East Asian cemeteries and shrine precincts. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Platycladus"
  },
  sacred_bodhi_and_fig: {
    name: "Sacred fig · Ficus religiosa",
    size: [16, 16, 11],
    note: "Temple Ficus religiosa: a short, fluted pale-grey bole, massive wide-arching limbs, a broad dome of heart-shaped leaves with long drip tips on slender stalks, and a few aerial roots from the lower limbs. Shared with CE South and Southeast Asian sacred precincts and cemeteries. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Ficus_religiosa"
  },
  peaceful_willow: {
    name: "Weeping willow · Salix babylonica",
    size: [13, 13, 10],
    note: "Salix babylonica of East Asian gardens and graveyards: a short, deeply ridged trunk, ascending main limbs and curtains of pendulous whips clothed in narrow yellow-green lance leaves hanging almost to the ground. Shared with CE cemeteries and waterside parks. Illustrative dimensions. Botanical reference: https://en.wikipedia.org/wiki/Salix_babylonica"
  }
};

const LEVEL_LABELS: Record<string, string> = {
  ultra: "Ultra (individual foliage)",
  high: "High (reduced foliage)",
  medium: "Medium (canopy lobes)",
  low: "Low (canopy silhouette)"
};

export const models: MedievalModel[] = TREE_SPECIES.map(species => ({
  id: species.replaceAll("_", "-"),
  ...TREES[species],
  author: TREE_AUTHORS[species],
  task: 43,
  variants: hasTreeQualityLevels(species)
    ? TREE_VARIANTS.filter(variant => variant.family === treeFamily(species)).map(variant => ({
        ...variant,
        label: LEVEL_LABELS[variant.level]
      }))
    : undefined,
  create: () => createLandscapeTree(species)
}));
