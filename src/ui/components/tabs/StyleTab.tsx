import { useEffect } from "react";
import {
  addStylePreset,
  applyBurgIconsIcon,
  applyBurgIconsLinejoin,
  applyClipping,
  applyCoastlineAuto,
  applyCompassShiftX,
  applyCompassShiftY,
  applyFillColor,
  applyFontShiftX,
  applyFontShiftY,
  applyFontSize,
  applyFontSizeMinus,
  applyFontSizePlus,
  applyGridScale,
  applyGridShiftX,
  applyGridShiftY,
  applyGridType,
  applyHeightmapCurve,
  applyHeightmapRenderOcean,
  applyHeightmapScheme,
  applyLabelsHideGroup,
  applyLegendBack,
  applyMapFilterButton,
  applyOceanFill,
  applyOceanPattern,
  applyOutlineLayers,
  applyPopulationRuralStroke,
  applyPopulationUrbanStroke,
  applyReliefSet,
  applyRescaleMarkers,
  applyScaleBarInput,
  applyShadow,
  applySliderChange,
  applyStatesBodyFilter,
  applyStrokeColor,
  applyStrokeDasharray,
  applyStrokeLinecap,
  applyStyleFilter,
  applyTemperatureFill,
  applyTextureSelect,
  applyTextureShiftX,
  applyTextureShiftY,
  applyVignetteHeight,
  applyVignettePreset,
  applyVignetteRx,
  applyVignetteRy,
  applyVignetteWidth,
  applyVignetteX,
  applyVignetteY,
  changeFont,
  initStyleTab,
  openHeightmapSchemeDialog,
  requestRemoveStylePreset,
  requestStylePresetChange,
  selectStyleElement,
  textureProvideURL,
  VIGNETTE_PRESETS
} from "../../../controllers/style";
import { invokeActiveZooming } from "../../../main";
import { fonts } from "../../../services/fonts";
import { useExtensionState } from "../../../store/extensionState";
import { useStyleState } from "../../../store/styleState";
import { openDialog } from "../../dialogs/dialogService";
import { SliderInput } from "../SliderInput";

const CUSTOM_PRESET_PREFIX = "fmgStyle_";

const CORE_STYLE_OPTIONS = [
  { value: "anchors", label: "Anchor Icons" },
  { value: "biomes", label: "Biomes" },
  { value: "borders", label: "Borders" },
  { value: "burgIcons", label: "Burg Icons" },
  { value: "cells", label: "Cells" },
  { value: "coastline", label: "Coastline" },
  { value: "coordinates", label: "Coordinates" },
  { value: "cults", label: "Cultures" },
  { value: "emblems", label: "Emblems" },
  { value: "fogging", label: "Fogging" },
  { value: "gridOverlay", label: "Grid" },
  { value: "terrs", label: "Heightmap" },
  { value: "ice", label: "Ice" },
  { value: "labels", label: "Labels" },
  { value: "lakes", label: "Lakes" },
  { value: "landmass", label: "Landmass" },
  { value: "legend", label: "Legend" },
  { value: "markers", label: "Markers" },
  { value: "armies", label: "Military" },
  { value: "ocean", label: "Ocean" },
  { value: "population", label: "Population" },
  { value: "prec", label: "Precipitation" },
  { value: "provs", label: "Provinces" },
  { value: "terrain", label: "Relief Icons" },
  { value: "relig", label: "Religions" },
  { value: "rivers", label: "Rivers" },
  { value: "routes", label: "Routes" },
  { value: "ruler", label: "Rulers" },
  { value: "scaleBar", label: "Scale Bar" },
  { value: "regions", label: "States" },
  { value: "temperature", label: "Temperature" },
  { value: "texture", label: "Texture" },
  { value: "vignette", label: "Vignette" },
  { value: "compass", label: "Wind Rose" },
  { value: "zones", label: "Zones" }
];

