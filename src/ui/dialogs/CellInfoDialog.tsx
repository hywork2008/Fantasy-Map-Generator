import type React from "react";
import { useTranslation } from "react-i18next";
import { useCellInfoState } from "../../store/cellInfoState";
import { useDialogState } from "../../store/dialogState";
import { useExtensionState } from "../../store/extensionState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CellInfoDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("cellInfo"));
  const info = useCellInfoState();
  const cellInfoRows = useExtensionState(state => state.cellInfoRows);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.cellInfo")}
      onClose={() => closeDialog("cellInfo")}
      className="fmg-dialog--cell-info"
    >
      <div className="cell-info-actions">
        <button
          type="button"
          className={info.isPinned ? "pressed" : undefined}
          aria-pressed={info.isPinned}
          data-tip={info.isPinned ? t("dialogs.cellInfo.followTip") : t("dialogs.cellInfo.pinTip")}
          onClick={info.togglePinned}
        >
          {info.isPinned ? t("dialogs.cellInfo.follow") : t("dialogs.cellInfo.pin")}
        </button>
      </div>
      <table id="cellInfo" className="fmg-table">
        <tbody>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.cell")}</th>
            <td>{info.cell}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.x")}</th>
            <td>{info.x}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.y")}</th>
            <td>{info.y}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.latitude")}</th>
            <td>{info.lat}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.longitude")}</th>
            <td>{info.lon}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.geozone")}</th>
            <td>{info.geozone}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.area")}</th>
            <td>{info.area}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.type")}</th>
            <td>{info.feature}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.precipitation")}</th>
            <td>{info.prec}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.river")}</th>
            <td>{info.river}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.riverFlowTip")}>
              {t("dialogs.cellInfo.riverFlow")}
            </th>
            <td>{info.riverSurfaceVelocity}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.riverDepthTip")}>
              {t("dialogs.cellInfo.riverDepth")}
            </th>
            <td>{info.riverWaterDepth}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.riverTempTip")}>
              {t("dialogs.cellInfo.riverTemp")}
            </th>
            <td>{info.riverWaterTemperature}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.population")}</th>
            <td>{info.population}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.livelihoodTip")}>
              {t("dialogs.cellInfo.livelihood")}
            </th>
            <td>{info.livelihood}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.localFoodTip")}>
              {t("dialogs.cellInfo.localFood")}
            </th>
            <td>{info.subsistenceCapacity}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.elevation")}</th>
            <td>{info.elevation}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.depth")}</th>
            <td>{info.depth}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.temperature")}</th>
            <td>{info.temp}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.waterTempTip")}>
              {t("dialogs.cellInfo.waterTemp")}
            </th>
            <td>{info.waterTemp}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.currentDirectionTip")}>
              {t("dialogs.cellInfo.currentDirection")}
            </th>
            <td>{info.currentDirection}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.currentSpeedTip")}>
              {t("dialogs.cellInfo.currentSpeed")}
            </th>
            <td>{info.currentSpeed}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.enclosureTip")}>
              {t("dialogs.cellInfo.enclosure")}
            </th>
            <td>{info.enclosure}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.biome")}</th>
            <td>{info.biome}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.forestClearanceTip")}>
              {t("dialogs.cellInfo.forestClearance")}
            </th>
            <td>{info.forestClearance}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.coastalHabitatTip")}>
              {t("dialogs.cellInfo.coastalHabitat")}
            </th>
            <td>{info.coastalHabitat}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.nearshoreHabitatTip")}>
              {t("dialogs.cellInfo.nearshoreHabitat")}
            </th>
            <td>{info.nearshoreHabitat}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.state")}</th>
            <td>{info.state}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.province")}</th>
            <td>{info.province}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.culture")}</th>
            <td>{info.culture}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.religion")}</th>
            <td>{info.religion}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.burg")}</th>
            <td>{info.burg}</td>
          </tr>
          <tr>
            <th scope="row">{t("dialogs.cellInfo.danger")}</th>
            <td>{info.danger}</td>
          </tr>
          {cellInfoRows.map(row => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>
                {info.extra[row.id] ?? "n/a"}
                {row.action && (
                  <button
                    type="button"
                    className="cell-info-row-action"
                    data-tip={row.action.tip}
                    onClick={row.action.onClick}
                  >
                    {row.action.label}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
};
