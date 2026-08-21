import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { useBurgEditorState } from "../../../hostUi";
import { rn } from "../../../hostUtils";
import { getAleDemandMultiplier, getAleWaterRisk } from "../../generators/aleDemand";
import {
  culturalHygieneProfile,
  formatUrbanWaterSummary,
  getUrbanWaterSystemForBurg,
  sanitationScoreFromSystem,
  WATER_DEMAND_SIGNAL_LABELS,
  WATER_SANITATION_TIER_LABELS,
  WATER_WORKS_PROJECT_LABELS
} from "../../generators/urbanWaterSystem";
import {
  CLEANSING_MATERIALS,
  type CleansingMaterial,
  ORGANIC_WASTE_ROUTES,
  type OrganicWasteRoute
} from "../../generators/urbanWaterTypes";

/** English fallbacks used when a translation is missing; canonical labels live in i18n under economy.water.*. */
const CLEANSING_LABELS: Readonly<Record<CleansingMaterial, string>> = {
  water: "Water washing",
  plant: "Plant materials",
  cloth: "Cloth / rags",
  paper: "Paper",
  sharedTool: "Shared tools"
};

const WASTE_LABELS: Readonly<Record<OrganicWasteRoute, string>> = {
  openDisposal: "Open disposal",
  cesspit: "Cesspits",
  nightSoilCollection: "Night-soil collection",
  managedComposting: "Managed composting",
  animalScavenging: "Animal scavenging (pigs etc.)",
  waterDischarge: "Water discharge"
};

function pct(value: number): string {
  return `${rn(value * 100, 0)}%`;
}

/**
 * Read-only water / sanitation ledger for the open burg.
 * Phases 1–3: metrics, public works, institutions, organic routes, river externalities.
 */
