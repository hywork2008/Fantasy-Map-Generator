import type React from "react";
import { saveMap } from "../../io/save";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";

export const SaveMapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("saveMapData"));
  const closeDialog = useDialogState(state => state.closeDialog);

  return (
    <Dialog
      isOpen={isOpen}
      title="Save map"
      onClose={() => closeDialog("saveMapData")}
      buttons={[{ label: "Close", onClick: () => closeDialog("saveMapData") }]}
      className="-save-map-dialog__width-25em"
    >
      <div style={{ marginTop: "0.3em" }}>
        <strong>Save map to</strong>
        <button
          data-tip="Download map file to your local disk"
          className="-save-map-dialog__font-weight-600"
          type="button"
          onClick={() => saveMap("machine")}
        >
          machine
        </button>
        <button type="button" data-tip="Save map file to your Dropbox" onClick={() => saveMap("dropbox")}>
          dropbox
        </button>
        <button type="button" data-tip="Save the project to browser storage only" onClick={() => saveMap("storage")}>
          browser
        </button>
      </div>
      <p>
        Maps are saved in <i>.map</i> format, that can be loaded back via the <i>Load</i> in menu. There is no way to
        restore the progress if file is lost. Please keep old save files on your machine or cloud storage as backups.
      </p>
    </Dialog>
  );
};
