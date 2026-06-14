import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const EmblemEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("emblemEditor"));

  return (
    <Dialog isOpen={isOpen} title="Emblem Editor" onClose={() => closeDialog("emblemEditor")}>
      <div id="emblemEditorContainer">
        <div>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <use id="emblemImage" />
          </svg>
          <div id="emblemBody">
            <div>
              <b id="emblemArmiger" />
            </div>
            <hr />
            <div data-tip="Select state">
              <div className="label">State:</div>
              <select id="emblemStates" />
            </div>
            <div data-tip="Select province in state">
              <div className="label">Province:</div>
              <select id="emblemProvinces" />
            </div>
            <div data-tip="Select burg in province or state">
              <div className="label">Burg:</div>
              <select id="emblemBurgs" />
            </div>
            <hr />
            <div data-tip="Select shape of the emblem">
              <div className="label">Shape:</div>
              <select id="emblemShapeSelector">
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
                <optgroup label="Middle Earth">
                  <option value="noldor">Noldor</option>
                  <option value="gondor">Gondor</option>
                  <option value="easterling">Easterling</option>
                  <option value="erebor">Erebor</option>
                  <option value="ironHills">Iron Hills</option>
                  <option value="urukHai">UrukHai</option>
                  <option value="moriaOrc">Moria Orc</option>
                </optgroup>
              </select>
            </div>
            <div data-tip="Set size of particular Emblem. To hide set to 0. To change the entire category go to Menu ⭢ Style ⭢ Emblems">
              <div className="label" style={{ width: "2.8em" }}>
                Size:
              </div>
              <input id="emblemSizeSlider" type="range" min={0} max={5} step=".1" style={{ width: "7em" }} />
              <input id="emblemSizeNumber" type="number" min={0} max={5} step=".1" />
            </div>
          </div>
          <div id="emblemsBottom">
            <button type="button" id="emblemsRegenerate" data-tip="Regenerate emblem" className="icon-shuffle" />
            <button
              type="button"
              id="emblemsArmoria"
              data-tip="Edit the emblem in Armoria - dedicated heraldry editor. Download emblem and upload it back map the generator"
              className="icon-brush"
            />
            <button
              type="button"
              id="emblemsDownload"
              data-tip="Set size, select file format and download emblem image"
              className="icon-download"
            />
            <button
              type="button"
              id="emblemsUpload"
              data-tip="Upload png, jpg or svg image from Armoria or other sources as emblem"
              className="icon-upload"
            />
            <button
              type="button"
              id="emblemsGallery"
              data-tip="Download emblems gallery as html document (open in browser; downloading takes some time)"
              className="icon-layer-group"
            />
            <button
              type="button"
              id="emblemsFocus"
              data-tip="Show emblem associated area or place"
              className="icon-target"
            />
          </div>
          <div id="emblemUploadControl" className="hidden">
            <button
              type="button"
              id="emblemsUploadImage"
              data-tip="Upload SVG or PNG image from any source. Make sure background is transparent"
            >
              Any image
            </button>
            <button
              type="button"
              id="emblemsUploadSVG"
              data-tip="Upload prepared SVG image (SVG from Armoria or SVG processed with 'Optimize vector' tool)"
            >
              Prepared SVG
            </button>
            <a
              href="https://www.iloveimg.com/compress-image"
              target="_blank"
              data-tip="Use external tool to compress/resize raster images before upload"
              rel="noopener"
            >
              Comperess raster
            </a>
            <span> | </span>
            <a
              href="https://jakearchibald.github.io/svgomg"
              target="_blank"
              data-tip="Use external tool to optimize vector images before upload"
              rel="noopener"
            >
              Optimize vector
            </a>
          </div>
          <div id="emblemDownloadControl" className="hidden">
            <input
              id="emblemsDownloadSize"
              data-tip="Set image size in pixels"
              type="number"
              defaultValue={500}
              step={100}
              min={100}
              max={10000}
            />
            <button
              type="button"
              id="emblemsDownloadSVG"
              data-tip="Download as SVG: scalable vector image. Best quality, can be opened in browser or Inkscape"
            >
              SVG
            </button>
            <button
              type="button"
              id="emblemsDownloadPNG"
              data-tip="Download as PNG: lossless raster image with transparent background"
            >
              PNG
            </button>
            <button
              type="button"
              id="emblemsDownloadJPG"
              data-tip="Download as JPG: lossy compressed raster image with solid white background"
            >
              JPG
            </button>
          </div>
          <div id="unitsEditor" className="dialog stable" style={{ display: "none" }}>
            <div id="unitsBody" style={{ marginLeft: "1.1em" }}>
              <div className="unitsHeader" style={{ marginTop: "0.4em" }}>
                <span className="icon-map-signs" />
                <label>Distance:</label>
              </div>
              <div data-tip="Select a distance unit or provide a custom name">
                <label>Distance unit:</label>
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
                <slider-input
                  id="distanceScaleInput"
                  data-stored="distanceScale"
                  min=".01"
                  max={20}
                  step=".1"
                  value={3}
                >
                  <label>1 map pixel:</label>
                </slider-input>
              </div>
              <div data-tip="Area unit name, type &quot;square&quot; to add ² to the distance unit">
                <label>Area unit:</label>
                <input id="areaUnit" data-stored="areaUnit" type="text" defaultValue="square" />
              </div>
              <div className="unitsHeader">
                <span className="icon-signal" />
                <label>Altitude:</label>
              </div>
              <div data-tip="Select an altitude unit or provide a custom name">
                <label>Height unit:</label>
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
                  <label>Exponent:</label>
                </slider-input>
              </div>
              <div className="unitsHeader" data-tip="Select Temperature scale">
                <span className="icon-temperature-high" />
                <label>Temperature:</label>
              </div>
              <div>
                <label>Temperature scale:</label>
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
                <label>Population:</label>
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
                  <label>1 population point:</label>
                </slider-input>
              </div>
              <div data-tip="Set urban population modifier. Change to increase or descrese burgs population">
                <slider-input id="urbanizationInput" data-stored="urbanization" min=".01" max={5} step=".01" value={1}>
                  <label>Urbanization rate:</label>
                </slider-input>
              </div>
              <div data-tip="Set urban density: average population per building in Medieval Fantasy City Generator">
                <slider-input id="urbanDensityInput" data-stored="urbanDensity" min={1} max={200} step={1} value={10}>
                  <label>Urban density:</label>
                </slider-input>
              </div>
            </div>
            <div id="unitsBottom">
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
          <div id="burgsOverview" className="dialog stable" style={{ display: "none" }}>
            <div
              id="burgsHeader"
              className="header"
              style={{ gridTemplateColumns: "9em 7em 7.5em 7.2em 6.5em 7em 6em" }}
            >
              <div data-tip="Click to sort by burg name" className="sortable alphabetically" data-sortby="name">
                Burg
              </div>
              <div data-tip="Click to sort by province name" className="sortable alphabetically" data-sortby="province">
                Province
              </div>
              <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="state">
                State
              </div>
              <div data-tip="Click to sort by culture name" className="sortable alphabetically" data-sortby="culture">
                Culture
              </div>
              <div data-tip="Click to sort by culture group" className="sortable alphabetically" data-sortby="group">
                Group
              </div>
              <div
                data-tip="Click to sort by burg population"
                className="sortable icon-sort-number-down"
                data-sortby="population"
              >
                Population
              </div>
              <div data-tip="Click to sort by burg features" className="sortable alphabetically" data-sortby="features">
                Features&nbsp;
              </div>
            </div>
            <div id="burgsBody" className="table" />
            <div
              id="burgsFilters"
              data-tip="Apply a filter"
              style={{ paddingBlock: "0.1em", display: "flex", gap: "0.5em", width: "100%" }}
            >
              <label htmlFor="burgsSearch" data-tip="Filter by name, province, state, culture, or group">
                Search: <input id="burgsSearch" type="search" />
              </label>
              <label htmlFor="burgsFilterState">
                State:
                <select id="burgsFilterState" />
              </label>
              <label htmlFor="burgsFilterCulture">
                Culture:
                <select id="burgsFilterCulture" />
              </label>
            </div>
            <div id="burgsFooter" className="totalLine">
              <div data-tip="Burgs displayed" style={{ marginLeft: 4 }}>
                Burgs:&nbsp;<span id="burgsFooterBurgs">0 of 0</span>
              </div>
              <div data-tip="Average population" style={{ marginLeft: 14 }}>
                Average population:&nbsp;<span id="burgsFooterPopulation">0</span>
              </div>
            </div>
            <div id="burgsBottom">
              <button type="button" id="burgsOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button type="button" id="burgsGroupsEditorButton" data-tip="Edit burg groups" className="icon-cog" />
              <button type="button" id="burgsChart" data-tip="Show burgs bubble chart" className="icon-chart-area" />
              <button
                type="button"
                id="regenerateBurgNames"
                data-tip="Regenerate burg names based on assigned culture"
                className="icon-retweet"
              />
              <button
                type="button"
                id="addNewBurg"
                data-tip="Add a new burg. Hold Shift to add multiple"
                className="icon-plus"
              />
              <button
                type="button"
                id="burgsExport"
                data-tip="Save burgs-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="burgNamesImport" data-tip="Rename burgs in bulk" className="icon-upload" />
              <button type="button" id="burgsLockAll" data-tip="Lock or unlock all burgs" className="icon-lock" />
              <button
                type="button"
                id="burgsRemoveAll"
                data-tip="Remove all unlocked burgs except for capitals. To remove a capital remove its state first"
                className="icon-trash"
              />
            </div>
          </div>
          <div id="burgGroupsEditor" className="dialog stable" style={{ display: "none" }}>
            <form id="burgGroupsForm">
              <table className="table">
                <thead>
                  <tr>
                    <th data-tip="Rendering order: higher values are rendered on top">Order</th>
                    <th data-tip="Type group name">Name</th>
                    <th data-tip="Burg preview generator">Preview generator</th>
                    <th data-tip="Set min population constraint" colSpan={3}>
                      Population
                    </th>
                    <th data-tip="Select allowed biomes">Biomes</th>
                    <th data-tip="Select allowed states">States</th>
                    <th data-tip="Select allowed cultures">Cultures</th>
                    <th data-tip="Select allowed religions">Religions</th>
                    <th data-tip="Select allowed features">Features</th>
                    <th data-tip="Number of burgs in group">Count</th>
                    <th data-tip="Activate/deactivate group">Active</th>
                    <th data-tip="Select group to be assigned if burg doesn't pass the criteria for other groups">
                      Default
                    </th>
                  </tr>
                </thead>
                <tbody id="burgGroupsBody" />
              </table>
            </form>
          </div>
          <div id="routesOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="routesHeader" className="header" style={{ gridTemplateColumns: "17em 8em 8em" }}>
              <div data-tip="Click to sort by route name" className="sortable alphabetically" data-sortby="name">
                Route&nbsp;
              </div>
              <div data-tip="Click to sort by route group" className="sortable alphabetically" data-sortby="group">
                Group&nbsp;
              </div>
              <div
                data-tip="Click to sort by route length"
                className="sortable icon-sort-number-down"
                data-sortby="length"
              >
                Length&nbsp;
              </div>
            </div>
            <div id="routesBody" className="table" />
            <div id="routesFooter" className="totalLine">
              <div data-tip="Routes number" style={{ marginLeft: 4 }}>
                Routes:&nbsp;<span id="routesFooterNumber">0</span>
              </div>
              <div data-tip="Average length" style={{ marginLeft: 12 }}>
                Average length:&nbsp;<span id="routesFooterLength">0</span>
              </div>
            </div>
            <div id="routesBottom">
              <button type="button" id="routesOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button
                type="button"
                id="routesCreateNew"
                data-tip="Create a new route selecting route cells"
                className="icon-map-pin"
              />
              <button
                type="button"
                id="routesExport"
                data-tip="Save routes-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="routesLockAll" data-tip="Lock or unlock all routes" className="icon-lock" />
              <button
                type="button"
                id="routesRemoveAll"
                data-tip="Remove all unlocked routes (locked routes are kept)"
                className="icon-trash"
              />
              <label htmlFor="routesSearch" data-tip="Filter by name or group" style={{ marginLeft: "0.2em" }}>
                Search: <input id="routesSearch" type="search" />
              </label>
            </div>
          </div>
          <div id="riversOverview" className="dialog stable" style={{ display: "none" }}>
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
