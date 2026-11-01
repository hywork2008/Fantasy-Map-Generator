import { DEFAULT_AUTHOR } from "../authors";
import type { CemeteryPropKind } from "../landscape/cemeteryProps";
import type { ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { mausoleumPartFactories } from "./mausoleumParts";
import { boneRackPartFactories, ossuaryPartFactories } from "./ossuaryParts";
import { preachingCrossPartFactories } from "./preachingCrossParts";

interface CemeteryHighDetail {
  parts: () => ModelPartFactory[];
  note: string;
  basedOn?: string[];
}

/** Only independently detailed models enter this registry; other cemetery props remain Low. */
export const CEMETERY_HIGH_DETAILS: Partial<Record<CemeteryPropKind, CemeteryHighDetail>> = {
  ossuary_charnel_house: {
    parts: ossuaryPartFactories,
    note: "Small stone charnel house for stored skeletal remains. High adds ventilating grilles, an open arched door, tiled roof and shared ossuary racks. Illustrative dimensions; no specific historical monument is reconstructed.",
    basedOn: [variantId("cemetery.skull_shelf", "high", DEFAULT_AUTHOR)]
  },
  skull_shelf: {
    parts: boneRackPartFactories,
    note: "Reusable wooden rack for stored skeletal remains. High adds pegged shelves, braced posts, pierced skull sockets and supported long bones. Illustrative dimensions; no specific historical monument is reconstructed."
  },
  mausoleum_dome: {
    parts: mausoleumPartFactories,
    note: "Circular stone mausoleum. High has a hollow rotunda, real arched entrance and glazed windows, annular cornice, hollow hemispherical dome and a separate memorial chest. Illustrative dimensions; no specific historical monument is reconstructed."
  },
  preaching_cross_calvary: {
    parts: preachingCrossPartFactories,
    note: "Free-standing stone preaching cross on a stepped platform. High has a socket block, tapered octagonal shaft, capital and bevelled Latin cross with recessed carving on both faces. Illustrative dimensions; no specific historical monument is reconstructed."
  }
};
