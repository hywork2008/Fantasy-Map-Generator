import type React from "react";
import { useRef } from "react";
import { closeNotesEditor, notesEditorActions } from "../../editors/notes-editor";
import { useNotesEditorState } from "../../store/notesEditorState";
import { Dialog } from "./Dialog";

export const NotesEditorDialog: React.FC = () => {
  const { isOpen, selectedId, noteName, availableNotes, isPinned } = useNotesEditorState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} title="Notes Editor" onClose={closeNotesEditor}>
      <div id="notesEditorContainer">
        <div>
          <div style={{ marginBottom: "0.3em" }}>
            <strong>Element: </strong>
            <select
              id="notesSelect"
              data-tip="Select element id"
              style={{ width: "12em" }}
              value={selectedId}
              onChange={e => notesEditorActions.changeElement(e.target.value)}
            >
              {availableNotes.map(n => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
            <strong>Element name: </strong>
            <input
              id="notesName"
              data-tip="Set element name"
              autoCorrect="off"
              spellCheck="false"
              style={{ width: "16em" }}
              value={noteName}
              onChange={e => notesEditorActions.changeName(e.target.value)}
            />
            <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
              🔊
            </span>
          </div>

          {/* Note: This div is mutated by TinyMCE. React must not update its children! */}
          <div id="notesLegend" contentEditable="true" onBlur={notesEditorActions.updateLegend} />

          <div style={{ marginTop: "0.3em" }}>
            <button
              type="button"
              id="notesFocus"
              data-tip="Focus on selected object"
              className="icon-target"
              onClick={notesEditorActions.validateHighlightElement}
            />
            <button
              type="button"
              id="notesGenerateWithAi"
              data-tip="Generate note with AI"
              className="icon-robot"
              onClick={notesEditorActions.openAiGenerator}
            />
            <button
              type="button"
              id="notesPin"
              data-tip="Toggle notes box dispay: hide or do not hide the box on mouse move"
              className={`icon-pin ${isPinned ? "pressed" : ""}`}
              onClick={notesEditorActions.toggleNotesPin}
            />
            <button
              type="button"
              id="notesDownload"
              data-tip="Download notes to PC"
              className="icon-download"
              onClick={notesEditorActions.downloadLegends}
            />
            <button
              type="button"
              id="notesUpload"
              data-tip="Upload notes from PC"
              className="icon-upload"
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              type="file"
              id="legendsToLoad"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => notesEditorActions.handleUploadFile(e.nativeEvent)}
            />
            <button
              type="button"
              id="notesRemove"
              data-tip="Remove this note"
              className="icon-trash fastDelete"
              onClick={notesEditorActions.triggerNotesRemove}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
