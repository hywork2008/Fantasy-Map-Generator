import { DEFAULT_AUTHOR } from "../authors";
import { type ModelVariant, variantId } from "../modelVariants";
import { models as dwellings } from "./07-dwellingsModels";
import { models as smithies } from "./11-smithiesModels";
import { models as fuel } from "./13-fuel-storageModels";
import { models as churches } from "./14-parish-churchesModels";
import { models as granaries } from "./16-granariesModels";
import { models as warehouses } from "./17-warehousesModels";
import { models as livestock } from "./18-livestock-marketsModels";
import { models as graves } from "./19-grave-markersModels";
import { models as tanneries } from "./22-tanneriesModels";
import { models as publicGranaries } from "./25-public-granariesModels";
import { models as cloth } from "./27-cloth-hallsModels";
import { models as guilds } from "./28-craft-guild-hallsModels";
import { models as stoneYards } from "./29-stone-yardsModels";
import { models as kilns } from "./30-lime-kilnsModels";
import { models as bleaching } from "./31-bleaching-fieldsModels";
import { models as cranes } from "./35-harbor-cranesModels";
import { models as gallows } from "./36-gallowsModels";
import { models as glass } from "./37-glassworkers-hallsModels";
import { models as printing } from "./38-printing-modelsModels";
import { models as instruments } from "./39-instrument-makers-hallsModels";
import { models as sand } from "./40-sand-yardsModels";
import type { MedievalModel } from "./modelKit";

export function medievalFamily(model: Pick<MedievalModel, "id">): string {
  return `medieval.${model.id}`;
}

/** Medieval task models that CE draws, one variant each. */
export const MEDIEVAL_VARIANTS: readonly ModelVariant[] = [
  dwellings,
  smithies,
  fuel,
  churches,
  granaries,
  warehouses,
  livestock,
  graves,
  tanneries,
  publicGranaries,
  cloth,
  guilds,
  stoneYards,
  kilns,
  bleaching,
  cranes,
  gallows,
  glass,
  printing,
  instruments,
  sand
]
  .flat()
  .map(model => {
    const author = model.author ?? DEFAULT_AUTHOR;
    return {
      id: variantId(medievalFamily(model), "default", author),
      family: medievalFamily(model),
      level: "default",
      author,
      create: () => model.create()
    };
  });
