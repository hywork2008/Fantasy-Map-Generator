import type React from "react";
import { useEffect } from "react";
import { connectToDropbox, loadURL } from "../../controllers/options";
import { createSharableDropboxLink, loadFromDropbox, quickLoad, uploadMap } from "../../io/load";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog, closeDialogs } from "./dialogService";

export const LoadMapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("loadMapData"));

  useEffect(() => {
    const mapToLoad = document.getElementById("mapToLoad") as HTMLInputElement | null;
    if (!mapToLoad) return;

    const handleChange = function (this: HTMLInputElement) {
      const fileToLoad = this.files![0];
      this.value = "";
      closeDialogs();
      uploadMap(fileToLoad);
    };

    mapToLoad.addEventListener("change", handleChange);
    return () => mapToLoad.removeEventListener("change", handleChange);
  }, []);

  const handleLoadFromMachine = () => {
    document.getElementById("mapToLoad")?.click();
  };

  return (
    <Dialog isOpen={isOpen} title="Load Map" onClose={() => closeDialog("loadMapData")}>
      <div>
        <strong>Load map from</strong>{" "}
        <button
          data-tip="Load map file (.map or .gz) from your local disk"
          type="button"
          onClick={handleLoadFromMachine}
        >
          machine
        </button>{" "}
        <button
          data-tip="Load map file (.map or .gz) file from URL. Note that the server should allow CORS"
          type="button"
          onClick={() => loadURL()}
        >
          URL
        </button>{" "}
        <button type="button" data-tip="Load map from browser storage (if saved before)" onClick={() => quickLoad()}>
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
            onClick={() => connectToDropbox()}
          >
            Connect
          </button>
        </p>

        <select id="loadFromDropboxSelect" style={{ width: "22em" }}></select>
        <div id="loadFromDropboxButtons" style={{ marginBottom: "0.6em" }}>
          <button
            type="button"
            data-tip="Load map file (.map or .gz) from your Dropbox"
            onClick={() => loadFromDropbox()}
          >
            Load
          </button>{" "}
          <button
            data-tip="Select file and create a link to share with your friends"
            type="button"
            onClick={() => createSharableDropboxLink()}
          >
            Share
          </button>
        </div>

        <div style={{ marginTop: "0.3em" }}>
          <div id="sharableLinkContainer" style={{ display: "none" }}>
            {/* biome-ignore lint/a11y/useValidAnchor: href is set dynamically by legacy JS before the link is displayed */}
            <a id="sharableLink" href="#" target="_blank" rel="noreferrer">
              {" "}
            </a>
            <i data-tip="Copy link to the clipboard" className="icon-clone pointer"></i>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
