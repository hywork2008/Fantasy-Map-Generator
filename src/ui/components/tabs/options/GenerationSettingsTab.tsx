import type React from "react";
import {
  getInitialSettlementPatternPreset,
  heightmapLandmassThresholds,
  INITIAL_SETTLEMENT_PATTERN_PRESETS
} from "../../../../data";
import { generationProgressStore, useGenerationProgressState } from "../../../../store/generationProgressState";
import { useOptionsState } from "../../../../store/optionsState";
import { isValidCanvasDimension, MIN_CANVAS_HEIGHT, MIN_CANVAS_WIDTH } from "../../../../utils/canvasSize";
import { lock } from "../../../../utils/domUtils";
import { openDialog } from "../../../dialogs/dialogService";
import { IconButton } from "../../IconButton";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";
export const GenerationSettingsTab: React.FC = () => {
  const options = useOptionsState();
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  // Generation is merely paused for stage review (including the initial map's review
  // flow), not actively computing a stage — safe to redirect it to a new seed instead
  // of waiting for the whole thing to finish.
  const isGenerationPaused = useGenerationProgressState(state => state.isOpen && !state.isGenerating);
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

  // While a generation is paused for stage review (including the initial map's own
  // review flow, which otherwise leaves no window to apply a custom seed without a
  // URL param), redirect the already-running pipeline instead of starting a second,
  // concurrent one. Once generation is fully idle, fall through to the normal
  // confirm-and-regenerate path used by the "New Map" button.
  const generateWithSeed = () => {
    if (isGenerationPaused) {
      generationProgressStore.getState().restartWithSeed(options.seed);
      return;
    }
    if (isMapGenerationInProgress) return;
    document.dispatchEvent(new CustomEvent("react-generate-map-with-seed", { detail: { seed: options.seed } }));
  };

  const updateCanvasDimension = (key: "mapWidth" | "mapHeight", value: string) => {
    const minimum = key === "mapWidth" ? MIN_CANVAS_WIDTH : MIN_CANVAS_HEIGHT;
    const dimension = Number(value);
    if (!isValidCanvasDimension(dimension, minimum)) {
      updateOption(key, options[key]);
      return;
    }

    updateOption(key, dimension);
    handleMapSizeChange();
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
      <table id="generationSettingsTable">
        <tbody>
          <tr data-tip="Set original map size on generation. It cannot be changed later. Always keep canvas size equal to your screen size or less.">
            <td>
              <IconButton data-tip="Restore default canvas size" icon="icon-ccw" onClick={handleRestoreDefaultSize} />
            </td>
            <th>Canvas size</th>
            <td>
              <input
                id="mapWidthInput"
                className="paired"
                type="number"
                min={MIN_CANVAS_WIDTH}
                value={options.mapWidth}
                onChange={e => updateCanvasDimension("mapWidth", e.target.value)}
              />
              <span>x</span>
              <input
                id="mapHeightInput"
                className="paired"
                type="number"
                min={MIN_CANVAS_HEIGHT}
                value={options.mapHeight}
                onChange={e => updateCanvasDimension("mapHeight", e.target.value)}
              />
              <span>px</span>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Map seed number. Press 'Enter' or click the play button to generate a new map with this seed">
            <td>
              <i
                data-tip="Show seed history to apply a previous seed"
                id="optionsMapHistory"
                className="icon-hourglass-1"
              ></i>
            </td>
            <th>Map seed</th>
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
                  if (e.key === "Enter" && (!isMapGenerationInProgress || isGenerationPaused)) {
                    generateWithSeed();
                  }
                }}
              />
              <IconButton
                data-tip="Generate a new map with this seed"
                icon="icon-play"
                disabled={isMapGenerationInProgress && !isGenerationPaused}
                onClick={generateWithSeed}
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
            <th>Points number</th>
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
            <th>Heightmap</th>
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
            <th>Random heightmap pool</th>
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
            <th>
              <label htmlFor="biomeRegionProfile">Biome region</label>
            </th>
            <td colSpan={2}>
              <select
                id="biomeRegionProfile"
                name="biomeRegionProfile"
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

          <tr data-tip="How harbor/mooring calmness (pack.cells.enclosure) is scored for ocean-connected water. Ocean Currents reads the resolved current speed at the shoreline itself — bends around headlands and funnels out of bays/straits, but almost every shore cell reads near-zero regardless of real shelter, so it saturates toward 100 close to the coast. Ocean Currents (Ambient) instead reads the current speed a short distance offshore, distinguishing a genuinely sheltered bay from an exposed open coastline — better for siting decisions like harbor placement. Both score every lake cell fully enclosed. Radius is the legacy fixed 6-hop land-blocked-ratio heuristic for all. Applies immediately, no regenerate needed.">
            <td>
              <LockIconButton id="enclosureCalculationMode" />
            </td>
            <th>
              <label htmlFor="enclosureCalculationMode">Enclosure calculation</label>
            </th>
            <td colSpan={2}>
              <select
                id="enclosureCalculationMode"
                name="enclosureCalculationMode"
                value={options.enclosureCalculationMode}
                onChange={e => {
                  options.setOptions({
                    enclosureCalculationMode: e.target.value as typeof options.enclosureCalculationMode
                  });
                  lock("enclosureCalculationMode");
                  document.dispatchEvent(new CustomEvent("react-change-enclosure-calculation"));
                }}
              >
                <option value="oceanCurrents">Ocean Currents (default)</option>
                <option value="oceanCurrentsAmbient">Ocean Currents (Ambient)</option>
                <option value="radius">Radius (shape only)</option>
              </select>
            </td>
          </tr>

          <tr data-tip="How the Ocean Currents WebGL layer draws grid.cells.currentAngle/currentSpeed. Direction Lines draws a short arrow per cell, colored by water temperature — cells reading exactly 0 speed are skipped, so a calm patch looks like a gap. Intensity Shading instead fills every ocean cell by current speed alone (pale = calm, dark = strong), with full gapless coverage. Applies immediately, no regenerate needed.">
            <td></td>
            <th>
              <label htmlFor="oceanCurrentRenderMode">Ocean current rendering</label>
            </th>
            <td colSpan={2}>
              <select
                id="oceanCurrentRenderMode"
                name="oceanCurrentRenderMode"
                value={options.oceanCurrentRenderMode}
                onChange={e => {
                  updateOption("oceanCurrentRenderMode", e.target.value as typeof options.oceanCurrentRenderMode);
                  document.dispatchEvent(new CustomEvent("react-change-ocean-current-render-mode"));
                }}
              >
                <option value="path">Direction Lines (default)</option>
                <option value="intensity">Intensity Shading</option>
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
            <th>Cultures number</th>
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
            <th>Cultures set</th>
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

          <tr data-tip="Assign person-name cultural spheres to races (e.g. Dark Elf → Mesopotamian). Opens a dialog so Generation stays short. Applies on the next map generation.">
            <td>
              <IconButton
                data-tip="Open race person-name sphere mapping"
                icon="icon-book"
                onClick={() => openDialog("racePersonNames")}
              />
            </td>
            <th>Race person names</th>
            <td colSpan={2}>
              <button type="button" className="button" onClick={() => openDialog("racePersonNames")}>
                Configure…
              </button>
            </td>
          </tr>

          <tr data-tip="Determines how full the world is relative to its carrying capacity at the start. 100% means fully saturated, lower values allow for future demographic growth.">
            <td>
              <LockIconButton id="initialPopulationSaturation" />
            </td>
            <th>Initial population %</th>
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

          <tr data-tip="Choose whether initial people are spread across suitable land or concentrated around favorable settlement hubs. Selecting a preset also applies its recommended initial population percentage. Marches sits between Frontier and Scattered: several polity islands with wilderness/danger between them.">
            <td>
              <LockIconButton id="initialSettlementPattern" />
            </td>
            <th>Settlement pattern</th>
            <td colSpan={2}>
              <select
                value={options.initialSettlementPattern}
                onChange={e => {
                  const initialSettlementPattern = e.target.value as typeof options.initialSettlementPattern;
                  const preset = getInitialSettlementPatternPreset(initialSettlementPattern);
                  options.setOptions({
                    initialSettlementPattern,
                    initialPopulationSaturation: preset.initialPopulationSaturation,
                    oikoumeneLandShare: preset.settledFootprint
                  });
                  // Persist pattern + linked oikoumene share together so reloads stay consistent.
                  lock("initialSettlementPattern");
                  lock("oikoumeneLandShare");
                  lock("initialPopulationSaturation");
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

          <tr
            data-tip="Target share of suitable land capacity that becomes the oikoumene (settled / state-claimable core). Lower = more wilderness and shorter interstate borders; higher = larger realms. Ignored for Standard (full habitable fill). Fantasy defaults ~45%."
            style={{
              display: options.initialSettlementPattern === "standard" ? "none" : undefined
            }}
          >
            <td>
              <LockIconButton id="oikoumeneLandShare" />
            </td>
            <th>Oikoumene land share %</th>
            <td colSpan={2}>
              <SliderInput
                min="15"
                max="85"
                step="5"
                value={Math.round(options.oikoumeneLandShare * 100)}
                onChange={v => updateOptionAndLock("oikoumeneLandShare", Number(v) / 100)}
              />
            </td>
          </tr>

          <tr data-tip="Define a number of non-capital settlements to be placed (if enough suitable land exists)">
            <td>
              <LockIconButton id="manors" />
            </td>
            <th>Burgs number</th>
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
            <th>{statesNumberLabel}</th>
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
            <th>Size variety</th>
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
            <th>Growth rate</th>
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
            <th>Provinces ratio</th>
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
            <th>History attempts</th>
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
            <th>Religions number</th>
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
            <th>Map name</th>
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
            <th>Year and era</th>
            <td>
              <input
                id="yearInput"
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

          <tr data-tip="Select the historical-technology backdrop. Gates what feels anachronistic (e.g. gunpowder is off by default before Late Medieval).">
            <td>
              <LockIconButton id="historicalPeriod" />
            </td>
            <th>Historical period</th>
            <td>
              <select
                className="long"
                value={options.historicalPeriod}
                onChange={e => {
                  const period = e.target.value as "earlyMedieval" | "highMedieval" | "lateMedieval";
                  updateOptionAndLock("historicalPeriod", period);
                  document.dispatchEvent(new CustomEvent("react-change-historical-period", { detail: { period } }));
                }}
              >
                <option value="earlyMedieval">Early Medieval (c. 500-1000)</option>
                <option value="highMedieval">High Medieval (c. 1000-1300)</option>
                <option value="lateMedieval">Late Medieval (c. 1300-1500)</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select state labels mode: display short or full names">
            <td>
              <LockIconButton id="stateLabelsMode" />
            </td>
            <th>State labels</th>
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

          <tr>
            <th colSpan={4}>6. Rural economy</th>
          </tr>
          <tr data-tip="Detail level of the fauna population model backing Game and livestock production (docs/plan/biome-goods-producer-ecosystem.md). Detailed runs an annual per-cell wildlife/livestock cohort model (breeding, aging, age-selective culling, carrying capacity) that caps output by an actual headcount instead of an unlimited rate. Simplified skips that model and keeps the cheaper labour/rate-gated formula with no population ceiling — a performance option for large maps. Apply on next map generation.">
            <td>
              <LockIconButton id="ruralEcosystemDetail" />
            </td>
            <th>
              <label htmlFor="ruralEcosystemDetail">Fauna population model</label>
            </th>
            <td colSpan={2}>
              <select
                id="ruralEcosystemDetail"
                name="ruralEcosystemDetail"
                value={options.ruralEcosystemDetail}
                onChange={e => {
                  options.setOptions({
                    ruralEcosystemDetail: e.target.value as typeof options.ruralEcosystemDetail
                  });
                  lock("ruralEcosystemDetail");
                }}
              >
                <option value="detailed">Detailed (fauna population model)</option>
                <option value="simplified">Simplified (faster)</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
