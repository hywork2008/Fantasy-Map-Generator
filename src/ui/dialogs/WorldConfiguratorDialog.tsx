import { geoGraticule, geoOrthographic, geoPath, interpolateSpectral, range, scaleSequential, select } from "d3";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { updateWorld } from "../../controllers/world-configurator";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { useWorldConfiguratorFormStore } from "../../store/worldConfiguratorFormStore";
import { convertTemperature, debounce, parseTransform, rn, round } from "../../utils";
import { lock } from "../../utils/domUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const debouncedUpdateWorld = debounce(updateWorld, 300);

export const WorldConfiguratorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("worldConfigurator"));
  const globeRef = useRef<SVGSVGElement>(null);
  const [autoChange, setAutoChange] = useState(true);

  // Read Zustand state for globe stats calculation
  const mapSize = useOptionsState(s => s.mapSize);

  // Compute temperature conversions for display
  const tempEqF = convertTemperature(worldContext.options.temperatureEquator, "°F");
  const tempNpF = convertTemperature(worldContext.options.temperatureNorthPole, "°F");
  const tempSpF = convertTemperature(worldContext.options.temperatureSouthPole, "°F");

  const getProjectionPath = useCallback(() => {
    const projection = geoOrthographic().translate([100, 100]).scale(100);
    return geoPath(projection);
  }, []);

  const updateGlobeTemperature = useCallback(() => {
    if (!globeRef.current) return;
    const globe = select(globeRef.current);
    const tEq = worldContext.options.temperatureEquator;
    const tNP = worldContext.options.temperatureNorthPole;
    const tSP = worldContext.options.temperatureSouthPole;

    const colorScale = scaleSequential(interpolateSpectral);
    const getColor = (value: number) => colorScale(1 - value);
    const [tMin, tMax] = [-25, 30];
    const tDelta = tMax - tMin;

    globe.select("#grad90").attr("stop-color", getColor((tNP - tMin) / tDelta));
    globe.select("#grad60").attr("stop-color", getColor((tEq - ((tEq - tNP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad30").attr("stop-color", getColor((tEq - ((tEq - tNP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad0").attr("stop-color", getColor((tEq - tMin) / tDelta));
    globe.select("#grad-30").attr("stop-color", getColor((tEq - ((tEq - tSP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad-60").attr("stop-color", getColor((tEq - ((tEq - tSP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad-90").attr("stop-color", getColor((tSP - tMin) / tDelta));
  }, []);

  // Compute display values for globe statistics
  const globeStats = useMemo(() => {
    const size = mapSize;
    const eqD = ((worldContext.graphHeight / 2) * 100) / size;
    const unit = useOptionsState.getState().distanceUnit;
    const eqD2 = eqD * 2;
    const meridianInUnit = eqD2 * worldContext.distanceScale;
    const meridian = toKilometer(meridianInUnit, unit);

    return {
      mapSizeText: `${worldContext.graphWidth}x${worldContext.graphHeight}`,
      mapSizeFriendly: `${rn(worldContext.graphWidth * worldContext.distanceScale)}x${rn(worldContext.graphHeight * worldContext.distanceScale)} ${unit}`,
      meridianLength: rn(eqD2),
      meridianLengthFriendly: `${rn(meridianInUnit)} ${unit}`,
      meridianLengthEarth: meridian ? ` = ${rn(meridian / 200)}%🌏` : "",
      mapCoordinates: `${lat(worldContext.mapCoordinates.latN!)} ${Math.abs(rn(worldContext.mapCoordinates.lonW!))}°W; ${lat(worldContext.mapCoordinates.latS!)} ${rn(worldContext.mapCoordinates.lonE!)}°E`
    };
  }, [mapSize]);

  const updateGlobePosition = useCallback(() => {
    if (!globeRef.current) return;
    const globe = select(globeRef.current);
    const path = getProjectionPath();

    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { coords: true } }));

    const mc = worldContext.mapCoordinates;
    const area = geoGraticule().extent([
      [mc.lonW!, mc.latN!],
      [mc.lonE!, mc.latS!]
    ]);
    globe.select("#globeArea").attr("d", round(path(area.outline()) ?? "", 1));
  }, [getProjectionPath]);

  const updateWindDirections = useCallback(() => {
    if (!globeRef.current) return;
    let idx = 0;
    select(globeRef.current)
      .select("#globeWindArrows")
      .selectAll<SVGPathElement, unknown>("path")
      .each(function (this: SVGPathElement) {
        const tr = parseTransform(this.getAttribute("transform") ?? "");
        this.setAttribute("transform", `rotate(${worldContext.options.winds[idx]} ${tr[1]} ${tr[2]})`);
        idx++;
      });
  }, []);

  const refreshGlobe = useCallback(() => {
    updateGlobeTemperature();
    updateGlobePosition();
    if (!globeRef.current) return;
    const globe = select(globeRef.current);
    const path = getProjectionPath();
    const graticule = geoGraticule();
    globe.select("#globeGraticule").attr("d", round(path(graticule()) ?? "", 1));
    updateWindDirections();
  }, [getProjectionPath, updateGlobePosition, updateGlobeTemperature, updateWindDirections]);

  // Initialize on open
  useEffect(() => {
    if (!isOpen) return;
    refreshGlobe();
  }, [isOpen, refreshGlobe]);

  // Refresh when map regenerates while dialog is open
  useEffect(() => {
    const handler = () => {
      if (isOpen) refreshGlobe();
    };
    document.addEventListener("fmg:world-configurator-refresh", handler);
    return () => document.removeEventListener("fmg:world-configurator-refresh", handler);
  }, [isOpen, refreshGlobe]);

  function handleControlsChange(
    event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLFieldSetElement>
  ): void {
    const target = event.target as HTMLInputElement;
    const stored = target.dataset.stored;
    if (!stored) return;

    lock(stored);
    const val = Number(target.value);
    const formStore = useWorldConfiguratorFormStore.getState();

    if (stored === "temperatureEquator") {
      worldContext.options.temperatureEquator = val;
      formStore.setTemperatureEquator(val);
      updateGlobeTemperature();
    } else if (stored === "temperatureNorthPole") {
      worldContext.options.temperatureNorthPole = val;
      formStore.setTemperatureNorthPole(val);
      updateGlobeTemperature();
    } else if (stored === "temperatureSouthPole") {
      worldContext.options.temperatureSouthPole = val;
      formStore.setTemperatureSouthPole(val);
      updateGlobeTemperature();
    } else if (stored === "mapSize" || stored === "latitude" || stored === "longitude" || stored === "prec") {
      useOptionsState.getState().setOption(stored, val);
      // Also sync to form store
      if (stored === "mapSize") formStore.setMapSize(val);
      else if (stored === "latitude") formStore.setLatitude(val);
      else if (stored === "longitude") formStore.setLongitude(val);
      else if (stored === "prec") formStore.setPrec(val);

      if (stored !== "prec") updateGlobePosition();
    }

    if (autoChange) debouncedUpdateWorld();
  }

  function handleWindChange(event: React.MouseEvent<SVGGElement>): void {
    const arrow = (event.target as Element)?.nextElementSibling as SVGElement | null;
    if (!arrow) return;
    const tier = +(arrow.dataset.tier ?? 0);
    worldContext.options.winds[tier] = (worldContext.options.winds[tier] + 45) % 360;
    const tr = parseTransform(arrow.getAttribute("transform") ?? "");
    arrow.setAttribute("transform", `rotate(${worldContext.options.winds[tier]} ${tr[1]} ${tr[2]})`);
    localStorage.setItem("winds", String(worldContext.options.winds));

    const mapTiers = range(worldContext.mapCoordinates.latN!, worldContext.mapCoordinates.latS!, -30).map(
      c => ((90 - c) / 30) | 0
    );
    if (autoChange && mapTiers.includes(tier)) updateWorld();
  }

  function restoreDefaultWinds(): void {
    const defaultWinds: [number, number, number, number, number, number] = [225, 45, 225, 315, 135, 315];
    const mapTiers = range(worldContext.mapCoordinates.latN!, worldContext.mapCoordinates.latS!, -30).map(
      c => ((90 - c) / 30) | 0
    );
    const needsUpdate = autoChange && mapTiers.some(t => worldContext.options.winds[t] !== defaultWinds[t]);
    worldContext.options.winds = defaultWinds;
    updateWindDirections();
    if (needsUpdate) updateWorld();
  }

  function applyWorldPreset(size: number, latShift: number): void {
    useOptionsState.getState().setOption("mapSize", size);
    useOptionsState.getState().setOption("latitude", latShift);
    useWorldConfiguratorFormStore.getState().setMapSize(size);
    useWorldConfiguratorFormStore.getState().setLatitude(latShift);
    lock("mapSize");
    lock("latitude");
    if (autoChange) updateWorld();
  }

  return (
    <Dialog isOpen={isOpen} title="WorldConfigurator" onClose={() => closeDialog("worldConfigurator")}>
      <div id="worldConfiguratorContainer">
        <div>
          <div className="-world-configurator-dialog__display-flex">
            <fieldset
              id="worldControls"
              onInput={handleControlsChange}
              className="-world-configurator-dialog__border-none--padding-0--margin-0"
            >
              <div>
                <i data-locked={0} id="lock_temperatureEquator" className="icon-lock-open" />
                <label data-tip="Set temperature at equator">
                  <i>Equator:</i>
                  <input
                    id="temperatureEquatorInput"
                    data-stored="temperatureEquator"
                    type="number"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureEquator}
                    onChange={handleControlsChange}
                  />
                  <span>
                    °C = <span id="temperatureEquatorF">{tempEqF}</span>
                  </span>
                  <input
                    id="temperatureEquatorOutput"
                    data-stored="temperatureEquator"
                    type="range"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureEquator}
                    onChange={handleControlsChange}
                  />
                </label>
              </div>
              <div>
                <label data-tip="Set the North Pole average yearly temperature">
                  <i data-locked={0} id="lock_temperatureNorthPole" className="icon-lock-open" />
                  <i>North Pole:</i>
                  <input
                    id="temperatureNorthPoleInput"
                    data-stored="temperatureNorthPole"
                    type="number"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureNorthPole}
                    onChange={handleControlsChange}
                  />
                  <span>
                    °C = <span id="temperatureNorthPoleF">{tempNpF}</span>
                  </span>
                  <input
                    id="temperatureNorthPoleOutput"
                    data-stored="temperatureNorthPole"
                    type="range"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureNorthPole}
                    onChange={handleControlsChange}
                  />
                </label>
              </div>
              <div>
                <label data-tip="Set the South Pole average yearly temperature">
                  <i data-locked={0} id="lock_temperatureSouthPole" className="icon-lock-open" />
                  <i>South Pole:</i>
                  <input
                    id="temperatureSouthPoleInput"
                    data-stored="temperatureSouthPole"
                    type="number"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureSouthPole}
                    onChange={handleControlsChange}
                  />
                  <span>
                    °C = <span id="temperatureSouthPoleF">{tempSpF}</span>
                  </span>
                  <input
                    id="temperatureSouthPoleOutput"
                    data-stored="temperatureSouthPole"
                    type="range"
                    min={-50}
                    max={50}
                    value={worldContext.options.temperatureSouthPole}
                    onChange={handleControlsChange}
                  />
                </label>
              </div>
              <div>
                <i data-locked={0} id="lock_mapSize" className="icon-lock-open" />
                <label data-tip="Set map size relative to the world size">
                  <i>Map size:</i>
                  <input
                    id="mapSizeInput"
                    data-stored="mapSize"
                    type="number"
                    min={1}
                    max={100}
                    step="0.1"
                    value={useOptionsState(s => s.mapSize)}
                    onChange={handleControlsChange}
                  />
                  %
                  <input
                    id="mapSizeOutput"
                    data-stored="mapSize"
                    type="range"
                    min={1}
                    max={100}
                    step="0.1"
                    value={useOptionsState(s => s.mapSize)}
                    onChange={handleControlsChange}
                  />
                </label>
              </div>
              <div>
                <i data-locked={0} id="lock_latitude" className="icon-lock-open" />
                <label data-tip="Set a North-South map shift, set to 50 to make map center lie on Equator">
                  <i>Latitudes:</i>
                  <input
                    id="latitudeInput"
                    data-stored="latitude"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={useOptionsState(s => s.latitude)}
                    onChange={handleControlsChange}
                  />
                  <br />
                  <i>N</i>
                  <input
                    id="latitudeOutput"
                    data-stored="latitude"
                    type="range"
                    min={0}
                    max={100}
                    step="0.1"
                    className="-world-configurator-dialog__width-10-3em"
                    value={useOptionsState(s => s.latitude)}
                    onChange={handleControlsChange}
                  />
                  <i>S</i>
                </label>
              </div>
              <div>
                <i data-locked={0} id="lock_longitude" className="icon-lock-open" />
                <label data-tip="Set a West-East map shift, set to 50 to make map center lie on Prime meridian">
                  <i>Longitudes:</i>
                  <input
                    id="longitudeInput"
                    data-stored="longitude"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={useOptionsState(s => s.longitude)}
                    onChange={handleControlsChange}
                  />
                  <br />
                  <i>W</i>
                  <input
                    id="longitudeOutput"
                    data-stored="longitude"
                    type="range"
                    min={0}
                    max={100}
                    step="0.1"
                    className="-world-configurator-dialog__width-10-3em"
                    value={useOptionsState(s => s.longitude)}
                    onChange={handleControlsChange}
                  />
                  <i>E</i>
                </label>
              </div>
              <div>
                <label data-tip="Set precipitation - water amount clouds can bring. Defines rivers and biomes generation. Keep around 100% for default generation">
                  <i data-locked={0} id="lock_prec" className="icon-lock-open" />
                  <i>Precipitation:</i>
                  <input
                    id="precInput"
                    data-stored="prec"
                    type="number"
                    value={useOptionsState(s => s.prec)}
                    onChange={handleControlsChange}
                  />
                  %
                  <input
                    id="precOutput"
                    data-stored="prec"
                    type="range"
                    min={0}
                    max={500}
                    value={useOptionsState(s => s.prec)}
                    onChange={handleControlsChange}
                  />
                </label>
              </div>
              <div data-tip="Canvas size. Can be changed in general options on new map generation">
                <i>Canvas size:</i>
                <br />
                <span id="mapSize">{globeStats.mapSizeText}</span> px ={" "}
                <span id="mapSizeFriendly">{globeStats.mapSizeFriendly}</span>
              </div>
              <div>
                <i data-tip="Length of Meridian. Almost half of the equator length">Meridian length:</i>
                <br />
                <span id="meridianLength" data-tip="Length of Meridian in pixels">
                  {globeStats.meridianLength}
                </span>{" "}
                px =
                <span
                  id="meridianLengthFriendly"
                  data-tip="Length of Meridian is friendly units (depends on user configuration)"
                >
                  {globeStats.meridianLengthFriendly}
                </span>
                <span
                  id="meridianLengthEarth"
                  data-tip="Fantasy world Meridian length relative to real-world Earth (20k km)"
                >
                  {globeStats.meridianLengthEarth}
                </span>
              </div>
              <div data-tip="Map coordinates on globe">
                <i>Coords:</i> <span id="mapCoordinates">{globeStats.mapCoordinates}</span>
              </div>
            </fieldset>
            <div className="-world-configurator-dialog__display-flex--flex-direction-column--align-items-f">
              <svg ref={globeRef} id="globe" width="22em" viewBox="-20 -25 240 240" aria-hidden="true">
                <defs>
                  <linearGradient id="temperatureGradient" x1={0} x2={0} y1={0} y2={1}>
                    <stop id="grad90" offset="0%" stopColor="blue" />
                    <stop id="grad60" offset="16.6%" stopColor="green" />
                    <stop id="grad30" offset="33.3%" stopColor="yellow" />
                    <stop id="grad0" offset="50%" stopColor="red" />
                    <stop id="grad-30" offset="66.6%" stopColor="yellow" />
                    <stop id="grad-60" offset="83.3%" stopColor="green" />
                    <stop id="grad-90" offset="100%" stopColor="blue" />
                  </linearGradient>
                </defs>
                <g id="globeNoteLines">
                  <line x1={5} x2={220} y1={0} y2={0} />
                  <line x1={5} x2={220} y1={13} y2={13} />
                  <line x1={5} x2={220} y1="49.5" y2="49.5" />
                  <line x1={-5} x2={220} y1={100} y2={100} />
                  <line x1={5} x2={220} y1="150.5" y2="150.5" />
                  <line x1={5} x2={220} y1={187} y2={187} />
                  <line x1={5} x2={220} y1={200} y2={200} />
                </g>
                <g
                  id="globeWindArrows"
                  data-tip="Click to change wind direction"
                  strokeLinejoin="round"
                  onClick={handleWindChange}
                  className="-world-configurator-dialog__cursor-pointer"
                >
                  <circle cx={210} cy={6} r={12} />
                  <path data-tier={0} d="M210,11 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 6)" />
                  <circle cx={210} cy={30} r={12} />
                  <path data-tier={1} d="M210,35 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(45 210 30)" />
                  <circle cx={210} cy={75} r={12} />
                  <path data-tier={2} d="M210,80 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(225 210 75)" />
                  <circle cx={210} cy={130} r={12} />
                  <path data-tier={3} d="M210,135 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 130)" />
                  <circle cx={210} cy={173} r={12} />
                  <path data-tier={4} d="M210,178 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(135 210 173)" />
                  <circle cx={210} cy={194} r={12} />
                  <path data-tier={5} d="M210,199 v-10 l-3,3 m6,0 l-3,-3" transform="rotate(315 210 194)" />
                </g>
                <g id="globaAxisLabels">
                  <text x="82%" y="-4%">
                    wind
                  </text>
                  <text x="-8%" y="-4%">
                    latitude
                  </text>
                </g>
                <g id="globeLatLabels">
                  <text x={-15} y={5}>
                    90°
                  </text>
                  <text x={-15} y={18}>
                    60°
                  </text>
                  <text x={-15} y={53}>
                    30°
                  </text>
                  <text x={-15} y={103}>
                    0°
                  </text>
                  <text x={-15} y={153}>
                    30°
                  </text>
                  <text x={-15} y={190}>
                    60°
                  </text>
                  <text x={-15} y={204}>
                    90°
                  </text>
                </g>
                <circle id="globeGradient" cx={100} cy={100} r={100} fill="url(#temperatureGradient)" stroke="none" />
                <line id="globePrimeMeridian" x1={100} x2={100} y1={0} y2={200} />
                <line id="globeEquator" x1={1} x2={200} y1={100} y2={100} />
                <circle id="globeOutline" cx={100} cy={100} r={100} fill="none" />
                <path id="globeGraticule" />
                <path id="globeArea" />
              </svg>
              <button
                type="button"
                id="restoreWinds"
                data-tip="Click to restore default (Earth-based) wind directions"
                onClick={restoreDefaultWinds}
              >
                Restore winds
              </button>
            </div>
          </div>
          <div className="-world-configurator-dialog__margin-top-0-3em">
            <i>Presets:</i>
            <button
              type="button"
              id="wcWholeWorld"
              data-tip="Click to set map size to cover the whole world"
              onClick={() => applyWorldPreset(100, 50)}
            >
              Whole world
            </button>
            <button
              type="button"
              id="wcNorthern"
              data-tip="Click to set map size to cover the Northern latitudes"
              onClick={() => applyWorldPreset(33, 25)}
            >
              Northern
            </button>
            <button
              type="button"
              id="wcTropical"
              data-tip="Click to set map size to cover the Tropical latitudes"
              onClick={() => applyWorldPreset(33, 50)}
            >
              Tropical
            </button>
            <button
              type="button"
              id="wcSouthern"
              data-tip="Click to set map size to cover the Southern latitudes"
              onClick={() => applyWorldPreset(33, 75)}
            >
              Southern
            </button>
          </div>
        </div>
        <div className="fmg-dialog-buttonpane -world-configurator-dialog__display-flex--align-items-center--justify-content-">
          <div className="dontAsk" data-tip="Automatically update world on input changes and button clicks">
            <input
              id="wcAutoChange"
              className="checkbox"
              type="checkbox"
              checked={autoChange}
              onChange={e => setAutoChange(e.target.checked)}
            />
            <label htmlFor="wcAutoChange" className="checkbox-label">
              <i>auto-apply changes</i>
            </label>
          </div>
          <button type="button" className="fmg-dialog-button" onClick={updateWorld}>
            Update world
          </button>
        </div>
      </div>
    </Dialog>
  );
};

function toKilometer(v: number, unit: string): number {
  if (unit === "km") return v;
  if (unit === "mi") return v * 1.60934;
  if (unit === "lg") return v * 4.828;
  if (unit === "vr") return v * 1.0668;
  if (unit === "nmi") return v * 1.852;
  if (unit === "nlg") return v * 5.556;
  return 0;
}

function lat(latVal: number): string {
  return latVal > 0 ? `${Math.abs(rn(latVal))}°N` : `${Math.abs(rn(latVal))}°S`;
}
