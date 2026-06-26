import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const StyleSaverDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("styleSaver"));

  return (
    <Dialog isOpen={isOpen} title="StyleSaver" onClose={() => closeDialog("styleSaver")}>
      <div id="styleSaverContainer">
        <div>
          <div id="styleSaverHeader" style={{ padding: "2px 0" }}>
            <span>Preset name:</span>
            <input
              id="styleSaverName"
              data-tip="Enter style preset name"
              placeholder="Preset name"
              style={{ width: "12em" }}
              required
            />
            <span
              id="styleSaverTip"
              data-tip="Shows whether there is already a preset with this name"
              className="italic"
            />
          </div>
          <div id="styleSaverBody" style={{ padding: "2px 0", width: "100%" }}>
            <span>Style JSON:</span>
            <textarea
              id="styleSaverJSON"
              rows={18}
              data-tip="Style JSON is getting formed based the current settings, but can be entered manually"
              placeholder="Paste any valid style data in JSON format"
              autoCorrect="off"
              spellCheck="false"
              defaultValue={""}
            />
          </div>
          <div id="styleSaverFooter">
            <button
              type="button"
              id="styleSaverSave"
              data-tip="Save current JSON as a new style preset"
              className="icon-check"
            />
            <button
              type="button"
              id="styleSaverDownload"
              data-tip="Download the style as a .json file (can be opened in any text editor)"
              className="icon-download"
            />
            <button
              type="button"
              id="styleSaverLoad"
              data-tip="Open previously downloaded style file"
              className="icon-upload"
            />
            <button
              type="button"
              id="styleSaverCA"
              data-tip="Find or share custom style preset on Cartography Assets portal"
              className="icon-drafting-compass"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
