import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
export const UnitsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("unitsEditor"));

  return (
    <Dialog isOpen={isOpen} title="Units Editor" onClose={() => closeDialog("unitsEditor")}>
      <div id="unitsEditorContainer">
        <div>
          <div id="unitsBody" style={{ marginLeft: "1.1em" }}>
            <div className="unitsHeader" style={{ marginTop: "0.4em" }}>
              <span className="icon-map-signs" />
              <span>Distance:</span>
            </div>
            <div data-tip="Select a distance unit or provide a custom name">
              <label htmlFor="distanceUnitInput">Distance unit:</label>
              <select id="distanceUnitInput" data-stored="distanceUnit" defaultValue="mi">
                <option value="mi">Mile (mi)</option>
                <option value="km">Kilometer (km)</option>
                <option value="lg">League (lg)</option>
                <option value="vr">Versta (vr)</option>
                <option value="nmi">Nautical mile (nmi)</option>
                <option value="nlg">Nautical league (nlg)</option>
                <option value="custom_name">Custom name</option>
              </select>
            </div>
            <div data-tip="Select how many distance units are in one pixel">
              <i data-locked={0} id="lock_distanceScale" className="icon-lock-open" />
              <slider-input id="distanceScaleInput" data-stored="distanceScale" min=".01" max={20} step=".1" value={3}>
                <span>1 map pixel:</span>
              </slider-input>
            </div>
            <div data-tip="Area unit name, type &quot;square&quot; to add ² to the distance unit">
              <label htmlFor="areaUnit">Area unit:</label>
              <input id="areaUnit" data-stored="areaUnit" type="text" defaultValue="square" />
            </div>
            <div className="unitsHeader">
              <span className="icon-signal" />
              <span>Altitude:</span>
            </div>
            <div data-tip="Select an altitude unit or provide a custom name">
              <label htmlFor="heightUnit">Height unit:</label>
              <select id="heightUnit" data-stored="heightUnit" defaultValue="ft">
                <option value="ft">Feet (ft)</option>
                <option value="m">Meters (m)</option>
                <option value="f">Fathoms (f)</option>
                <option value="custom_name">Custom name</option>
              </select>
            </div>
            <div data-tip="Set height exponent, i.e. a value for altitude change sharpness. Altitude affects temperature and hence biomes">
              <slider-input
                id="heightExponentInput"
                data-stored="heightExponent"
                min="1.5"
                max="2.2"
                step=".01"
                value={2}
              >
                <span>Exponent:</span>
              </slider-input>
            </div>
            <div className="unitsHeader" data-tip="Select Temperature scale">
              <span className="icon-temperature-high" />
              <span>Temperature:</span>
            </div>
            <div>
              <label htmlFor="temperatureScale">Temperature scale:</label>
              <select id="temperatureScale" data-stored="temperatureScale" defaultValue="°C">
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
              <slider-input
                id="populationRateInput"
                data-stored="populationRate"
                min={10}
                max={10000}
                step={10}
                value={1000}
              >
                <span>1 population point:</span>
              </slider-input>
            </div>
            <div data-tip="Set urban population modifier. Change to increase or descrese burgs population">
              <slider-input id="urbanizationInput" data-stored="urbanization" min=".01" max={5} step=".01" value={1}>
                <span>Urbanization rate:</span>
              </slider-input>
            </div>
            <div data-tip="Set urban density: average population per building in Medieval Fantasy City Generator">
              <slider-input id="urbanDensityInput" data-stored="urbanDensity" min={1} max={200} step={1} value={10}>
                <span>Urban density:</span>
              </slider-input>
            </div>
          </div>
          <div id="unitsFooter">
            <button
              type="button"
              id="addLinearRuler"
              data-tip="Click to place a linear measurer (ruler)"
              className="icon-ruler"
            />
            <button
              type="button"
              id="addOpisometer"
              data-tip="Drag to measure a curve length (opisometer)"
              className="icon-drafting-compass"
            />
            <button
              type="button"
              id="addRouteOpisometer"
              data-tip="Drag to measure a curve length that sticks to routes (route opisometer)"
            >
              <svg width="0.88em" height="0.88em" aria-hidden="true">
                <use xlinkHref="#icon-route" />
              </svg>
            </button>
            <button
              type="button"
              id="addPlanimeter"
              data-tip="Drag to measure a polygon area (planimeter)"
              className="icon-draw-polygon"
            />
            <button
              type="button"
              id="removeRulers"
              data-tip="Remove all rulers from the map. Click on ruler label to remove a ruler separately"
              className="icon-trash"
            />
            <button type="button" id="unitsRestore" data-tip="Restore default units settings" className="icon-ccw" />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
