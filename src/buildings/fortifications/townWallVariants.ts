import type { BuildingAppearanceProfile } from "../appearance/types";
import { type ModelVariant, variantId } from "../modelVariants";
import { CODEX_TOWN_WALLS, createCodexTownWallPart } from "./codexTownWalls";
import { TOWN_WALL_AUTHOR, TOWN_WALLS, type TownWallModel } from "./townWalls";

type Profiled = ModelVariant<[profile?: BuildingAppearanceProfile]>;

const study = (model: TownWallModel): Profiled => ({
  id: variantId(`town-wall.${model.id}`, "default", model.author ?? TOWN_WALL_AUTHOR),
  family: `town-wall.${model.id}`,
  level: "default",
  author: model.author ?? TOWN_WALL_AUTHOR,
  create: profile => model.create(profile)
});

/** BV studies with illustrative curtain wings; Codex and Grok each designed all three. */
export const TOWN_WALL_STUDY_VARIANTS: readonly Profiled[] = [...CODEX_TOWN_WALLS, ...TOWN_WALLS].map(study);

const STUDY_OF = { wall: "town-curtain-wall", bare: "town-curtain-wall", tower: "town-mural-tower", gate: "town-gate" };

/** Wingless parts CE strings along a circuit, cut from the adopted Codex studies. */
export const TOWN_WALL_PART_VARIANTS: readonly Profiled[] = (["wall", "bare", "tower", "gate"] as const).map(part => ({
  id: variantId(`town-wall-part.${part}`, "default", "Codex GPT-6.1 Sol"),
  family: `town-wall-part.${part}`,
  level: "default",
  author: "Codex GPT-6.1 Sol",
  basedOn: [variantId(`town-wall.${STUDY_OF[part]}`, "default", "Codex GPT-6.1 Sol")],
  create: profile =>
    part === "bare" ? createCodexTownWallPart("wall", false, profile) : createCodexTownWallPart(part, true, profile)
}));
