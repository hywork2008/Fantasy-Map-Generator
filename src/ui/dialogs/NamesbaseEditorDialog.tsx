import type React from "react";
import { useEffect } from "react";
import { NamesbaseEditor } from "../../controllers/namesbase-editor";

export const NamesbaseEditorContent: React.FC = () => {
  useEffect(() => {
    NamesbaseEditor.onMount();
    return () => NamesbaseEditor.onUnmount();
  }, []);

  return (
    <div id="namesbaseEditorContainer">
      <div>
        <div id="namesbaseBasesTop">
          <span>Select base: </span>
          <select id="namesbaseSelect" data-tip="Select base to edit" style={{ width: "12em" }} defaultValue={0} />
          <span style={{ marginLeft: 2 }}>Names data: </span>
        </div>
        <div id="namesbaseBody" style={{ marginBlock: 2, width: "auto" }}>
          <textarea
            id="namesbaseTextarea"
            data-base={0}
            rows={13}
            data-tip="Names data: a comma separated list of source names used for names generation"
            placeholder="Provide a names data: a comma separated list of source names"
            autoCorrect="off"
            spellCheck="false"
            style={{ resize: "none" }}
            defaultValue={""}
          />
          <div>
            <span>Name: </span>
            <input
              id="namesbaseName"
              data-tip="Type to change a base name"
              placeholder="Base name"
              autoCorrect="off"
              spellCheck="false"
              style={{ width: "12em" }}
            />
            <span>Length: </span>
            <input id="namesbaseMin" data-tip="Recommended minimum name length" type="number" min={2} max={100} />
            <input
              id="namesbaseMax"
              data-tip="Recommended maximum name length"
              type="number"
              min={2}
              defaultValue={10}
            />
            <span>Doubled: </span>
            <input
              id="namesbaseDouble"
              data-tip="Populate with letters that can be used twice in a row (geminates)"
              autoCorrect="off"
              spellCheck="false"
              style={{ width: "10em" }}
            />
          </div>
          <fieldset>
            <legend>Generated examples:</legend>
            <div id="namesbaseExamples" data-tip="Examples. Click to re-generate" />
          </fieldset>
        </div>
        <div id="namesbaseFooter">
          <button
            type="button"
            id="namesbaseUpdateExamples"
            data-tip="Re-generate examples based on provided data"
            className="icon-arrows-cw"
          />
          <button type="button" id="namesbaseAdd" data-tip="Add new namesbase" className="icon-plus" />
          <button type="button" id="namesbaseDefault" data-tip="Restore default namesbase" className="icon-cancel" />
          <button type="button" id="namesbaseDownload" data-tip="Download namesbase to PC" className="icon-download" />
          <button
            type="button"
            id="namesbaseUpload"
            data-tip="Upload a namesbase from PC, replacing the current set"
            className="icon-upload"
          />
          <button
            type="button"
            id="namesbaseUploadExtend"
            data-tip="Upload a namesbase from PC, extending the current set"
            className="icon-up-circled2"
          />
          <button
            type="button"
            id="namesbaseCA"
            data-tip="Find or share custom namesbase on Cartography Assets portal"
            className="icon-drafting-compass"
          />
          <button
            type="button"
            id="namesbaseAnalyze"
            data-tip="Analyze namesbase to get a validity and quality overview"
            className="icon-flask"
          />
          <button
            type="button"
            id="namesbaseSpeak"
            data-tip="Speak the examples. You can change voice and language in options"
            className="icon-voice"
          />
        </div>
      </div>
    </div>
  );
};
