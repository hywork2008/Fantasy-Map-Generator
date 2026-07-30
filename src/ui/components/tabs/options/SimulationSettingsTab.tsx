import type React from "react";
import { setConflictAutonomy } from "../../../../controllers/simulationSettings";
import { useOptionsState } from "../../../../store/optionsState";
import { lock } from "../../../../utils/domUtils";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";

export const SimulationSettingsTab: React.FC = () => {
  const options = useOptionsState();
  const updateOption = options.setOption;

  const updateOptionAndLock = <K extends keyof Omit<typeof options, "setOption" | "setOptions">>(
    key: K,
    value: (typeof options)[K]
  ) => {
    updateOption(key, value);
    lock(key as string);
  };

  return (
    <div>
      <p data-tip="Settings related to time advancement and demographics simulation">Simulation Settings:</p>
      <table>
        <tbody>
          <tr data-tip="Base birth rate per female adult per year at zero population density. Higher values mean faster demographic recovery and higher equilibrium limits.">
            <td>
              <LockIconButton id="demographicBirthRate" />
            </td>
            <td>Base Birth Rate</td>
            <td colSpan={2}>
              <SliderInput
                min="0.05"
                max="1.0"
                step="0.025"
                value={options.demographicBirthRate}
                onChange={v => updateOptionAndLock("demographicBirthRate", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Child mortality rate. The percentage of children who die before reaching adulthood. A historically realistic rate is 20-40%. 0% causes rapid population spikes.">
            <td>
              <LockIconButton id="demographicChildMortalityRate" />
            </td>
            <td>Child Mortality %</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="90"
                step="1"
                value={Math.round(options.demographicChildMortalityRate * 100)}
                onChange={v => updateOptionAndLock("demographicChildMortalityRate", Number(v) / 100)}
              />
            </td>
          </tr>

          <tr data-tip="Autonomous lets rulers begin wars as time advances. Player-directed prevents automatic declarations, battles, and occupations while economic and demographic simulation continues.">
            <td />
            <td>Conflict autonomy</td>
            <td colSpan={2}>
              <label>
                <input
                  type="radio"
                  name="conflictAutonomy"
                  value="autonomous"
                  checked={options.conflictAutonomy === "autonomous"}
                  onChange={e => setConflictAutonomy(e.target.value)}
                />{" "}
                Autonomous
              </label>{" "}
              <label>
                <input
                  type="radio"
                  name="conflictAutonomy"
                  value="playerDirected"
                  checked={options.conflictAutonomy === "playerDirected"}
                  onChange={e => setConflictAutonomy(e.target.value)}
                />{" "}
                Player-directed
              </label>
            </td>
          </tr>

          <tr data-tip="Multiplier for how quickly autonomous wars mature. 1.0 is default (wars take roughly a generation to brew). 0.0 prevents autonomous escalation. 2.0 means frequent wars.">
            <td>
              <LockIconButton id="warFrequency" />
            </td>
            <td>War Frequency</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="3"
                step="0.1"
                value={options.warFrequency}
                onChange={v => updateOptionAndLock("warFrequency", Number(v))}
              />
            </td>
          </tr>

          <tr>
            <td colSpan={4}>
              <p data-tip="Toggle advance-time subsystems. Day is the base unit (Month ≈ 30.5 days, Year ≈ 365). Turn off unused systems to speed up long runs.">
                Advance-time systems (skip when off):
              </p>
            </td>
          </tr>
          <tr data-tip="Aging, births, migration, and overpopulation losses each advance tick">
            <td />
            <td>
              <label htmlFor="simDemographics">Demographics</label>
            </td>
            <td colSpan={2}>
              <input
                id="simDemographics"
                type="checkbox"
                checked={options.simDemographics}
                onChange={e => updateOption("simDemographics", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip="Civilian adult males ↔ troops under arms: draft, refill, demobilize, and non-double-counted battle deaths">
            <td />
            <td>
              <label htmlFor="simManpower">Manpower ledger</label>
            </td>
            <td colSpan={2}>
              <input
                id="simManpower"
                type="checkbox"
                checked={options.simManpower}
                onChange={e => updateOption("simManpower", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip="Spring/autumn war hurts planting/harvest → foodStress → famine deaths and (with Economy) food prices/production">
            <td />
            <td>
              <label htmlFor="simAgriculture">Agriculture / famine</label>
            </td>
            <td colSpan={2}>
              <input
                id="simAgriculture"
                type="checkbox"
                checked={options.simAgriculture}
                onChange={e => updateOption("simAgriculture", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip="Independent: each settlement grows toward its own capacity via births only, no deliberate labor movement. Megacity: rural cells also release labor-safety-margined surplus adults once a year toward nearby cities (requires Economy enabled).">
            <td />
            <td>
              <label htmlFor="ruralUrbanMigration">Settlement growth</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralUrbanMigration"
                value={options.ruralUrbanMigration}
                onChange={e => updateOption("ruralUrbanMigration", e.target.value as "independent" | "megacity")}
              >
                <option value="independent">Independent (no migration)</option>
                <option value="megacity">Megacity (rural→urban migration)</option>
              </select>
            </td>
          </tr>
          <tr data-tip="Regiment reinforcement and cleanup of destroyed units (uses manpower pool when Manpower ledger is on)">
            <td />
            <td>
              <label htmlFor="simMilitaryRecovery">Military recovery</label>
            </td>
            <td colSpan={2}>
              <input
                id="simMilitaryRecovery"
                type="checkbox"
                checked={options.simMilitaryRecovery}
                onChange={e => updateOption("simMilitaryRecovery", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip="New recruits dilute regiment quality; combat power scales with quality (green troops fight poorly)">
            <td />
            <td>
              <label htmlFor="recruitQualityEnabled">Recruit quality</label>
            </td>
            <td colSpan={2}>
              <input
                id="recruitQualityEnabled"
                type="checkbox"
                checked={options.recruitQualityEnabled}
                onChange={e => updateOption("recruitQualityEnabled", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip="When male adults are scarce, draft a limited share of adult females into under-arms (experimental)">
            <td />
            <td>
              <label htmlFor="femaleLevyEnabled">Female levy</label>
            </td>
            <td colSpan={2}>
              <input
                id="femaleLevyEnabled"
                type="checkbox"
                checked={options.femaleLevyEnabled}
                onChange={e => updateOption("femaleLevyEnabled", e.target.checked)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
