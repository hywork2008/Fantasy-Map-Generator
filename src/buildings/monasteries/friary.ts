import { fitMonastery, type Monastery, type MonasteryKind } from "../../city-editor/generators/monasteryLayout";
import { makeRng } from "../../city-editor/generators/prng";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import type { TreeQuality } from "../landscape/treeQuality";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { createHighFriaryBuilding, createHighFriaryCloister, createHighFriaryWall } from "./friaryDetails";
import {
  createMonasteryBuilding,
  createMonasteryCloister,
  createMonasterySlab,
  createMonasteryTree,
  createMonasteryWall,
  createMonasteryWell,
  monasteryContext
} from "./monasteryComponents";

/** A fixed example of the same fitted programme used by generated CE religious houses. */
export function monasteryPreviewPlan(kind: MonasteryKind = "friary"): Monastery {
  return fitMonastery({
    kind,
    id: kind === "friary" ? "mendicant-friary" : kind === "abbey" ? "abbey" : "orthodox-monastery",
    faceId: "preview",
    ring:
      kind === "friary"
        ? [
            [-40, -35],
            [40, -35],
            [40, 35],
            [-40, 35]
          ]
        : [
            [-50, -45],
            [50, -45],
            [50, 45],
            [-50, 45]
          ],
    margin: 5,
    rng: makeRng(`bv-${kind}`),
    maxScale: 1,
    minScale: 1
  })!.monastery;
}

export interface MonasteryRenderOptions {
  /** Detailed architecture is currently available for the friary programme only. */
  architectureQuality?: "low" | "high";
  /** Omitted means all parts; an empty array intentionally creates an empty assembly. */
  partIds?: readonly string[];
  /** Vegetation has its own budget; never inherit the standalone tree's Ultra default. */
  vegetationQuality?: TreeQuality;
  /** Keep the original standalone well available without coupling it to the building tier. */
  wellQuality?: "low" | "default";
}

/** Enumerate factories without constructing any geometry or changing the saved plan. */
export function monasteryPartFactories(
  plan: Monastery = monasteryPreviewPlan(),
  elevation = 0,
  foundationBottom = elevation,
  options: MonasteryRenderOptions = {}
): ModelPartFactory[] {
  if (options.architectureQuality === "high" && plan.kind === "orthodoxMonastery")
    throw new Error("High architecture is not yet available for this monastery programme");
  const high = options.architectureQuality === "high";
  const context = monasteryContext(plan, elevation, foundationBottom);
  const { scale } = context;
  const result: ModelPartFactory[] = [];
  const add = (
    id: string,
    role: string,
    create: ModelPartFactory["create"],
    quality: ModelPartFactory["quality"] = "low",
    basedOn?: string[]
  ) => result.push({ id: `${plan.id}:${id}`, role, quality, author: DEFAULT_AUTHOR, basedOn, create });
  if (foundationBottom < elevation - 0.01)
    add("foundation", "foundation", () =>
      createMonasterySlab(
        "precinct-foundation",
        plan.precinct,
        [],
        foundationBottom,
        elevation - foundationBottom,
        "stone"
      )
    );
  for (const [index, court] of plan.courts.entries())
    add(`court:${index}`, court.kind, () =>
      createMonasterySlab(
        `friary-${court.kind}`,
        court.polygon,
        [],
        elevation + 0.01,
        0.03,
        court.kind === "yard" ? "earth" : "green"
      )
    );
  for (const [index, bed] of plan.beds.entries())
    add(`bed:${index}`, "herb-bed", () =>
      createMonasterySlab("herb-bed", bed, [], elevation + 0.04, 0.15 * scale, "earth")
    );
  for (const [index, building] of plan.buildings.entries())
    add(
      `building:${index}`,
      building.role,
      () => (high ? createHighFriaryBuilding(context, index) : createMonasteryBuilding(context, index)),
      high ? "high" : "low"
    );
  if (plan.walk)
    add(
      "cloister",
      "cloister",
      () => (high ? createHighFriaryCloister(context) : createMonasteryCloister(context)),
      high ? "high" : "low"
    );
  if (plan.wall.length > 1)
    add(
      "wall",
      "precinct-wall",
      () => (high ? createHighFriaryWall(context) : createMonasteryWall(context)),
      high ? "high" : "low"
    );
  for (const [index] of plan.trees.entries()) {
    const quality = options.vegetationQuality ?? "low";
    add(`tree:${index}`, "vegetation", () => createMonasteryTree(context, index, quality), quality, [
      variantId("tree.garden-parkland", quality, DEFAULT_AUTHOR)
    ]);
  }
  if (plan.well) {
    const quality = options.wellQuality ?? "low";
    add("well", "well", () => createMonasteryWell(context, quality), quality, [
      variantId("well.medieval", quality, DEFAULT_AUTHOR)
    ]);
  }
  return result;
}

/** Selected parts retain their fitted world placement and own only the resources they build. */
export function createMonastery(
  plan: Monastery = monasteryPreviewPlan(),
  elevation = 0,
  foundationBottom = elevation,
  options: MonasteryRenderOptions = {}
) {
  const factories = monasteryPartFactories(plan, elevation, foundationBottom, options);
  const selected =
    options.partIds === undefined
      ? factories
      : options.partIds.map(id => {
          const factory = factories.find(part => part.id === id);
          if (!factory) throw new Error(`Unknown monastery part: ${id}`);
          return factory;
        });
  if (new Set(selected.map(part => part.id)).size !== selected.length)
    throw new Error("Duplicate monastery part selection");
  return assembleMonasteryParts(plan.kind === "friary" ? "mendicant-friary" : plan.kind, selected);
}

export function assembleMonasteryParts(name: string, parts: readonly ModelPartFactory[]) {
  const model = createModelAssembly(name, parts);
  return parts.some(part => part.quality === "high") ? compactModel(model, { mergeEquivalentMaterials: true }) : model;
}

/** Backwards-compatible friary entry points for callers requesting that specific programme. */
export const friaryPreviewPlan = () => monasteryPreviewPlan("friary");
export const createFriary = (
  plan: Monastery = friaryPreviewPlan(),
  elevation = 0,
  foundationBottom = elevation,
  options: MonasteryRenderOptions = {}
) => createMonastery(plan, elevation, foundationBottom, options);
