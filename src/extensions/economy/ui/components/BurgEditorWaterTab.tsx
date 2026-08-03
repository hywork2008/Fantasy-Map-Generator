import type { FC } from "react";
import { useBurgEditorState } from "../../../hostUi";
import { rn } from "../../../hostUtils";
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
 * Phase 1 metrics + Phase 2 public works, maintenance, and demand signals.
 */
export const BurgEditorWaterTab: FC = () => {
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const cultureType = useBurgEditorState(state => state.burgData?.type);
  const system = burgId === undefined ? undefined : getUrbanWaterSystemForBurg(burgId);

  if (!system) {
    return (
      <div id="burgWaterTab" role="status">
        No urban water system is recorded for this burg. Enable Economy and regenerate the map, or wait for the annual
        settlement.
      </div>
    );
  }

  const profile = culturalHygieneProfile(cultureType);
  const civicScore = sanitationScoreFromSystem(system);
  const topCleansing = [...CLEANSING_MATERIALS]
    .map(key => ({ key, weight: profile.cleansing[key] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const topWaste = [...ORGANIC_WASTE_ROUTES]
    .map(key => ({ key, weight: profile.organicWaste[key] }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const projectLabel = system.activeProject ? WATER_WORKS_PROJECT_LABELS[system.activeProject] : "None";
  const demandLabel = system.primaryDemandSignal ? WATER_DEMAND_SIGNAL_LABELS[system.primaryDemandSignal] : "None";

  return (
    <div id="burgWaterTab">
      <p data-tip="Drainage tier is local practice; Phase 2 invests up to covered culverts without a tech-tree unlock.">
        {formatUrbanWaterSummary(system)}
      </p>
      <p data-tip="Host civic score written to burg.sanitation (0 worst – 100 best).">
        Civic sanitation score: <strong id="burgWaterCivicScore">{civicScore}</strong> / 100
      </p>

      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgWaterMetricsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Infrastructure tier</th>
              <td>
                {system.tier} — {WATER_SANITATION_TIER_LABELS[system.tier]}
              </td>
            </tr>
            <tr data-tip="Demand signal that most strongly justifies a waterworks project this year.">
              <th scope="row">Primary demand</th>
              <td>
                {demandLabel} ({pct(system.demandUrgency)})
              </td>
            </tr>
            <tr data-tip="Active public works project paid from burg treasury + market Stone/Tools/Brick.">
              <th scope="row">Active project</th>
              <td>
                {projectLabel}
                {system.activeProject ? ` · ${pct(system.upgradeProgress)} complete` : ""}
              </td>
            </tr>
            <tr data-tip="Share of needed annual maintenance paid from burg treasury (separate from construction).">
              <th scope="row">Maintenance coverage</th>
              <td>
                {pct(system.lastMaintenanceCoverage)} (spent {rn(system.lastMaintenanceSpend, 1)})
              </td>
            </tr>
            <tr data-tip="Treasury spent on construction last year (cash + materials).">
              <th scope="row">Construction spend</th>
              <td>{rn(system.lastConstructionSpend, 1)}</td>
            </tr>
            <tr data-tip="Silt, debris, and illegal dumping that cut capacity even when the structure is intact.">
              <th scope="row">Clogging</th>
              <td>{pct(system.clogging)}</td>
            </tr>
            <tr data-tip="Effective capacity after maintenance and local slope.">
              <th scope="row">Stormwater capacity</th>
              <td>
                {pct(system.stormwaterDrainageCapacity)} (demand {pct(system.stormwaterDemand)})
              </td>
            </tr>
            <tr data-tip="Household, bath, and workshop wastewater handling capacity.">
              <th scope="row">Wastewater capacity</th>
              <td>
                {pct(system.wastewaterCapacity)} (demand {pct(system.wastewaterDemand)})
              </td>
            </tr>
            <tr>
              <th scope="row">Drinking-water security</th>
              <td>{pct(system.drinkingWaterSecurity)}</td>
            </tr>
            <tr>
              <th scope="row">Service / craft water</th>
              <td>{pct(system.serviceWaterCapacity)}</td>
            </tr>
            <tr>
              <th scope="row">Irrigation capacity</th>
              <td>{pct(system.irrigationCapacity)}</td>
            </tr>
            <tr>
              <th scope="row">Maintenance condition</th>
              <td>{pct(system.maintenanceCondition)}</td>
            </tr>
            <tr>
              <th scope="row">Sanitation burden</th>
              <td>{pct(system.sanitationBurden)}</td>
            </tr>
            <tr>
              <th scope="row">Water contamination</th>
              <td>{pct(system.waterContamination)}</td>
            </tr>
            <tr>
              <th scope="row">Flood exposure</th>
              <td>{pct(system.floodExposure)}</td>
            </tr>
            <tr>
              <th scope="row">Muddiness</th>
              <td>{pct(system.muddiness)}</td>
            </tr>
            <tr>
              <th scope="row">Odor</th>
              <td>{pct(system.odor)}</td>
            </tr>
            <tr>
              <th scope="row">Intake / outfall</th>
              <td>
                {system.hasUpstreamIntake ? "upstream intake" : "no protected intake"}
                {" · "}
                {system.hasDownstreamOutfall ? "downstream outfall" : "no natural outfall"}
                {system.hasSeparateWastewaterRoute ? " · separate wastewater route" : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p data-tip="Cultural weights are recomputed from burg type; they are not separate tech unlocks.">
        Cleansing customs:{" "}
        {topCleansing.map(entry => `${CLEANSING_LABELS[entry.key]} ${pct(entry.weight)}`).join(" · ")}
      </p>
      <p data-tip="Organic-waste pathways. Market pigs contribute to animal scavenging relief and risk.">
        Organic waste routes: {topWaste.map(entry => `${WASTE_LABELS[entry.key]} ${pct(entry.weight)}`).join(" · ")}
      </p>
    </div>
  );
};
