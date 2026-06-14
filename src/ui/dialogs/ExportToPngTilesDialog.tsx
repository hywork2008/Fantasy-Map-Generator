import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { callWindowFn } from "../../utils/windowGlobals";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ExportToPngTilesDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("exportToPngTilesScreen"));

  const handleExport = () => {
    callWindowFn("exportToPngTiles");
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Export to PNG tiles"
      onClose={() => closeDialog("exportToPngTilesScreen")}
      buttons={[
        {
          label: "Export",
          onClick: handleExport
        },
        {
          label: "Cancel",
          onClick: () => closeDialog("exportToPngTilesScreen")
        }
      ]}
    >
      <p>Map will be split into tiles and downloaded as a single zip file. Avoid saving too large images</p>

      <div data-tip="Number of columns" style={{ marginBottom: "0.3em" }}>
        <div className="label">Columns:</div>
        <input
          id="tileColsInput"
          data-stored="tileCols"
          type="range"
          min="2"
          max="26"
          defaultValue="8"
          style={{ width: "10em" }}
          onInput={e => {
            const out = document.getElementById("tileColsOutput") as HTMLInputElement;
            if (out) out.value = e.currentTarget.value;
          }}
        />
        <input
          id="tileColsOutput"
          data-stored="tileCols"
          type="number"
          min="2"
          defaultValue="8"
          onInput={e => {
            const inp = document.getElementById("tileColsInput") as HTMLInputElement;
            if (inp) inp.value = e.currentTarget.value;
          }}
        />
      </div>

      <div data-tip="Number of rows" style={{ marginBottom: "0.3em" }}>
        <div className="label">Rows:</div>
        <input
          id="tileRowsInput"
          data-stored="tileRows"
          type="range"
          min="2"
          max="26"
          defaultValue="8"
          style={{ width: "10em" }}
          onInput={e => {
            const out = document.getElementById("tileRowsOutput") as HTMLInputElement;
            if (out) out.value = e.currentTarget.value;
          }}
        />
        <input
          id="tileRowsOutput"
          data-stored="tileRows"
          type="number"
          min="2"
          defaultValue="8"
          onInput={e => {
            const inp = document.getElementById("tileRowsInput") as HTMLInputElement;
            if (inp) inp.value = e.currentTarget.value;
          }}
        />
      </div>
    </Dialog>
  );
};
