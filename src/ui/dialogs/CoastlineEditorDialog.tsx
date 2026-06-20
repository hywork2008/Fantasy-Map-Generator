import type React from "react";
import { coastlineEditorActions } from "../../editors/coastline-editor";
import { useCoastlineEditorState } from "../../store/coastlineEditorState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CoastlineEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("coastlineEditor"));
  const { isGroupSectionVisible, isNewGroupInputVisible, group, groupOptions, newGroupName, areaUI } =
    useCoastlineEditorState();

  return (
    <Dialog isOpen={isOpen} title="Coastline Editor" onClose={() => closeDialog("coastlineEditor")}>
      <button
        type="button"
        id="coastlineGroupsShow"
        data-tip="Show the group selection"
        className="icon-tags"
        onClick={coastlineEditorActions.showGroupSection}
        style={{ display: isGroupSectionVisible ? "none" : "inline-block" }}
      ></button>
      <div id="coastlineGroupsSelection" style={{ display: isGroupSectionVisible ? "inline-block" : "none" }}>
        <button
          type="button"
          id="coastlineGroupsHide"
          data-tip="Hide the group section"
          className="icon-tags"
          onClick={coastlineEditorActions.hideGroupSection}
        ></button>
        <select
          id="coastlineGroup"
          data-tip="Select a group for this coastline"
          style={{ width: "9em", display: isNewGroupInputVisible ? "none" : "inline-block" }}
          value={group}
          onChange={e => coastlineEditorActions.changeGroup(e.target.value)}
        >
          {groupOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          id="coastlineGroupName"
          placeholder="new group name"
          data-tip="Provide a name for the new group"
          style={{ display: isNewGroupInputVisible ? "inline-block" : "none", width: "9em" }}
          value={newGroupName}
          onChange={e => coastlineEditorActions.setNewGroupName(e.target.value)}
          onBlur={coastlineEditorActions.createNewGroup}
          onKeyDown={e => {
            if (e.key === "Enter") coastlineEditorActions.createNewGroup();
          }}
        />
        <span
          id="coastlineGroupAdd"
          data-tip="Create a new group for this coastline"
          className="icon-plus pointer"
          onClick={coastlineEditorActions.toggleNewGroupInput}
        ></span>
        <span
          id="coastlineGroupRemove"
          data-tip="Remove the group"
          className="icon-trash-empty pointer"
          onClick={coastlineEditorActions.removeGroup}
        ></span>
      </div>

      <button
        id="coastlineEditStyle"
        data-tip="Edit coastline group style in Style Editor"
        className="icon-brush"
        type="button"
        onClick={coastlineEditorActions.editStyle}
        style={{ display: isGroupSectionVisible ? "none" : "inline-block" }}
      ></button>
      <button
        type="button"
        id="coastlineArea"
        data-tip="Landmass area in selected units"
        style={{ display: isGroupSectionVisible ? "none" : "inline-block" }}
      >
        {areaUI}
      </button>
    </Dialog>
  );
};
