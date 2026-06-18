import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const TemplateEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("templateEditor"));

  return (
    <Dialog isOpen={isOpen} title="Template Editor" onClose={() => closeDialog("templateEditor")}>
      <div id="templateEditorContainer">
        <div>
          <div id="templateTop">
            <i>Select template: </i>
            <select
              id="templateSelect"
              style={{ width: "16em" }}
              data-prev="templateCustom"
              data-tip="Select base template"
              defaultValue="custom"
            >
              <option value="custom">Custom</option>
              <option value="volcano">Volcano</option>
              <option value="highIsland">High Island</option>
              <option value="lowIsland">Low Island</option>
              <option value="continents">Continents</option>
              <option value="archipelago">Archipelago</option>
              <option value="atoll">Atoll</option>
              <option value="mediterranean">Mediterranean</option>
              <option value="peninsula">Peninsula</option>
              <option value="pangea">Pangea</option>
              <option value="isthmus">Isthmus</option>
              <option value="shattered">Shattered</option>
              <option value="taklamakan">Taklamakan</option>
              <option value="oldWorld">Old World</option>
              <option value="fractious">Fractious</option>
            </select>
          </div>
          <div id="templateTools">
            <button data-type="Hill" data-tip="Hill: small blob" type="button">
              H
            </button>
            <button data-type="Pit" data-tip="Pit: round depression" type="button">
              P
            </button>
            <button data-type="Range" data-tip="Range: elongated elevation" type="button">
              R
            </button>
            <button data-type="Trough" data-tip="Trough: elongated depression" type="button">
              T
            </button>
            <button data-type="Strait" data-tip="Strait: centered vertical or horizontal depression" type="button">
              S
            </button>
            <button data-type="Mask" data-tip="Mask: lower cells near edges or in map center" type="button">
              M
            </button>
            <button data-type="Invert" data-tip="Invert heightmap along the axes" type="button">
              I
            </button>
            <button data-type="Add" data-tip="Add or subtract value from all heights in range" type="button">
              +
            </button>
            <button data-type="Multiply" data-tip="Multiply all heights in range by factor" type="button">
              *
            </button>
            <button
              data-type="Smooth"
              data-tip="Smooth the map replacing cell heights by an average values of its neighbors"
              type="button"
            >
              ~
            </button>
          </div>
          <div id="templateBody" data-changed={0} className="table" style={{ padding: "2px 0" }}>
            <div data-type="Hill">
              <div className="icon-check" data-tip="Click to skip the step" />
              <div style={{ width: "4em" }}>Hill</div>
              <i className="icon-trash-empty pointer" data-tip="Remove the step" />
              <i className="icon-resize-vertical" data-tip="Drag to reorder" />
              <span>
                y:
                <input
                  className="templateY"
                  data-tip="Y axis position in percentage (minY-maxY or Y)"
                  defaultValue="47-53"
                />
              </span>
              <span>
                x:
                <input
                  className="templateX"
                  data-tip="X axis position in percentage (minX-maxX or X)"
                  defaultValue="65-75"
                />
              </span>
              <span>
                h:
                <input
                  className="templateHeight"
                  data-tip="Blob maximum height, use hyphen to get a random number in range"
                  defaultValue="90-100"
                />
              </span>
              <span>
                n:
                <input
                  className="templateCount"
                  data-tip="Blobs to add, use hyphen to get a random number in range"
                  defaultValue={1}
                />
              </span>
            </div>
          </div>
          <div id="templateFooter">
            <button type="button" id="templateRun" data-tip="Execute the template" className="icon-play-circled2" />
            <button type="button" id="templateUndo" data-tip="Undo the latest action" className="icon-ccw" disabled />
            <button type="button" id="templateRedo" data-tip="Redo the action" className="icon-cw" disabled />
            <button
              type="button"
              id="templateSave"
              data-tip="Download the template as a text file"
              className="icon-download"
            />
            <button
              type="button"
              id="templateLoad"
              data-tip="Open previously downloaded template"
              className="icon-upload"
            />
            <button
              type="button"
              id="templateCA"
              data-tip="Find or share custom template on Cartography Assets portal"
              className="icon-drafting-compass"
            />
            <button
              type="button"
              id="templateTutorial"
              data-tip="Open Template Editor Tutorial"
              className="icon-info"
            />
            <label data-tip="Lock seed (click on lock icon) if you want template to generate the same heightmap each time">
              Seed:{" "}
              <input
                id="templateSeed"
                defaultValue=""
                type="number"
                min={1}
                max={999999999}
                step={1}
                style={{ width: "8em" }}
              />
              <i data-locked={0} id="lock_templateSeed" className="icon-lock-open" />
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
