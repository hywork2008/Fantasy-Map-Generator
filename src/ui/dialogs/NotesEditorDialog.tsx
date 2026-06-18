import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const NotesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("notesEditor"));

  return (
    <Dialog isOpen={isOpen} title="Notes Editor" onClose={() => closeDialog("notesEditor")}>
      <div id="notesEditorContainer">
        <div>
          <div style={{ marginBottom: "0.3em" }}>
            <strong>Element: </strong>
            <select id="notesSelect" data-tip="Select element id" style={{ width: "12em" }} />
            <strong>Element name: </strong>
            <input
              id="notesName"
              data-tip="Set element name"
              autoCorrect="off"
              spellCheck="false"
              style={{ width: "16em" }}
            />
            <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
              🔊
            </span>
          </div>
          <div id="notesLegend" contentEditable="true" />
          <div style={{ marginTop: "0.3em" }}>
            <button type="button" id="notesFocus" data-tip="Focus on selected object" className="icon-target" />
            <button type="button" id="notesGenerateWithAi" data-tip="Generate note with AI" className="icon-robot" />
            <button
              type="button"
              id="notesPin"
              data-tip="Toggle notes box dispay: hide or do not hide the box on mouse move"
              className="icon-pin"
            />
            <button type="button" id="notesDownload" data-tip="Download notes to PC" className="icon-download" />
            <button type="button" id="notesUpload" data-tip="Upload notes from PC" className="icon-upload" />
            <button type="button" id="notesRemove" data-tip="Remove this note" className="icon-trash fastDelete" />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
