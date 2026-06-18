import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const DiplomacyEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("diplomacyEditor"));

  return (
    <Dialog isOpen={isOpen} title="Diplomacy Editor" onClose={() => closeDialog("diplomacyEditor")}>
      <div id="diplomacyEditorContainer">
        <div>
          <div id="diplomacyHeader" className="header" style={{ gridTemplateColumns: "15em 6em" }}>
            <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="name">
              State&nbsp;
            </div>
            <div
              data-tip="Click to sort by diplomatical relations"
              className="sortable alphabetically"
              data-sortby="relations"
            >
              Relations&nbsp;
            </div>
          </div>
          <div id="diplomacyBodySection" className="table" />
          <div className="info-line">
            Click on state name to see relations.
            <br />
            Click on relations name to change it
          </div>
          <div id="diplomacyFooter" style={{ marginTop: "0.1em" }}>
            <button type="button" id="diplomacyEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="diplomacyEditStyle"
              data-tip="Edit states (including diplomacy view) style in Style Editor"
              className="icon-adjust"
            />
            <button
              type="button"
              id="diplomacyRegenerate"
              data-tip="Regenerate diplomatical relations"
              className="icon-retweet"
            />
            <button
              type="button"
              id="diplomacyReset"
              data-tip="Reset diplomatical relations of selected state to Neutral"
              className="icon-eraser"
            />
            <button
              type="button"
              id="diplomacyHistory"
              data-tip="Show relations history"
              className="icon-hourglass-1"
            />
            <button
              type="button"
              id="diplomacyShowMatrix"
              data-tip="Show relations matrix"
              className="icon-list-bullet"
            />
            <button
              type="button"
              id="diplomacyExport"
              data-tip="Save state relations matrix as a text file (.csv)"
              className="icon-download"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
