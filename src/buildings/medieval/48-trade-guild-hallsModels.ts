import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleEnclosedGuildHall, enclosedGuildHallParts } from "./enclosedGuildHall";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";
import type { MedievalModel } from "./modelKit";
import {
  createOpusGuildHouse,
  OPUS_GUILD_HOUSE_PRESET_ENVELOPE,
  type OpusGuildHouseSpec,
  opusGuildHouseModelId,
  opusGuildHousePreset
} from "./opusGuildHouse";
import { OPUS_WORKHOME_CULTURES, type OpusWorkhomeCulture } from "./opusWorkhomeProfiles";

/** New families: existing arcade halls and all saved variant identities remain untouched. */
const enclosedHalls: MedievalModel[] = ENCLOSED_GUILD_TRADES.map(({ id: role, name }) => {
  const id = `trade-hall.guild-enclosed.${role}`,
    family = `medieval.${id}`;
  return {
    id,
    task: 48,
    name,
    author: DEFAULT_AUTHOR,
    size: [12.8, 9, 9.2],
    note: "T1b guild-enclosed v1: closed ground floor, internal return stair, 24 assembly seats. No dwelling or manufacturing workshop capacity. Shared main-body origin, ports and floor budgets across Low and High; available through explicit CE site reservations; automatic generation remains separate.",
    create: () => assembleEnclosedGuildHall(role, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: DEFAULT_AUTHOR,
      create: () => assembleEnclosedGuildHall(role, quality)
    })),
    parts: selected => enclosedGuildHallParts(role, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleEnclosedGuildHall(role, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});

const OPUS = "Claude Opus 5.5" as const;

/** Opus guild houses (docs/plan/bv-workhome-facade-variation.md §6.1 W5b): a town house in the street row. */
const guildHouses: MedievalModel[] = ENCLOSED_GUILD_TRADES.map(({ id: role, name }) => {
  const id = opusGuildHouseModelId(role),
    family = `medieval.${id}`,
    preset = opusGuildHousePreset(role),
    spec = (values: Readonly<Record<string, string>>): OpusGuildHouseSpec =>
      opusGuildHousePreset(role, {
        culture: values.culture as OpusWorkhomeCulture,
        widthMeters: Number(values.frontage),
        storeys: values.storeys === "2" ? 2 : 3,
        entranceFace: values.face === "eave" ? "eave" : "gable",
        door: values.door === "ajar" ? "ajar" : "closed",
        mirror: values.side === "right"
      });
  return {
    id,
    task: 48,
    name: ((n: string) => n[0].toUpperCase() + n.slice(1))(
      name.replace("Enclosed ", "").replace(" guild hall", " guild house")
    ),
    author: OPUS,
    size: [...OPUS_GUILD_HOUSE_PRESET_ENVELOPE, 16] as [number, number, number],
    placementEnvelope: OPUS_GUILD_HOUSE_PRESET_ENVELOPE,
    note:
      "Opus guild house: a town house in the street row a guild bought for its Stube (Zürich, Konstanz; plan §5.6). " +
      "Stone ground storey with an arched portal and barred windows, the guild's Stube above lit by a row of close-set " +
      "windows, the guild's sign by the portal. No interior; Low and High share every opening.",
    create: () => createOpusGuildHouse(preset, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, OPUS),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: OPUS,
      create: () => createOpusGuildHouse(preset, quality)
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
          id: "frontage",
          label: "Frontage",
          default: String(preset.widthMeters),
          options: ["6", "7", "8", "9", "10"].map(w => ({ id: w, label: `${w}.0 m` }))
        },
        {
          id: "storeys",
          label: "Storeys",
          default: String(preset.storeys),
          options: [
            { id: "2", label: "Ground storey and Stube" },
            { id: "3", label: "Ground storey, Stube and an upper storey" }
          ]
        },
        {
          id: "face",
          label: "Street face",
          default: preset.entranceFace,
          options: [
            { id: "gable", label: "Gable (Hanseatic and Mediterranean keep their own)" },
            { id: "eave", label: "Eaves" }
          ]
        },
        {
          id: "door",
          label: "Portal",
          default: preset.door,
          options: [
            { id: "closed", label: "Closed" },
            { id: "ajar", label: "Ajar" }
          ]
        },
        {
          id: "side",
          label: "Portal side",
          default: "left",
          options: [
            { id: "left", label: "Left" },
            { id: "right", label: "Right" }
          ]
        }
      ],
      applies: () => true,
      create: (variant, values) => createOpusGuildHouse(spec(values), variant.includes("@high#") ? "high" : "low")
    }
  };
});

export const models: MedievalModel[] = [...enclosedHalls, ...guildHouses];
