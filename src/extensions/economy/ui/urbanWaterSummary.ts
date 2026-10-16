/**
 * Display text for a burg's urban water system. Lives with the UI so the simulation core never
 * imports i18n (docs/plan/simulation-core-separation.md S1).
 */
import i18n from "../../../i18n";
import { rn } from "../../hostUtils";
import {
  type UrbanWaterSystem,
  WATER_SANITATION_TIER_LABELS,
  WATER_WORKS_PROJECT_LABELS
} from "../generators/urbanWaterSystem";

export function formatUrbanWaterSummary(system: UrbanWaterSystem): string {
  const tierLabel = i18n.t(`economy.water.tiers.${system.tier}`, {
    defaultValue: WATER_SANITATION_TIER_LABELS[system.tier]
  });
  const project =
    system.activeProject && system.upgradeProgress > 0
      ? i18n.t("economy.water.summary.building", {
          project: i18n.t(`economy.water.projects.${system.activeProject}`, {
            defaultValue: WATER_WORKS_PROJECT_LABELS[system.activeProject]
          }),
          percent: rn(system.upgradeProgress * 100, 0)
        })
      : "";
  const health =
    system.healthPressure >= 0.45
      ? i18n.t("economy.water.summary.healthRisk", { percent: rn(system.healthPressure * 100, 0) })
      : "";
  const upstream =
    system.upstreamPollutionImport >= 0.15
      ? i18n.t("economy.water.summary.upstreamPollution", { percent: rn(system.upstreamPollutionImport * 100, 0) })
      : "";
  return i18n.t("economy.water.summary.main", {
    tier: tierLabel,
    burden: rn(system.sanitationBurden * 100, 0),
    flood: rn(system.floodExposure * 100, 0),
    odor: rn(system.odor * 100, 0),
    project,
    health,
    upstream
  });
}
