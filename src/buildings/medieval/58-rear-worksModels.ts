import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import {
  createOpusRearWorks,
  OPUS_REAR_TRADES,
  OPUS_REAR_WORKS_PRESET_ENVELOPE,
  type OpusRearTrade,
  type OpusRearWorksSpec,
  opusRearWorksModelId,
  opusRearWorksPreset
} from "./opusRearWorks";
import { OPUS_WORKHOME_CULTURES, type OpusWorkhomeCulture } from "./opusWorkhomeProfiles";

const OPUS = "Claude Opus 5.5" as const;

const NAMES: Record<OpusRearTrade, string> = {
  baking: "Bakehouse behind the house",
  cutlery: "Cutler's forge and grinding behind the house",
  metalwares: "Pewterer's casting shed behind the house",
  glazing: "Glazier's workshop behind the house",
  chandlery: "Chandler's rendering shed behind the house",
  fishmongery: "Fishmonger's curing shed behind the house",
  butchery: "Butcher's slaughter shed behind the house"
};

const NOTES: Record<OpusRearTrade, string> = {
  baking:
    "A closed bakehouse with a domed brick oven 1.2–2.7 m across (a second, smaller one where the plot is wide), its stack, a kneading trough and faggots: commercial ovens stood behind the houses of Guildhall Street, Bury St Edmunds (Warrens Yards, late 13th–early 14th century), and a bakehouse about 5.5 m wide held two ovens at Mill Cotton.",
  cutlery:
    "An open-fronted forge shed with hearth, hood and stack, bellows, anvil and quench tub; the grindstone turns in its trough in the yard.",
  metalwares:
    "An open-fronted casting shed with a brick furnace and crucible, bellows, a bench of stone moulds and cast flagons; charcoal and a quench tub in the yard.",
  glazing:
    "An open-fronted shop with a whitened glazing table of leaded panels, a came rack and a small stove for the lead; glass crates and cullet in the yard.",
  chandlery:
    "An open-fronted rendering shed with the tallow copper on its hearth under hood and stack and a dipping frame of setting candles; tallow barrels in the yard.",
  fishmongery:
    "An open-fronted curing shed behind a Fish Row shop: herring tuns stacked along the back, the salt bin, a gutting table and stockfish hung under the eaves; brine and water tubs in the yard. Salisbury's fish stalls became shops in a Fish Row (1314).",
  butchery:
    "An open-fronted slaughter shed behind a Butcher Row shop: sides of beef dressed on a beam with its windlass, chopping blocks and a scalding trough where the plot is wide; offal and water tubs in the yard. Salisbury's Butcher Row was mostly shops by 1455."
};

/**
 * Rear works (docs/plan/ce-town-trade-rear-works.md R1): the workshop a craftsman kept in the back of his burgage
 * plot, behind the shop-house at its front (`trade-workhome.shop-house.*`). The shed and its yard only.
 */
export const models: MedievalModel[] = OPUS_REAR_TRADES.map(trade => {
  const id = opusRearWorksModelId(trade),
    family = `medieval.${id}`,
    preset = opusRearWorksPreset(trade),
    spec = (values: Readonly<Record<string, string>>): OpusRearWorksSpec =>
      opusRearWorksPreset(trade, {
        culture: values.culture as OpusWorkhomeCulture,
        widthMeters: Number(values.width),
        depthMeters: Number(values.depth),
        mirror: values.side === "right"
      });
  return {
    id,
    task: 58,
    name: NAMES[trade],
    author: OPUS,
    size: [...OPUS_REAR_WORKS_PRESET_ENVELOPE, 6] as [number, number, number],
    placementEnvelope: OPUS_REAR_WORKS_PRESET_ENVELOPE,
    note: `Opus rear works: ${NOTES[trade]} +Z faces the house; the house itself is the plot's shop-house. Low and High share every wall, opening and fitting.`,
    create: () => createOpusRearWorks(preset, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, OPUS),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: OPUS,
      create: () => createOpusRearWorks(preset, quality)
    })),
    presentation: {
      fields: [
        {
          id: "culture",
          label: "Culture",
          default: preset.culture,
          options: OPUS_WORKHOME_CULTURES.map(culture => ({ id: culture, label: culture }))
        },
        {
          id: "width",
          label: "Plot width",
          default: String(preset.widthMeters),
          options: ["3", "4", "5", "6", "8"].map(w => ({ id: w, label: `${w}.0 m` }))
        },
        {
          id: "depth",
          label: "Depth",
          default: String(preset.depthMeters),
          options: ["5", "7", "10"].map(d => ({ id: d, label: `${d}.0 m` }))
        },
        {
          id: "side",
          label: "Hearth side",
          default: "left",
          options: [
            { id: "left", label: "Left" },
            { id: "right", label: "Right" }
          ]
        }
      ],
      applies: () => true,
      create: (variant, values) => createOpusRearWorks(spec(values), variant.includes("@high#") ? "high" : "low")
    }
  };
});
