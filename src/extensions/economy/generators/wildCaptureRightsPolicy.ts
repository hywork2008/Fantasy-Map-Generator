/**
 * Who may capture wild horses into the village herd (docs/plan/wild-animal-capture-domestication.md
 * §4, stage C1). The model has no land tenure or hunting-right data, so the right is read from the
 * cell's culture type, its state's form, the map's historical period and the biome tags. Lord-run
 * capture (a lord stocking his own stud) is out of scope here. Every value is a model placeholder
 * ("provisional") until checked against sources.
 */
import type { BiomeTag } from "../../../types/biome";
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import { getWorldContext } from "../context/economyApi";

export type WildCaptureRight =
  | "noState"
  | "foragingCulture"
  | "openForm"
  | "outsideForestLawEra"
  | "commonsCustom"
  | "lordsForest";

/** Hunting and herding peoples treat wild horses as anyone's to take (provisional). */
const FORAGING_CULTURE_TYPES: ReadonlySet<string> = new Set(["Hunting", "Nomadic", "Desert"]);

/** Forms with a crown or church that claims the forest and its large game (royal forest, seigneurial
 * hunting right). Republics, unions and anarchies are read as without such a claim (provisional). */
const FOREST_CLAIMING_FORMS: ReadonlySet<string> = new Set(["Monarchy", "Theocracy"]);

/** Forest law runs from the Carolingian forestis (earlyMedieval) until game rights were abolished or
 * fell away at the end of the pre-industrial era; Roman law treated wild animals as res nullius
 * (provisional). */
const FOREST_LAW_FIRST_PERIOD = "earlyMedieval";
const FOREST_LAW_LAST_PERIOD = "preIndustrialEra";

/** Tags that make a cell the lord's game reserve. Moor and open pasture stay under commons custom
 * (semi-wild herds rounded up by the community), allowed at first (provisional). */
const LORDS_RESERVE_TAGS: ReadonlySet<BiomeTag> = new Set(["forest"]);

export interface WildCaptureRightInput {
  cultureType?: string;
  /** 0 or undefined for unclaimed land. */
  stateId?: number;
  stateForm?: string;
  historicalPeriod?: string;
  biomeTags: readonly BiomeTag[];
}

export function resolveWildCaptureRight(input: WildCaptureRightInput): WildCaptureRight {
  if (!input.stateId) return "noState";
  if (input.cultureType && FORAGING_CULTURE_TYPES.has(input.cultureType)) return "foragingCulture";
  if (!FOREST_CLAIMING_FORMS.has(input.stateForm || "Monarchy")) return "openForm";
  // Legacy maps without a period read as highMedieval, as elsewhere in the economy.
  const period = historicalPeriodIndex(input.historicalPeriod ?? "highMedieval");
  if (period < historicalPeriodIndex(FOREST_LAW_FIRST_PERIOD) || period > historicalPeriodIndex(FOREST_LAW_LAST_PERIOD))
    return "outsideForestLawEra";
  return input.biomeTags.some(tag => LORDS_RESERVE_TAGS.has(tag)) ? "lordsForest" : "commonsCustom";
}

export function isWildCaptureAllowed(right: WildCaptureRight): boolean {
  return right !== "lordsForest";
}

export function getCellWildCaptureRight(cellId: number): WildCaptureRight {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const stateId = cells.state?.[cellId];
  return resolveWildCaptureRight({
    cultureType: world.pack.cultures?.[cells.culture?.[cellId]]?.type,
    stateId,
    stateForm: stateId ? world.pack.states?.[stateId]?.form : undefined,
    historicalPeriod: world.options?.historicalPeriod,
    biomeTags: world.biomesData.tags?.[cells.biomeCode[cellId] ?? 0] ?? []
  });
}
