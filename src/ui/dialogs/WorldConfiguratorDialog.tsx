import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
export const WorldConfiguratorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("worldConfigurator"));

  return (
    <Dialog isOpen={isOpen} title="WorldConfigurator" onClose={() => closeDialog("worldConfigurator")}>
      <div id="worldConfiguratorContainer">
        <div>
          <div style={{ display: "flex" }}>
            <div id="worldControls">
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
                  <input id="mapSizeInput" data-stored="mapSize" type="number" min={1} max={100} step="0.1" />%
                  <input id="mapSizeOutput" data-stored="mapSize" type="range" min={1} max={100} step="0.1" />
                </label>
              </div>
              <div>
                <i data-locked={0} id="lock_latitude" className="icon-lock-open" />
                <label data-tip="Set a North-South map shift, set to 50 to make map center lie on Equator">
                  <i>Latitudes:</i>
                  <input id="latitudeInput" data-stored="latitude" type="number" min={0} max={100} step="0.1" />
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
                    defaultValue={50}
                    step="0.1"
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
                  />
                  <i>E</i>
                </label>
              </div>
              <div>
                <label data-tip="Set precipitation - water amount clouds can bring. Defines rivers and biomes generation. Keep around 100% for default generation">
                  <i data-locked={0} id="lock_prec" className="icon-lock-open" />
                  <i>Precipitation:</i>
                  <input id="precInput" data-stored="prec" type="number" defaultValue={100} />%
                  <input id="precOutput" data-stored="prec" type="range" min={0} max={500} defaultValue={100} />
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
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <svg id="globe" width="22em" viewBox="-20 -25 240 240" aria-hidden="true">
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
                <g id="globeWindArrows" data-tip="Click to change wind direction" strokeLinejoin="round">
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
              <button type="button" id="restoreWinds" data-tip="Click to restore default (Earth-based) wind directions">
                Restore winds
              </button>
            </div>
          </div>
          <div style={{ marginTop: "0.3em" }}>
            <i>Presets:</i>
            <button type="button" id="wcWholeWorld" data-tip="Click to set map size to cover the whole world">
              Whole world
            </button>
            <button type="button" id="wcNorthern" data-tip="Click to set map size to cover the Northern latitudes">
              Northern
            </button>
            <button type="button" id="wcTropical" data-tip="Click to set map size to cover the Tropical latitudes">
              Tropical
            </button>
            <button type="button" id="wcSouthern" data-tip="Click to set map size to cover the Southern latitudes">
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
          <button type="button" className="fmg-dialog-button" onClick={() => window.updateWorld?.()}>
            Update world
          </button>
        </div>
      </div>
    </Dialog>
  );
};
