import type React from "react";
import { useMemo, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { exportToPngTiles } from "../../io/export";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
export const ExportToPngTilesDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("exportToPngTilesScreen"));
  const [tileCols, setTileCols] = useState(8);
  const [tileRows, setTileRows] = useState(8);
  const [tileScale, setTileScale] = useState(1);
  const [status, setStatus] = useState("");

  const [sizeLabel, sizeColor] = useMemo(() => {
    const sizeX = worldContext.graphWidth * tileScale * tileCols;
    const sizeY = worldContext.graphHeight * tileScale * tileRows;
    const totalSize = sizeX * sizeY;
    const color = totalSize > 1e9 ? "#d00b0b" : totalSize > 1e8 ? "#9e6409" : "#1a941a";
    return [`${sizeX} x ${sizeY} px`, color];
  }, [tileCols, tileRows, tileScale]);

  const handleExport = () => {
    void exportToPngTiles({
      tilesX: tileCols,
      tilesY: tileRows,
      scale: tileScale,
      onStatus: setStatus
    });
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

      <div data-tip="Number of columns" className="-export-to-png-tiles-dialog__margin-bottom-0-3em">
        <div className="label">Columns:</div>
        <input
          id="tileColsInput"
          data-stored="tileCols"
          type="range"
          min="2"
          max="26"
          value={tileCols}
          className="-export-to-png-tiles-dialog__width-10em"
          onChange={e => setTileCols(Number(e.currentTarget.value))}
        />
        <input
          id="tileColsOutput"
          data-stored="tileCols"
          type="number"
          min="2"
          value={tileCols}
          onChange={e => setTileCols(Number(e.currentTarget.value) || 2)}
        />
      </div>

      <div data-tip="Number of rows" className="-export-to-png-tiles-dialog__margin-bottom-0-3em">
        <div className="label">Rows:</div>
        <input
          id="tileRowsInput"
          data-stored="tileRows"
          type="range"
          min="2"
          max="26"
          value={tileRows}
          className="-export-to-png-tiles-dialog__width-10em"
          onChange={e => setTileRows(Number(e.currentTarget.value))}
        />
        <input
          id="tileRowsOutput"
          data-stored="tileRows"
          type="number"
          min="2"
          value={tileRows}
          onChange={e => setTileRows(Number(e.currentTarget.value) || 2)}
        />
      </div>

      <div data-tip="Tile output scale" className="-export-to-png-tiles-dialog__margin-bottom-0-3em">
        <div className="label">Scale:</div>
        <input
          id="tileScaleInput"
          data-stored="tileScale"
          type="range"
          min="1"
          max="4"
          step="1"
          value={tileScale}
          className="-export-to-png-tiles-dialog__width-10em"
          onChange={e => setTileScale(Number(e.currentTarget.value))}
        />
        <input
          id="tileScaleOutput"
          data-stored="tileScale"
          type="number"
          min="1"
          max="4"
          value={tileScale}
          onChange={e => setTileScale(Number(e.currentTarget.value) || 1)}
        />
      </div>

      <p className="-export-to-png-tiles-dialog__margin-0-4em-0">
        Total image size:{" "}
        <span id="tileSize" style={{ color: sizeColor }}>
          {sizeLabel}
        </span>
      </p>
      <p id="tileStatus" className="-export-to-png-tiles-dialog__margin-top-0-4em--min-height-1-2em">
        {status}
      </p>
    </Dialog>
  );
};
