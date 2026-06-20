import type React from "react";
import { closeLabelEditor, labelsEditorActions } from "../../editors/labels-editor";
import { useLabelsEditorState } from "../../store/labelsEditorState";
import { Dialog } from "./Dialog";

export const LabelEditorDialog: React.FC = () => {
  const {
    isOpen,
    activeSection,
    group,
    groupOptions,
    isBasicGroup,
    isNewGroup,
    newGroupName,
    text,
    size,
    startOffset,
    letterSpacing
  } = useLabelsEditorState();

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} title="Label Editor" onClose={closeLabelEditor}>
      {!isBasicGroup && (
        <>
          <button
            type="button"
            id="labelGroupShow"
            data-tip="Show the group selection"
            className={`icon-tags ${activeSection === "group" ? "pressed" : ""}`}
            style={{ display: activeSection === "group" ? "none" : "inline-block" }}
            onClick={() => labelsEditorActions.toggleSection("group")}
          ></button>
          {activeSection === "group" && (
            <div id="labelGroupSection" style={{ display: "inline-block" }}>
              <button
                type="button"
                id="labelGroupHide"
                data-tip="Hide the group selection"
                className="icon-tags"
                onClick={() => labelsEditorActions.toggleSection(null)}
              ></button>

              {!isNewGroup ? (
                <select
                  id="labelGroupSelect"
                  data-tip="Select a group for this label"
                  style={{ width: "10em" }}
                  value={group}
                  onChange={e => labelsEditorActions.changeGroup(e.target.value)}
                >
                  {groupOptions.map(g => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="labelGroupInput"
                  placeholder="new group name"
                  data-tip="Provide a name for the new group"
                  style={{ width: "10em" }}
                  value={newGroupName}
                  onChange={e => labelsEditorActions.changeNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && labelsEditorActions.createNewGroup()}
                />
              )}

              <span
                id="labelGroupNew"
                data-tip="Create a new group for this label"
                className={`icon-plus pointer ${isNewGroup ? "pressed" : ""}`}
                onClick={labelsEditorActions.toggleNewGroupInput}
              ></span>
              <span
                id="labelGroupRemove"
                data-tip="Remove the Group with all labels"
                className="icon-trash-empty pointer"
                onClick={labelsEditorActions.removeLabelsGroup}
              ></span>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        id="labelTextShow"
        data-tip="Show the edit label text section"
        className={`icon-pencil ${activeSection === "text" ? "pressed" : ""}`}
        style={{
          display:
            activeSection === "text" ||
            activeSection === "group" ||
            activeSection === "size" ||
            activeSection === "offset" ||
            activeSection === "letterSpacing"
              ? "none"
              : "inline-block"
        }}
        onClick={() => labelsEditorActions.toggleSection("text")}
      ></button>
      {activeSection === "text" && (
        <div id="labelTextSection" style={{ display: "inline-block" }}>
          <button
            type="button"
            id="labelTextHide"
            data-tip="Hide the edit label text section"
            className="icon-pencil"
            onClick={() => labelsEditorActions.toggleSection(null)}
          ></button>
          <input
            id="labelText"
            data-tip='Type to change the label. Enter "|" to move to a new line'
            style={{ width: "12em" }}
            value={text}
            onChange={e => labelsEditorActions.changeText(e.target.value)}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            id="labelTextRandom"
            data-tip="Generate random name"
            className="icon-shuffle pointer"
            onClick={labelsEditorActions.generateRandomName}
          ></span>
        </div>
      )}

      <button
        type="button"
        id="labelEditStyle"
        data-tip="Edit label group style in Style Editor"
        className="icon-brush"
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={labelsEditorActions.editGroupStyle}
      ></button>

      <button
        type="button"
        id="labelSizeShow"
        data-tip="Show the font size section"
        className={`icon-text-height ${activeSection === "size" ? "pressed" : ""}`}
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={() => labelsEditorActions.toggleSection("size")}
      ></button>
      {activeSection === "size" && (
        <div id="labelSizeSection" style={{ display: "inline-block" }}>
          <button
            type="button"
            id="labelSizeHide"
            data-tip="Hide the font size section"
            className="icon-text-height"
            onClick={() => labelsEditorActions.toggleSection(null)}
          ></button>
          <span data-tip="Set relative size for the particular label">Size:</span>
          <input
            id="labelRelativeSize"
            data-tip="Set relative size for the particular label (% of group default)"
            type="number"
            min="30"
            max="300"
            step="1"
            style={{ width: "4.5em" }}
            value={size}
            onChange={e => labelsEditorActions.changeRelativeSize(Number(e.target.value))}
          />
        </div>
      )}

      <button
        type="button"
        id="labelOffsetShow"
        data-tip="Show the label offset section"
        className={`icon-sliders ${activeSection === "offset" ? "pressed" : ""}`}
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={() => labelsEditorActions.toggleSection("offset")}
      ></button>
      {activeSection === "offset" && (
        <div id="labelOffsetSection" style={{ display: "inline-block" }}>
          <button
            type="button"
            id="labelOffsetHide"
            data-tip="Hide the label offset section"
            className="icon-sliders"
            onClick={() => labelsEditorActions.toggleSection(null)}
          ></button>
          <span data-tip="Set starting offset for the particular label">Offset:</span>
          <input
            id="labelStartOffset"
            data-tip="Set starting offset for the particular label (% along the path)"
            type="range"
            min="20"
            max="80"
            style={{ width: "8em" }}
            value={startOffset}
            onChange={e => labelsEditorActions.changeStartOffset(Number(e.target.value))}
          />
          <input
            id="labelStartOffsetValue"
            type="number"
            min="20"
            max="80"
            step="1"
            style={{ width: "3.5em" }}
            data-tip="Set starting offset numerically"
            value={startOffset}
            onChange={e => labelsEditorActions.changeStartOffset(Number(e.target.value))}
          />
        </div>
      )}

      <button
        type="button"
        id="labelLetterSpacingShow"
        data-tip="Show the letter spacing section"
        className={`icon-text-width ${activeSection === "letterSpacing" ? "pressed" : ""}`}
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={() => labelsEditorActions.toggleSection("letterSpacing")}
      ></button>
      {activeSection === "letterSpacing" && (
        <div id="labelLetterSpacingSection" style={{ display: "inline-block" }}>
          <button
            type="button"
            id="labelLetterSpacingHide"
            data-tip="Hide the letter spacing section"
            className="icon-text-width"
            onClick={() => labelsEditorActions.toggleSection(null)}
          ></button>
          <input
            id="labelLetterSpacingSize"
            type="range"
            min="0"
            max="20"
            step=".01"
            value={letterSpacing}
            onChange={e => labelsEditorActions.changeLetterSpacingSize(Number(e.target.value))}
            data-tip="Set the letter spacing size for this label"
            style={{ display: "inline-block" }}
          />
        </div>
      )}

      <button
        type="button"
        id="labelAlign"
        data-tip="Turn text path into a straight line"
        className="icon-resize-horizontal"
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={labelsEditorActions.editLabelAlign}
      ></button>
      <button
        type="button"
        id="labelLegend"
        data-tip="Edit free text notes (legend) for this label"
        className="icon-edit"
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={labelsEditorActions.editLabelLegend}
      ></button>
      <button
        id="labelRemoveSingle"
        data-tip="Remove the label"
        data-shortcut="Delete"
        className="icon-trash fastDelete"
        type="button"
        style={{ display: activeSection ? "none" : "inline-block" }}
        onClick={labelsEditorActions.removeLabel}
      ></button>
    </Dialog>
  );
};
