import type { CityDocument } from "../types/document";
import { validPopulationPlan, validPopulationSettings } from "./populationPlan";

/** Validate every persisted population field before rendering or replaying a recipe. */
export function validPopulationDocument(document: Partial<CityDocument>): boolean {
  const plan = document.populationPlan;
  if (plan !== undefined && !validPopulationPlan(plan)) return false;
  if (plan?.heightPolicyVersion === 1 && !document.buildingHeightPolicy) return false;
  const recipe = document.fabric?.generation;
  if (recipe?.settings?.population !== undefined && !validPopulationSettings(recipe.settings.population)) return false;
  if (recipe?.input?.populationPlan !== undefined && !validPopulationPlan(recipe.input.populationPlan)) return false;
  const clusters = document.residentialClusters;
  if (clusters !== undefined) {
    if (!plan || !Array.isArray(clusters) || clusters.length > 200_000) return false;
    const ids = new Set<string>();
    for (const c of clusters) {
      if (
        !c ||
        typeof c.id !== "string" ||
        ids.has(c.id) ||
        typeof c.regionId !== "string" ||
        !Array.isArray(c.faceIds) ||
        !c.faceIds.length ||
        c.faceIds.some(id => typeof id !== "string" || !document.mesh?.faces[id]) ||
        !Array.isArray(c.polygon) ||
        c.polygon.length < 3 ||
        c.polygon.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
        !c.templateCounts ||
        typeof c.templateCounts !== "object" ||
        Array.isArray(c.templateCounts) ||
        Object.values(c.templateCounts).some(n => !Number.isSafeInteger(n) || n < 1) ||
        !Number.isFinite(c.residentialFootprintM2) ||
        c.residentialFootprintM2 <= 0 ||
        ![c.capacityDwellings, c.assignedDwellings, c.assignedPopulation].every(
          n => Number.isSafeInteger(n) && n >= 0
        ) ||
        c.assignedDwellings > c.capacityDwellings
      )
        return false;
      ids.add(c.id);
    }
  }
  const report = document.populationReport;
  if (report !== undefined) {
    if (!report || typeof report !== "object") return false;
    if (
      report.wallEnvelopeAreaM2 !== null &&
      (!Number.isFinite(report.wallEnvelopeAreaM2) || report.wallEnvelopeAreaM2 < 0)
    )
      return false;
    if (
      !plan ||
      !report ||
      typeof report !== "object" ||
      report.targetPopulation !== plan.settings.targetPopulation ||
      ![report.assignedPopulation, report.unplacedPopulation, report.estimatedBuildings, report.displayGroups].every(
        n => Number.isSafeInteger(n) && n >= 0
      ) ||
      report.assignedPopulation + report.unplacedPopulation !== report.targetPopulation ||
      ![report.coreLandAreaM2, report.outsideDevelopedAreaM2, report.residentialFootprintM2, report.frameAreaM2].every(
        n => Number.isFinite(n) && n >= 0
      ) ||
      !Array.isArray(report.reasons) ||
      report.reasons.some(r => typeof r !== "string")
    )
      return false;
  }
  return true;
}
