import type React from "react";
import { unitsEditorActions } from "../../controllers/units-editor";
import { useOptionsState } from "../../store/optionsState";
import { useUnitsEditorState } from "../../store/unitsEditorState";
import { showPrompt } from "../../utils";
import { LockIconButton } from "../components/LockIconButton";
import { SliderInput } from "../components/SliderInput";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const UnitsEditorDialog: React.FC = () => {
  const { isOpen, rulerMode } = useUnitsEditorState();
  const options = useOptionsState();

  const handleDistanceUnitChange = (value: string) => {
    if (value === "custom_name") {
      showPrompt("Provide a custom name for a distance unit", { default: "" }, customValue => {
        const custom = String(customValue);
        options.setOption("distanceUnit", custom);
        unitsEditorActions.changeDistanceUnit(custom);
      });
      return;
    }
    options.setOption("distanceUnit", value);
    unitsEditorActions.changeDistanceUnit(value);
  };

  const handleHeightUnitChange = (value: string) => {
    if (value === "custom_name") {
      showPrompt("Provide a custom name for a height unit", { default: "" }, customValue => {
        const custom = String(customValue);
        options.setOption("heightUnit", custom);
        unitsEditorActions.changeHeightUnit(custom);
      });
      return;
    }
    options.setOption("heightUnit", value);
    unitsEditorActions.changeHeightUnit(value);
  };

  const isCustomDistance = !["mi", "km", "lg", "vr", "nmi", "nlg"].includes(options.distanceUnit);
  const isCustomHeight = !["ft", "m", "f"].includes(options.heightUnit);

  return (
    <Dialog isOpen={isOpen} title="Units Editor" onClose={() => closeDialog("unitsEditor")}>
      <div id="unitsEditorContainer">
        <div>
          <div id="unitsBody">
            <div>
              <span className="icon-map-signs" />
              <span>Distance:</span>
            </div>
            <div data-tip="Select a distance unit or provide a custom name">
              <label htmlFor="distanceUnitInput">Distance unit:</label>
              <select
                id="distanceUnitInput"
                value={options.distanceUnit}
                onChange={e => handleDistanceUnitChange(e.currentTarget.value)}
              >
                <option value="mi">Mile (mi)</option>
                <option value="km">Kilometer (km)</option>
                <option value="lg">League (lg)</option>
                <option value="vr">Versta (vr)</option>
                <option value="nmi">Nautical mile (nmi)</option>
                <option value="nlg">Nautical league (nlg)</option>
                {isCustomDistance && <option value={options.distanceUnit}>{options.distanceUnit}</option>}
                <option value="custom_name">Custom name</option>
              </select>
            </div>
            <div data-tip="Select how many distance units are in one pixel">
              <LockIconButton id="distanceScale" />
              <SliderInput
                id="distanceScaleInput"
                min=".01"
                max={20}
                step=".1"
                value={options.distanceScale}
                onChange={value => {
                  const val = Number(value);
                  options.setOption("distanceScale", val);
                  unitsEditorActions.changeDistanceScale(val);
                }}
              >
                <span>1 map pixel:</span>
              </SliderInput>
            </div>
            <div data-tip="Area unit name, type &quot;square&quot; to add ² to the distance unit">
              <label htmlFor="areaUnit">Area unit:</label>
              <input
                id="areaUnit"
                type="text"
                value={options.areaUnit}
                onChange={e => {
                  options.setOption("areaUnit", e.target.value);
                }}
              />
            </div>
            <div className="unitsHeader">
              <span className="icon-signal" />
              <span>Altitude:</span>
            </div>
            <div data-tip="Select an altitude unit or provide a custom name">
              <label htmlFor="heightUnit">Height unit:</label>
              <select
                id="heightUnit"
                value={options.heightUnit}
                onChange={e => handleHeightUnitChange(e.currentTarget.value)}
              >
                <option value="ft">Feet (ft)</option>
                <option value="m">Meters (m)</option>
                <option value="f">Fathoms (f)</option>
                {isCustomHeight && <option value={options.heightUnit}>{options.heightUnit}</option>}
                <option value="custom_name">Custom name</option>
              </select>
            </div>
            <div data-tip="Set height exponent, i.e. a value for altitude change sharpness. Altitude affects temperature and hence biomes">
              <SliderInput
                id="heightExponentInput"
                min="1.5"
                max="2.2"
                step=".01"
                value={options.heightExponent}
                onChange={value => {
                  options.setOption("heightExponent", Number(value));
                  unitsEditorActions.changeHeightExponent();
                }}
              >
                <span>Exponent:</span>
              </SliderInput>
            </div>
            <div className="unitsHeader" data-tip="Select Temperature scale">
              <span className="icon-temperature-high" />
              <span>Temperature:</span>
            </div>
            <div>
              <label htmlFor="temperatureScale">Temperature scale:</label>
              <select
                id="temperatureScale"
                value={options.temperatureScale}
                onChange={e => {
                  options.setOption("temperatureScale", e.currentTarget.value);
                  unitsEditorActions.changeTemperatureScale();
                }}
              >
                <option value="°C">degree Celsius (°C)</option>
                <option value="°F">degree Fahrenheit (°F)</option>
                <option value="K">Kelvin (K)</option>
                <option value="°R">degree Rankine (°R)</option>
                <option value="°De">degree Delisle (°De)</option>
                <option value="°N">degree Newton (°N)</option>
                <option value="°Ré">degree Réaumur (°Ré)</option>
                <option value="°Rø">degree Rømer (°Rø)</option>
              </select>
            </div>
            <div className="unitsHeader">
              <span className="icon-male" />
              <span>Population:</span>
            </div>
            <div data-tip="Set how many people are in one population point">
              <SliderInput
                id="populationRateInput"
                min={10}
                max={10000}
                step={10}
                value={options.populationRate}
                onChange={value => {
                  const val = Number(value);
                  options.setOption("populationRate", val);
                  unitsEditorActions.changePopulationRate(val);
                }}
              >
                <span>1 population point:</span>
              </SliderInput>
            </div>
            <div data-tip="Set urban population modifier. Change to increase or descrese burgs population">
              <SliderInput
                id="urbanizationInput"
                min=".01"
                max={5}
                step=".01"
                value={options.urbanization}
                onChange={value => {
                  const val = Number(value);
                  options.setOption("urbanization", val);
                  unitsEditorActions.changeUrbanizationRate(val);
                }}
              >
                <span>Urbanization rate:</span>
              </SliderInput>
            </div>
            <div data-tip="Set urban density: average population per building in Medieval Fantasy City Generator">
              <SliderInput
                id="urbanDensityInput"
                min={1}
                max={200}
                step={1}
                value={options.urbanDensity}
                onChange={value => {
                  const val = Number(value);
                  options.setOption("urbanDensity", val);
                  unitsEditorActions.changeUrbanDensity(val);
                }}
              >
                <span>Urban density:</span>
              </SliderInput>
            </div>
          </div>
          <div id="unitsFooter">
            <button
              type="button"
              data-tip="Click to place a linear measurer (ruler)"
              className="icon-ruler"
              onClick={unitsEditorActions.addRuler}
            />
            <button
              type="button"
              data-tip="Drag to measure a curve length (opisometer)"
              className={`icon-drafting-compass ${rulerMode === "opisometer" ? "pressed" : ""}`}
              onClick={unitsEditorActions.toggleOpisometerMode}
            />
            <button
              type="button"
              data-tip="Drag to measure a curve length that sticks to routes (route opisometer)"
              className={rulerMode === "routeOpisometer" ? "pressed" : undefined}
              onClick={unitsEditorActions.toggleRouteOpisometerMode}
            >
              <svg width="0.88em" height="0.88em" aria-hidden="true">
                <use xlinkHref="#icon-route" />
              </svg>
            </button>
            <button
              type="button"
              data-tip="Drag to measure a polygon area (planimeter)"
              className={`icon-draw-polygon ${rulerMode === "planimeter" ? "pressed" : ""}`}
              onClick={unitsEditorActions.togglePlanimeterMode}
            />
            <button
              type="button"
              data-tip="Remove all rulers from the map. Click on ruler label to remove a ruler separately"
              className="icon-trash"
              onClick={unitsEditorActions.removeAllRulers}
            />
            <button
              type="button"
              data-tip="Restore default units settings"
              className="icon-ccw"
              onClick={unitsEditorActions.restoreDefaultUnits}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