export function StyleTab() {
  const visibility = useStyleState(state => state.visibility);
  const values = useStyleState(state => state.values);
  const options = useStyleState(state => state.options);
  const activeElement = useStyleState(state => state.activeElement);
  const activeGroup = useStyleState(state => state.activeGroup);
  const activePreset = useStyleState(state => state.activePreset);
  const systemPresets = useStyleState(state => state.systemPresets);
  const customPresets = useStyleState(state => state.customPresets);
  const activeMapFilter = useStyleState(state => state.activeMapFilter);

  const styleConfigs = useExtensionState(state => state.styleConfigs);
  const enabledExtensions = useExtensionState(state => state.enabledExtensions);
  const extensionConfigs = styleConfigs.filter(c => enabledExtensions[c.extensionId]);

  const isSystemPreset = systemPresets.includes(activePreset);

  const styleOptions = [...CORE_STYLE_OPTIONS, ...extensionConfigs.flatMap(config => config.elements ?? [])].sort(
    (a, b) => a.label.localeCompare(b.label)
  );

  useEffect(() => {
    initStyleTab();
  }, []);

  const str = (key: string, fallback = "") => String(values[key] ?? fallback);
  const num = (key: string, fallback = "0") => String(values[key] ?? fallback);
  const bool = (key: string) => values[key] === "1" || values[key] === 1;

  const slider = (id: string, min: string, max: string, step: string) => (
    <SliderInput
      id={id}
      min={min}
      max={max}
      step={step}
      value={values[id] ?? ""}
      onChange={v => applySliderChange(id, v)}
    />
  );

  const filterOptions = options.styleFilterInput ?? [];
  const scaleBarFilterOptions = options.styleScaleBarBackgroundFilter ?? [];
  const statesBodyFilterOptions = options.styleStatesBodyFilter ?? [];
  const heightmapSchemeOptions = options.styleHeightmapScheme ?? [];
  const groupOptions = options.styleGroupSelect ?? [];
  const textureCustomOptions = options.styleTextureCustom ?? [];

  return (
    <div id="styleContent" className="tabcontent" style={{ display: "block" }}>
      <p
        data-tip="Select a style preset. State labels may required regeneration if font is changed"
        style={{ display: "inline-block" }}
      >
        Style preset:
      </p>
      <select
        data-tip="Select a style preset"
        id="stylePreset"
        value={activePreset}
        onChange={e => requestStylePresetChange(e.target.value)}
        style={{ width: "45%", textTransform: "capitalize" }}
      >
        {systemPresets.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {customPresets.map(name => (
          <option key={CUSTOM_PRESET_PREFIX + name} value={CUSTOM_PRESET_PREFIX + name}>
            {name} [custom]
          </option>
        ))}
      </select>
      <button
        id="addStyleButton"
        data-tip="Click to save current style as a new preset"
        className="icon-plus sideButton"
        style={{ display: "inline-block" }}
        onClick={() => addStylePreset()}
        type="button"
      ></button>
      <button
        id="removeStyleButton"
        data-tip="Click to remove current custom style preset"
        className="icon-minus sideButton"
        style={{ display: isSystemPreset ? "none" : "inline-block" }}
        onClick={() => requestRemoveStylePreset()}
        type="button"
      ></button>

      <p data-tip="Select an element to edit its style" style={{ display: "inline-block" }}>
        Select element:
      </p>
      <select
        data-tip="Select an element to edit its style (list is ordered alphabetically)"
        id="styleElementSelect"
        style={{ width: "42%" }}
        value={activeElement}
        onChange={e => {
          useStyleState.getState().setActiveElement(e.target.value);
          selectStyleElement();
        }}
      >
        {styleOptions.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <table id="styleElements">
        <caption id="styleIsOff" data-tip="The selected layer is not visible. Toogle it on to see style changes effect">
          Ensure the element visibility is toggled on!
        </caption>

        <tbody id="styleGroup" style={{ display: visibility.styleGroup ? "block" : "none" }}>
          <tr data-tip="Select element group">
            <td>
              <b>Group</b>
            </td>
            <td>
              <select
                id="styleGroupSelect"
                value={activeGroup}
                onChange={e => {
                  useStyleState.getState().setActiveGroup(e.target.value);
                  selectStyleElement();
                }}
              >
                {groupOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        </tbody>

        <tbody id="styleHeightmap" style={{ display: visibility.styleHeightmap ? "block" : "none" }}>
          <tr
            id="styleHeightmapRenderOceanOption"
            data-tip="Check to render ocean heights"
            style={{ display: str("styleHeightmapRenderOceanOptionVisible") === "1" ? "block" : "none" }}
          >
            <td colSpan={2}>
              <input
                id="styleHeightmapRenderOcean"
                className="checkbox"
                type="checkbox"
                checked={bool("styleHeightmapRenderOcean")}
                onChange={e => applyHeightmapRenderOcean(e.target.checked)}
              />
              <label htmlFor="styleHeightmapRenderOcean" className="checkbox-label">
                Render ocean heights
              </label>
            </td>
          </tr>

          <tr data-tip="Terracing power. Set to 0 to toggle off">
            <td>Terracing</td>
            <td>{slider("styleHeightmapTerracing", "0", "20", "1")}</td>
          </tr>

          <tr data-tip="Layers reduction rate. Increase to improve performance">
            <td>Reduce layers</td>
            <td>{slider("styleHeightmapSkip", "0", "10", "1")}</td>
          </tr>

          <tr data-tip="Line simplification rate. Increase to slightly improve performance">
            <td>Simplify line</td>
            <td>{slider("styleHeightmapSimplification", "0", "10", "1")}</td>
          </tr>

          <tr data-tip="Select line interpolation type">
            <td>Line style</td>
            <td>
              <select
                id="styleHeightmapCurve"
                value={str("styleHeightmapCurve")}
                onChange={e => applyHeightmapCurve(e.target.value)}
              >
                <option value="curveBasisClosed">Curved</option>
                <option value="curveLinear">Linear</option>
                <option value="curveStep">Rectangular</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Select color scheme for the element">
            <td>Color scheme</td>
            <td>
              <select
                id="styleHeightmapScheme"
                style={{ width: "86%" }}
                value={str("styleHeightmapScheme")}
                onChange={e => applyHeightmapScheme(e.target.value)}
              >
                {heightmapSchemeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                id="openCreateHeightmapSchemeButton"
                data-tip="Click to add a custom heightmap color scheme"
                className="icon-plus sideButton"
                type="button"
                onClick={openHeightmapSchemeDialog}
              ></button>
            </td>
          </tr>
        </tbody>

        <tbody id="styleOpacity" style={{ display: visibility.styleOpacity ? "block" : "none" }}>
          <tr data-tip="Set opacity. 0: transparent, 1: solid">
            <td>Opacity</td>
            <td>{slider("styleOpacityInput", "0", "1", "0.01")}</td>
          </tr>
        </tbody>

        <tbody id="styleLegend" style={{ display: visibility.styleLegend ? "block" : "none" }}>
          <tr data-tip="Set maximum number of items in one column">
            <td>Column items</td>
            <td>{slider("styleLegendColItems", "1", "30", "1")}</td>
          </tr>

          <tr data-tip="Set background color">
            <td>Background</td>
            <td>
              <input
                id="styleLegendBack"
                type="color"
                value={str("styleLegendBack", "#ffffff")}
                onChange={e => applyLegendBack(e.target.value)}
              />
              <output id="styleLegendBackOutput">{str("styleLegendBack", "#ffffff")}</output>
            </td>
          </tr>

          <tr data-tip="Set background opacity">
            <td>Opacity</td>
            <td>{slider("styleLegendOpacity", "0", "1", ".01")}</td>
          </tr>
        </tbody>

        <tbody id="stylePopulation" style={{ display: visibility.stylePopulation ? "block" : "none" }}>
          <tr data-tip="Set bar color for rural population">
            <td>Rural color</td>
            <td>
              <input
                id="stylePopulationRuralStrokeInput"
                type="color"
                value={str("stylePopulationRuralStrokeInput", "#0000ff")}
                onChange={e => applyPopulationRuralStroke(e.target.value)}
              />
              <output id="stylePopulationRuralStrokeOutput">{str("stylePopulationRuralStrokeInput", "#0000ff")}</output>
            </td>
          </tr>

          <tr data-tip="Set bar color for urban population">
            <td>Urban color</td>
            <td>
              <input
                id="stylePopulationUrbanStrokeInput"
                type="color"
                value={str("stylePopulationUrbanStrokeInput", "#ff0000")}
                onChange={e => applyPopulationUrbanStroke(e.target.value)}
              />
              <output id="stylePopulationUrbanStrokeOutput">{str("stylePopulationUrbanStrokeInput", "#ff0000")}</output>
            </td>
          </tr>
        </tbody>

        <tbody id="styleTexture" style={{ display: visibility.styleTexture ? "block" : "none" }}>
          <tr data-tip="Select texture image. Big textures can highly affect performance">
            <td>Image</td>
            <td>
              <select
                id="styleTextureInput"
                style={{ width: "86%" }}
                value={str("styleTextureInput")}
                onChange={e => applyTextureSelect(e.target.value)}
              >
                <option value="">No texture</option>
                <option value="./images/textures/folded-paper-big.jpg">Folded paper big</option>
                <option value="./images/textures/folded-paper-small.jpg">Folded paper small</option>
                <option value="./images/textures/gray-paper.jpg">Gray paper</option>
                <option value="./images/textures/soiled-paper.jpg">Soiled paper horizontal</option>
                <option value="./images/textures/soiled-paper-vertical.jpg">Soided paper vertical</option>
                <option value="./images/textures/plaster.jpg">Plaster</option>
                <option value="./images/textures/ocean.jpg">Ocean</option>
                <option value="./images/textures/antique-small.jpg">Antique small</option>
                <option value="./images/textures/antique-big.jpg">Antique big</option>
                <option value="./images/textures/pergamena-small.jpg">Pergamena small</option>
                <option value="./images/textures/marble-big.jpg">Marble big</option>
                <option value="./images/textures/marble-small.jpg">Marble small</option>
                <option value="./images/textures/marble-blue-small.jpg">Marble Blue</option>
                <option value="./images/textures/marble-blue-big.jpg">Marble Blue big</option>
                <option value="./images/textures/stone-small.jpg">Stone small</option>
                <option value="./images/textures/stone-big.jpg">Stone big</option>
                <option value="./images/textures/timbercut-small.jpg">Timber Cut small</option>
                <option value="./images/textures/timbercut-big.jpg">Timber Cut big</option>
                <option value="./images/textures/mars-small.jpg">Mars small</option>
                <option value="./images/textures/mars-big.jpg">Mars big</option>
                <option value="./images/textures/mercury-small.jpg">Mercury small</option>
                <option value="./images/textures/mercury-big.jpg">Mercury big</option>
                <option value="./images/textures/mauritania-small.jpg">Mauritania small</option>
                <option value="./images/textures/iran-small.jpg">Iran small</option>
                <option value="./images/textures/spain-small.jpg">Spain small</option>
                {textureCustomOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                data-tip="Click and provide a URL to image to be set as a texture"
                className="icon-plus sideButton"
                onClick={() => textureProvideURL()}
                type="button"
              ></button>
            </td>
          </tr>

          <tr data-tip="Shift the texture by axes">
            <td>Shift by axes</td>
            <td>
              <input
                id="styleTextureShiftX"
                type="number"
                value={num("styleTextureShiftX", "0")}
                data-tip="Shift texture by x axis in pixels"
                onChange={e => applyTextureShiftX(e.target.value)}
              />
              <input
                id="styleTextureShiftY"
                type="number"
                value={num("styleTextureShiftY", "0")}
                data-tip="Shift texture by y axis in pixels"
                onChange={e => applyTextureShiftY(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleVignette" style={{ display: visibility.styleVignette ? "block" : "none" }}>
          <tr data-tip="Select precreated vignette">
            <td>Preset</td>
            <td>
              <select id="styleVignettePreset" onChange={e => applyVignettePreset(e.target.value)}>
                {Object.keys(VIGNETTE_PRESETS).map(preset => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr data-tip="Vignette rectangle position (in percents)">
            <td>Position</td>
            <td style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div>
                <span>x </span>
                <input
                  id="styleVignetteX"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  style={{ width: "5em" }}
                  value={num("styleVignetteX")}
                  onChange={e => applyVignetteX(e.target.value)}
                />
                <span>width&nbsp; </span>
                <input
                  id="styleVignetteWidth"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  style={{ width: "5em" }}
                  value={num("styleVignetteWidth")}
                  onChange={e => applyVignetteWidth(e.target.value)}
                />
              </div>
              <div>
                <span>y </span>
                <input
                  id="styleVignetteY"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  style={{ width: "5em" }}
                  value={num("styleVignetteY")}
                  onChange={e => applyVignetteY(e.target.value)}
                />
                <span>height </span>
                <input
                  id="styleVignetteHeight"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  style={{ width: "5em" }}
                  value={num("styleVignetteHeight")}
                  onChange={e => applyVignetteHeight(e.target.value)}
                />
              </div>
            </td>
          </tr>

          <tr data-tip="Set vignette X and Y radius (in percents)">
            <td>Radius</td>
            <td>
              <span>x </span>
              <input
                id="styleVignetteRx"
                type="number"
                min="0"
                max="50"
                style={{ width: "5em" }}
                value={num("styleVignetteRx")}
                onChange={e => applyVignetteRx(e.target.value)}
              />
              <span>y </span>
              <input
                id="styleVignetteRy"
                type="number"
                min="0"
                max="50"
                style={{ width: "5em" }}
                value={num("styleVignetteRy")}
                onChange={e => applyVignetteRy(e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Set vignette blue propagation (in pixels)">
            <td>Blur</td>
            <td>{slider("styleVignetteBlur", "0", "400", "1")}</td>
          </tr>
        </tbody>

        <tbody id="styleOcean" style={{ display: visibility.styleOcean ? "block" : "none" }}>
          <tr data-tip="Select ocean pattern">
            <td>Pattern</td>
            <td>
              <select
                id="styleOceanPattern"
                value={str("styleOceanPattern")}
                onChange={e => applyOceanPattern(e.target.value)}
              >
                <option value="">No pattern</option>
                <option value="./images/pattern1.png">Pattern 1</option>
                <option value="./images/pattern2.png">Pattern 2</option>
                <option value="./images/pattern3.png">Pattern 3</option>
                <option value="./images/pattern4.png">Pattern 4</option>
                <option value="./images/pattern5.png">Pattern 5</option>
                <option value="./images/pattern6.png">Pattern 6</option>
                <option value="./images/kiwiroo.png">Kiwiroo</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Set ocean pattern opacity">
            <td>Pattern opacity</td>
            <td>{slider("styleOceanPatternOpacity", "0", "1", ".01")}</td>
          </tr>

          <tr data-tip="Define the coast outline contours scheme">
            <td>Ocean layers</td>
            <td>
              <select
                id="outlineLayers"
                value={str("outlineLayers")}
                onChange={e => applyOutlineLayers(e.target.value)}
              >
                <option value="none">No outline</option>
                <option value="random">Random</option>
                <option value="-6,-3,-1">Standard 3</option>
                <option value="-6,-4,-2">Indented 3</option>
                <option value="-9,-6,-3,-1">Standard 4</option>
                <option value="-6,-5,-4,-3,-2,-1">Smooth 6</option>
                <option value="-9,-8,-7,-6,-5,-4,-3,-2,-1">Smooth 9</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Set ocean color">
            <td>Color</td>
            <td>
              <input
                id="styleOceanFill"
                type="color"
                value={str("styleOceanFill", "#466eab")}
                onChange={e => applyOceanFill(e.target.value)}
              />
              <output id="styleOceanFillOutput">{str("styleOceanFill", "#466eab")}</output>
            </td>
          </tr>
        </tbody>

        <tbody id="styleBurgIcons" style={{ display: visibility.styleBurgIcons ? "block" : "none" }}>
          <tr data-tip="Select group icon">
            <td>Icon</td>
            <td>
              <select
                id="styleBurgIconsIcon"
                value={str("styleBurgIconsIcon")}
                onChange={e => applyBurgIconsIcon(e.target.value)}
              >
                <option value="#icon-circle">Circle</option>
                <option value="#icon-square">Square</option>
                <option value="#icon-triangle">Triangle</option>
                <option value="#icon-cross">Cross</option>
                <option value="#icon-star">Star</option>
                <option value="#icon-circled">Circled</option>
                <option value="#icon-squared">Squared</option>
                <option value="#icon-star-circled">Star circled</option>
                <option value="#icon-star-circled-empty">Star circled empty</option>
                <option value="#icon-star-squared">Star squared</option>
                <option value="#icon-watabou-capital">Watabou capital</option>
                <option value="#icon-watabou-city">Watabou city</option>
                <option value="#icon-watabou-town">Watabou town</option>
                <option value="#icon-watabou-village">Watabou village</option>
                <option value="#icon-watabou-hamlet">Watabou hamlet</option>
                <option value="#icon-watabou-fort">Watabou fort</option>
                <option value="#icon-watabou-monastery">Watabou monastery</option>
                <option value="#icon-watabou-caravanserai">Watabou caravanserai</option>
                <option value="#icon-watabou-post">Watabou trade post</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Set icon size">
            <td>Icon size</td>
            <td>{slider("styleBurgIconsIconSize", "0.01", "20", ".01")}</td>
          </tr>

          <tr data-tip="Set icon stroke linejoin">
            <td>Stroke linejoin</td>
            <td>
              <select
                id="styleBurgIconsStrokeLinejoin"
                value={str("styleBurgIconsStrokeLinejoin")}
                onChange={e => applyBurgIconsLinejoin(e.target.value)}
              >
                <option value="inherit">Inherit</option>
                <option value="butt">Butt</option>
                <option value="round">Round</option>
                <option value="square">Square</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Define transparency of fill color">
            <td>Fill opacity</td>
            <td>{slider("styleBurgIconsFillOpacity", "0", "1", ".01")}</td>
          </tr>
        </tbody>

        <tbody id="styleGrid" style={{ display: visibility.styleGrid ? "block" : "none" }}>
          <tr data-tip="Select grid overlay type">
            <td>Type</td>
            <td>
              <select id="styleGridType" value={str("styleGridType")} onChange={e => applyGridType(e.target.value)}>
                <option value="pointyHex">Hex grid (pointy)</option>
                <option value="flatHex">Hex grid (flat)</option>
                <option value="square">Square grid</option>
                <option value="square45deg">Square 45 degrees grid</option>
                <option value="squareTruncated">Truncated square grid</option>
                <option value="squareTetrakis">Tetrakis square grid</option>
                <option value="triangleHorizontal">Triangle grid (horizontal)</option>
                <option value="triangleVertical">Triangle grid (vertical)</option>
                <option value="trihexagonal">Trihexagonal grid</option>
                <option value="rhombille">Rhombille grid</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Set grid cells scale multiplier">
            <td>Scale</td>
            <td>
              <input
                id="styleGridScale"
                type="number"
                min=".1"
                max="10"
                step=".01"
                value={num("styleGridScale", "1")}
                onChange={e => applyGridScale(e.target.value)}
              />
              <output id="styleGridSizeFriendly" data-tip="Distance between grid cell centers (in map scale)">
                {str("styleGridSizeFriendly")}
              </output>
              <a
                href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Scale-and-distance#grids"
                target="_blank"
                rel="noopener"
              >
                <span
                  data-tip="Open wiki article scale and distance to know about grid scale"
                  className="icon-info-circled pointer"
                ></span>
              </a>
            </td>
          </tr>

          <tr data-tip="Shift the element by axes">
            <td>Shift by axes</td>
            <td>
              <input
                id="styleGridShiftX"
                type="number"
                data-tip="Shift by x axis in pixels"
                value={num("styleGridShiftX")}
                onChange={e => applyGridShiftX(e.target.value)}
              />
              <input
                id="styleGridShiftY"
                type="number"
                data-tip="Shift by y axis in pixels"
                value={num("styleGridShiftY")}
                onChange={e => applyGridShiftY(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleCompass" style={{ display: visibility.styleCompass ? "block" : "none" }}>
          <tr data-tip="Set wind (compass) rose size">
            <td>Size</td>
            <td>{slider("styleCompassSizeInput", ".02", "1", ".01")}</td>
          </tr>

          <tr data-tip="Shift wind (compass) rose by axes">
            <td>Shift by axes</td>
            <td>
              <input
                id="styleCompassShiftX"
                type="number"
                value={num("styleCompassShiftX", "80")}
                data-tip="Shift by x axis in pixels"
                onChange={e => applyCompassShiftX(e.target.value)}
              />
              <input
                id="styleCompassShiftY"
                type="number"
                value={num("styleCompassShiftY", "80")}
                onChange={e => applyCompassShiftY(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleRelief" style={{ display: visibility.styleRelief ? "block" : "none" }}>
          <tr data-tip="Select set of relief icons. All relief icons will be regenerated">
            <td>Style</td>
            <td>
              <select id="styleReliefSet" value={str("styleReliefSet")} onChange={e => applyReliefSet(e.target.value)}>
                <option value="simple">Simple</option>
                <option value="gray">Gray</option>
                <option value="colored">Colored</option>
              </select>
            </td>
          </tr>

          <tr data-tip="Define the size of relief icons. All relief icons will be regenerated">
            <td>Size</td>
            <td>{slider("styleReliefSize", ".2", "4", ".01")}</td>
          </tr>

          <tr data-tip="Define the density of relief icons. All relief icons will be regenerated. Highly affects performance!">
            <td>Density</td>
            <td>{slider("styleReliefDensity", ".3", ".8", ".01")}</td>
          </tr>
        </tbody>

        <tbody id="styleFill" style={{ display: visibility.styleFill ? "block" : "none" }}>
          <tr data-tip="Set fill color">
            <td>Fill color</td>
            <td>
              <input
                id="styleFillInput"
                type="color"
                value={str("styleFillInput", "#5E4FA2")}
                onChange={e => applyFillColor(e.target.value)}
              />
              <output id="styleFillOutput">{str("styleFillInput", "#5E4FA2")}</output>
            </td>
          </tr>
        </tbody>

        <tbody id="styleStroke" style={{ display: visibility.styleStroke ? "block" : "none" }}>
          <tr data-tip="Set stroke color">
            <td>Stroke color</td>
            <td>
              <input
                id="styleStrokeInput"
                type="color"
                value={str("styleStrokeInput", "#5E4FA2")}
                onChange={e => applyStrokeColor(e.target.value)}
              />
              <output id="styleStrokeOutput">{str("styleStrokeInput", "#5E4FA2")}</output>
            </td>
          </tr>
        </tbody>

        <tbody id="styleStrokeWidth" style={{ display: visibility.styleStrokeWidth ? "block" : "none" }}>
          <tr data-tip="Set stroke width">
            <td>Stroke width</td>
            <td>{slider("styleStrokeWidthInput", "0", "10", ".01")}</td>
          </tr>
        </tbody>

        <tbody id="styleLetterSpacing" style={{ display: visibility.styleLetterSpacing ? "block" : "none" }}>
          <tr data-tip="Set letter spacing">
            <td>Letter spacing</td>
            <td>{slider("styleLetterSpacingInput", "-1", "10", ".01")}</td>
          </tr>
        </tbody>

        <tbody id="styleStrokeDash" style={{ display: visibility.styleStrokeDash ? "block" : "none" }}>
          <tr data-tip="Set stroke dash array (e.g. 5 2) and linecap">
            <td>Stroke dash</td>
            <td>
              <input
                id="styleStrokeDasharrayInput"
                type="text"
                style={{ width: "26%" }}
                value={str("styleStrokeDasharrayInput", "1 2")}
                onChange={e => applyStrokeDasharray(e.target.value)}
              />
              <select
                id="styleStrokeLinecapInput"
                style={{ width: "32%" }}
                value={str("styleStrokeLinecapInput", "inherit")}
                onChange={e => applyStrokeLinecap(e.target.value)}
              >
                <option value="inherit">Inherit</option>
                <option value="butt">Butt</option>
                <option value="round">Round</option>
                <option value="square">Square</option>
              </select>
            </td>
          </tr>
        </tbody>

        <tbody id="styleShadow" style={{ display: visibility.styleShadow ? "block" : "none" }}>
          <tr data-tip="Set text shadow">
            <td>Text shadow</td>
            <td>
              <input
                id="styleShadowInput"
                type="text"
                value={str("styleShadowInput")}
                onChange={e => applyShadow(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleFont" style={{ display: visibility.styleFont ? "block" : "none" }}>
          <tr data-tip="Select font">
            <td>Font</td>
            <td>
              <select
                id="styleSelectFont"
                style={{ width: "85%" }}
                value={str("styleSelectFont")}
                onChange={e => {
                  useStyleState.getState().updateValue("styleSelectFont", e.target.value);
                  changeFont();
                }}
              >
                {fonts.map(f => (
                  <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                    {f.family}
                  </option>
                ))}
                {(options.styleSelectFont ?? []).map(f => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                id="styleFontAdd"
                data-tip="Add a font"
                className="icon-plus sideButton"
                onClick={() => openDialog("addFontDialog")}
              ></button>
            </td>
          </tr>
        </tbody>

        <tbody id="styleSize" style={{ display: visibility.styleSize ? "block" : "none" }}>
          <tr data-tip="Set font size">
            <td>Font size</td>
            <td>
              <button
                type="button"
                id="styleFontPlus"
                data-tip="Increase font"
                className="whiteButton"
                onClick={applyFontSizePlus}
              >
                +
              </button>
              <button
                type="button"
                id="styleFontMinus"
                data-tip="Descrease font"
                className="whiteButton"
                onClick={applyFontSizeMinus}
              >
                -
              </button>
              <input
                id="styleFontSize"
                type="number"
                min=".5"
                max="100"
                step=".1"
                value={num("styleFontSize")}
                onChange={e => applyFontSize(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleFontShift" style={{ display: visibility.styleFontShift ? "block" : "none" }}>
          <tr data-tip="Set label shift along X and Y axes">
            <td>Label shift</td>
            <td>
              <input
                id="styleFontShiftX"
                data-tip="Set label shift along Y axis"
                type="number"
                min="-5"
                max="5"
                step=".01"
                value={num("styleFontShiftX")}
                onChange={e => applyFontShiftX(e.target.value)}
              />
              <input
                id="styleFontShiftY"
                data-tip="Set label shift along Y axis"
                type="number"
                min="-5"
                max="5"
                step=".01"
                value={num("styleFontShiftY")}
                onChange={e => applyFontShiftY(e.target.value)}
              />
            </td>
          </tr>
        </tbody>

        <tbody id="styleCoastline" style={{ display: visibility.styleCoastline ? "block" : "none" }}>
          <tr data-tip="Allow system to apply filter automatically based on zoom level">
            <td colSpan={2}>
              <input
                id="styleCoastlineAuto"
                className="checkbox"
                type="checkbox"
                checked={bool("styleCoastlineAuto")}
                onChange={e => applyCoastlineAuto(e.target.checked)}
              />
              <label htmlFor="styleCoastlineAuto" className="checkbox-label">
                Automatically change filter on zoom
              </label>
            </td>
          </tr>
        </tbody>

        <tbody id="styleTemperature" style={{ display: visibility.styleTemperature ? "block" : "none" }}>
          <tr data-tip="Define transparency of temperature leyer. Set to 0 to make it fully transparent">
            <td>Fill opacity</td>
            <td>{slider("styleTemperatureFillOpacityInput", "0", "1", ".01")}</td>
          </tr>

          <tr data-tip="Set labels size">
            <td>Labels size</td>
            <td>{slider("styleTemperatureFontSizeInput", "0", "30", "1")}</td>
          </tr>

          <tr data-tip="Set labels color">
            <td>Labels color</td>
            <td>
              <input
                id="styleTemperatureFillInput"
                type="color"
                value={str("styleTemperatureFillInput", "#000000")}
                onChange={e => applyTemperatureFill(e.target.value)}
              />
              <output id="styleTemperatureFillOutput">{str("styleTemperatureFillInput", "#000000")}</output>
            </td>
          </tr>
        </tbody>

        <tbody id="styleStates" style={{ display: visibility.styleStates ? "block" : "none" }}>
          <tr data-tip="Set states fill opacity. 0: invisible, 1: solid">
            <td>Body opacity</td>
            <td>{slider("styleStatesBodyOpacity", "0", "1", "0.01")}</td>
          </tr>

          <tr data-tip="Select filter for states fill. Please note filters may cause performance issues!">
            <td>Body filter</td>
            <td>
              <select
                id="styleStatesBodyFilter"
                value={str("styleStatesBodyFilter")}
                onChange={e => applyStatesBodyFilter(e.target.value)}
              >
                {statesBodyFilterOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr style={{ marginTop: "0.8em" }}>
            <td style={{ fontStyle: "italic" }}>
              Halo is only rendered if "Rendering" option is set to "Best quality"!
            </td>
          </tr>

          <tr data-tip="Set states halo effect width">
            <td>Halo width</td>
            <td>{slider("styleStatesHaloWidth", "0", "30", "0.1")}</td>
          </tr>

          <tr data-tip="Set states halo effect opacity. 0: invisible, 1: solid">
            <td>Halo opacity</td>
            <td>{slider("styleStatesHaloOpacity", "0", "1", "0.01")}</td>
          </tr>

          <tr
            data-tip="Select halo effect power (blur). Set to 0 to make it solid line"
            style={{ marginBottom: "1em" }}
          >
            <td>Halo blur</td>
            <td>{slider("styleStatesHaloBlur", "0", "10", "0.01")}</td>
          </tr>
        </tbody>

        <tbody id="styleArmies" style={{ display: visibility.styleArmies ? "block" : "none" }}>
          <tr data-tip="Set fill transparency. Set to 0 to make it fully transparent">
            <td>Fill opacity</td>
            <td>{slider("styleArmiesFillOpacity", "0", "1", ".01")}</td>
          </tr>
          <tr data-tip="Set regiment box size. All regiments will be redrawn on change (position will defaulted)">
            <td>Box Size</td>
            <td>{slider("styleArmiesSize", "0", "10", ".1")}</td>
          </tr>
        </tbody>

        <tbody id="styleEmblems" style={{ display: visibility.styleEmblems ? "block" : "none" }}>
          <tr data-tip="Set state emblems size multiplier">
            <td>State size</td>
            <td>{slider("emblemsStateSizeInput", "0", "5", ".01")}</td>
          </tr>

          <tr data-tip="Set province emblems size multiplier">
            <td>Province size</td>
            <td>{slider("emblemsProvinceSizeInput", "0", "5", ".01")}</td>
          </tr>

          <tr data-tip="Set burg emblems size multiplier">
            <td>Burg size</td>
            <td>{slider("emblemsBurgSizeInput", "0", "5", ".01")}</td>
          </tr>

          <tr data-tip="Allow system to hide emblem groups if their size in too small or too big on that scale">
            <td colSpan={2}>
              <input id="hideEmblems" className="checkbox" type="checkbox" onChange={() => invokeActiveZooming()} />
              <label htmlFor="hideEmblems" className="checkbox-label">
                Toggle visibility automatically
              </label>
            </td>
          </tr>
        </tbody>

        <tbody id="styleFilter" style={{ display: visibility.styleFilter ? "block" : "none" }}>
          <tr data-tip="Select filter for element. Please note filters may cause performance issues!">
            <td>Filter</td>
            <td>
              <select
                id="styleFilterInput"
                value={str("styleFilterInput")}
                onChange={e => applyStyleFilter(e.target.value)}
              >
                {filterOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        </tbody>

        <tbody id="styleClipping" style={{ display: visibility.styleClipping ? "block" : "none" }}>
          <tr data-tip="Set clipping. Only non-clipped part will be visible">
            <td>Clipping</td>
            <td>
              <select
                id="styleClippingInput"
                value={str("styleClippingInput")}
                onChange={e => applyClipping(e.target.value)}
              >
                <option value="">No clipping</option>
                <option value="url(#land)">Clip water</option>
                <option value="url(#water)">Clip land</option>
              </select>
            </td>
          </tr>
        </tbody>

        <tbody id="styleMarkers" style={{ display: visibility.styleMarkers ? "block" : "none" }}>
          <tr data-tip="Try to keep the same size on any map scale, turn off to get size change depending on scale">
            <td colSpan={2}>
              <input
                id="styleRescaleMarkers"
                className="checkbox"
                type="checkbox"
                checked={bool("styleRescaleMarkers")}
                onChange={e => applyRescaleMarkers(e.target.checked)}
              />
              <label htmlFor="styleRescaleMarkers" className="checkbox-label">
                Keep initial size on zoom change
              </label>
            </td>
          </tr>
        </tbody>

        <tbody id="styleVisibility" style={{ display: visibility.styleVisibility ? "block" : "none" }}>
          <tr data-tip="Completely hide the selected labels group using display:none">
            <td colSpan={2}>
              <input
                id="styleLabelsHideGroup"
                className="checkbox"
                type="checkbox"
                checked={bool("styleLabelsHideGroup")}
                onChange={e => applyLabelsHideGroup(e.target.checked)}
              />
              <label htmlFor="styleLabelsHideGroup" className="checkbox-label">
                Hide selected group
              </label>
            </td>
          </tr>

          <tr data-tip="Allow system to hide labels if their size in too small or too big on that scale">
            <td colSpan={2}>
              <input id="hideLabels" className="checkbox" type="checkbox" onChange={() => invokeActiveZooming()} />
              <label htmlFor="hideLabels" className="checkbox-label">
                Toggle visibility automatically
              </label>
            </td>
          </tr>

          <tr data-tip="Allow system to rescale labels on zoom">
            <td colSpan={2}>
              <input id="rescaleLabels" className="checkbox" type="checkbox" onChange={() => invokeActiveZooming()} />
              <label htmlFor="rescaleLabels" className="checkbox-label">
                Rescale on zoom
              </label>
            </td>
          </tr>
        </tbody>

        <tbody id="styleScaleBar" style={{ display: visibility.styleScaleBar ? "block" : "none" }}>
          <tr data-tip="Set bar and font size">
            <td>Size</td>
            <td>
              <span>Bar </span>
              <input
                id="styleScaleBarSize"
                type="number"
                min=".5"
                max="5"
                step=".1"
                value={num("styleScaleBarSize")}
                onChange={e => applyScaleBarInput("styleScaleBarSize", e.target.value)}
              />
              <span>Font </span>
              <input
                id="styleScaleBarFontSize"
                type="number"
                min="1"
                max="100"
                step=".1"
                value={num("styleScaleBarFontSize")}
                onChange={e => applyScaleBarInput("styleScaleBarFontSize", e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Set position of the Scale bar bottom right corner (in percents)">
            <td>Position</td>
            <td>
              <span>x </span>
              <input
                id="styleScaleBarPositionX"
                type="number"
                min="0"
                max="100"
                step="0.1"
                style={{ width: "5em" }}
                value={num("styleScaleBarPositionX")}
                onChange={e => applyScaleBarInput("styleScaleBarPositionX", e.target.value)}
              />
              <span>y </span>
              <input
                id="styleScaleBarPositionY"
                type="number"
                min="0"
                max="100"
                step="0.1"
                style={{ width: "5em" }}
                value={num("styleScaleBarPositionY")}
                onChange={e => applyScaleBarInput("styleScaleBarPositionY", e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Type scale bar label, leave blank to hide label">
            <td>Label</td>
            <td>
              <input
                id="styleScaleBarLabel"
                type="text"
                value={str("styleScaleBarLabel")}
                onChange={e => applyScaleBarInput("styleScaleBarLabel", e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Set background opacity. 0: transparent, 1: solid">
            <td>Back opacity</td>
            <td>{slider("styleScaleBarBackgroundOpacity", "0", "1", ".01")}</td>
          </tr>

          <tr data-tip="Set background fill color">
            <td>Back fill</td>
            <td>
              <input
                id="styleScaleBarBackgroundFill"
                type="color"
                value={str("styleScaleBarBackgroundFill", "#ffffff")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundFill", e.target.value)}
              />
              <output id="styleScaleBarBackgroundFillOutput">{str("styleScaleBarBackgroundFill")}</output>
            </td>
          </tr>

          <tr data-tip="Set background stroke color and width">
            <td>Back stroke</td>
            <td>
              <input
                id="styleScaleBarBackgroundStroke"
                type="color"
                value={str("styleScaleBarBackgroundStroke", "#000000")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundStroke", e.target.value)}
              />
              <output id="styleScaleBarBackgroundStrokeOutput">{str("styleScaleBarBackgroundStroke")}</output>

              <span>Width </span>
              <input
                id="styleScaleBarBackgroundStrokeWidth"
                type="number"
                min="0"
                max="10"
                step="0.1"
                style={{ width: "5em" }}
                value={num("styleScaleBarBackgroundStrokeWidth")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundStrokeWidth", e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Set background element padding: top, right, bottom, left (in pixels)">
            <td>Back padding</td>
            <td style={{ display: "flex", gap: "4px" }}>
              <input
                id="styleScaleBarBackgroundPaddingTop"
                type="number"
                min="0"
                max="100"
                style={{ width: "5em" }}
                value={num("styleScaleBarBackgroundPaddingTop")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundPaddingTop", e.target.value)}
              />
              <input
                id="styleScaleBarBackgroundPaddingRight"
                type="number"
                min="0"
                max="100"
                style={{ width: "5em" }}
                value={num("styleScaleBarBackgroundPaddingRight")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundPaddingRight", e.target.value)}
              />
              <input
                id="styleScaleBarBackgroundPaddingBottom"
                type="number"
                min="0"
                max="100"
                style={{ width: "5em" }}
                value={num("styleScaleBarBackgroundPaddingBottom")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundPaddingBottom", e.target.value)}
              />
              <input
                id="styleScaleBarBackgroundPaddingLeft"
                type="number"
                min="0"
                max="100"
                style={{ width: "5em" }}
                value={num("styleScaleBarBackgroundPaddingLeft")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundPaddingLeft", e.target.value)}
              />
            </td>
          </tr>

          <tr data-tip="Select background filter">
            <td>Back filter</td>
            <td>
              <select
                id="styleScaleBarBackgroundFilter"
                value={str("styleScaleBarBackgroundFilter")}
                onChange={e => applyScaleBarInput("styleScaleBarBackgroundFilter", e.target.value)}
              >
                {scaleBarFilterOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        </tbody>

        {extensionConfigs.map(config => {
          if (!config.component) return null;
          const Component = config.component;
          return (
            <Component key={config.id} visibility={visibility} values={values} applySliderChange={applySliderChange} />
          );
        })}
      </table>

      <div
        id="mapFilters"
        data-tip="Set a filter to be applied to the map in general"
        onClick={e => {
          const btn = (e.target as HTMLElement).closest("button");
          if (!btn) return;
          applyMapFilterButton(btn.id);
        }}
      >
        <p>Toggle global filters:</p>
        <button type="button" id="grayscale" className={activeMapFilter === "grayscale" ? "radio pressed" : "radio"}>
          Grayscale
        </button>
        <button type="button" id="sepia" className={activeMapFilter === "sepia" ? "radio pressed" : "radio"}>
          Sepia
        </button>
        <button type="button" id="dingy" className={activeMapFilter === "dingy" ? "radio pressed" : "radio"}>
          Dingy
        </button>
        <button type="button" id="tint" className={activeMapFilter === "tint" ? "radio pressed" : "radio"}>
          Tint
        </button>
      </div>
    </div>
  );
}
