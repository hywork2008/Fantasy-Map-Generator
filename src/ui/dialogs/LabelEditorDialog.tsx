import React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "slider-input": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        min?: string;
        max?: string;
        step?: string;
        value?: string;
      };
    }
  }
}

export const LabelEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("labelEditor"));

  return (
    <Dialog isOpen={isOpen} title="Label Editor" onClose={() => closeDialog("labelEditor")}>
      <button type="button" id="labelGroupShow" data-tip="Show the group selection" className="icon-tags"></button>
      <div id="labelGroupSection" style={{ display: "none" }}>
        <button type="button" id="labelGroupHide" data-tip="Hide the group selection" className="icon-tags"></button>
        <select id="labelGroupSelect" data-tip="Select a group for this label" style={{ width: "10em" }}></select>
        <input
          id="labelGroupInput"
          placeholder="new group name"
          data-tip="Provide a name for the new group"
          style={{ display: "none", width: "10em" }}
        />
        <span id="labelGroupNew" data-tip="Create a new group for this label" className="icon-plus pointer"></span>
        <span
          id="labelGroupRemove"
          data-tip="Remove the Group with all labels"
          className="icon-trash-empty pointer"
        ></span>
      </div>

      <button
        type="button"
        id="labelTextShow"
        data-tip="Show the edit label text section"
        className="icon-pencil"
      ></button>
      <div id="labelTextSection" style={{ display: "none" }}>
        <button
          type="button"
          id="labelTextHide"
          data-tip="Hide the edit label text section"
          className="icon-pencil"
        ></button>
        <input
          id="labelText"
          data-tip='Type to change the label. Enter "|" to move to a new line'
          style={{ width: "12em" }}
        />
        <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
          🔊
        </span>
        <span id="labelTextRandom" data-tip="Generate random name" className="icon-shuffle pointer"></span>
      </div>

      <button
        type="button"
        id="labelEditStyle"
        data-tip="Edit label group style in Style Editor"
        className="icon-brush"
      ></button>

      <button
        type="button"
        id="labelSizeShow"
        data-tip="Show the font size section"
        className="icon-text-height"
      ></button>
      <div id="labelSizeSection" style={{ display: "none" }}>
        <button
          type="button"
          id="labelSizeHide"
          data-tip="Hide the font size section"
          className="icon-text-height"
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
        />
      </div>

      <button
        type="button"
        id="labelOffsetShow"
        data-tip="Show the label offset section"
        className="icon-sliders"
      ></button>
      <div id="labelOffsetSection" style={{ display: "none" }}>
        <button
          type="button"
          id="labelOffsetHide"
          data-tip="Hide the label offset section"
          className="icon-sliders"
        ></button>
        <span data-tip="Set starting offset for the particular label">Offset:</span>
        <input
          id="labelStartOffset"
          data-tip="Set starting offset for the particular label (% along the path)"
          type="range"
          min="20"
          max="80"
          style={{ width: "8em" }}
        />
        <input
          id="labelStartOffsetValue"
          type="number"
          min="20"
          max="80"
          step="1"
          style={{ width: "3.5em" }}
          data-tip="Set starting offset numerically"
        />
      </div>

      <button
        type="button"
        id="labelLetterSpacingShow"
        data-tip="Show the letter spacing section"
        className="icon-text-width"
      ></button>
      <div id="labelLetterSpacingSection" style={{ display: "none" }}>
        <button
          type="button"
          id="labelLetterSpacingHide"
          data-tip="Hide the letter spacing section"
          className="icon-text-width"
        ></button>
        {React.createElement("slider-input", {
          id: "labelLetterSpacingSize",
          style: { display: "inline-block" },
          "data-tip": "Set the letter spacing size for this label",
          min: "0",
          max: "20",
          step: ".01",
          value: "0"
        })}
      </div>

      <button
        type="button"
        id="labelAlign"
        data-tip="Turn text path into a straight line"
        className="icon-resize-horizontal"
      ></button>
      <button
        type="button"
        id="labelLegend"
        data-tip="Edit free text notes (legend) for this label"
        className="icon-edit"
      ></button>
      <button
        id="labelRemoveSingle"
        data-tip="Remove the label"
        data-shortcut="Delete"
        className="icon-trash fastDelete"
        type="button"
      ></button>
    </Dialog>
  );
};
