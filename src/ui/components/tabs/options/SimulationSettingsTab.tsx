import type React from "react";
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
        </tbody>
      </table>
    </div>
  );
};
