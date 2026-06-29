import { geoGraticule, geoOrthographic, geoPath, interpolateSpectral, range, scaleSequential, select } from "d3";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { worldContext } from "../../context/worldContext";
import { updateWorld } from "../../controllers/world-configurator";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { convertTemperature, debounce, parseTransform, rn, round } from "../../utils";
import { lock } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

const debouncedUpdateWorld = debounce(updateWorld, 300);

export const WorldConfiguratorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("worldConfigurator"));
  const globeRef = useRef<SVGSVGElement>(null);

  const getProjectionPath = useCallback(() => {
    const projection = geoOrthographic().translate([100, 100]).scale(100);
    return geoPath(projection);
  }, []);

  const updateInputValues = useCallback(() => {
    const eq = worldContext.options.temperatureEquator;
    getEl("temperatureEquatorInput")?.setAttribute("value", String(eq));
    const eqOut = getEl<HTMLOutputElement>("temperatureEquatorOutput");
    if (eqOut) eqOut.value = String(eq);
    const eqF = getEl("temperatureEquatorF");
    if (eqF) eqF.innerText = convertTemperature(eq, "°F");

    const np = worldContext.options.temperatureNorthPole;
    getEl("temperatureNorthPoleInput")?.setAttribute("value", String(np));
    const npOut = getEl<HTMLOutputElement>("temperatureNorthPoleOutput");
    if (npOut) npOut.value = String(np);
    const npF = getEl("temperatureNorthPoleF");
    if (npF) npF.innerText = convertTemperature(np, "°F");

    const sp = worldContext.options.temperatureSouthPole;
    getEl("temperatureSouthPoleInput")?.setAttribute("value", String(sp));
    const spOut = getEl<HTMLOutputElement>("temperatureSouthPoleOutput");
    if (spOut) spOut.value = String(sp);
    const spF = getEl("temperatureSouthPoleF");
    if (spF) spF.innerText = convertTemperature(sp, "°F");
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

  const updateGlobePosition = useCallback(() => {
    if (!globeRef.current) return;
    const globe = select(globeRef.current);
    const path = getProjectionPath();

    const size = +(getEl<HTMLOutputElement>("mapSizeOutput")?.value ?? "100");
    const eqD = ((worldContext.graphHeight / 2) * 100) / size;

    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { coords: true } }));
    const mc = worldContext.mapCoordinates;
    const unit = (document.getElementById("distanceUnitInput") as HTMLSelectElement | null)?.value ?? "km";

    const eqD2 = eqD * 2;
    const meridianInUnit = eqD2 * worldContext.distanceScale;
    const meridian = toKilometer(meridianInUnit, unit);

    const mapSizeEl = getEl("mapSize");
    if (mapSizeEl) mapSizeEl.innerHTML = `${worldContext.graphWidth}x${worldContext.graphHeight}`;
    const mapSizeFriendlyEl = getEl("mapSizeFriendly");
    if (mapSizeFriendlyEl)
      mapSizeFriendlyEl.innerHTML = `${rn(worldContext.graphWidth * worldContext.distanceScale)}x${rn(worldContext.graphHeight * worldContext.distanceScale)} ${unit}`;
    const meridianLengthEl = getEl("meridianLength");
    if (meridianLengthEl) meridianLengthEl.innerHTML = String(rn(eqD2));
    const meridianLengthFriendlyEl = getEl("meridianLengthFriendly");
    if (meridianLengthFriendlyEl) meridianLengthFriendlyEl.innerHTML = `${rn(meridianInUnit)} ${unit}`;
    const meridianLengthEarthEl = getEl("meridianLengthEarth");
    if (meridianLengthEarthEl) meridianLengthEarthEl.innerHTML = meridian ? ` = ${rn(meridian / 200)}%🌏` : "";
    const mapCoordsEl = getEl("mapCoordinates");
    if (mapCoordsEl)
      mapCoordsEl.innerHTML = `${lat(mc.latN!)} ${Math.abs(rn(mc.lonW!))}°W; ${lat(mc.latS!)} ${rn(mc.lonE!)}°E`;

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
    updateInputValues();
    updateGlobeTemperature();
    updateGlobePosition();
    if (!globeRef.current) return;
    const globe = select(globeRef.current);
    const path = getProjectionPath();
    const graticule = geoGraticule();
    globe.select("#globeGraticule").attr("d", round(path(graticule()) ?? "", 1));
    updateWindDirections();
  }, [getProjectionPath, updateGlobePosition, updateGlobeTemperature, updateInputValues, updateWindDirections]);

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

  function isAutoChange(): boolean {
    return getEl<HTMLInputElement>("wcAutoChange")?.checked ?? true;
  }

  function handleControlsChange(
    event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLFieldSetElement>
  ): void {
    const target = event.target as HTMLInputElement;
    const stored = target.dataset.stored;
    if (!stored) return;

    const inputEl = getEl<HTMLInputElement>(`${stored}Input`);
    const outputEl = getEl<HTMLOutputElement>(`${stored}Output`);
    if (inputEl) inputEl.value = target.value;
    if (outputEl) outputEl.value = target.value;
    lock(stored);

    const val = Number(target.value);
    if (stored === "temperatureEquator") {
      worldContext.options.temperatureEquator = val;
      const eqF = getEl("temperatureEquatorF");
      if (eqF) eqF.innerText = convertTemperature(val, "°F");
      updateGlobeTemperature();
    } else if (stored === "temperatureNorthPole") {
      worldContext.options.temperatureNorthPole = val;
      const npF = getEl("temperatureNorthPoleF");
      if (npF) npF.innerText = convertTemperature(val, "°F");
      updateGlobeTemperature();
    } else if (stored === "temperatureSouthPole") {
      worldContext.options.temperatureSouthPole = val;
      const spF = getEl("temperatureSouthPoleF");
      if (spF) spF.innerText = convertTemperature(val, "°F");
      updateGlobeTemperature();
    } else if (stored === "mapSize" || stored === "latitude" || stored === "longitude" || stored === "prec") {
      useOptionsState.getState().setOption(stored, val);
      if (stored !== "prec") updateGlobePosition();
    }

    if (isAutoChange()) debouncedUpdateWorld();
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
    if (isAutoChange() && mapTiers.includes(tier)) updateWorld();
  }

  function restoreDefaultWinds(): void {
    const defaultWinds: [number, number, number, number, number, number] = [225, 45, 225, 315, 135, 315];
    const mapTiers = range(worldContext.mapCoordinates.latN!, worldContext.mapCoordinates.latS!, -30).map(
      c => ((90 - c) / 30) | 0
    );
    const needsUpdate = isAutoChange() && mapTiers.some(t => worldContext.options.winds[t] !== defaultWinds[t]);
    worldContext.options.winds = defaultWinds;
    updateWindDirections();
    if (needsUpdate) updateWorld();
  }

  function applyWorldPreset(size: number, latShift: number): void {
    const mapSizeInput = getEl<HTMLInputElement>("mapSizeInput");
    const mapSizeOutput = getEl<HTMLOutputElement>("mapSizeOutput");
    const latInput = getEl<HTMLInputElement>("latitudeInput");
    const latOutput = getEl<HTMLOutputElement>("latitudeOutput");
    if (mapSizeInput) mapSizeInput.value = String(size);
    if (mapSizeOutput) mapSizeOutput.value = String(size);
    if (latInput) latInput.value = String(latShift);
    if (latOutput) latOutput.value = String(latShift);
    useOptionsState.getState().setOption("mapSize", size);
    useOptionsState.getState().setOption("latitude", latShift);
    lock("mapSize");
    lock("latitude");
    if (isAutoChange()) updateWorld();
  }

  return (
    <Dialog isOpen={isOpen} title="WorldConfigurator" onClose={() => closeDialog("worldConfigurator")}>
      <div id="worldConfiguratorContainer">
        <div>
          <div style={{ display: "flex" }}>
            <fieldset
              id="worldControls"
              onInput={handleControlsChange}
              style={{ border: "none", padding: 0, margin: 0 }}
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
                  />
                  <span>
                    °C = <span id="temperatureEquatorF" />
                  </span>
                  <input
                    id="temperatureEquatorOutput"
                    data-stored="temperatureEquator"
                    type="range"
                    min={-50}
                    max={50}
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
                  />
                  <span>
                    °C = <span id="temperatureNorthPoleF" />
                  </span>
                  <input
                    id="temperatureNorthPoleOutput"
                    data-stored="temperatureNorthPole"
                    type="range"
                    min={-50}
                    max={50}
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
                  />
                  <span>
                    °C = <span id="temperatureSouthPoleF" />
                  </span>
                  <input
                    id="temperatureSouthPoleOutput"
                    data-stored="temperatureSouthPole"
                    type="range"
                    min={-50}
                    max={50}
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
                    style={{ width: "10.3em" }}
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
                    style={{ width: "10.3em" }}
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
                <span id="mapSize" /> px = <span id="mapSizeFriendly" />
              </div>
              <div>
                <i data-tip="Length of Meridian. Almost half of the equator length">Meridian length:</i>
                <br />
                <span id="meridianLength" data-tip="Length of Meridian in pixels" /> px =
                <span
                  id="meridianLengthFriendly"
                  data-tip="Length of Meridian is friendly units (depends on user configuration)"
                />
                <span
                  id="meridianLengthEarth"
                  data-tip="Fantasy world Meridian length relative to real-world Earth (20k km)"
                />
              </div>
              <div data-tip="Map coordinates on globe">
                <i>Coords:</i> <span id="mapCoordinates" />
              </div>
            </fieldset>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
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
                  style={{ cursor: "pointer" }}
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
          <div style={{ marginTop: "0.3em" }}>
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
        <div
          className="fmg-dialog-buttonpane"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div className="dontAsk" data-tip="Automatically update world on input changes and button clicks">
            <input id="wcAutoChange" className="checkbox" type="checkbox" defaultChecked />
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
