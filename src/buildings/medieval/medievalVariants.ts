import { DEFAULT_AUTHOR } from "../authors";
import { type ModelVariant, variantId } from "../modelVariants";
import { models as boundaries } from "./02-boundariesModels";
import { models as barns } from "./03-barnsModels";
import { models as animals } from "./04-animal-housingModels";
import { models as troughs } from "./05-troughsModels";
import { models as stalls } from "./06-market-stallsModels";
import { models as dwellings } from "./07-dwellingsModels";
import { models as shops } from "./08-shop-housesModels";
import { models as carts } from "./09-hand-cartsModels";
import { models as bakeries } from "./10-bakeriesModels";
import { models as smithies } from "./11-smithiesModels";
import { models as inns } from "./12-innsModels";
import { models as fuel } from "./13-fuel-storageModels";
import { models as churches } from "./14-parish-churchesModels";
import { models as townChurches } from "./14-town-churchesModels";
import { models as breweries } from "./15-breweriesModels";
import { models as granaries } from "./16-granariesModels";
import { models as warehouses } from "./17-warehousesModels";
import { models as livestock } from "./18-livestock-marketsModels";
import { models as graves } from "./19-grave-markersModels";
import { models as textileWorkshops } from "./20-textile-leather-workshopsModels";
import { models as woodworking } from "./21-woodworking-workshopsModels";
import { models as tanneries } from "./22-tanneriesModels";
import { models as smallBoats } from "./23-small-boatsModels";
import { models as publicGranaries } from "./25-public-granariesModels";
import { models as civicHalls } from "./26-civic-hallsModels";
import { models as cloth } from "./27-cloth-hallsModels";
import { models as guilds } from "./28-craft-guild-hallsModels";
import { models as stoneYards } from "./29-stone-yardsModels";
import { models as kilns } from "./30-lime-kilnsModels";
import { models as bleaching } from "./31-bleaching-fieldsModels";
import { models as domestic } from "./32-abbey-living-quartersModels";
import { models as pottery } from "./34-pottery-workshopsModels";
import { models as cranes } from "./35-harbor-cranesModels";
import { models as gallows } from "./36-gallowsModels";
import { models as glass } from "./37-glassworkers-hallsModels";
import { models as printing } from "./38-printing-modelsModels";
import { models as instruments } from "./39-instrument-makers-hallsModels";
import { models as sand } from "./40-sand-yardsModels";
import { models as caravanserais } from "./42-caravanseraisModels";
import { models as jettied } from "./45-jettied-housesModels";
import { models as enclosedGuildHalls } from "./48-trade-guild-hallsModels";
import { models as marketGuildHalls } from "./49-market-guild-hallsModels";
import { models as workhomeShells } from "./50-workhome-shellsModels";
import { models as tradeWorkhomes } from "./51-trade-workhomesModels";
import { models as dedicatedBakehouses } from "./52-dedicated-bakehousesModels";
import { models as dedicatedSmithies } from "./53-dedicated-smithiesModels";
import { models as dedicatedCooperage } from "./54-dedicated-cooperageModels";
import { models as dedicatedTanneries } from "./55-dedicated-tanneriesModels";
import { models as ropeworks } from "./56-ropeworksModels";
import { models as butcheries } from "./57-butcheryModels";
import { models as townTrades } from "./58-town-tradesModels";
import { models as squareFurniture } from "./59-market-square-furnitureModels";
import type { MedievalModel } from "./modelKit";

export function medievalFamily(model: Pick<MedievalModel, "id">): string {
  return `medieval.${model.id}`;
}

/** Registered medieval studies: explicit BV tiers and the default variants used by CE. */
export const MEDIEVAL_VARIANTS: readonly ModelVariant[] = [
  boundaries,
  barns,
  animals,
  troughs,
  stalls,
  dwellings,
  shops,
  carts,
  bakeries,
  smithies,
  inns,
  fuel,
  churches,
  townChurches,
  breweries,
  granaries,
  warehouses,
  livestock,
  graves,
  textileWorkshops,
  woodworking,
  tanneries,
  smallBoats,
  publicGranaries,
  civicHalls,
  cloth,
  guilds,
  stoneYards,
  kilns,
  bleaching,
  domestic.filter(model => model.id === "abbey-domestic-range"),
  pottery,
  cranes,
  gallows,
  glass,
  printing,
  instruments,
  sand,
  caravanserais,
  jettied,
  enclosedGuildHalls,
  marketGuildHalls,
  workhomeShells,
  tradeWorkhomes,
  dedicatedBakehouses,
  dedicatedSmithies,
  dedicatedCooperage,
  dedicatedTanneries,
  ropeworks,
  butcheries,
  townTrades,
  squareFurniture
]
  .flat()
  .flatMap(model => {
    const author = model.author ?? DEFAULT_AUTHOR;
    const legacy = {
      id: variantId(medievalFamily(model), "default", author),
      family: medievalFamily(model),
      level: "default",
      author,
      create: () => model.create()
    };
    // Previously registered CE families keep default identities while BV gains selectable tiers.
    return model.variants
      ? [
          ...model.variants,
          ...(dwellings.includes(model) ||
          smithies.includes(model) ||
          fuel.includes(model) ||
          churches.includes(model) ||
          granaries.includes(model) ||
          warehouses.includes(model) ||
          livestock.includes(model) ||
          graves.includes(model) ||
          tanneries.includes(model) ||
          publicGranaries.includes(model) ||
          cloth.includes(model) ||
          guilds.includes(model) ||
          stoneYards.includes(model) ||
          kilns.includes(model) ||
          bleaching.includes(model) ||
          domestic.includes(model) ||
          pottery.includes(model) ||
          cranes.includes(model) ||
          gallows.includes(model) ||
          glass.includes(model) ||
          printing.includes(model) ||
          instruments.includes(model) ||
          sand.includes(model) ||
          caravanserais.includes(model) ||
          jettied.includes(model)
            ? [legacy]
            : [])
        ]
      : [legacy];
  });