export const BurgEditorWaterTab: FC = () => {
  const { t } = useTranslation();
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const cultureType = useBurgEditorState(state => state.burgData?.type);
  const system = burgId === undefined ? undefined : getUrbanWaterSystemForBurg(burgId);

  if (!system) {
    return (
      <div id="burgWaterTab" role="status">
        {t("dialogs.burgEditor.waterTab.noSystem")}
      </div>
    );
  }

  const profile = culturalHygieneProfile(cultureType);
  const civicScore = sanitationScoreFromSystem(system);
  const aleWaterRisk = getAleWaterRisk(system);
  const aleDemandBonus = getAleDemandMultiplier(aleWaterRisk) - 1;
  const topCleansing = [...CLEANSING_MATERIALS]
    .map(key => ({ key, weight: profile.cleansing[key] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const topWaste = [...ORGANIC_WASTE_ROUTES]
    .map(key => ({ key, weight: profile.organicWaste[key] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const tierLabel = t(`economy.water.tiers.${system.tier}`, {
    defaultValue: WATER_SANITATION_TIER_LABELS[system.tier]
  });
  const projectLabel = system.activeProject
    ? t(`economy.water.projects.${system.activeProject}`, {
        defaultValue: WATER_WORKS_PROJECT_LABELS[system.activeProject]
      })
    : t("economy.water.none");
  const demandLabel = system.primaryDemandSignal
    ? t(`economy.water.demandSignals.${system.primaryDemandSignal}`, {
        defaultValue: WATER_DEMAND_SIGNAL_LABELS[system.primaryDemandSignal]
      })
    : t("economy.water.none");

  return (
    <div id="burgWaterTab">
      <p data-tip={t("dialogs.burgEditor.waterTab.summaryTip")}>{formatUrbanWaterSummary(system)}</p>
      <p data-tip={t("dialogs.burgEditor.waterTab.civicScoreTip")}>
        {t("dialogs.burgEditor.waterTab.civicScoreLabel")} <strong id="burgWaterCivicScore">{civicScore}</strong>{" "}
        {t("dialogs.burgEditor.waterTab.outOf100")}
      </p>
      <p data-tip={t("dialogs.burgEditor.waterTab.aleDemandTip")}>
        {t("dialogs.burgEditor.waterTab.aleDemandLabel")}{" "}
        <strong id="burgWaterAleDemandAdjustment">+{pct(aleDemandBonus)}</strong>{" "}
        {t("dialogs.burgEditor.waterTab.drinkingWaterRiskSuffix", { risk: pct(aleWaterRisk) })}
      </p>

      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgWaterMetricsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">{t("dialogs.burgEditor.waterTab.metric")}</th>
              <th scope="col">{t("dialogs.burgEditor.waterTab.value")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.infrastructureTier")}</th>
              <td>
                {system.tier} — {tierLabel}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.primaryDemandTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.primaryDemand")}</th>
              <td>
                {demandLabel} ({pct(system.demandUrgency)})
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.activeProjectTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.activeProject")}</th>
              <td>
                {projectLabel}
                {system.activeProject
                  ? ` ${t("dialogs.burgEditor.waterTab.projectCompleteSuffix", { percent: pct(system.upgradeProgress) })}`
                  : ""}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.cleaningTaxTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.cleaningTax")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.cleaningTaxValue", {
                  rate: pct(system.cleaningTaxRate),
                  revenue: rn(system.lastCleaningTaxRevenue, 1)
                })}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.connectionPermitsTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.connectionPermits")}</th>
              <td>{pct(system.connectionPermitCoverage)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.dischargeRegulationTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.dischargeRegulation")}</th>
              <td>{pct(system.dischargeRegulation)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.mixedIntakeOutfallTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.mixedIntakeOutfall")}</th>
              <td>
                {system.localMixedIntakeOutfall
                  ? t("dialogs.burgEditor.waterTab.mixedIntakeYes")
                  : t("dialogs.burgEditor.waterTab.mixedIntakeNo")}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.maintenanceCoverageTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.maintenanceCoverage")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.maintenanceCoverageValue", {
                  coverage: pct(system.lastMaintenanceCoverage),
                  spend: rn(system.lastMaintenanceSpend, 1)
                })}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.constructionSpendTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.constructionSpend")}</th>
              <td>{rn(system.lastConstructionSpend, 1)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.cloggingTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.clogging")}</th>
              <td>{pct(system.clogging)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.organicStreetLoadTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.organicStreetLoad")}</th>
              <td>{pct(system.organicStreetLoad)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.compostingEfficiencyTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.compostingEfficiency")}</th>
              <td>{pct(system.compostingEfficiency)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.pigToiletPracticeTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.pigToiletPractice")}</th>
              <td>{pct(system.pigToiletPractice)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.upstreamPollutionTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.upstreamPollution")}</th>
              <td>{pct(system.upstreamPollutionImport)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.downstreamExportTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.downstreamExport")}</th>
              <td>{pct(system.downstreamPollutionExport)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.coalSmokeExposureTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.coalSmokeExposure")}</th>
              <td>{pct(system.coalSmokeExposure ?? 0)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.healthPressureTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.healthPressure")}</th>
              <td>{pct(system.healthPressure)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.waterLiftingTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.waterLifting")}</th>
              <td>{pct(system.waterLifting)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.municipalSanitationTechTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.municipalSanitationTech")}</th>
              <td>{pct(system.municipalSanitation)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.sanitaryEngineeringTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.sanitaryEngineering")}</th>
              <td>
                {pct(system.sanitaryEngineering)}
                {system.hasSeparateWastewaterRoute
                  ? ` ${t("dialogs.burgEditor.waterTab.separateWastewaterRouteSuffix")}`
                  : ""}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.pollutionCompensationTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.pollutionCompensation")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.pollutionCompensationValue", {
                  paid: rn(system.lastPollutionCompensationPaid, 1),
                  received: rn(system.lastPollutionCompensationReceived, 1)
                })}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.diplomaticStrainTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.diplomaticStrain")}</th>
              <td>{pct(system.pollutionDiplomaticStrain)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.stormwaterCapacityTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.stormwaterCapacity")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.capacityDemandValue", {
                  capacity: pct(system.stormwaterDrainageCapacity),
                  demand: pct(system.stormwaterDemand)
                })}
              </td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.wastewaterCapacityTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.wastewaterCapacity")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.capacityDemandValue", {
                  capacity: pct(system.wastewaterCapacity),
                  demand: pct(system.wastewaterDemand)
                })}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.drinkingWaterSecurity")}</th>
              <td>{pct(system.drinkingWaterSecurity)}</td>
            </tr>
            <tr data-tip={t("dialogs.burgEditor.waterTab.aleDemandFromWaterRiskTip")}>
              <th scope="row">{t("dialogs.burgEditor.waterTab.aleDemandFromWaterRisk")}</th>
              <td>
                {t("dialogs.burgEditor.waterTab.aleDemandRiskValue", {
                  bonus: pct(aleDemandBonus),
                  risk: pct(aleWaterRisk)
                })}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.serviceCraftWater")}</th>
              <td>{pct(system.serviceWaterCapacity)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.irrigationCapacity")}</th>
              <td>{pct(system.irrigationCapacity)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.maintenanceCondition")}</th>
              <td>{pct(system.maintenanceCondition)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.sanitationBurden")}</th>
              <td>{pct(system.sanitationBurden)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.waterContamination")}</th>
              <td>{pct(system.waterContamination)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.floodExposure")}</th>
              <td>{pct(system.floodExposure)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.muddiness")}</th>
              <td>{pct(system.muddiness)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.odor")}</th>
              <td>{pct(system.odor)}</td>
            </tr>
            <tr>
              <th scope="row">{t("dialogs.burgEditor.waterTab.intakeOutfall")}</th>
              <td>
                {system.hasUpstreamIntake
                  ? t("dialogs.burgEditor.waterTab.upstreamIntakeYes")
                  : t("dialogs.burgEditor.waterTab.upstreamIntakeNo")}
                {" · "}
                {system.hasDownstreamOutfall
                  ? t("dialogs.burgEditor.waterTab.downstreamOutfallYes")
                  : t("dialogs.burgEditor.waterTab.downstreamOutfallNo")}
                {system.hasSeparateWastewaterRoute
                  ? ` ${t("dialogs.burgEditor.waterTab.separateWastewaterRouteSuffix")}`
                  : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p data-tip={t("dialogs.burgEditor.waterTab.cleansingCustomsTip")}>
        {t("dialogs.burgEditor.waterTab.cleansingCustomsLabel")}{" "}
        {topCleansing
          .map(
            entry =>
              `${t(`economy.water.cleansingMaterials.${entry.key}`, { defaultValue: CLEANSING_LABELS[entry.key] })} ${pct(entry.weight)}`
          )
          .join(" · ")}
      </p>
      <p data-tip={t("dialogs.burgEditor.waterTab.organicWasteRoutesTip")}>
        {t("dialogs.burgEditor.waterTab.organicWasteRoutesLabel")}{" "}
        {topWaste
          .map(
            entry =>
              `${t(`economy.water.wasteRoutes.${entry.key}`, { defaultValue: WASTE_LABELS[entry.key] })} ${pct(entry.weight)}`
          )
          .join(" · ")}
      </p>
    </div>
  );
};
