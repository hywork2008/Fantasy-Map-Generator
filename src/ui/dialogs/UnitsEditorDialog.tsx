import type React from "react";
import { unitsEditorActions } from "../../controllers/units-editor";
import { useOptionsState } from "../../store/optionsState";
import { useUnitsEditorState } from "../../store/unitsEditorState";
import { showPrompt } from "../../utils";
import { detectUnitSystem, type UnitSystemId, unitSystemPresets } from "../../utils/unitUtils";
import { LockIconButton } from "../components/LockIconButton";
import { SliderInput } from "../components/SliderInput";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const UnitsEditorDialog: React.FC = () => {
  const { isOpen, rulerMode } = useUnitsEditorState();
  const options = useOptionsState();

  const unitSystem = detectUnitSystem({
    temperatureScale: options.temperatureScale,
    distanceUnit: options.distanceUnit,
    heightUnit: options.heightUnit,
    weightUnit: options.weightUnit
  });

  const handleUnitSystemChange = (value: string) => {
    if (value === "custom") return;
    unitsEditorActions.applyUnitSystemPreset(value as UnitSystemId);
  };

  const handleWeightUnitChange = (value: string) => {
    if (value === "custom_name") {
      showPrompt("Provide a custom name for a weight unit", { default: "" }, customValue => {
        const custom = String(customValue);
        options.setOption("weightUnit", custom);
        unitsEditorActions.changeWeightUnit(custom);
      });
      return;
    }
    options.setOption("weightUnit", value);
    unitsEditorActions.changeWeightUnit(value);
  };

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
  const isCustomWeight = !["kg", "lb"].includes(options.weightUnit);

  return (
    <Dialog isOpen={isOpen} title="Units Editor" onClose={() => closeDialog("unitsEditor")}>
      <div id="unitsEditorContainer">
        <div>
          <table id="unitsBody">
            <tbody>
              <tr data-tip="Switch temperature, distance, altitude and weight units at once">
                <th scope="row">
                  <label htmlFor="unitSystem">Unit system:</label>
                </th>
                <td>
                  <select
                    id="unitSystem"
                    value={unitSystem}
                    onChange={e => handleUnitSystemChange(e.currentTarget.value)}
                  >
                    {unitSystemPresets.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    {unitSystem === "custom" && <option value="custom">Custom</option>}
                  </select>
                </td>
              </tr>
              <tr className="unitsHeader">
                <td colSpan={2}>
                  <span className="icon-map-signs" />
                  <span>Distance:</span>
                </td>
              </tr>
              <tr data-tip="Select a distance unit or provide a custom name">
                <th scope="row">
                  <label htmlFor="distanceUnitInput">Distance unit:</label>
                </th>
                <td>
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
                </td>
              </tr>
              <tr data-tip="Select how many distance units are in one pixel">
                <th scope="row">
                  <LockIconButton id="distanceScale" />
                  <label htmlFor="distanceScaleInput">1 map pixel:</label>
                </th>
                <td>
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
                  />
                </td>
              </tr>
              <tr data-tip="Area unit name, type &quot;square&quot; to add ² to the distance unit">
                <th scope="row">
                  <label htmlFor="areaUnit">Area unit:</label>
                </th>
                <td>
                  <input
                    id="areaUnit"
                    type="text"
                    value={options.areaUnit}
                    onChange={e => {
                      options.setOption("areaUnit", e.target.value);
                    }}
                  />
                </td>
              </tr>
              <tr className="unitsHeader">
                <td colSpan={2}>
                  <span className="icon-signal" />
                  <span>Altitude:</span>
                </td>
              </tr>
              <tr data-tip="Select an altitude unit or provide a custom name">
                <th scope="row">
                  <label htmlFor="heightUnit">Height unit:</label>
                </th>
                <td>
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
                </td>
              </tr>
              <tr data-tip="Set height exponent, i.e. a value for altitude change sharpness. Altitude affects temperature and hence biomes">
                <th scope="row">
                  <label htmlFor="heightExponentInput">Exponent:</label>
                </th>
                <td>
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
                  />
                </td>
              </tr>
              <tr className="unitsHeader" data-tip="Select Temperature scale">
                <td colSpan={2}>
                  <span className="icon-temperature-high" />
                  <span>Temperature:</span>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="temperatureScale">Temperature scale:</label>
                </th>
                <td>
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
                </td>
              </tr>
              <tr className="unitsHeader" data-tip="Select Weight unit">
                <td colSpan={2}>
                  <span className="icon-balance-scale" />
                  <span>Weight:</span>
                </td>
              </tr>
              <tr data-tip="Select a weight unit or provide a custom name">
                <th scope="row">
                  <label htmlFor="weightUnit">Weight unit:</label>
                </th>
                <td>
                  <select
                    id="weightUnit"
                    value={options.weightUnit}
                    onChange={e => handleWeightUnitChange(e.currentTarget.value)}
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="lb">Pound (lb)</option>
                    {isCustomWeight && <option value={options.weightUnit}>{options.weightUnit}</option>}
                    <option value="custom_name">Custom name</option>
                  </select>
                </td>
              </tr>
              <tr className="unitsHeader">
                <td colSpan={2}>
                  <span className="icon-male" />
                  <span>Population:</span>
                </td>
              </tr>
              <tr data-tip="Set how many people are in one population point">
                <th scope="row">
                  <label htmlFor="populationRateInput">1 population point:</label>
                </th>
                <td>
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
                  />
                </td>
              </tr>
              <tr data-tip="Set urban population modifier. Change to increase or descrese burgs population">
                <th scope="row">
                  <label htmlFor="urbanizationInput">Urbanization rate:</label>
                </th>
                <td>
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
                  />
                </td>
              </tr>
              <tr data-tip="Set urban density: average population per building in Medieval Fantasy City Generator">
                <th scope="row">
                  <label htmlFor="urbanDensityInput">Urban density:</label>
                </th>
                <td>
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
                  />
                </td>
              </tr>
            </tbody>
          </table>
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
