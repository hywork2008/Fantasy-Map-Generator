import type React from "react";
import { coastlineEditorActions } from "../../controllers/coastline-editor";
import { useCoastlineEditorState } from "../../store/coastlineEditorState";
import { IconButton } from "../components/IconButton";

export const CoastlineEditorContent: React.FC = () => {
  const { isGroupSectionVisible, isNewGroupInputVisible, group, groupOptions, newGroupName, areaUI } =
    useCoastlineEditorState();

  return (
    <>
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
          style={{ display: isNewGroupInputVisible ? "none" : "inline-block" }}
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
          style={{ display: isNewGroupInputVisible ? "inline-block" : "none" }}
          value={newGroupName}
          onChange={e => coastlineEditorActions.setNewGroupName(e.target.value)}
          onBlur={coastlineEditorActions.createNewGroup}
          onKeyDown={e => {
            if (e.key === "Enter") coastlineEditorActions.createNewGroup();
          }}
        />
        <IconButton
          id="coastlineGroupAdd"
          data-tip="Create a new group for this coastline"
          className="icon-plus pointer"
          onClick={coastlineEditorActions.toggleNewGroupInput}
        ></IconButton>
        <IconButton
          id="coastlineGroupRemove"
          data-tip="Remove the group"
          className="icon-trash-empty pointer"
          onClick={coastlineEditorActions.removeGroup}
        ></IconButton>
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
    </>
  );
};
