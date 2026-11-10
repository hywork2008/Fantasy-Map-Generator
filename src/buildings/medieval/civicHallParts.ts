import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { type CivicHallKind, createCivicHallDressing, createHighCivicHallBody } from "./civicHallDetails";
import { civicHallProfile, GUILD_HALL_PROFILE } from "./civicHallProfile";
import { createExteriorStair, type ExteriorStairOptions, exteriorStairLayout } from "./exteriorStair";
import { ModelKit } from "./modelKit";

export const CIVIC_STAIR: Readonly<ExteriorStairOptions> = {
  rise: GUILD_HALL_PROFILE.upperFloor,
  run: 5.7,
  width: 1.42,
  landingDepth: 1.5,
  doorWidth: 1.1
};

/** Identical assembly-origin anchors for both tiers; old callers continue to request High. */
export function createPlacedCivicStair(kind: CivicHallKind, detail: "low" | "high" = "high", landingFit?: "flush") {
  const profile = civicHallProfile(kind),
    k = new ModelKit(`${kind}-stair-placement`);
  const options = landingFit ? { ...CIVIC_STAIR, landingFit } : CIVIC_STAIR;
  const layout = exteriorStairLayout(options);
  k.attach(createExteriorStair(options, detail), [profile.width / 2 + layout.landingWidth / 2, 0, profile.doorZ]);
  return k.finish();
}

export function civicHallPartFactories(kind: CivicHallKind): ModelPartFactory[] {
  const parts: ModelPartFactory[] = [
    {
      id: `${kind}:architecture`,
      role: "architecture",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => createHighCivicHallBody(kind, kind !== "cloth")
    },
    {
      id: `${kind}:exterior-stair`,
      role: "exterior-stair",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => createPlacedCivicStair(kind)
    }
  ];
  if (kind === "cloth")
    parts.push({
      id: "cloth:trade-dressing",
      role: "trade-dressing",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => createCivicHallDressing(kind)
    });
  return parts;
}

export function assembleCivicHallParts(name: string, parts: readonly ModelPartFactory[]) {
  return compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });
}

export const createHighCivicHall = (kind: CivicHallKind) =>
  assembleCivicHallParts(`${kind}-civic-hall-high`, civicHallPartFactories(kind));
