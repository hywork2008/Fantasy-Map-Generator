import type React from "react";
import { useEffect, useState } from "react";
import { COArenderer } from "../../../../renderers/emblem-renderer";
import { useOptionsState } from "../../../../store/optionsState";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";

export const UiSettingsTab: React.FC = () => {
  const options = useOptionsState();
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
      <p data-tip="Tool settings that don't affect maps. Changes are getting applied immediately">
        Generator settings:
      </p>
      <table>
        <tbody>
          <tr data-tip="Set user interface size. Please note browser zoom also affects interface size (Ctrl + or Ctrl - to change)">
            <td></td>
            <td>Interface size</td>
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

          <tr data-tip="Set tooltip size">
            <td></td>
            <td>Tooltip size</td>
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

          <tr data-tip="Set theme hue for dialogs and tool windows">
            <td>
              <i
                data-tip="Restore default theme color: pale magenta"
                id="themeColorRestore"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-restore-theme"))}
              ></i>
            </td>
            <td>Theme color</td>
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

          <tr data-tip="Set dialog and tool windows transparency">
            <td></td>
            <td>Transparency</td>
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

          <tr data-tip="Set autosave interval in minutes. Set 0 to disable autosave. Map is saved to browser memory">
            <td></td>
            <td>Autosave interval</td>
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

          <tr data-tip="Set what Generator should do on load">
            <td></td>
            <td>Onload behavior</td>
            <td>
              <select
                id="onloadBehavior"
                value={options.onloadBehavior}
                onChange={e => updateOption("onloadBehavior", e.target.value)}
              >
                <option value="random">Generate random map</option>
                <option value="lastSaved">Open last saved map</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Toggle Azgaar Assistant (help bubble on the bottom right corner)">
            <td></td>
            <td>Azgaar assistant</td>
            <td>
              <select
                id="azgaarAssistant"
                value={options.azgaarAssistant}
                onChange={e => updateOption("azgaarAssistant", e.target.value as "show" | "hide")}
              >
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select voice for text-to-speech. Click the test button to preview">
            <td>
              <i
                data-tip="Test selected voice"
                className="icon-volume"
                onClick={() => document.dispatchEvent(new CustomEvent("react-test-speaker"))}
              ></i>
            </td>
            <td>Speaker voice</td>
            <td>
              <select
                id="speakerVoice"
                value={options.speakerVoice}
                onChange={e => updateOption("speakerVoice", e.target.value)}
              >
                <option value="">Default</option>
                {voices.map(v => (
                  <option key={`${v.name}-${v.lang}`} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select emblem shape. Can be changed individually in Emblem editor">
            <td>
              <LockIconButton id="emblemShape" />
            </td>
            <td>Emblem shape</td>
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
                <optgroup label="Diversiform">
                  <option value="culture">Culture-specific</option>
                  <option value="random">Culture-random</option>
                  <option value="state">State-specific</option>
                </optgroup>
                <optgroup label="Basic">
                  <option value="heater">Heater</option>
                  <option value="spanish">Spanish</option>
                  <option value="french">French</option>
                </optgroup>
                <optgroup label="Regional">
                  <option value="horsehead">Horsehead</option>
                  <option value="horsehead2">Horsehead Edgy</option>
                  <option value="polish">Polish</option>
                  <option value="hessen">Hessen</option>
                  <option value="swiss">Swiss</option>
                </optgroup>
                <optgroup label="Historical">
                  <option value="boeotian">Boeotian</option>
                  <option value="roman">Roman</option>
                  <option value="kite">Kite</option>
                  <option value="oldFrench">Old French</option>
                  <option value="renaissance">Renaissance</option>
                  <option value="baroque">Baroque</option>
                </optgroup>
                <optgroup label="Specific">
                  <option value="targe">Targe</option>
                  <option value="targe2">Targe2</option>
                  <option value="pavise">Pavise</option>
                  <option value="wedged">Wedged</option>
                </optgroup>
                <optgroup label="Banner">
                  <option value="flag">Flag</option>
                  <option value="pennon">Pennon</option>
                  <option value="guidon">Guidon</option>
                  <option value="banner">Banner</option>
                  <option value="dovetail">Dovetail</option>
                  <option value="gonfalon">Gonfalon</option>
                  <option value="pennant">Pennant</option>
                </optgroup>
                <optgroup label="Simple">
                  <option value="round">Round</option>
                  <option value="oval">Oval</option>
                  <option value="vesicaPiscis">Vesica Piscis</option>
                  <option value="square">Square</option>
                  <option value="diamond">Diamond</option>
                </optgroup>
                <optgroup label="Fantasy">
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

          <tr data-tip="Set minimum and maximum possible zoom level">
            <td>
              <i
                data-tip="Restore default zoom extent: [1, 20]"
                id="zoomExtentDefault"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-restore-default-zoom-extent"))}
              ></i>
            </td>
            <td>Zoom extent</td>
            <td>
              <span data-tip="Minimal possible zoom level (should be > 0)">min</span>
              <input
                data-tip="Minimal possible zoom level (should be > 0)"
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
              <span data-tip="Maximal possible zoom level (should be > 1)">max</span>
              <input
                data-tip="Maximal possible zoom level (should be > 1)"
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
                data-tip="Allow to drag map beyond canvas borders"
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

          <tr data-tip="Select the population layer visualization style">
            <td></td>
            <td>Population rendering</td>
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
                <option value="original">3D Bars</option>
                <option value="contour">Smooth Contours</option>
                <option value="choropleth">Cell Heatmap</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select the danger layer visualization style">
            <td></td>
            <td>Danger rendering</td>
            <td>
              <select
                id="dangerRenderingMode"
                value={options.dangerRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "contour" | "choropleth";
                  options.setOption("dangerRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-danger-rendering-mode"));
                }}
              >
                <option value="contour">Smooth Contours</option>
                <option value="choropleth">Cell Heatmap</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Select rendering model. Try to set to 'optimized' if you face performance issues">
            <td></td>
            <td>Rendering</td>
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
                <option value="geometricPrecision">Best quality</option>
                <option value="optimizeSpeed">Best performance</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip="Load Google Translate and select language. Note that automatic translation can break some page functionality. In this case reset the language back to English or refresh the page">
            <td>
              <i
                data-tip="Reset language to English"
                id="resetLanguage"
                className="icon-ccw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-reset-language"))}
              ></i>
            </td>
            <td>Language</td>
            <td>
              <button
                type="button"
                id="loadGoogleTranslateButton"
                onClick={() => document.dispatchEvent(new CustomEvent("react-load-google-translate"))}
              >
                Init Google Translate
              </button>
              <div id="google_translate_element"></div>
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div>
        <button
          type="button"
          id="configureWorldButton"
          data-tip="Click to open world configurator to setup map position on Globe and World climate"
          onClick={() => document.dispatchEvent(new CustomEvent("react-open-world-configurator"))}
        >
          Configure World
        </button>
        <button
          type="button"
          id="optionsReset"
          data-tip="Click to restore default options and reload the page"
          onClick={() => document.dispatchEvent(new CustomEvent("react-cleanup-data"))}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
};
