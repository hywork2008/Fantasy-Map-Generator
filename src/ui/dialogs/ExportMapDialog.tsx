import type React from "react";
import { useState } from "react";
import { exportToJson } from "../../controllers/export-json";
import {
  exportToJpeg,
  exportToPng,
  exportToPngTiles,
  exportToSvg,
  saveGeoJsonCells,
  saveGeoJsonMarkers,
  saveGeoJsonRivers,
  saveGeoJsonRoutes,
  saveGeoJsonZones
} from "../../io/export";
import { invokeActiveZooming } from "../../main";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { Dialog } from "./Dialog";

export const ExportMapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("exportMapData"));
  const closeDialog = useDialogState(state => state.closeDialog);
  const hideLabels = useOptionsState(state => state.hideLabels);
  const setOption = useOptionsState(state => state.setOption);
  const [pngResolution, setPngResolution] = useState(1);

  return (
    <Dialog
      isOpen={isOpen}
      title="Export map data"
      onClose={() => closeDialog("exportMapData")}
      buttons={[{ label: "Close", onClick: () => closeDialog("exportMapData") }]}
      className="-export-map-dialog__width-26em"
    >
      <div id="exportMapData">
        <div className="-export-map-dialog__margin-bottom-0-3em--font-weight-bold">Download image</div>
        <div>
          <button
            type="button"
            onClick={exportToSvg}
            data-tip="Download the map as vector image (open directly in browser or Inkscape)"
          >
            .svg
          </button>
          <button
            type="button"
            onClick={() => exportToPng({ resolution: pngResolution })}
            data-tip="Download visible part of the map as .png (lossless compressed)"
          >
            .png
          </button>
          <button
            type="button"
            onClick={() => exportToJpeg({ resolution: pngResolution })}
            data-tip="Download visible part of the map as .jpeg (lossy compressed) image"
          >
            .jpeg
          </button>
          <button
            type="button"
            onClick={() => {
              void exportToPngTiles();
            }}
            data-tip="Split map into smaller png tiles and download as zip archive"
          >
            tiles
          </button>
          <span data-tip="Check to not allow system to automatically hide labels">
            <input
              id="showLabels"
              className="checkbox"
              type="checkbox"
              checked={!hideLabels}
              onChange={e => {
                setOption("hideLabels", !e.target.checked);
                invokeActiveZooming();
              }}
            />
            <label htmlFor="showLabels" className="checkbox-label -export-map-dialog__margin-left-1-2em">
              <i>show labels</i>
            </label>
          </span>
        </div>
        <div
          data-tip="Define scale of a saved png/jpeg image (e.g. 5x). Saving big images is slow and may cause a browser crash!"
          className="-export-map-dialog__margin-bottom-0-3em"
        >
          PNG / JPEG scale:
          <input
            id="pngResolutionInput"
            data-stored="pngResolution"
            type="range"
            min="1"
            max="8"
            value={pngResolution}
            onChange={e => setPngResolution(Number(e.target.value))}
            className="-export-map-dialog__width-10em"
          />
          <input
            id="pngResolutionOutput"
            data-stored="pngResolution"
            type="number"
            min="1"
            max="8"
            value={pngResolution}
            onChange={e => setPngResolution(Number(e.target.value))}
          />
        </div>
        <p>Generator uses pop-up window to download files. Please ensure your browser does not block popups.</p>
        <div className="-export-map-dialog__margin-1em-0-0-3em--font-weight-bold">Export to GeoJSON</div>
        <div>
          <button type="button" onClick={saveGeoJsonCells} data-tip="Download cells data in GeoJSON format">
            cells
          </button>
          <button type="button" onClick={saveGeoJsonRoutes} data-tip="Download routes data in GeoJSON format">
            routes
          </button>
          <button type="button" onClick={saveGeoJsonRivers} data-tip="Download rivers data in GeoJSON format">
            rivers
          </button>
          <button type="button" onClick={saveGeoJsonMarkers} data-tip="Download markers data in GeoJSON format">
            markers
          </button>
          <button type="button" onClick={saveGeoJsonZones} data-tip="Download zones data in GeoJSON format">
            zones
          </button>
        </div>
        <p>
          GeoJSON format is used in GIS tools such as QGIS. Check out{" "}
          <a
            href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/GIS-data-export"
            target="_blank"
            rel="noreferrer"
          >
            wiki-page
          </a>{" "}
          for guidance.
        </p>
        <div className="-export-map-dialog__margin-1em-0-0-3em--font-weight-bold">Export To JSON</div>
        <div>
          <button type="button" onClick={() => exportToJson("Full")} data-tip="Download full data in JSON">
            full
          </button>
          <button type="button" onClick={() => exportToJson("Minimal")} data-tip="Download minimal data in JSON">
            minimal
          </button>
          <button
            type="button"
            onClick={() => exportToJson("PackCells")}
            data-tip="Download map metadata and pack cells data in JSON"
          >
            pack cells
          </button>
          <button
            type="button"
            onClick={() => exportToJson("GridCells")}
            data-tip="Download map metadata and grid cells data in JSON"
          >
            grid cells
          </button>
        </div>
        <p>Export in JSON format can be used as an API replacement.</p>
      </div>
    </Dialog>
  );
};
