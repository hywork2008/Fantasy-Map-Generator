import { residentialStoreys } from "../../../../utils/urbanMorphology";
import type { GenerationSettings } from "../../../types/generation";
import type { VectorCityDocument } from "../../../types/vector/document";
import { lotFloorSpecs, varyFloorHeights } from "../../buildingFloors";
import { storeysWithinLimit } from "../../buildingHeightLimits";
import {
  heightSeed,
  type ResidentialHeightKind,
  residentialHeightWeights,
  sampleStoreysFromWeights,
  supportsBuildingHeightVariation
} from "../../buildingHeightPolicy";

/**
 * House heights of a meshless city by the mesh editor's rules (P3b): the period's storey weights per street
 * block, the requested height limit, and the per-house floor-height variation. The requested settings decide;
 * a city without them keeps the period's standard storeys, as before P3b.
 */
export interface VectorHousingHeights {
  /** True when storeys follow the period weights instead of the standard storeys. */
  varied: boolean;
  /** Storeys of one house, never below one. `inside` is false outside the town wall (the mesh outskirts). */
  storeys(houseKey: string, blockId: string, inside: boolean, kind?: ResidentialHeightKind): number;
  /** Mean storeys of a walled house, for sizing the site before any house exists. */
  expectedStoreys: number;
  /** Floor uses and heights of a house, with its variation when heights vary. */
  floors(houseKey: string, storeys: number): ReturnType<typeof lotFloorSpecs>;
}

/** A street block and a draw identify a house across regenerations; the key feeds the height streams. */
export const vectorHouseHeightKey = (blockId: string, draw: number) => `${blockId}#${draw}`;

export function vectorHousingHeights(
  doc: Pick<VectorCityDocument, "context" | "recipe" | "site">
): VectorHousingHeights {
  const period = doc.context.historicalPeriod,
    requested = doc.context.requestedSettings,
    tradition = doc.site?.descriptor?.civilization?.tradition,
    limit = requested?.buildingHeightLimit,
    varied = requested?.buildingHeightPolicy?.version === 1 && supportsBuildingHeightVariation(period, tradition),
    seed = heightSeed(doc.recipe.seed),
    floors = (key: string, storeys: number) => {
      const specs = lotFloorSpecs({ role: "main" }, storeys, period);
      return varied ? varyFloorHeights(specs, `${seed}:${key}`) : specs;
    },
    // A limit below one storey still leaves a one-storey house: a lot is never adopted empty.
    capped = (key: string, storeys: number) =>
      Math.max(
        1,
        storeysWithinLimit(limit, storeys, n => floors(key, n))
      ),
    standard = residentialStoreys(period).standard;
  return {
    varied,
    storeys: (key, blockId, inside, kind = "ordinary") =>
      capped(
        key,
        varied
          ? sampleStoreysFromWeights(seed, key, blockId, residentialHeightWeights(period, inside ? kind : "outside"))
          : standard
      ),
    expectedStoreys: expectedVectorHouseStoreys(period, requested, tradition),
    floors
  };
}

/** Mean storeys of a walled house under the requested settings; sizes the site before any house exists. A
 * height-only limit is left to the margin of the sizing. */
export function expectedVectorHouseStoreys(
  period: string,
  requested: Pick<GenerationSettings, "buildingHeightPolicy" | "buildingHeightLimit"> | undefined,
  tradition?: string
): number {
  const weights = residentialHeightWeights(period, "ordinary"),
    mean =
      requested?.buildingHeightPolicy?.version === 1 && supportsBuildingHeightVariation(period, tradition)
        ? weights.reduce((n, w, i) => n + w * (i + 1), 0)
        : residentialStoreys(period).standard;
  return Math.min(mean, Math.max(1, requested?.buildingHeightLimit?.maxStoreys ?? Infinity));
}
