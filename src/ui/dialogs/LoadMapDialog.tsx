import type React from "react";
import { useEffect } from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const LoadMapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("loadMapData"));

  // Using effects to run global code only when dialog is open and rendered, if necessary
  useEffect(() => {
    if (!isOpen) return;

    const mapToLoad = document.getElementById("mapToLoad");
    if (!mapToLoad) {
      // Create hidden file input if it doesn't exist
      const input = document.createElement("input");
      input.type = "file";
      input.id = "mapToLoad";
      input.style.display = "none";
      input.accept = ".map,.gz";
      document.body.appendChild(input);

      // We expect the original main.ts to attach event listeners to it.
      // If it doesn't, we can attach it here if needed, but original code did that on window load.
      // Actually main.ts already created <input id="mapToLoad">? No, it's in index.html line 4310.
      // Wait, let's see where mapToLoad is.
    }
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Load Map" onClose={() => closeDialog("loadMapData")}>
      <div>
        <strong>Load map from</strong>{" "}
        <button data-tip="Load map file (.map or .gz) from your local disk" type="button">
          machine
        </button>{" "}
        <button
          data-tip="Load map file (.map or .gz) file from URL. Note that the server should allow CORS"
          type="button"
        >
          URL
        </button>{" "}
        <button type="button" data-tip="Load map from browser storage (if saved before)">
          storage
        </button>
      </div>

      <p>
        Click on <i>storage</i> to open the last saved map.
      </p>

      <div id="loadFromDropbox">
        <p style={{ marginBottom: "0.3em" }}>
          Or load from your Dropbox account{" "}
          <button
            id="dropboxConnectButton"
            data-tip="Connect your Dropbox account to be able to load maps from it"
            type="button"
          >
            Connect
          </button>
        </p>

        <select id="loadFromDropboxSelect" style={{ width: "22em" }}></select>
        <div id="loadFromDropboxButtons" style={{ marginBottom: "0.6em" }}>
          <button type="button" data-tip="Load map file (.map or .gz) from your Dropbox">
            Load
          </button>{" "}
          <button data-tip="Select file and create a link to share with your friends" type="button">
            Share
          </button>
        </div>

        <div style={{ marginTop: "0.3em" }}>
          <div id="sharableLinkContainer" style={{ display: "none" }}>
            <a id="sharableLink" target="_blank" rel="noreferrer">
              {" "}
            </a>
            <i data-tip="Copy link to the clipboard" className="icon-clone pointer"></i>
          </div>
        </div>
      </div>

      {/* We need to ensure that the buttons in the legacy code have equivalents here, 
          since the original dialog had no buttons pane, only content buttons. */}
    </Dialog>
  );
};
