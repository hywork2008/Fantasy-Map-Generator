import type React from "react";
import {
  getInitialSettlementPatternPreset,
  heightmapLandmassThresholds,
  INITIAL_SETTLEMENT_PATTERN_PRESETS
} from "../../../../data";
import { useGenerationProgressState } from "../../../../store/generationProgressState";
import { useOptionsState } from "../../../../store/optionsState";
import { lock } from "../../../../utils/domUtils";
import { IconButton } from "../../IconButton";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";
export const GenerationSettingsTab: React.FC = () => {
  const options = useOptionsState();
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const updateOption = options.setOption;
  const usesPolityDensity = options.initialSettlementPattern !== "standard";
  const statesNumberLabel = usesPolityDensity ? "Polity density" : "States number";
  const statesNumberTooltip = usesPolityDensity
    ? "Define polity density for settlement-network maps"
    : "Define the number of states for standard maps";

  const updateOptionAndLock = <K extends keyof Omit<typeof options, "setOption" | "setOptions">>(
    key: K,
    value: (typeof options)[K]
  ) => {
    updateOption(key, value);
    lock(key as string);
  };

  const handleMapSizeChange = () => {
    document.dispatchEvent(new CustomEvent("react-map-size-change"));
  };

  const handleRestoreDefaultSize = () => {
    options.setOptions({ mapWidth: window.innerWidth, mapHeight: window.innerHeight });
    setTimeout(handleMapSizeChange, 0);
  };

  return (
    <div>
      <p data-tip="Map generation settings. Generate a new map to apply the settings">
        Map settings (new map to apply):
      </p>
      <table>
        <tbody>
          <tr data-tip="Set original map size on generation. It cannot be changed later. Always keep canvas size equal to your screen size or less.">
            <td>
              <IconButton data-tip="Restore default canvas size" icon="icon-ccw" onClick={handleRestoreDefaultSize} />
            </td>
            <td>Canvas size</td>
            <td>
              <input
                className="paired"
                type="number"
                min="240"
                value={options.mapWidth}
                onChange={e => {
                  updateOption("mapWidth", Number(e.target.value));
                  handleMapSizeChange();
                }}
              />
              <span>x</span>
              <input
                className="paired"
                type="number"
                min="135"
                value={options.mapHeight}
                onChange={e => {
                  updateOption("mapHeight", Number(e.target.value));
                  handleMapSizeChange();
                }}
              />
              <span>px</span>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Map seed number. Press 'Enter' to apply. Seed produces the same map only if canvas size and options are the same">
            <td>
              <i
                data-tip="Show seed history to apply a previous seed"
                id="optionsMapHistory"
                className="icon-hourglass-1"
              ></i>
            </td>
            <td>Map seed</td>
            <td>
              <input
                id="optionsSeed"
                className="long"
                type="number"
                min="1"
                max="999999999"
                step="1"
                value={options.seed}
                onChange={e => updateOption("seed", e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !isMapGenerationInProgress) {
                    document.dispatchEvent(
                      new CustomEvent("react-generate-map-with-seed", { detail: { seed: options.seed } })
                    );
                  }
                }}
              />
            </td>
            <td>
              <i
                data-tip="Copy map seed as URL. It will produce the same map only if options are default or the same"
                id="optionsCopySeed"
                className="icon-docs"
              ></i>
            </td>
          </tr>

          <tr data-tip="Set number of points to be used for graph generation. Highly affects performance. 10K is the only recommended value">
            <td>
              <LockIconButton id="points" />
            </td>
            <td>Points number</td>
            <td>
              <input
                type="range"
                min="1"
                max="13"
                value={options.points}
                onChange={e => updateOptionAndLock("points", Number(e.target.value))}
              />
            </td>
            <td>
              <output style={{ color: options.points === 4 ? "#053305" : "#dfdf12" }}>
                {options.points === 4 ? "10K" : `${options.points * 2.5}K`}
              </output>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>1. Landscape outline</th>
          </tr>
          <tr data-tip="Select heightmap template to be used for map generation">
            <td>
              <LockIconButton id="template" />
            </td>
            <td>Heightmap</td>
            <td
              id="templateInputContainer"
              className="pointer"
              onClick={() => document.dispatchEvent(new CustomEvent("react-open-template-selection"))}
            >
              <span className="d-inline-block">{options.template || "highIsland"}</span>
              <input id="templateInput" type="hidden" value={options.template} readOnly />
            </td>
            <td></td>
          </tr>

          <tr data-tip="When Heightmap is unlocked, limit random selection to templates with the selected average land or ocean coverage">
            <td></td>
            <td>Random heightmap pool</td>
            <td colSpan={2}>
              <select
                value={options.templateRandomization}
                onChange={e =>
                  updateOption("templateRandomization", e.target.value as typeof options.templateRandomization)
                }
              >
                <option value="all">All templates</option>
                <option value="landRich">Land-rich ({heightmapLandmassThresholds.landRichMinimum}%+ land)</option>
                <option value="oceanRich">
                  Ocean-rich ({100 - heightmapLandmassThresholds.oceanRichMaximum}%+ ocean)
                </option>
              </select>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>2. Climate and waterways</th>
          </tr>
          <tr data-tip="Regional climate-vegetation profile: adjusts continuous great forests, heath mosaics, mediterranean scrub, mangroves, and mountain biomes without replacing the base terrain generator. Apply on next map generation.">
            <td>
              <LockIconButton id="biomeRegionProfile" />
            </td>
            <td>Biome region</td>
            <td colSpan={2}>
              <select
                value={options.biomeRegionProfile}
                onChange={e => {
                  options.setOptions({
                    biomeRegionProfile: e.target.value as typeof options.biomeRegionProfile
                  });
                  lock("biomeRegionProfile");
                }}
              >
                <option value="global">Global (default mix)</option>
                <option value="medievalEurope">Medieval Europe</option>
                <option value="mediterranean">Mediterranean</option>
                <option value="tropicalRiverBasin">Tropical river basin</option>
                <option value="mountainRealm">Mountain realm</option>
              </select>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>3. Cultures and settlements</th>
          </tr>

          <tr data-tip="Define how many Cultures should be generated">
            <td>
              <LockIconButton id="cultures" />
            </td>
            <td>Cultures number</td>
            <td colSpan={2}>
              <input
                type="range"
                min="1"
                max="100"
                value={options.cultures}
                onChange={e => updateOptionAndLock("cultures", Number(e.target.value))}
              />
              <input
                type="number"
                min="1"
                max="100"
                value={options.cultures}
                onChange={e => updateOptionAndLock("cultures", Number(e.target.value))}
              />
            </td>
          </tr>

          <tr data-tip="Select a set of cultures to be used for names and cultures generation">
            <td>
              <LockIconButton id="culturesSet" />
            </td>
            <td>Cultures set</td>
            <td>
              <select
                id="culturesSet"
                value={options.culturesSet}
                onChange={e => {
                  updateOptionAndLock("culturesSet", e.target.value);
                  document.dispatchEvent(new CustomEvent("react-change-cultures-set"));
                }}
              >
                <option value="world" data-max="32">
                  All-world
                </option>
                <option value="european" data-max="15">
                  European
                </option>
                <option value="oriental" data-max="13">
                  Oriental
                </option>
                <option value="english" data-max="10">
                  English
                </option>
                <option value="antique" data-max="10">
                  Antique
                </option>
                <option value="highFantasy" data-max="17">
                  High Fantasy
                </option>
                <option value="darkFantasy" data-max="18">
                  Dark Fantasy
                </option>
                <option value="random" data-max="100">
                  Random
                </option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Determines how full the world is relative to its carrying capacity at the start. 100% means fully saturated, lower values allow for future demographic growth.">
            <td>
              <LockIconButton id="initialPopulationSaturation" />
            </td>
            <td>Initial population %</td>
            <td colSpan={2}>
              <SliderInput
                min="10"
                max="100"
                step="5"
                value={options.initialPopulationSaturation}
                onChange={v => updateOptionAndLock("initialPopulationSaturation", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Choose whether initial people are spread across suitable land or concentrated around favorable settlement hubs. Selecting a preset also applies its recommended initial population percentage.">
            <td>
              <LockIconButton id="initialSettlementPattern" />
            </td>
            <td>Settlement pattern</td>
            <td colSpan={2}>
              <select
                value={options.initialSettlementPattern}
                onChange={e => {
                  const initialSettlementPattern = e.target.value as typeof options.initialSettlementPattern;
                  const preset = getInitialSettlementPatternPreset(initialSettlementPattern);
                  options.setOptions({
                    initialSettlementPattern,
                    initialPopulationSaturation: preset.initialPopulationSaturation
                  });
                  lock("initialSettlementPattern");
                }}
              >
                {INITIAL_SETTLEMENT_PATTERN_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr data-tip="Define a number of non-capital settlements to be placed (if enough suitable land exists)">
            <td>
              <LockIconButton id="manors" />
            </td>
            <td>Burgs number</td>
            <td>
              <input
                id="manorsInput"
                type="range"
                min="0"
                max="1000"
                step="1"
                value={options.manors}
                onChange={e => updateOptionAndLock("manors", Number(e.target.value))}
              />
            </td>
            <td>
              <output id="manorsOutput">{options.manors === 1000 ? "auto" : options.manors}</output>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>4. Realms and routes</th>
          </tr>
          <tr data-tip={statesNumberTooltip}>
            <td>
              <LockIconButton id="statesNumber" />
            </td>
            <td>{statesNumberLabel}</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.statesNumber}
                onChange={v => updateOptionAndLock("statesNumber", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Define how much states and cultures can vary in size. Defines expansionism value">
            <td>
              <LockIconButton id="sizeVariety" />
            </td>
            <td>Size variety</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="10"
                step="0.1"
                value={options.sizeVariety}
                onChange={v => updateOptionAndLock("sizeVariety", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Set state and cultures growth rate. Defines how many lands will stay neutral">
            <td>
              <LockIconButton id="growthRate" />
            </td>
            <td>Growth rate</td>
            <td colSpan={2}>
              <SliderInput
                min="0.1"
                max="2"
                step="0.1"
                value={options.growthRate}
                onChange={v => updateOptionAndLock("growthRate", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Set what share of eligible burgs in each state will become province centers. Higher values create more provinces">
            <td>
              <LockIconButton id="provincesRatio" />
            </td>
            <td>Provinces ratio</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.provincesRatio}
                onChange={v => updateOptionAndLock("provincesRatio", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Define how many times wars are generated to build relations history.">
            <td>
              <LockIconButton id="diplomacyHistoryAttempts" />
            </td>
            <td>History attempts</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="10"
                value={options.diplomacyHistoryAttempts}
                onChange={v => updateOptionAndLock("diplomacyHistoryAttempts", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Define how many organized religions and cults should be generated. Cultures will have their own folk religions in any case">
            <td>
              <LockIconButton id="religionsNumber" />
            </td>
            <td>Religions number</td>
            <td colSpan={2}>
              <SliderInput
                id="religionsNumber"
                min="0"
                max="50"
                value={options.religionsNumber}
                onChange={v => updateOptionAndLock("religionsNumber", Number(v))}
              />
            </td>
          </tr>

          <tr>
            <th colSpan={4}>5. Finish the world</th>
          </tr>
          <tr data-tip="Define map name (will be used to name downloaded files)">
            <td>
              <LockIconButton id="mapName" />
            </td>
            <td>Map name</td>
            <td>
              <input
                className="long"
                autoCorrect="off"
                spellCheck="false"
                type="text"
                value={options.mapName}
                onChange={e => updateOptionAndLock("mapName", e.target.value)}
              />
            </td>
            <td>
              <i
                data-tip="Regenerate map name"
                className="icon-arrows-cw"
                onClick={() => {
                  if (!isMapGenerationInProgress) {
                    document.dispatchEvent(new CustomEvent("react-regenerate-map-name"));
                  }
                }}
              ></i>
            </td>
          </tr>

          <tr data-tip="Define current year and era name">
            <td>
              <LockIconButton id="year" />
            </td>
            <td>Year and era</td>
            <td>
              <input
                type="number"
                step="1"
                className="paired"
                value={options.year}
                onChange={e => {
                  updateOptionAndLock("year", Number(e.target.value));
                  document.dispatchEvent(
                    new CustomEvent("react-change-year", { detail: { year: Number(e.target.value) } })
                  );
                }}
              />
              <input
                autoCorrect="off"
                spellCheck="false"
                type="text"
                className="long"
                value={options.era}
                onChange={e => {
                  updateOptionAndLock("era", e.target.value);
                  document.dispatchEvent(new CustomEvent("react-change-era", { detail: { era: e.target.value } }));
                }}
              />
            </td>
            <td>
              <i
                data-tip="Regenerate era"
                className="icon-arrows-cw"
                onClick={() => {
                  if (!isMapGenerationInProgress) document.dispatchEvent(new CustomEvent("react-regenerate-era"));
                }}
              ></i>
            </td>
          </tr>

          <tr data-tip="Select state labels mode: display short or full names">
            <td>
              <LockIconButton id="stateLabelsMode" />
            </td>
            <td>State labels</td>
            <td>
              <select
                value={options.stateLabelsMode}
                onChange={e => {
                  updateOptionAndLock("stateLabelsMode", e.target.value as "auto" | "short" | "full");
                  document.dispatchEvent(
                    new CustomEvent("react-change-state-labels-mode", { detail: { mode: e.target.value } })
                  );
                }}
              >
                <option value="auto">Auto</option>
                <option value="short">Short names</option>
                <option value="full">Full names</option>
              </select>
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
