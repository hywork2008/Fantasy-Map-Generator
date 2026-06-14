import type React from "react";
import { useEffect, useState } from "react";
import { useOptionsState } from "../../../store/optionsState";
import { SliderInput } from "../SliderInput";

export const OptionsTab: React.FC = () => {
  const options = useOptionsState();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => setVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Helper to update a field (型安全なsetOptionへのショートカット)
  const updateOption = options.setOption;

  const handleMapSizeChange = () => {
    // We will bind this to fitMapToScreen logic later in the controller wrapper
    document.dispatchEvent(new CustomEvent("react-map-size-change"));
  };

  const handleRestoreDefaultSize = () => {
    options.setOptions({ mapWidth: window.innerWidth, mapHeight: window.innerHeight });
    setTimeout(handleMapSizeChange, 0);
  };

  return (
    <div id="optionsTabContent" className="tabcontent" style={{ display: "block" }}>
      <p data-tip="Map generation settings. Generate a new map to apply the settings">
        Map settings (new map to apply):
      </p>
      <table>
        <tbody>
          <tr data-tip="Set original map size on generation. It cannot be changed later. Always keep canvas size equal to your screen size or less.">
            <td>
              <i data-tip="Restore default canvas size" className="icon-ccw" onClick={handleRestoreDefaultSize}></i>
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
                  if (e.key === "Enter") {
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
              <i data-locked="0" id="lock_points" className="icon-lock-open"></i>
            </td>
            <td>Points number</td>
            <td>
              <input
                type="range"
                min="1"
                max="13"
                value={options.points}
                onChange={e => updateOption("points", Number(e.target.value))}
              />
            </td>
            <td>
              <output style={{ color: options.points === 4 ? "#053305" : "#dfdf12" }}>
                {options.points === 4 ? "10K" : `${options.points * 2.5}K`}
              </output>
            </td>
          </tr>

          <tr data-tip="Define map name (will be used to name downloaded files)">
            <td>
              <i data-locked="0" id="lock_mapName" className="icon-lock-open"></i>
            </td>
            <td>Map name</td>
            <td>
              <input
                className="long"
                autoCorrect="off"
                spellCheck="false"
                type="text"
                value={options.mapName}
                onChange={e => updateOption("mapName", e.target.value)}
              />
            </td>
            <td>
              <i
                data-tip="Regenerate map name"
                className="icon-arrows-cw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-regenerate-map-name"))}
              ></i>
            </td>
          </tr>

          <tr data-tip="Define current year and era name">
            <td>
              <i data-locked="0" id="lock_year" className="icon-lock-open"></i>
            </td>
            <td>Year and era</td>
            <td>
              <input
                type="number"
                step="1"
                className="paired"
                style={{ width: "24%", float: "left", fontSize: "smaller" }}
                value={options.year}
                onChange={e => {
                  updateOption("year", Number(e.target.value));
                  document.dispatchEvent(
                    new CustomEvent("react-change-year", { detail: { year: Number(e.target.value) } })
                  );
                }}
              />
              <input
                autoCorrect="off"
                spellCheck="false"
                type="text"
                style={{ width: "75%", float: "right" }}
                className="long"
                value={options.era}
                onChange={e => {
                  updateOption("era", e.target.value);
                  document.dispatchEvent(new CustomEvent("react-change-era", { detail: { era: e.target.value } }));
                }}
              />
            </td>
            <td>
              <i
                data-tip="Regenerate era"
                className="icon-arrows-cw"
                onClick={() => document.dispatchEvent(new CustomEvent("react-regenerate-era"))}
              ></i>
            </td>
          </tr>

          <tr data-tip="Select heightmap template to be used for map generation">
            <td>
              <i data-locked="0" id="lock_template" className="icon-lock-open"></i>
            </td>
            <td>Heightmap</td>
            <td
              id="templateInputContainer"
              className="pointer"
              onClick={() => document.dispatchEvent(new CustomEvent("react-open-template-selection"))}
            >
              <span style={{ display: "inline-block", minWidth: "8em", cursor: "pointer" }}>
                {options.template || "highIsland"}
              </span>
              <input id="templateInput" type="hidden" value={options.template} readOnly />
            </td>
            <td></td>
          </tr>

          <tr data-tip="Define how many Cultures should be generated">
            <td>
              <i data-locked="0" id="lock_cultures" className="icon-lock-open"></i>
            </td>
            <td>Cultures number</td>
            <td>
              <input
                type="range"
                min="1"
                max="100"
                value={options.cultures}
                onChange={e => updateOption("cultures", Number(e.target.value))}
              />
            </td>
            <td>
              <input
                type="number"
                min="1"
                max="100"
                value={options.cultures}
                onChange={e => updateOption("cultures", Number(e.target.value))}
              />
            </td>
          </tr>

          <tr data-tip="Select a set of cultures to be used for names and cultures generation">
            <td>
              <i data-locked="0" id="lock_culturesSet" className="icon-lock-open"></i>
            </td>
            <td>Cultures set</td>
            <td>
              <select
                id="culturesSet"
                value={options.culturesSet}
                onChange={e => {
                  updateOption("culturesSet", e.target.value);
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

          <tr data-tip="Define how many states and capitals should be generated">
            <td>
              <i data-locked="0" id="lock_statesNumber" className="icon-lock-open"></i>
            </td>
            <td>States number</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.statesNumber}
                onChange={v => updateOption("statesNumber", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Set what share of eligible burgs in each state will become province centers. Higher values create more provinces">
            <td>
              <i data-locked="0" id="lock_provincesRatio" className="icon-lock-open"></i>
            </td>
            <td>Provinces ratio</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="100"
                value={options.provincesRatio}
                onChange={v => updateOption("provincesRatio", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Define how much states and cultures can vary in size. Defines expansionism value">
            <td>
              <i data-locked="0" id="lock_sizeVariety" className="icon-lock-open"></i>
            </td>
            <td>Size variety</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="10"
                step="0.1"
                value={options.sizeVariety}
                onChange={v => updateOption("sizeVariety", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Set state and cultures growth rate. Defines how many lands will stay neutral">
            <td>
              <i data-locked="0" id="lock_growthRate" className="icon-lock-open"></i>
            </td>
            <td>Growth rate</td>
            <td colSpan={2}>
              <SliderInput
                min="0.1"
                max="2"
                step="0.1"
                value={options.growthRate}
                onChange={v => updateOption("growthRate", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Define a number of non-capital settlements to be placed (if enough suitable land exists)">
            <td>
              <i data-locked="0" id="lock_manors" className="icon-lock-open"></i>
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
                onChange={e => updateOption("manors", Number(e.target.value))}
              />
            </td>
            <td>
              <output id="manorsOutput">{options.manors === 1000 ? "auto" : options.manors}</output>
            </td>
          </tr>

          <tr data-tip="Define how many organized religions and cults should be generated. Cultures will have their own folk religions in any case">
            <td>
              <i data-locked="0" id="lock_religionsNumber" className="icon-lock-open"></i>
            </td>
            <td>Religions number</td>
            <td colSpan={2}>
              <SliderInput
                id="religionsNumber"
                min="0"
                max="50"
                value={options.religionsNumber}
                onChange={v => updateOption("religionsNumber", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip="Select state labels mode: display short or full names">
            <td>
              <i data-locked="0" id="lock_stateLabelsMode" className="icon-lock-open"></i>
            </td>
            <td>State labels</td>
            <td>
              <select
                value={options.stateLabelsMode}
                onChange={e => {
                  updateOption("stateLabelsMode", e.target.value as "auto" | "short" | "full");
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
            </td>
            <td>
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
              <i data-locked="0" id="lock_emblemShape" className="icon-lock-open"></i>
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
                <path id="emblemShapeImage" />
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
