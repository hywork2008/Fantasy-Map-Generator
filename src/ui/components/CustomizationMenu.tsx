import type React from "react";
import { HeightmapEditorActions } from "../../controllers/heightmapEditor";
import { setHeightmapEditorState, useHeightmapEditorState } from "../../store/heightmapEditorState";
import { useOptionsState } from "../../store/optionsState";
import { useViewState } from "../../store/viewState";
import { SliderInput } from "./SliderInput";
export const CustomizationMenu: React.FC = () => {
  const { isCustomizationMode, activeMenu } = useViewState();
  const options = useOptionsState();
  const editor = useHeightmapEditorState();
  const isVisible = isCustomizationMode && activeMenu === "toolsTab";

  return (
    <div id="customizationMenu" className="tabcontent" style={{ display: isVisible ? "block" : "none" }}>
      <p>Heightmap customization tools:</p>
      <div id="customizeTools">
        <button
          type="button"
          data-tip="Display brushes panel"
          id="paintBrushes"
          onClick={() => HeightmapEditorActions.openBrushesPanel()}
        >
          Paint Brushes
        </button>
        <button
          type="button"
          data-tip="Open template editor"
          id="applyTemplate"
          className="-customization-menu__display-none"
          onClick={() => HeightmapEditorActions.openTemplateEditor()}
        >
          Template Editor
        </button>
        <button
          type="button"
          data-tip="Open Image Converter"
          id="convertImage"
          className="-customization-menu__display-none"
          onClick={() => HeightmapEditorActions.openImageConverter()}
        >
          Image Converter
        </button>
        <button
          type="button"
          data-tip="Render heightmap data as a small monochrome image"
          id="heightmapPreview"
          onClick={() => HeightmapEditorActions.toggleHeightmapPreview()}
        >
          Preview
        </button>
        <button
          type="button"
          data-tip="Preview heightmap in 3D scene"
          id="heightmap3DView"
          onClick={e => HeightmapEditorActions.changeViewMode(e)}
        >
          3D scene
        </button>
      </div>

      <p>Options:</p>
      <div id="customizeOptions">
        <div data-tip="Heightmap edit mode">
          Edit mode: <span id="heightmapEditMode"></span>
        </div>
        <div data-tip="Render cells below the sea level (with height less than 20)">
          <input
            id="renderOcean"
            className="checkbox"
            type="checkbox"
            checked={editor.renderOcean}
            onChange={e => {
              setHeightmapEditorState({ renderOcean: e.target.checked });
              HeightmapEditorActions.mockHeightmap();
            }}
          />
          <label htmlFor="renderOcean" className="checkbox-label">
            Render ocean cells
          </label>
        </div>
        <div
          id="allowErosionBox"
          data-tip="Regenerate rivers and allow water flow to change heights and form new lakes. Better to keep checked"
        >
          <input
            id="allowErosion"
            className="checkbox"
            type="checkbox"
            checked={editor.allowErosion}
            onChange={e => setHeightmapEditorState({ allowErosion: e.target.checked })}
          />
          <label htmlFor="allowErosion" className="checkbox-label">
            Allow water erosion
          </label>
        </div>
        <div data-tip="Maximum number of iterations taken to resolve depressions. Increase if you have rivers ending nowhere">
          <SliderInput
            id="resolveDepressionsStepsInput"
            data-stored="resolveDepressionsSteps"
            min={0}
            max={500}
            value={options.resolveDepressionsSteps}
            onChange={val => options.setOption("resolveDepressionsSteps", Number(val))}
          >
            <div>Depressions filling max iterations:</div>
          </SliderInput>
        </div>
        <div data-tip="Depression depth to form a new lake. Increase to reduce number of lakes added by system">
          <SliderInput
            id="lakeElevationLimitInput"
            data-stored="lakeElevationLimit"
            min={0}
            max={80}
            value={options.lakeElevationLimit}
            onChange={val => options.setOption("lakeElevationLimit", Number(val))}
          >
            <div>Depression depth threshold:</div>
          </SliderInput>
        </div>
      </div>

      <p>Statistics:</p>
      <div>
        <span>Land cells: </span>
        <span id="landmassCounter">0</span>
        <span style={{ marginLeft: "0.9em" }}>Mean height: </span>
        <span id="landmassAverage">0</span>
      </div>

      <p>Cell info:</p>
      <div>
        <span>Coord: </span>
        <span id="heightmapInfoX"></span>/<span id="heightmapInfoY"></span>
        <br />
        <span>Cell: </span>
        <span id="heightmapInfoCell"></span>
        <br />
        <span>Height: </span>
        <span id="heightmapInfoHeight"></span>
      </div>
    </div>
  );
};
