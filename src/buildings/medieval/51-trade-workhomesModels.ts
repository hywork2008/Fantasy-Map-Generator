import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import {
  createOpusWorkhome,
  OPUS_WORKHOME_CULTURES,
  OPUS_WORKHOME_PRESET_ENVELOPES,
  type OpusWorkhomeCulture,
  type OpusWorkhomeSpec,
  opusWorkhomePreset
} from "./opusWorkhome";
import { WORKHOME_FORMS } from "./workhomeShell";
import {
  assembleWorkhomeTrade,
  tradeDefinition,
  WORKHOME_TRADE_COMBINATIONS,
  workhomeTradeParts
} from "./workhomeTrades";

const OPUS = "Claude Opus 5.5" as const;

const CULTURE_LABELS: Record<OpusWorkhomeCulture, string> = {
  atlantic: "Atlantic (English jettied frame)",
  "northern-urban": "Northern urban (Hanseatic gable, hoist loft)",
  mediterranean: "Mediterranean (arched shop, stone counter)",
  "stone-upland": "Stone upland (arched shop under a framed storey)",
  "northern-wooded": "Northern wooded (boarded)"
};

const OPUS_NOTE =
  "Opus: the street front of a craftsman's shop-house with no interior ledger (docs/plan/bv-workhome-facade-variation.md). " +
  "Shop window with a drop-down stall board and propped shutter, or an arched shop with a stone counter in the Midi; " +
  "a closed plank door beside it; a signboard naming the house. Low and High share every opening and fitting.";

export const models: MedievalModel[] = WORKHOME_TRADE_COMBINATIONS.map(({ role, form }) => {
  const trade = tradeDefinition(role),
    p = WORKHOME_FORMS[form],
    id = `trade-workhome.${p.formId}.${role}`,
    family = `medieval.${id}`,
    [presetWidth] = OPUS_WORKHOME_PRESET_ENVELOPES[form],
    opusIds = new Set((["low", "high"] as const).map(level => variantId(family, level, OPUS)));
  const spec = (values: Readonly<Record<string, string>>): OpusWorkhomeSpec =>
    opusWorkhomePreset(role, form, {
      culture: values.culture as OpusWorkhomeCulture,
      ...(values.frontage !== "preset" ? { widthMeters: Number(values.frontage) } : {}),
      fronts: values.fronts === "2" ? 2 : 1,
      shop: values.shop === "closed" ? "closed" : "open",
      door: values.door === "ajar" ? "ajar" : "closed",
      storeys: values.storeys === "3" ? 3 : 2,
      entranceFace: values.face === "gable" ? "gable" : "eave",
      mirror: values.side === "right"
    });
  const preset = opusWorkhomePreset(role, form);
  return {
    id,
    task: 51,
    name: `${trade.name} workhome (${form})`,
    author: DEFAULT_AUTHOR,
    size: [p.width + 0.6, p.depth + 1.5, p.envelope.max[1]],
    // The Codex envelope: CE plots keep their size whichever author's model draws on them (plan §4.7).
    placementEnvelope: OPUS_WORKHOME_PRESET_ENVELOPES[form],
    note: `Dry workhome via explicit CE conversion: one planned dwelling, three static workplaces; production throughput and supply chain are not verified. ${trade.dependencies.length ? `External inputs/processes: ${trade.dependencies.join(", ")}. ` : ""}Supply and occupational process conditions remain separate from placement. ${OPUS_NOTE}`,
    create: () => assembleWorkhomeTrade(role, form, "low"),
    variants: [
      ...(["low", "high"] as const).map(quality => ({
        id: variantId(family, quality, DEFAULT_AUTHOR),
        family,
        level: quality,
        label: quality === "low" ? "Low" : "High",
        author: DEFAULT_AUTHOR,
        create: () => assembleWorkhomeTrade(role, form, quality)
      })),
      ...(["low", "high"] as const).map(quality => ({
        id: variantId(family, quality, OPUS),
        family,
        level: quality,
        label: quality === "low" ? "Low" : "High",
        author: OPUS,
        create: () => createOpusWorkhome(preset, quality)
      }))
    ],
    presentation: {
      fields: [
        {
          id: "culture",
          label: "Culture",
          default: preset.culture,
          options: OPUS_WORKHOME_CULTURES.map(culture => ({ id: culture, label: CULTURE_LABELS[culture] }))
        },
        {
          id: "frontage",
          label: "Frontage",
          default: "preset",
          options: [
            { id: "preset", label: `${presetWidth.toFixed(2)} m (Codex ${form} envelope)` },
            ...["3", "4.5", "6", "7.5"].map(w => ({ id: w, label: `${Number(w).toFixed(1)} m plot` }))
          ]
        },
        {
          id: "fronts",
          label: "Shop windows",
          default: String(preset.fronts),
          options: [
            { id: "1", label: "One, beside the door" },
            { id: "2", label: "Two, either side of the door (6 m and wider)" }
          ]
        },
        {
          id: "shop",
          label: "Shop",
          default: preset.shop,
          options: [
            { id: "open", label: "Open" },
            { id: "closed", label: "Shuttered" }
          ]
        },
        {
          id: "door",
          label: "Door",
          default: preset.door,
          options: [
            { id: "closed", label: "Closed" },
            { id: "ajar", label: "Ajar" }
          ]
        },
        {
          id: "storeys",
          label: "Storeys",
          default: String(preset.storeys),
          options: [
            { id: "2", label: "Two and a garret" },
            { id: "3", label: "Three and a garret" }
          ]
        },
        {
          id: "face",
          label: "Street face",
          default: preset.entranceFace,
          options: [
            { id: "eave", label: "Eaves (Hanseatic and Mediterranean keep their own)" },
            { id: "gable", label: "Gable" }
          ]
        },
        {
          id: "side",
          label: "Door side",
          default: preset.mirror ? "right" : "left",
          options: [
            { id: "left", label: "Left" },
            { id: "right", label: "Right" }
          ]
        }
      ],
      applies: variant => opusIds.has(variant),
      create: (variant, values) => createOpusWorkhome(spec(values), variant.includes("@high#") ? "high" : "low")
    },
    // The Opus workhome has no interior parts to list.
    parts: selected =>
      selected && opusIds.has(selected)
        ? []
        : workhomeTradeParts(role, form, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleWorkhomeTrade(role, form, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});
