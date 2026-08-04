import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from "../../../../i18n";
import { COArenderer } from "../../../../renderers/emblem-renderer";
import { useLocaleState } from "../../../../store/localeState";
import { useOptionsState } from "../../../../store/optionsState";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";

export const UiSettingsTab: React.FC = () => {
  const options = useOptionsState();
  const language = useLocaleState(state => state.language);
  const setLanguage = useLocaleState(state => state.setLanguage);
  const { t } = useTranslation();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [translateExtentOn, setTranslateExtentOn] = useState(false);

  useEffect(() => {
    const loadVoices = () => setVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const updateOption = options.setOption;

  return (
    <div>
      <p data-tip={t("uiSettings.intro")}>{t("uiSettings.heading")}</p>
      <table>
        <tbody>
          <tr data-tip={t("uiSettings.interfaceSizeTip")}>
            <td></td>
            <td>{t("uiSettings.interfaceSize")}</td>
            <td colSpan={2}>
              <SliderInput
                min="0.6"
                max="3"
                step="0.1"
                value={options.uiSize}
                onChange={v => {
                  updateOption("uiSize", Number(v));
                  document.dispatchEvent(new CustomEvent("react-change-ui-size", { detail: { size: Number(v) } }));
                }}
              />
            </td>
          </tr>

          <tr data-tip={t("uiSettings.tooltipSizeTip")}>
            <td></td>
            <td>{t("uiSettings.tooltipSize")}</td>
            <td colSpan={2}>
              <SliderInput
                id="tooltipSizeInput"
                min="1"
                max="32"
                value={options.tooltipSize}
                onChange={v => {
                  updateOption("tooltipSize", Number(v));
                  document.dispatchEvent(new CustomEvent("react-change-tooltip-size", { detail: { size: Number(v) } }));
                }}
              />
            </td>
          </tr>

          <tr data-tip={t("uiSettings.themeColorTip")}>
            <td>
              <i
                data-tip={t("uiSettings.restoreThemeColor")}
                id="themeColorRestore"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-restore-theme"))}
              ></i>
            </td>
            <td>{t("uiSettings.themeColor")}</td>
            <td>
              <input
                id="themeColorInput"
                type="color"
                value={options.themeColor}
                onChange={e => {
                  updateOption("themeColor", e.target.value);
                  document.dispatchEvent(
                    new CustomEvent("react-change-theme", {
                      detail: { color: e.target.value, transparency: options.transparency }
                    })
                  );
                }}
              />
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.radarChartColorTip")}>
            <td>
              <i
                data-tip={t("uiSettings.restoreRadarChartColor")}
                id="radarChartColorRestore"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-restore-radar-chart-color"))}
              ></i>
            </td>
            <td>{t("uiSettings.radarChartColor")}</td>
            <td>
              <input
                id="radarChartColorInput"
                type="color"
                value={options.radarChartColor}
                onChange={e => {
                  updateOption("radarChartColor", e.target.value);
                }}
              />
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.transparencyTip")}>
            <td></td>
            <td>{t("uiSettings.transparency")}</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.transparency}
                onChange={v => {
                  updateOption("transparency", Number(v));
                  document.dispatchEvent(
                    new CustomEvent("react-change-theme", {
                      detail: { color: options.themeColor, transparency: Number(v) }
                    })
                  );
                }}
              />
            </td>
          </tr>

          <tr data-tip={t("uiSettings.autosaveTip")}>
            <td></td>
            <td>{t("uiSettings.autosave")}</td>
            <td>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={options.autosaveInterval}
                onChange={e => updateOption("autosaveInterval", Number(e.target.value))}
              />
              <input
                id="autosaveIntervalOutput"
                type="number"
                min="0"
                max="60"
                step="1"
                value={options.autosaveInterval}
                onChange={e => updateOption("autosaveInterval", Number(e.target.value))}
              />
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.onloadTip")}>
            <td></td>
            <td>{t("uiSettings.onload")}</td>
            <td>
              <select
                id="onloadBehavior"
                value={options.onloadBehavior}
                onChange={e => updateOption("onloadBehavior", e.target.value)}
              >
                <option value="random">{t("uiSettings.generateRandom")}</option>
                <option value="lastSaved">{t("uiSettings.openLastSaved")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.assistantTip")}>
            <td></td>
            <td>{t("uiSettings.assistant")}</td>
            <td>
              <select
                id="azgaarAssistant"
                value={options.azgaarAssistant}
                onChange={e => updateOption("azgaarAssistant", e.target.value as "show" | "hide")}
              >
                <option value="show">{t("uiSettings.show")}</option>
                <option value="hide">{t("uiSettings.hide")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.zoomLevelTip")}>
            <td></td>
            <td>{t("uiSettings.zoomLevel")}</td>
            <td>
              <input
                id="showZoomLevel"
                className="checkbox"
                type="checkbox"
                checked={options.showZoomLevel}
                onChange={e => updateOption("showZoomLevel", e.target.checked)}
              />
              <label htmlFor="showZoomLevel" className="checkbox-label">
                {t("uiSettings.show")}
              </label>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.speakerVoiceTip")}>
            <td>
              <i
                data-tip={t("uiSettings.testVoice")}
                className="icon-volume"
                onClick={() => document.dispatchEvent(new CustomEvent("react-test-speaker"))}
              ></i>
            </td>
            <td>{t("uiSettings.speakerVoice")}</td>
            <td>
              <select
                id="speakerVoice"
                value={options.speakerVoice}
                onChange={e => updateOption("speakerVoice", e.target.value)}
              >
                <option value="">{t("uiSettings.default")}</option>
                {voices.map(v => (
                  <option key={`${v.name}-${v.lang}`} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.emblemShapeTip")}>
            <td>
              <LockIconButton id="emblemShape" />
            </td>
            <td>{t("uiSettings.emblemShape")}</td>
            <td>
              <select
                id="emblemShape"
                value={options.emblemShape}
                onChange={e => {
                  updateOption("emblemShape", e.target.value);
                  document.dispatchEvent(
                    new CustomEvent("react-change-emblem-shape", { detail: { shape: e.target.value } })
                  );
                }}
              >
                <optgroup label={t("uiSettings.shapeGroups.diversiform")}>
                  <option value="culture">{t("uiSettings.shapeOptions.culture")}</option>
                  <option value="random">{t("uiSettings.shapeOptions.random")}</option>
                  <option value="state">{t("uiSettings.shapeOptions.state")}</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.basic")}>
                  <option value="heater">Heater</option>
                  <option value="spanish">Spanish</option>
                  <option value="french">French</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.regional")}>
                  <option value="horsehead">Horsehead</option>
                  <option value="horsehead2">Horsehead Edgy</option>
                  <option value="polish">Polish</option>
                  <option value="hessen">Hessen</option>
                  <option value="swiss">Swiss</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.historical")}>
                  <option value="boeotian">Boeotian</option>
                  <option value="roman">Roman</option>
                  <option value="kite">Kite</option>
                  <option value="oldFrench">Old French</option>
                  <option value="renaissance">Renaissance</option>
                  <option value="baroque">Baroque</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.specific")}>
                  <option value="targe">Targe</option>
                  <option value="targe2">Targe2</option>
                  <option value="pavise">Pavise</option>
                  <option value="wedged">Wedged</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.banner")}>
                  <option value="flag">Flag</option>
                  <option value="pennon">Pennon</option>
                  <option value="guidon">Guidon</option>
                  <option value="banner">Banner</option>
                  <option value="dovetail">Dovetail</option>
                  <option value="gonfalon">Gonfalon</option>
                  <option value="pennant">Pennant</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.simple")}>
                  <option value="round">Round</option>
                  <option value="oval">Oval</option>
                  <option value="vesicaPiscis">Vesica Piscis</option>
                  <option value="square">Square</option>
                  <option value="diamond">Diamond</option>
                </optgroup>
                <optgroup label={t("uiSettings.shapeGroups.fantasy")}>
                  <option value="fantasy1">Fantasy1</option>
                  <option value="fantasy2">Fantasy2</option>
                  <option value="fantasy3">Fantasy3</option>
                  <option value="fantasy4">Fantasy4</option>
                  <option value="fantasy5">Fantasy5</option>
                </optgroup>
              </select>
            </td>
            <td>
              <svg className="emblemShapePreview" viewBox="0 0 200 210" aria-hidden="true">
                <path d={(COArenderer?.shieldPaths as Record<string, string>)?.[options.emblemShape] || ""} />
              </svg>
            </td>
          </tr>

          <tr data-tip={t("uiSettings.zoomExtentTip")}>
            <td>
              <i
                data-tip={t("uiSettings.restoreZoomExtent")}
                id="zoomExtentDefault"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-restore-default-zoom-extent"))}
              ></i>
            </td>
            <td>{t("uiSettings.zoomExtent")}</td>
            <td>
              <span data-tip={t("uiSettings.minZoom")}>{t("uiSettings.min")}</span>
              <input
                data-tip={t("uiSettings.minZoom")}
                id="zoomExtentMin"
                className="paired"
                type="number"
                min="0.2"
                step="0.1"
                max="20"
                value={options.zoomExtentMin}
                onChange={e => {
                  options.setOption("zoomExtentMin", Number(e.target.value));
                  document.dispatchEvent(
                    new CustomEvent("react-change-zoom-extent", { detail: { value: e.target.value } })
                  );
                }}
              />
              <span data-tip={t("uiSettings.maxZoom")}>{t("uiSettings.max")}</span>
              <input
                data-tip={t("uiSettings.maxZoom")}
                id="zoomExtentMax"
                className="paired"
                type="number"
                min="1"
                max="50"
                value={options.zoomExtentMax}
                onChange={e => {
                  options.setOption("zoomExtentMax", Number(e.target.value));
                  document.dispatchEvent(
                    new CustomEvent("react-change-zoom-extent", { detail: { value: e.target.value } })
                  );
                }}
              />
            </td>
            <td>
              <i
                data-tip={t("uiSettings.allowDragBeyondCanvas")}
                id="translateExtent"
                className={`icon-hand-paper-o${translateExtentOn ? " active" : ""}`}
                onClick={() => {
                  const next = !translateExtentOn;
                  setTranslateExtentOn(next);
                  document.dispatchEvent(new CustomEvent("react-set-translate-extent", { detail: { on: next } }));
                }}
              ></i>
            </td>
          </tr>

          <tr data-tip={t("uiSettings.populationRenderingTip")}>
            <td></td>
            <td>{t("uiSettings.populationRendering")}</td>
            <td>
              <select
                id="populationRenderingMode"
                value={options.populationRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "original" | "contour" | "choropleth";
                  options.setOption("populationRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-population-rendering-mode"));
                }}
              >
                <option value="original">{t("uiSettings.bars3d")}</option>
                <option value="contour">{t("uiSettings.smoothContours")}</option>
                <option value="choropleth">{t("uiSettings.cellHeatmap")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.populationColorScaleTip")}>
            <td></td>
            <td>{t("uiSettings.populationColorScale")}</td>
            <td>
              <select
                id="populationColorScale"
                value={options.populationColorScale}
                onChange={e => {
                  const scale = e.target.value as "capacity" | "relativeDensity";
                  options.setOption("populationColorScale", scale);
                  document.dispatchEvent(new CustomEvent("react-change-population-color-scale"));
                }}
              >
                <option value="capacity">{t("uiSettings.capacityUtilization")}</option>
                <option value="relativeDensity">{t("uiSettings.relativeDensity")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.heightmapRenderingTip")}>
            <td></td>
            <td>{t("uiSettings.heightmapRendering")}</td>
            <td>
              <select
                id="heightmapRenderingMode"
                value={options.heightmapRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "heatmap" | "contours" | "labeledContours";
                  options.setOption("heightmapRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-heightmap-rendering-mode"));
                }}
              >
                <option value="heatmap">{t("uiSettings.heatmapCurrent")}</option>
                <option value="contours">{t("uiSettings.contourLinesSvg")}</option>
                <option value="labeledContours">{t("uiSettings.blackContoursSvg")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.combatDeathsRenderingTip")}>
            <td></td>
            <td>{t("uiSettings.combatDeathsRendering")}</td>
            <td>
              <select
                id="combatDeathsRenderingMode"
                value={options.combatDeathsRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "contour" | "choropleth";
                  options.setOption("combatDeathsRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-combat-deaths-rendering-mode"));
                }}
              >
                <option value="contour">{t("uiSettings.smoothContours")}</option>
                <option value="choropleth">{t("uiSettings.cellHeatmap")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.renderingTip")}>
            <td></td>
            <td>{t("uiSettings.rendering")}</td>
            <td>
              <select
                id="shapeRendering"
                value={options.shapeRendering}
                onChange={e => {
                  options.setOption(
                    "shapeRendering",
                    e.target.value as "crispEdges" | "optimizeSpeed" | "geometricPrecision"
                  );
                  document.dispatchEvent(
                    new CustomEvent("react-change-shape-rendering", { detail: { value: e.target.value } })
                  );
                }}
              >
                <option value="geometricPrecision">{t("uiSettings.bestQuality")}</option>
                <option value="optimizeSpeed">{t("uiSettings.bestPerformance")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("uiSettings.languageTip")}>
            <td></td>
            <td>{t("uiSettings.language")}</td>
            <td>
              <select
                id="language"
                value={language}
                onChange={event => {
                  const nextLanguage = event.target.value;
                  if (isSupportedLanguage(nextLanguage)) setLanguage(nextLanguage);
                }}
              >
                {SUPPORTED_LANGUAGES.map(supportedLanguage => (
                  <option key={supportedLanguage} value={supportedLanguage}>
                    {t(`languages.${supportedLanguage}`)}
                  </option>
                ))}
              </select>
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div>
        <button
          type="button"
          id="configureWorldButton"
          data-tip={t("uiSettings.configureWorldTip")}
          onClick={() => document.dispatchEvent(new CustomEvent("react-open-world-configurator"))}
        >
          {t("uiSettings.configureWorld")}
        </button>
        <button
          type="button"
          id="optionsReset"
          data-tip={t("uiSettings.resetDefaultsTip")}
          onClick={() => document.dispatchEvent(new CustomEvent("react-cleanup-data"))}
        >
          {t("uiSettings.resetDefaults")}
        </button>
      </div>
    </div>
  );
};
