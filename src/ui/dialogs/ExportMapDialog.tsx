import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("exportMapData"));
  const closeDialog = useDialogState(state => state.closeDialog);
  const hideLabels = useOptionsState(state => state.hideLabels);
  const setOption = useOptionsState(state => state.setOption);
  const [pngResolution, setPngResolution] = useState(1);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.exportMap")}
      onClose={() => closeDialog("exportMapData")}
      buttons={[{ label: t("common.close"), onClick: () => closeDialog("exportMapData") }]}
    >
      <div id="exportMapData">
        <div>{t("dialogs.export.downloadImage")}</div>
        <div>
          <button type="button" onClick={exportToSvg} data-tip={t("dialogs.export.svgTip")}>
            .svg
          </button>
          <button
            type="button"
            onClick={() => exportToPng({ resolution: pngResolution })}
            data-tip={t("dialogs.export.pngTip")}
          >
            .png
          </button>
          <button
            type="button"
            onClick={() => exportToJpeg({ resolution: pngResolution })}
            data-tip={t("dialogs.export.jpegTip")}
          >
            .jpeg
          </button>
          <button
            type="button"
            onClick={() => {
              void exportToPngTiles();
            }}
            data-tip={t("dialogs.export.tilesTip")}
          >
            {t("dialogs.export.tiles")}
          </button>
          <span data-tip={t("dialogs.export.showLabelsTip")}>
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
            <label htmlFor="showLabels" className="checkbox-label">
              <i>{t("dialogs.export.showLabels")}</i>
            </label>
          </span>
        </div>
        <div data-tip={t("dialogs.export.scaleTip")}>
          {t("dialogs.export.scale")}
          <input
            id="pngResolutionInput"
            data-stored="pngResolution"
            type="range"
            min="1"
            max="8"
            value={pngResolution}
            onChange={e => setPngResolution(Number(e.target.value))}
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
        <p>{t("dialogs.export.popupNote")}</p>
        <div>{t("dialogs.export.geoJson")}</div>
        <div>
          <button type="button" onClick={saveGeoJsonCells} data-tip={t("dialogs.export.cellsTip")}>
            {t("dialogs.export.cells")}
          </button>
          <button type="button" onClick={saveGeoJsonRoutes} data-tip={t("dialogs.export.routesTip")}>
            {t("dialogs.export.routes")}
          </button>
          <button type="button" onClick={saveGeoJsonRivers} data-tip={t("dialogs.export.riversTip")}>
            {t("dialogs.export.rivers")}
          </button>
          <button type="button" onClick={saveGeoJsonMarkers} data-tip={t("dialogs.export.markersTip")}>
            {t("dialogs.export.markers")}
          </button>
          <button type="button" onClick={saveGeoJsonZones} data-tip={t("dialogs.export.zonesTip")}>
            {t("dialogs.export.zones")}
          </button>
        </div>
        <p>
          {t("dialogs.export.wikiLead")}{" "}
          <a
            href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/GIS-data-export"
            target="_blank"
            rel="noreferrer"
          >
            {t("dialogs.export.wiki")}
          </a>{" "}
          {t("dialogs.export.wikiTrail")}
        </p>
        <div>{t("dialogs.export.json")}</div>
        <div>
          <button type="button" onClick={() => exportToJson("Full")} data-tip={t("dialogs.export.fullTip")}>
            {t("dialogs.export.full")}
          </button>
          <button type="button" onClick={() => exportToJson("Minimal")} data-tip={t("dialogs.export.minimalTip")}>
            {t("dialogs.export.minimal")}
          </button>
          <button type="button" onClick={() => exportToJson("PackCells")} data-tip={t("dialogs.export.packCellsTip")}>
            {t("dialogs.export.packCells")}
          </button>
          <button type="button" onClick={() => exportToJson("GridCells")} data-tip={t("dialogs.export.gridCellsTip")}>
            {t("dialogs.export.gridCells")}
          </button>
        </div>
        <p>{t("dialogs.export.jsonNote")}</p>
      </div>
    </Dialog>
  );
};
