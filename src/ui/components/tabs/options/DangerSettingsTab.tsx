import type React from "react";
import { useOptionsState } from "../../../../store/optionsState";
import { lock } from "../../../../utils/domUtils";
import { LockIconButton } from "../../LockIconButton";

export const DangerSettingsTab: React.FC = () => {
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
      <p data-tip="Settings related to danger/threat generation">Danger settings:</p>
      <table>
        <tbody>
          <tr data-tip="Smooth Contours blend neighboring threats into a density field. Cell Heatmap paints each cell only from its own danger value (0–255); color matches the cell tooltip.">
            <td></td>
            <td>Danger rendering</td>
            <td>
              <select
                id="dangerRenderingMode"
                value={options.dangerRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "contour" | "choropleth";
                  updateOption("dangerRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-danger-rendering-mode"));
                }}
              >
                <option value="contour">Smooth Contours (blended)</option>
                <option value="choropleth">Cell Heatmap (per-cell)</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select how Threat (Danger) level is calculated from monsters">
            <td>
              <LockIconButton id="threatCalculation" />
            </td>
            <td>Threat calculation</td>
            <td>
              <select
                id="threatCalculation"
                value={options.threatCalculation}
                onChange={e => {
                  updateOptionAndLock("threatCalculation", e.target.value as "additive" | "max" | "nonlinear");
                  // Rebuild danger paint from living monsters so the layer reflects the mode
                  // immediately. Population capacity still requires a full map regenerate.
                  document.dispatchEvent(new CustomEvent("react-change-threat-calculation"));
                }}
              >
                <option value="additive">Accumulative (Default)</option>
                <option value="max">Highest Overlap (Max)</option>
                <option value="nonlinear">Steep Decay (Non-linear)</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr>
            <td colSpan={4} style={{ fontWeight: "bold", paddingTop: "10px" }}>
              Rarity 5 Threats
            </td>
          </tr>
          <tr data-tip="Number of Rarity 5 threats">
            <td></td>
            <td>Spawn Count</td>
            <td>
              <span data-tip="Minimal possible spawn">min</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity5Min}
                onChange={e => updateOption("dangerRarity5Min", Number(e.target.value))}
              />
              <span data-tip="Maximal possible spawn">max</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity5Max}
                onChange={e => updateOption("dangerRarity5Max", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Base power for Rarity 5 threats">
            <td></td>
            <td>Power</td>
            <td>
              <input
                type="number"
                min="1"
                max="1000"
                value={options.dangerRarity5Power}
                onChange={e => updateOption("dangerRarity5Power", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Type label for Rarity 5 threats">
            <td></td>
            <td>Type Name</td>
            <td>
              <input
                type="text"
                value={options.dangerRarity5Type}
                onChange={e => updateOption("dangerRarity5Type", e.target.value)}
              />
            </td>
            <td></td>
          </tr>

          <tr>
            <td colSpan={4} style={{ fontWeight: "bold", paddingTop: "10px" }}>
              Rarity 4 Threats
            </td>
          </tr>
          <tr data-tip="Number of Rarity 4 threats">
            <td></td>
            <td>Spawn Count</td>
            <td>
              <span data-tip="Minimal possible spawn">min</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity4Min}
                onChange={e => updateOption("dangerRarity4Min", Number(e.target.value))}
              />
              <span data-tip="Maximal possible spawn">max</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity4Max}
                onChange={e => updateOption("dangerRarity4Max", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Base power for Rarity 4 threats">
            <td></td>
            <td>Power</td>
            <td>
              <input
                type="number"
                min="1"
                max="1000"
                value={options.dangerRarity4Power}
                onChange={e => updateOption("dangerRarity4Power", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Type label for Rarity 4 threats">
            <td></td>
            <td>Type Name</td>
            <td>
              <input
                type="text"
                value={options.dangerRarity4Type}
                onChange={e => updateOption("dangerRarity4Type", e.target.value)}
              />
            </td>
            <td></td>
          </tr>

          <tr>
            <td colSpan={4} style={{ fontWeight: "bold", paddingTop: "10px" }}>
              Rarity 3 Threats
            </td>
          </tr>
          <tr data-tip="Number of Rarity 3 threats">
            <td></td>
            <td>Spawn Count</td>
            <td>
              <span data-tip="Minimal possible spawn">min</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity3Min}
                onChange={e => updateOption("dangerRarity3Min", Number(e.target.value))}
              />
              <span data-tip="Maximal possible spawn">max</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="100"
                value={options.dangerRarity3Max}
                onChange={e => updateOption("dangerRarity3Max", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Base power for Rarity 3 threats">
            <td></td>
            <td>Power</td>
            <td>
              <input
                type="number"
                min="1"
                max="1000"
                value={options.dangerRarity3Power}
                onChange={e => updateOption("dangerRarity3Power", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Type label for Rarity 3 threats">
            <td></td>
            <td>Type Name</td>
            <td>
              <input
                type="text"
                value={options.dangerRarity3Type}
                onChange={e => updateOption("dangerRarity3Type", e.target.value)}
              />
            </td>
            <td></td>
          </tr>

          <tr>
            <td colSpan={4} style={{ fontWeight: "bold", paddingTop: "10px" }}>
              Rarity 1-2 Threats
            </td>
          </tr>
          <tr data-tip="Number of Rarity 1-2 threats">
            <td></td>
            <td>Spawn Count</td>
            <td>
              <span data-tip="Minimal possible spawn">min</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="1000"
                value={options.dangerRarity1Min}
                onChange={e => updateOption("dangerRarity1Min", Number(e.target.value))}
              />
              <span data-tip="Maximal possible spawn">max</span>
              <input
                className="paired"
                type="number"
                min="0"
                max="1000"
                value={options.dangerRarity1Max}
                onChange={e => updateOption("dangerRarity1Max", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Base power for Rarity 1-2 threats">
            <td></td>
            <td>Power</td>
            <td>
              <input
                type="number"
                min="1"
                max="1000"
                value={options.dangerRarity1Power}
                onChange={e => updateOption("dangerRarity1Power", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>
          <tr data-tip="Type label for Rarity 1-2 threats">
            <td></td>
            <td>Type Name</td>
            <td>
              <input
                type="text"
                value={options.dangerRarity1Type}
                onChange={e => updateOption("dangerRarity1Type", e.target.value)}
              />
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
