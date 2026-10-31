import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { simulationContext } from "../../context/simulationContext";
import { worldContext } from "../../context/worldContext";
import { toggleCells } from "../../controllers/layers";
import { getCellClimateNormals } from "../../generators/cellClimateNormals";
import { worldRuntime } from "../../runtime/worldRuntime";
import { getDisplayedPrecipitation } from "../../services/cellInfoService";
import { useCellInfoState } from "../../store/cellInfoState";
import { useDialogState } from "../../store/dialogState";
import { useExtensionState } from "../../store/extensionState";
import { usePrecipitationDisplayState } from "../../store/precipitationDisplayState";
import { layerIsOn } from "../../utils/layerUtils";
import { getDrySeasonCandidates } from "../../utils/precipitationSeasonality";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CellInfoDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("cellInfo"));
  const info = useCellInfoState();
  const cellInfoRows = useExtensionState(state => state.cellInfoRows);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      const state = useCellInfoState.getState();
      const cell = state.cellId;
      if (cell === null) return;
      const gridCell = worldContext.pack.cells.g[cell];
      state.updateInfo({
        climateNormals: getCellClimateNormals(worldContext, gridCell, simulationContext.currentYear),
        prec: worldContext.pack.cells.h[cell] >= 20 ? getDisplayedPrecipitation(cell) : "n/a"
      });
    };
    const stopRuntime = worldRuntime.subscribe(commit => {
      if (
        commit.changes.fullReplace ||
        commit.changes.changes.some(c => c.topic === "simulation.cells" || c.topic === "map.physical")
      )
        refresh();
    });
    const stopDisplay = usePrecipitationDisplayState.subscribe(refresh);
    return () => {
      stopRuntime();
      stopDisplay();
    };
  }, [isOpen]);

  // Show the Cells layer while the dialog is open; restore it only if the dialog enabled it.
  useEffect(() => {
    if (!isOpen || layerIsOn("toggleCells")) return;
    toggleCells();
    return () => {
      if (layerIsOn("toggleCells")) toggleCells();
    };
  }, [isOpen]);

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
            <th scope="row" data-tip={t("dialogs.cellInfo.temperatureTip")}>
              {t("dialogs.cellInfo.temperature")}
            </th>
            <td>{t("dialogs.cellInfo.temperatureValue", { current: info.temp, annual: info.annualTemp })}</td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.windTip")}>
              {t("dialogs.cellInfo.wind")}
            </th>
            <td>{info.wind}</td>
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
            <th scope="row" data-tip={t("dialogs.cellInfo.funeralTip")}>
              {t("dialogs.cellInfo.funeral")}
            </th>
            <td>
              {info.funeralRite === "n/a"
                ? "n/a"
                : t(`funeralRites.${info.funeralRite}`, { defaultValue: info.funeralRite })}
            </td>
          </tr>
          <tr>
            <th scope="row" data-tip={t("dialogs.cellInfo.funeralRemainsTip")}>
              {t("dialogs.cellInfo.funeralRemains")}
            </th>
            <td>{info.funeralRemains}</td>
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
          {info.fireSpirits && info.fireSpirits !== "n/a" && (
            <tr>
              <th scope="row">{t("generation.fireSpirits")}</th>
              <td>{info.fireSpirits}</td>
            </tr>
          )}
          {info.gremlins && info.gremlins !== "n/a" && (
            <tr>
              <th scope="row">{t("generation.gremlins")}</th>
              <td>{info.gremlins}</td>
            </tr>
          )}
          {info.climateNormals && (
            <tr>
              <th scope="row">{t("dialogs.cellInfo.monthlyClimate", "Monthly climate")}</th>
              <td>
                <details>
                  <summary>
                    {info.climateNormals.annualPrecipitationMm.toFixed(1)} mm/year ·{" "}
                    {info.climateNormals.precipitationSeasonalitySource} ·{" "}
                    {Math.round(info.climateNormals.precipitationSeasonalityConfidence * 100)}%
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>{t("dialogs.cellInfo.month", "Month")}</th>
                        <th>°C</th>
                        <th>mm/month</th>
                        <th>{t("dialogs.cellInfo.moistureSupply", "Ocean supply")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(info.climateNormals.monthlyPrecipitationMm, (p, m) => (
                        // Month indices are immutable calendar identities, not reorderable rows.
                        // biome-ignore lint/suspicious/noArrayIndexKey: January through December are fixed identities.
                        <tr key={m}>
                          <td>{m + 1}</td>
                          <td>{info.climateNormals!.monthlyMeanTemperatureC[m].toFixed(1)}</td>
                          <td>{p.toFixed(1)}</td>
                          <td>{info.climateNormals!.monthlyMoistureSupply[m].toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    {t("dialogs.cellInfo.wetThreeMonths", "Wettest three months")}: {(() => {
                      const c = info.climateNormals!;
                      const sums = Array.from(
                        { length: 12 },
                        (_, m) =>
                          c.monthlyPrecipitationMm[m] +
                          c.monthlyPrecipitationMm[(m + 1) % 12] +
                          c.monthlyPrecipitationMm[(m + 2) % 12]
                      );
                      const peak = Math.max(...sums),
                        start = sums.indexOf(peak);
                      return `${start + 1}–${((start + 2) % 12) + 1}: ${c.annualPrecipitationMm > 0 ? ((100 * peak) / c.annualPrecipitationMm).toFixed(1) : 0}%`;
                    })()}
                  </p>
                  <p>
                    {t("dialogs.cellInfo.drySeason", "Dry season candidates")}: {(() => {
                      const dry = getDrySeasonCandidates(info.climateNormals);
                      return dry.status === "seasonal"
                        ? dry.intervals
                            .map(i => `${i.startMonth}–${((i.startMonth + i.length - 2) % 12) + 1}`)
                            .join(", ")
                        : dry.status;
                    })()}
                  </p>
                  {info.climateNormals.invalidAnnualPrecipitation && <p>invalidAnnualPrecipitation</p>}
                  {info.climateNormals.precipitationOutsideEarthlikeTilt && (
                    <p>{t("dialogs.cellInfo.outsideEarthlikeTilt", "Axial tilt outside the Earth-like model range")}</p>
                  )}
                </details>
              </td>
            </tr>
          )}
          {cellInfoRows.map(row => (
            <tr key={row.id}>
              <th scope="row">{t(`extensions.cellInfo.${row.id}`, { defaultValue: row.label })}</th>
              <td>
                {info.extra[row.id] ?? "n/a"}
                {row.action && (
                  <button
                    type="button"
                    className="cell-info-row-action"
                    data-tip={t(`extensions.cellInfoActions.${row.id}Tip`, { defaultValue: row.action.tip })}
                    onClick={row.action.onClick}
                  >
                    {t(`extensions.cellInfoActions.${row.id}`, { defaultValue: row.action.label })}
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
