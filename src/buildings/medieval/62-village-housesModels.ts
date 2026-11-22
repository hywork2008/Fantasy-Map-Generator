import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import {
  VILLAGE_HOUSE_AUTHOR as AUTHOR,
  createOpusVillageHouse,
  VILLAGE_HOUSE_PRESETS,
  VILLAGE_HOUSE_PROFILES,
  type VillageHouseKind,
  type VillageHouseProfile,
  type VillageHouseSpec
} from "./opusVillageHouses";

/** Village buildings of the roadside village (docs/plan/ce-meshless-roadside-burgage-village.md §14.4, V4). */
const PROFILE_LABELS: Record<VillageHouseProfile, string> = {
  atlantic: "Atlantic (wattle and daub, thatch)",
  "northern-wooded": "Northern wooded (logs, shingles)",
  "northern-urban": "Northern (framed Wohnstallhaus, thatch)",
  "stone-upland": "Stone upland (granite, thatch)",
  mediterranean: "Mediterranean (rubble, tiles)"
};

const KINDS: {
  kind: VillageHouseKind;
  name: string;
  size: readonly [number, number, number];
  lengths: readonly number[];
  widths: readonly number[];
  note: string;
}[] = [
  {
    kind: "longhouse",
    name: "Village longhouse",
    size: [15, 6.5, 7],
    lengths: [12, 14, 16, 19],
    widths: [5, 5.5, 6],
    note:
      "Single-storey peasant longhouse: home and byre under one roof, a cross-passage with opposed doors between them, " +
      "a hearth under a smoke louver at the home end, slit vents and a drain at the byre end. Low walls (about 2 m) " +
      "under a steep thatch. Sizes from Hangleton (about 12 × 6 m, three rooms) and Hound Tor (up to 19 m); the plan " +
      "follows the Herefordshire villein's house (two living rooms, one for beasts and stores)."
  },
  {
    kind: "cottage",
    name: "Village cottage",
    size: [8, 5.2, 6],
    lengths: [5, 7, 9],
    widths: [3.5, 4.2, 5],
    note:
      "Single-storey cottage of one or two rooms: one door, small shuttered openings, a hearth under a smoke louver. " +
      "Sizes from the Herefordshire cot (about 5 × 3.5 m) and Hangleton's buildings under 9 m."
  },
  {
    kind: "barn",
    name: "Village barn",
    size: [9, 5.5, 7],
    lengths: [6, 8, 10],
    widths: [4, 4.5, 5],
    note:
      "Single-storey barn standing apart in the toft, at right angles to the house: wide opposed doors in its long " +
      "sides for carts and threshing. No source gives a size; between the cottage and the longhouse (game adjustment)."
  }
];

function specOf(kind: VillageHouseKind, values: Readonly<Record<string, string>> = {}): VillageHouseSpec {
  const preset = VILLAGE_HOUSE_PRESETS[kind];
  return {
    kind,
    profile: (values.profile as VillageHouseProfile | undefined) ?? "atlantic",
    length: values.length ? Number(values.length) : preset.length,
    width: values.width ? Number(values.width) : preset.width,
    variant: values.end === "left" ? 1 : 0
  };
}

export const models: MedievalModel[] = KINDS.map(({ kind, name, size, lengths, widths, note }) => {
  const id = `village-house.${kind}`,
    family = `medieval.${id}`,
    preset = VILLAGE_HOUSE_PRESETS[kind],
    variants = (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, AUTHOR),
      family,
      author: AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => createOpusVillageHouse(specOf(kind), quality)
    }));
  return {
    id,
    task: 62,
    author: AUTHOR,
    name,
    size,
    note: `${note} CE fits the model to each house's footprint; the region sets walls and roof.`,
    create: () => createOpusVillageHouse(specOf(kind), "low"),
    variants,
    presentation: {
      fields: [
        {
          id: "profile",
          label: "Region",
          default: "atlantic",
          options: VILLAGE_HOUSE_PROFILES.map(profile => ({ id: profile, label: PROFILE_LABELS[profile] }))
        },
        {
          id: "length",
          label: "Length",
          default: String(preset.length),
          options: [...new Set([...lengths, preset.length])]
            .sort((a, b) => a - b)
            .map(l => ({ id: String(l), label: `${l} m` }))
        },
        {
          id: "width",
          label: "Width",
          default: String(preset.width),
          options: [...new Set([...widths, preset.width])]
            .sort((a, b) => a - b)
            .map(w => ({ id: String(w), label: `${w} m` }))
        },
        {
          id: "end",
          label: kind === "barn" ? "Hand" : "Home end",
          default: "right",
          options: [
            { id: "right", label: "Right" },
            { id: "left", label: "Left" }
          ]
        }
      ],
      applies: variant => variants.some(v => v.id === variant),
      create: (variant, values) =>
        createOpusVillageHouse(specOf(kind, values), variant.includes("@high#") ? "high" : "low")
    }
  };
});
