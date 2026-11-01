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

export function civicHallPartFactories(kind: CivicHallKind): ModelPartFactory[] {
  const profile = civicHallProfile(kind),
    width = profile.width;
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
      create: () => {
        const k = new ModelKit(`${kind}-stair-placement`);
        const layout = exteriorStairLayout(CIVIC_STAIR);
        k.attach(createExteriorStair(CIVIC_STAIR), [width / 2 + layout.landingWidth / 2, 0, profile.doorZ]);
        return k.finish();
      }
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
