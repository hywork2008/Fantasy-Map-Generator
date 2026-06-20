import type React from "react";
import { lakeEditorActions } from "../../editors/lakes-editor";
import { useDialogState } from "../../store/dialogState";
import { useLakeEditorState } from "../../store/lakeEditorState";
import { getAreaUnit } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const LakeEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("lakeEditor"));
  const lakeData = useLakeEditorState(state => state.lakeData);
  const groups = useLakeEditorState(state => state.groups);
  const isNewGroupInputOpen = useLakeEditorState(state => state.isNewGroupInputOpen);
  const setIsNewGroupInputOpen = useLakeEditorState(state => state.setIsNewGroupInputOpen);

  if (!isOpen || !lakeData) return null;

  return (
    <Dialog isOpen={isOpen} title="Edit Lake" onClose={() => closeDialog("lakeEditor")}>
      <div id="lakeBody" style={{ paddingBottom: "0.3em" }}>
        <div>
          <div className="label" style={{ width: "4.8em" }}>
            Name:
          </div>
          <span
            data-tip="Generate culture-specific name for the lake"
            className="icon-book pointer"
            onClick={() => lakeEditorActions.generateNameCulture()}
          ></span>
          <span
            data-tip="Generate random name for the lake"
            className="icon-globe pointer"
            onClick={() => lakeEditorActions.generateNameRandom()}
          ></span>
          <input
            data-tip="Type to rename the lake"
            autoCorrect="off"
            spellCheck="false"
            value={lakeData.name}
            onChange={e => lakeEditorActions.changeName(e.target.value)}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
        </div>

        <div data-tip="Type to change lake type (group)">
          <div className="label" style={{ width: "4.8em" }}>
            Type:
          </div>
          <span
            data-tip="Remove the group"
            className="icon-trash-empty pointer"
            onClick={() => lakeEditorActions.removeLakeGroup()}
          ></span>
          <span
            data-tip="Create a new type (group) for the lake"
            className="icon-plus pointer"
            onClick={() => setIsNewGroupInputOpen(!isNewGroupInputOpen)}
          ></span>

          {isNewGroupInputOpen ? (
            <input
              placeholder="type name"
              data-tip="Provide a name for the new group"
              autoFocus
              onBlur={() => setIsNewGroupInputOpen(false)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  lakeEditorActions.createNewGroup(e.currentTarget.value);
                  setIsNewGroupInputOpen(false);
                } else if (e.key === "Escape") {
                  setIsNewGroupInputOpen(false);
                }
              }}
            />
          ) : (
            <select
              data-tip="Select lake type (group)"
              value={lakeData.group}
              onChange={e => lakeEditorActions.changeLakeGroup(e.target.value)}
            >
              {groups.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}

          <span
            data-tip="Edit lake group style in Style Editor"
            className="icon-brush pointer"
            onClick={() => lakeEditorActions.editGroupStyle()}
          ></span>
        </div>

        <div data-tip="Lake area in selected units">
          <div className="label">Area:</div>
          <input disabled value={`${Math.round(lakeData.area).toLocaleString()} ${getAreaUnit()}`} />
        </div>

        <div data-tip="Lake shore length in selected units">
          <div className="label">Shore length:</div>
          <input disabled value={`${Math.round(lakeData.shoreLength).toLocaleString()} km`} />
        </div>

        <div data-tip="Lake elevation in selected units">
          <div className="label">Elevation:</div>
          <input disabled value={`${lakeData.elevation} ft`} />
        </div>

        <div data-tip="Lake average depth in selected units">
          <div className="label">Average depth:</div>
          <input disabled value={`${lakeData.averageDepth} ft`} />
        </div>

        <div data-tip="Lake maximum depth in selected units">
          <div className="label">Max depth:</div>
          <input disabled value={`${lakeData.maxDepth} ft`} />
        </div>

        <div data-tip="Lake water supply. If supply > evaporation and there is an outlet, the lake water is fresh. If supply is very low, the lake becomes dry">
          <div className="label">Supply:</div>
          <input disabled value={lakeData.flux} />
        </div>

        <div data-tip="Evaporation from lake surface. If evaporation > supply, the lake water is saline. If difference is high, the lake becomes dry">
          <div className="label">Evaporation:</div>
          <input disabled value={lakeData.evaporation} />
        </div>

        <div data-tip="Number of lake inlet rivers">
          <div className="label">Inlets:</div>
          <input disabled value={lakeData.inlets.length || "no"} title={lakeData.inlets.join(", ")} />
        </div>

        <div data-tip="Lake outlet river">
          <div className="label">Outlet:</div>
          <input disabled value={lakeData.outlet ?? "no"} />
        </div>
      </div>

      <div id="lakeFooter">
        <button
          type="button"
          data-tip="Edit free text notes (legend) for the lake"
          className="icon-edit"
          onClick={() => lakeEditorActions.editLakeLegend()}
        ></button>
      </div>
    </Dialog>
  );
};
