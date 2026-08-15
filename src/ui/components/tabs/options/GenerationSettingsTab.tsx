import type React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const options = useOptionsState();
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  // Generation is merely paused for stage review (including the initial map's review
  // flow), not actively computing a stage — safe to redirect it to a new seed instead
  // of waiting for the whole thing to finish.
  const isGenerationPaused = useGenerationProgressState(state => state.isOpen && !state.isGenerating);
  const updateOption = options.setOption;
  const usesPolityDensity = options.initialSettlementPattern !== "standard";
  const statesNumberLabel = usesPolityDensity ? t("generation.polityDensity") : t("generation.statesNumber");
  const statesNumberTooltip = usesPolityDensity ? t("generation.polityDensityTip") : t("generation.statesNumberTip");

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
      <p data-tip={t("generation.headingTip")}>{t("generation.heading")}</p>
      <table id="generationSettingsTable">
        <tbody>
          <tr data-tip={t("generation.canvasSizeTip")}>
            <td>
              <IconButton
                data-tip={t("generation.restoreCanvasSize")}
                icon="icon-ccw"
                onClick={handleRestoreDefaultSize}
              />
            </td>
            <th>{t("generation.canvasSize")}</th>
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

          <tr data-tip={t("generation.mapSeedTip")}>
            <td>
              <i data-tip={t("generation.showSeedHistory")} id="optionsMapHistory" className="icon-hourglass-1"></i>
            </td>
            <th>{t("generation.mapSeed")}</th>
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
                data-tip={t("generation.generateWithSeed")}
                icon="icon-play"
                disabled={isMapGenerationInProgress && !isGenerationPaused}
                onClick={generateWithSeed}
              />
            </td>
            <td>
              <i data-tip={t("generation.copySeed")} id="optionsCopySeed" className="icon-docs"></i>
            </td>
          </tr>

          <tr data-tip={t("generation.pointsNumberTip")}>
            <td>
              <LockIconButton id="points" />
            </td>
            <th>{t("generation.pointsNumber")}</th>
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
            <th colSpan={4}>{t("generation.sectionLandscape")}</th>
          </tr>
          <tr data-tip={t("generation.heightmapTip")}>
            <td>
              <LockIconButton id="template" />
            </td>
            <th>{t("generation.heightmap")}</th>
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

          <tr data-tip={t("generation.randomHeightmapPoolTip")}>
            <td>
              <LockIconButton id="templateRandomization" />
            </td>
            <th>{t("generation.randomHeightmapPool")}</th>
            <td colSpan={2}>
              <select
                value={options.templateRandomization}
                onChange={e =>
                  updateOptionAndLock("templateRandomization", e.target.value as typeof options.templateRandomization)
                }
              >
                <option value="all">{t("generation.allTemplates")}</option>
                <option value="landRich">
                  {t("generation.landRich", { percent: heightmapLandmassThresholds.landRichMinimum })}
                </option>
                <option value="oceanRich">
                  {t("generation.oceanRich", { percent: 100 - heightmapLandmassThresholds.oceanRichMaximum })}
                </option>
              </select>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>{t("generation.sectionClimate")}</th>
          </tr>
          <tr data-tip={t("generation.economyStartTip")}>
            <td>
              <LockIconButton id="economyStartMode" />
            </td>
            <th>
              <label htmlFor="economyStartMode">{t("generation.economyStart")}</label>
            </th>
            <td colSpan={2}>
              <select
                id="economyStartMode"
                value={options.economyStartMode}
                onChange={e =>
                  updateOptionAndLock("economyStartMode", e.target.value as typeof options.economyStartMode)
                }
              >
                <option value="provisioned">{t("generation.economyStartProvisioned")}</option>
                <option value="balanced">{t("generation.economyStartBalanced")}</option>
                <option value="subsistence">{t("generation.economyStartSubsistence")}</option>
              </select>
            </td>
          </tr>
          <tr data-tip={t("generation.biomeRegionTip")}>
            <td>
              <LockIconButton id="biomeRegionProfile" />
            </td>
            <th>
              <label htmlFor="biomeRegionProfile">{t("generation.biomeRegion")}</label>
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
                  document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { biomes: true } }));
                  // While paused for stage review, the visible map is a separate SVG preview
                  // (main.ts's renderGenerationReviewPreview) that only redraws on this event —
                  // fmg:world-recalculate's own render call targets the normal live map and is a
                  // no-op during that preview. A no-op when no review is paused (see main.ts's
                  // fmg:render-generation-review listener), so safe to always dispatch.
                  document.dispatchEvent(new CustomEvent("fmg:render-generation-review"));
                }}
              >
                <option value="global">{t("generation.biomeRegions.global")}</option>
                <option value="medievalEurope">{t("generation.biomeRegions.medievalEurope")}</option>
                <option value="mediterranean">{t("generation.biomeRegions.mediterranean")}</option>
                <option value="tropicalRiverBasin">{t("generation.biomeRegions.tropicalRiverBasin")}</option>
                <option value="mountainRealm">{t("generation.biomeRegions.mountainRealm")}</option>
              </select>
            </td>
          </tr>

          <tr data-tip={t("generation.volcanismChanceTip")}>
            <td>
              <LockIconButton id="volcanismChance" />
            </td>
            <th>{t("generation.volcanismChance")}</th>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.volcanismChance}
                onChange={v => updateOptionAndLock("volcanismChance", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("generation.activeVolcanoChanceTip")}>
            <td>
              <LockIconButton id="volcanoActiveChance" />
            </td>
            <th>{t("generation.activeVolcanoChance")}</th>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.volcanoActiveChance}
                onChange={v => updateOptionAndLock("volcanoActiveChance", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("generation.volcanicSoilStrengthTip")}>
            <td>
              <LockIconButton id="volcanicSoilStrength" />
            </td>
            <th>{t("generation.volcanicSoilStrength")}</th>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.volcanicSoilStrength}
                onChange={v => {
                  updateOptionAndLock("volcanicSoilStrength", Number(v));
                  document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { biomes: true } }));
                  // See the Biome region handler above — needed while paused for stage review.
                  document.dispatchEvent(new CustomEvent("fmg:render-generation-review"));
                }}
              />
            </td>
          </tr>

          <tr data-tip={t("generation.enclosureCalculationTip")}>
            <td>
              <LockIconButton id="enclosureCalculationMode" />
            </td>
            <th>
              <label htmlFor="enclosureCalculationMode">{t("generation.enclosureCalculation")}</label>
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
                <option value="oceanCurrents">{t("generation.enclosureOceanCurrents")}</option>
                <option value="oceanCurrentsAmbient">{t("generation.enclosureOceanCurrentsAmbient")}</option>
                <option value="radius">{t("generation.enclosureRadius")}</option>
              </select>
            </td>
          </tr>

          <tr data-tip={t("generation.oceanCurrentRenderingTip")}>
            <td></td>
            <th>
              <label htmlFor="oceanCurrentRenderMode">{t("generation.oceanCurrentRendering")}</label>
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
                <option value="path">{t("generation.oceanCurrentPath")}</option>
                <option value="intensity">{t("generation.oceanCurrentIntensity")}</option>
              </select>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>{t("generation.sectionCultures")}</th>
          </tr>

          <tr data-tip={t("generation.culturesNumberTip")}>
            <td>
              <LockIconButton id="cultures" />
            </td>
            <th>{t("generation.culturesNumber")}</th>
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

          <tr data-tip={t("generation.culturesSetTip")}>
            <td>
              <LockIconButton id="culturesSet" />
            </td>
            <th>{t("generation.culturesSet")}</th>
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
                  {t("generation.culturesSets.world")}
                </option>
                <option value="european" data-max="15">
                  {t("generation.culturesSets.european")}
                </option>
                <option value="oriental" data-max="13">
                  {t("generation.culturesSets.oriental")}
                </option>
                <option value="english" data-max="10">
                  {t("generation.culturesSets.english")}
                </option>
                <option value="antique" data-max="10">
                  {t("generation.culturesSets.antique")}
                </option>
                <option value="highFantasy" data-max="19">
                  {t("generation.culturesSets.highFantasy")}
                </option>
                <option value="darkFantasy" data-max="36">
                  {t("generation.culturesSets.darkFantasy")}
                </option>
                <option value="random" data-max="100">
                  {t("generation.culturesSets.random")}
                </option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("generation.raceSettingsTip")}>
            <td>
              <IconButton
                data-tip={t("generation.openRaceSettings")}
                icon="icon-book"
                onClick={() => openDialog("racePersonNames")}
              />
            </td>
            <th>{t("generation.raceSettings")}</th>
            <td colSpan={2}>
              <button type="button" className="button" onClick={() => openDialog("racePersonNames")}>
                {t("common.configure")}
              </button>
            </td>
          </tr>

          <tr data-tip={t("generation.initialPopulationTip")}>
            <td>
              <LockIconButton id="initialPopulationSaturation" />
            </td>
            <th>{t("generation.initialPopulation")}</th>
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

          <tr data-tip={t("generation.settlementPatternTip")}>
            <td>
              <LockIconButton id="initialSettlementPattern" />
            </td>
            <th>{t("generation.settlementPattern")}</th>
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
                    {t(`generation.settlementPatterns.${preset.id}`, { defaultValue: preset.label })}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr
            data-tip={t("generation.oikoumeneLandShareTip")}
            style={{
              display: options.initialSettlementPattern === "standard" ? "none" : undefined
            }}
          >
            <td>
              <LockIconButton id="oikoumeneLandShare" />
            </td>
            <th>{t("generation.oikoumeneLandShare")}</th>
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

          <tr data-tip={t("generation.burgsNumberTip")}>
            <td>
              <LockIconButton id="manors" />
            </td>
            <th>{t("generation.burgsNumber")}</th>
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
              <output id="manorsOutput">{options.manors === 1000 ? t("common.auto") : options.manors}</output>
            </td>
          </tr>

          <tr>
            <th colSpan={4}>{t("generation.sectionRealms")}</th>
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

          <tr data-tip={t("generation.sizeVarietyTip")}>
            <td>
              <LockIconButton id="sizeVariety" />
            </td>
            <th>{t("generation.sizeVariety")}</th>
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

          <tr data-tip={t("generation.growthRateTip")}>
            <td>
              <LockIconButton id="growthRate" />
            </td>
            <th>{t("generation.growthRate")}</th>
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

          <tr data-tip={t("generation.provincesRatioTip")}>
            <td>
              <LockIconButton id="provincesRatio" />
            </td>
            <th>{t("generation.provincesRatio")}</th>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.provincesRatio}
                onChange={v => updateOptionAndLock("provincesRatio", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("generation.historyAttemptsTip")}>
            <td>
              <LockIconButton id="diplomacyHistoryAttempts" />
            </td>
            <th>{t("generation.historyAttempts")}</th>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="10"
                value={options.diplomacyHistoryAttempts}
                onChange={v => updateOptionAndLock("diplomacyHistoryAttempts", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("generation.religionsNumberTip")}>
            <td>
              <LockIconButton id="religionsNumber" />
            </td>
            <th>{t("generation.religionsNumber")}</th>
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
            <th colSpan={4}>{t("generation.sectionFinish")}</th>
          </tr>
          <tr data-tip={t("generation.mapNameTip")}>
            <td>
              <LockIconButton id="mapName" />
            </td>
            <th>{t("generation.mapName")}</th>
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
                data-tip={t("generation.regenerateMapName")}
                className="icon-arrows-cw"
                onClick={() => {
                  if (!isMapGenerationInProgress) {
                    document.dispatchEvent(new CustomEvent("react-regenerate-map-name"));
                  }
                }}
              ></i>
            </td>
          </tr>

          <tr data-tip={t("generation.yearAndEraTip")}>
            <td>
              <LockIconButton id="year" />
            </td>
            <th>{t("generation.yearAndEra")}</th>
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
                data-tip={t("generation.regenerateEra")}
                className="icon-arrows-cw"
                onClick={() => {
                  if (!isMapGenerationInProgress) document.dispatchEvent(new CustomEvent("react-regenerate-era"));
                }}
              ></i>
            </td>
          </tr>

          <tr data-tip={t("generation.historicalPeriodTip")}>
            <td>
              <LockIconButton id="historicalPeriod" />
            </td>
            <th>{t("generation.historicalPeriod")}</th>
            <td>
              <select
                className="long"
                value={options.historicalPeriod}
                onChange={e => {
                  const period = e.target.value as
                    | "earlyMedieval"
                    | "highMedieval"
                    | "lateMedieval"
                    | "ageOfExploration";
                  updateOptionAndLock("historicalPeriod", period);
                  document.dispatchEvent(new CustomEvent("react-change-historical-period", { detail: { period } }));
                }}
              >
                <option value="earlyMedieval">{t("generation.periods.earlyMedieval")}</option>
                <option value="highMedieval">{t("generation.periods.highMedieval")}</option>
                <option value="lateMedieval">{t("generation.periods.lateMedieval")}</option>
                <option value="ageOfExploration">{t("generation.periods.ageOfExploration")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("generation.startFirearmsUnstockedTip")}>
            <td>
              <LockIconButton id="initialFirearmsUnstocked" />
            </td>
            <th>
              <label htmlFor="initialFirearmsUnstocked">{t("generation.startFirearmsUnstocked")}</label>
            </th>
            <td>
              <input
                id="initialFirearmsUnstocked"
                type="checkbox"
                checked={options.initialFirearmsUnstocked}
                onChange={event => updateOptionAndLock("initialFirearmsUnstocked", event.target.checked)}
              />
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("generation.stateLabelsTip")}>
            <td>
              <LockIconButton id="stateLabelsMode" />
            </td>
            <th>{t("generation.stateLabels")}</th>
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
                <option value="auto">{t("generation.stateLabelsAuto")}</option>
                <option value="short">{t("generation.stateLabelsShort")}</option>
                <option value="full">{t("generation.stateLabelsFull")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr>
            <th colSpan={4}>{t("generation.sectionRural")}</th>
          </tr>
          <tr data-tip={t("generation.ironDepositsPerStateTip")}>
            <td>
              <LockIconButton id="ironDepositsPerState" />
            </td>
            <th>
              <label htmlFor="ironDepositsPerState">{t("generation.ironDepositsPerState")}</label>
            </th>
            <td colSpan={2}>
              <SliderInput
                id="ironDepositsPerState"
                min="0.3"
                max="0.8"
                step="0.05"
                value={options.ironDepositsPerState}
                onChange={value => updateOptionAndLock("ironDepositsPerState", Number(value))}
              />
            </td>
          </tr>
          <tr data-tip={t("generation.faunaPopulationModelTip")}>
            <td>
              <LockIconButton id="ruralEcosystemDetail" />
            </td>
            <th>
              <label htmlFor="ruralEcosystemDetail">{t("generation.faunaPopulationModel")}</label>
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
                <option value="detailed">{t("generation.faunaDetailed")}</option>
                <option value="simplified">{t("generation.faunaSimplified")}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
