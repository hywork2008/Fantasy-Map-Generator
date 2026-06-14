import React from "react";
import { useViewState } from "../../store/viewState";

export const CustomizationMenu: React.FC = () => {
  const { isCustomizationMode, activeMenu } = useViewState();
  const isVisible = isCustomizationMode && activeMenu === "toolsTab";

  return (
    <div id="customizationMenu" className="tabcontent" style={{ display: isVisible ? "block" : "none" }}>
      <p>Heightmap customization tools:</p>
      <div id="customizeTools">
        <button data-tip="Display brushes panel" id="paintBrushes">Paint Brushes</button>
        <button data-tip="Open template editor" id="applyTemplate" style={{ display: "none" }}>Template Editor</button>
        <button data-tip="Open Image Converter" id="convertImage" style={{ display: "none" }}>Image Converter</button>
        <button data-tip="Render heightmap data as a small monochrome image" id="heightmapPreview">Preview</button>
        <button data-tip="Preview heightmap in 3D scene" id="heightmap3DView">3D scene</button>
      </div>

      <p>Options:</p>
      <div id="customizeOptions">
        <div data-tip="Heightmap edit mode">Edit mode: <span id="heightmapEditMode"></span></div>
        <div data-tip="Render cells below the sea level (with height less than 20)">
          <input id="renderOcean" className="checkbox" type="checkbox" />
          <label htmlFor="renderOcean" className="checkbox-label">Render ocean cells</label>
        </div>
        <div id="allowErosionBox" data-tip="Regenerate rivers and allow water flow to change heights and form new lakes. Better to keep checked">
          <input id="allowErosion" className="checkbox" type="checkbox" defaultChecked />
          <label htmlFor="allowErosion" className="checkbox-label">Allow water erosion</label>
        </div>
        <div data-tip="Maximum number of iterations taken to resolve depressions. Increase if you have rivers ending nowhere">
          <div>Depressions filling max iterations:</div>
          <input id="resolveDepressionsStepsInput" data-stored="resolveDepressionsSteps" type="range" min="0" max="500" defaultValue="250" />
          <input id="resolveDepressionsStepsOutput" data-stored="resolveDepressionsSteps" type="number" min="0" max="1000" defaultValue="250" />
        </div>
        <div data-tip="Depression depth to form a new lake. Increase to reduce number of lakes added by system">
          <div>Depression depth threshold:</div>
          <input id="lakeElevationLimitInput" data-stored="lakeElevationLimit" type="range" min="0" max="80" defaultValue="20" />
          <input id="lakeElevationLimitOutput" data-stored="lakeElevationLimit" type="number" min="0" max="80" defaultValue="20" />
        </div>
      </div>

      <p>Statistics:</p>
      <div>
        <span>Land cells: </span><span id="landmassCounter">0</span>
        <span style={{ marginLeft: "0.9em" }}>Mean height: </span><span id="landmassAverage">0</span>
      </div>

      <p>Cell info:</p>
      <div>
        <span>Coord: </span><span id="heightmapInfoX"></span>/<span id="heightmapInfoY"></span><br />
        <span>Cell: </span><span id="heightmapInfoCell"></span><br />
        <span>Height: </span><span id="heightmapInfoHeight"></span>
      </div>
    </div>
  );
};
