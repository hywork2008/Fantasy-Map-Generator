import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RiversOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riversOverview"));

  return (
    <Dialog isOpen={isOpen} title="Rivers Overview" onClose={() => closeDialog("riversOverview")}>
      <div id="riversOverviewContainer">
        <div>
          <div id="riversHeader" className="header" style={{ gridTemplateColumns: "9em 4em 7em 5em 5em 9em" }}>
            <div data-tip="Click to sort by river name" className="sortable alphabetically" data-sortby="name">
              River&nbsp;
            </div>
            <div data-tip="Click to sort by river type name" className="sortable alphabetically" data-sortby="type">
              Type&nbsp;
            </div>
            <div
              data-tip="Click to sort by discharge (flux in m3/s)"
              className="sortable icon-sort-number-down"
              data-sortby="discharge"
            >
              Discharge&nbsp;
            </div>
            <div data-tip="Click to sort by river length" className="sortable" data-sortby="length">
              Length&nbsp;
            </div>
            <div data-tip="Click to sort by river mouth width" className="sortable" data-sortby="width">
              Width&nbsp;
            </div>
            <div data-tip="Click to sort by river basin" className="sortable alphabetically" data-sortby="basin">
              Basin&nbsp;
            </div>
          </div>
          <div id="riversBody" className="table" />
          <div id="riversFooter" className="totalLine">
            <div data-tip="Rivers number" style={{ marginLeft: 4 }}>
              Rivers:&nbsp;<span id="riversFooterNumber">0</span>
            </div>
            <div data-tip="Average discharge" style={{ marginLeft: 12 }}>
              Average discharge:&nbsp;<span id="riversFooterDischarge">0</span>
            </div>
            <div data-tip="Average length" style={{ marginLeft: 12 }}>
              Length:&nbsp;<span id="riversFooterLength">0</span>
            </div>
            <div data-tip="Average mouth width" style={{ marginLeft: 12 }}>
              Width:&nbsp;<span id="riversFooterWidth">0</span>
            </div>
          </div>
          <div id="riversBottom">
            <button type="button" id="riversOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="addNewRiver"
              data-tip="Automatically add river starting from clicked cell. Hold Shift to add multiple"
              className="icon-plus"
            />
            <button
              type="button"
              id="riverCreateNew"
              data-tip="Create a new river selecting river cells"
              className="icon-map-pin"
            />
            <button
              type="button"
              id="riversBasinHighlight"
              data-tip="Toggle basin highlight mode"
              className="icon-sitemap"
            />
            <button
              type="button"
              id="riversExport"
              data-tip="Save rivers-related data as a text file (.csv)"
              className="icon-download"
            />
            <button type="button" id="riversRemoveAll" data-tip="Remove all rivers" className="icon-trash" />
            <label htmlFor="riversSearch" data-tip="Filter by name, type or basin" style={{ marginLeft: "0.2em" }}>
              Search: <input id="riversSearch" type="search" />
            </label>
          </div>
          <div id="militaryOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="militaryHeader" className="header">
              <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
                State&nbsp;
              </div>
              <div
                data-tip="Total military personnel (considering crew). Click to sort"
                id="militaryTotal"
                className="sortable icon-sort-number-down"
                data-sortby="total"
              >
                Total&nbsp;
              </div>
              <div data-tip="State population. Click to sort" className="sortable" data-sortby="population">
                Population&nbsp;
              </div>
              <div
                data-tip="Military personnel rate (% of state population). Depends on war alert. Click to sort"
                className="sortable"
                data-sortby="rate"
              >
                Rate&nbsp;
              </div>
              <div
                data-tip="War Alert. Modifier to military forces number, depends of political situation. Click to sort"
                className="sortable"
                data-sortby="alert"
              >
                War Alert&nbsp;
              </div>
            </div>
            <div id="militaryBody" className="table" data-type="absolute" />
            <div id="militaryFooter" className="totalLine">
              <div data-tip="States number" style={{ marginLeft: 4 }}>
                States:&nbsp;<span id="militaryFooterStates">0</span>
              </div>
              <div data-tip="Total military forces" style={{ marginLeft: 14 }}>
                Total forces:&nbsp;<span id="militaryFooterForcesTotal">0</span>
              </div>
              <div data-tip="Average military forces per state" style={{ marginLeft: 14 }}>
                Average forces:&nbsp;<span id="militaryFooterForces">0</span>
              </div>
              <div data-tip="Average forces rate per state" style={{ marginLeft: 14 }}>
                Average rate:&nbsp;<span id="militaryFooterRate">0%</span>
              </div>
              <div data-tip="Average War Alert" style={{ marginLeft: 14 }}>
                Average alert:&nbsp;<span id="militaryFooterAlert">0</span>
              </div>
            </div>
            <div id="militaryBottom">
              <button
                type="button"
                id="militaryOverviewRefresh"
                data-tip="Refresh the overview screen"
                className="icon-cw"
              />
              <button type="button" id="militaryOptionsButton" data-tip="Edit Military units" className="icon-cog" />
              <button
                type="button"
                id="militaryRegimentsList"
                data-tip="Show regiments list"
                className="icon-list-bullet"
              />
              <button
                type="button"
                id="militaryPercentage"
                data-tip="Toggle percentage / absolute values views"
                className="icon-percent"
              />
              <button
                type="button"
                id="militaryOverviewRecalculate"
                data-tip="Recalculate military forces based on current options"
                className="icon-retweet"
              />
              <button
                type="button"
                id="militaryExport"
                data-tip="Save military-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="militaryWiki" data-tip="Open Military Forces Tutorial" className="icon-info" />
            </div>
          </div>
          <div id="regimentsOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="regimentsHeader" className="header">
              <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
                State&nbsp;
              </div>
              <div
                data-tip="Regiment emblem and name. Click to sort by name"
                className="sortable alphabetically"
                data-sortby="name"
              >
                Name&nbsp;
              </div>
              <div
                data-tip="Total military personnel (not considering crew). Click to sort"
                id="regimentsTotal"
                className="sortable icon-sort-number-down"
                data-sortby="total"
              >
                Total&nbsp;
              </div>
            </div>
            <div id="regimentsBody" className="table" data-type="absolute" />
            <div id="regimentsBottom">
              <button
                type="button"
                id="regimentsOverviewRefresh"
                data-tip="Refresh the overview screen"
                className="icon-cw"
              />
              <button
                type="button"
                id="regimentsPercentage"
                data-tip="Toggle percentage / absolute values views"
                className="icon-percent"
              />
              <button type="button" id="regimentsAddNew" data-tip="Add new Regiment" className="icon-user-plus" />
              <div data-tip="Select state" style={{ display: "inline-block" }}>
                <span>State: </span>
                <select id="regimentsFilter" />
              </div>
              <button
                type="button"
                id="regimentsExport"
                data-tip="Save military-related data as a text file (.csv)"
                className="icon-download"
              />
            </div>
          </div>
          <div id="militaryOptions" className="dialog stable" style={{ display: "none" }}>
            <div className="table">
              <table id="militaryOptionsTable">
                <thead>
                  <tr>
                    <th data-tip="Unit icon">Icon</th>
                    <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">
                      Unit name
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed biomes">
                      Biomes
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed states">
                      States
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed cultures">
                      Cultures
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed religions">
                      Religions
                    </th>
                    <th data-tip="Conscription percentage for rural population">Rural</th>
                    <th data-tip="Conscription percentage for urban population">Urban</th>
                    <th data-tip="Average number of people in crew (used for total personnel calculation)">Crew</th>
                    <th data-tip="Unit military power (used for battle simulation)">Power</th>
                    <th data-tip="Unit type to apply special rules on forces recalculation">Type</th>
                    <th data-tip="Check if unit is separate and can be stacked only with units of the same type">
                      Separate
                    </th>
                  </tr>
                </thead>
                <tbody />
              </table>
            </div>
          </div>
          <div id="markersOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="markersHeader" className="header" style={{ gridTemplateColumns: "15em 1em 3em" }}>
              <div data-tip="Click to sort by marker type" className="sortable alphabetically" data-sortby="type">
                Type&nbsp;
              </div>
              <div
                id="markersInverPin"
                style={{ color: "#6e5e66" }}
                data-tip="Click to invert pin state for all markers"
                className="icon-pin pointer"
              />
              <div
                id="markersInverLock"
                style={{ color: "#6e5e66" }}
                data-tip="Click to invert lock state for all markers"
                className="icon-lock pointer"
              />
            </div>
            <div id="markersBody" className="table" />
            <div>
              <label htmlFor="markersSearch" data-tip="Filter by type">
                Search: <input id="markersSearch" type="search" />
              </label>
            </div>
            <div id="markersFooter" className="totalLine">
              <div data-tip="Markers number">
                Markers: <span id="markersFooterNumber">0</span> of <span id="markersFooterTotal">0</span>
              </div>
            </div>
            <div id="markersBottom">
              <button
                type="button"
                id="markersOverviewRefresh"
                data-tip="Refresh the Overview screen"
                className="icon-cw"
              />
              <input type="hidden" id="addedMarkerType" name="addedMarkerType" defaultValue="" />
              <span id="markerTypeSelectorWrapper">
                <button type="button" id="markerTypeSelector" data-tip="Select marker type for newly added markers.">
                  ❓
                </button>
                <div id="markerTypeSelectMenu" />
              </span>
              <button
                type="button"
                id="markersAddFromOverview"
                data-tip="Add a new marker. Hold Shift to add multiple"
                className="icon-plus"
              />
              <button
                type="button"
                id="markersGenerationConfig"
                data-tip="Config markers generation options"
                className="icon-cog"
              />
              <button
                type="button"
                id="markersRemoveAll"
                data-tip="Remove all unlocked markers"
                className="icon-trash"
              />
              <button
                type="button"
                id="markersExport"
                data-tip="Save markers data as a text file (.csv)"
                className="icon-download"
              />
            </div>
          </div>
          <div id="styleSaver" className="dialog stable textual" style={{ display: "none" }}>
            <div id="styleSaverHeader" style={{ padding: "2px 0" }}>
              <span>Preset name:</span>
              <input
                id="styleSaverName"
                data-tip="Enter style preset name"
                placeholder="Preset name"
                style={{ width: "12em" }}
                required
              />
              <span
                id="styleSaverTip"
                data-tip="Shows whether there is already a preset with this name"
                className="italic"
              />
            </div>
            <div id="styleSaverBody" style={{ padding: "2px 0", width: "100%" }}>
              <span>Style JSON:</span>
              <textarea
                id="styleSaverJSON"
                rows={18}
                data-tip="Style JSON is getting formed based the current settings, but can be entered manually"
                placeholder="Paste any valid style data in JSON format"
                autoCorrect="off"
                spellCheck="false"
                defaultValue={""}
              />
            </div>
            <div id="styleSaverBottom">
              <button
                type="button"
                id="styleSaverSave"
                data-tip="Save current JSON as a new style preset"
                className="icon-check"
              />
              <button
                type="button"
                id="styleSaverDownload"
                data-tip="Download the style as a .json file (can be opened in any text editor)"
                className="icon-download"
              />
              <button
                type="button"
                id="styleSaverLoad"
                data-tip="Open previously downloaded style file"
                className="icon-upload"
              />
              <button
                type="button"
                id="styleSaverCA"
                data-tip="Find or share custom style preset on Cartography Assets portal"
                className="icon-drafting-compass"
              />
            </div>
          </div>
          <div id="cellInfo" style={{ display: "none" }} className="dialog stable">
            <p>
              <b>Cell:</b> <span id="infoCell" /> <b>X:</b> <span id="infoX" /> <b>Y:</b> <span id="infoY" />
            </p>
            <p>
              <b>Latitude:</b> <span id="infoLat" />
            </p>
            <p>
              <b>Longitude:</b> <span id="infoLon" />
            </p>
            <p>
              <b>Geozone:</b> <span id="infoGeozone" />
            </p>
            <p>
              <b>Area:</b> <span id="infoArea">0</span>
            </p>
            <p>
              <b>Type:</b> <span id="infoFeature">n/a</span>
            </p>
            <p>
              <b>Precipitation:</b> <span id="infoPrec">0</span>
            </p>
            <p>
              <b>River:</b> <span id="infoRiver">no</span>
            </p>
            <p>
              <b>Population:</b> <span id="infoPopulation">0</span>
            </p>
            <p>
              <b>Elevation:</b> <span id="infoElevation">0</span>
            </p>
            <p>
              <b>Depth:</b> <span id="infoDepth">0</span>
            </p>
            <p>
              <b>Temperature:</b> <span id="infoTemp">0</span>
            </p>
            <p>
              <b>Biome:</b> <span id="infoBiome">n/a</span>
            </p>
            <p>
              <b>State:</b> <span id="infoState">n/a</span>
            </p>
            <p>
              <b>Province:</b> <span id="infoProvince">n/a</span>
            </p>
            <p>
              <b>Culture:</b> <span id="infoCulture">n/a</span>
            </p>
            <p>
              <b>Religion:</b> <span id="infoReligion">n/a</span>
            </p>
            <p>
              <b>Burg:</b> <span id="infoBurg">n/a</span>
            </p>
          </div>
          <div id="minimap" style={{ display: "none" }} className="dialog stable">
            <div id="minimapContent" />
          </div>
          <div id="options3d" className="dialog stable" style={{ display: "none" }}>
            <div id="options3dMesh" style={{ display: "none" }}>
              <div data-tip="Set map rotation speed. Set to 0 is you want to toggle off the rotation">
                <div>Rotation:</div>
                <input id="options3dMeshRotationRange" type="range" min={0} max={10} step=".1" />
                <input
                  id="options3dMeshRotationNumber"
                  type="number"
                  min={0}
                  max={10}
                  step=".1"
                  style={{ width: "4em" }}
                />
              </div>
              <div data-tip="Set height scale">
                <div>Height scale:</div>
                <input id="options3dScaleRange" type="range" min={0} max={100} />
                <input id="options3dScaleNumber" type="number" min={0} max={1000} style={{ width: "4em" }} />
              </div>
              <div data-tip="Set scene lightness">
                <div>Lightness:</div>
                <input id="options3dLightnessRange" type="range" min={0} max={100} />
                <input id="options3dLightnessNumber" type="number" min={0} max={500} style={{ width: "4em" }} />
              </div>
              <div data-tip="Set mesh texture resolution">
                <div>Texture resolution:</div>
                <select id="options3dMeshSkinResolution" style={{ width: "10em" }}>
                  <option value={512}>512x512px</option>
                  <option value={1024}>1024x1024px</option>
                  <option value={2048}>2048x2048px</option>
                  <option value={4096}>4096x4096px</option>
                  <option value={8192}>8192x8192px</option>
                </select>
              </div>
              <div data-tip="Quick preset lighting for different times of day" style={{ marginTop: "0.4em" }}>
                <label>Time of day:</label>
                <select id="options3dTimeOfDay" style={{ width: "10em", marginBottom: "0.3em" }} defaultValue="noon">
                  <option value="custom">Custom</option>
                  <option value="dawn">Dawn</option>
                  <option value="noon">Noon</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>
              <div data-tip="Set sun position (x, y) and color" style={{ marginTop: "0.4em" }}>
                <label>Sun position and color:</label>
                <div style={{ display: "flex", gap: "0.2em" }}>
                  <input
                    id="options3dSunX"
                    type="number"
                    min={-2500}
                    max={2500}
                    step={100}
                    style={{ width: "4.7em" }}
                  />
                  <input id="options3dSunY" type="number" min={0} max={5000} step={100} style={{ width: "4.7em" }} />
                  <input id="options3dSunColor" type="color" style={{ padding: 0, height: "1.5em", border: "none" }} />
                </div>
              </div>
              <div data-tip="Toggle 3d labels" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshLabels3d" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshLabels3d" className="checkbox-label">
                  <i>Show 3D labels</i>
                </label>
              </div>
              <div data-tip="Toggle sky mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshSkyMode" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshSkyMode" className="checkbox-label">
                  <i>Show sky and extend water</i>
                </label>
              </div>
              <div
                data-tip="Increases the polygon count to smooth the sharp points. Please note that it can take some time to calculate"
                style={{ margin: "0.6em 0 0.3em -0.2em" }}
              >
                <input id="options3dSubdivide" className="checkbox" type="checkbox" />
                <label htmlFor="options3dSubdivide" className="checkbox-label">
                  <i>
                    Smooth geometry <small style={{ color: "darkred" }}>[slow]</small>
                  </i>
                </label>
              </div>
              <div data-tip="Toggle wireframe mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshWireframeMode" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshWireframeMode" className="checkbox-label">
                  <i>Show wireframe</i>
                </label>
              </div>
              <div data-tip="Set sky and water color" id="options3dColorSection" style={{ display: "none" }}>
                <span>Sky:</span>
                <input
                  id="options3dMeshSky"
                  type="color"
                  style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                />
                <span>Water:</span>
                <input
                  id="options3dMeshWater"
                  type="color"
                  style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                />
              </div>
            </div>
            <div id="options3dGlobe" style={{ display: "none" }}>
              <div data-tip="Set globe rotation speed. Set to 0 is you want to toggle off the rotation">
                <div>Rotation:</div>
                <input id="options3dGlobeRotationRange" type="range" min={0} max={10} step=".1" />
                <input
                  id="options3dGlobeRotationNumber"
                  type="number"
                  min={0}
                  max={10}
                  step=".1"
                  style={{ width: "4em" }}
                />
              </div>
              <div data-tip="Set globe texture resolution">
                <div>Texture resolution:</div>
                <select id="options3dGlobeResolution" style={{ width: "5em" }}>
                  <option value="0.5">0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value={8}>8x</option>
                </select>
              </div>
              <div
                data-tip="Equirectangular projection is used: distortion is maximum on poles. Use map with aspect ratio 2:1 for best result"
                style={{ fontStyle: "italic", margin: "0.2em 0" }}
              >
                Equirectangular projection is used
              </div>
            </div>
            <div id="options3dBottom" style={{ marginTop: "0.2em" }}>
              <button type="button" id="options3dUpdate" data-tip="Update the scene" className="icon-cw" />
              <button
                type="button"
                data-tip="Configure world and map size and climate settings"
                className="icon-globe"
              />
              <button
                type="button"
                id="options3dSave"
                data-tip="Save screenshot of the 3d scene"
                className="icon-button-screenshot"
              />
              <button
                type="button"
                id="options3dOBJSave"
                data-tip="Save OBJ file of the 3d scene"
                className="icon-download"
              />
            </div>
          </div>
          <div id="preview3d" className="dialog stable" style={{ display: "none", padding: 0 }} />
        </div>
      </div>
    </Dialog>
  );
};
