import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import { buildElevationChartData } from "../../controllers/elevation-profile";
import { ensureRulersReady } from "../../controllers/mapContextMenu";
import { ElevationProfileRenderer } from "../../renderers/elevation-profile-renderer";
import { passClassLabel } from "../../services/routeGrade";
import {
  bestRoute,
  type DirectionsRoute,
  splitTravelDuration,
  TRAVEL_MODES,
  type TravelMode
} from "../../services/travelDirections";
import { viewLayerService as view } from "../../services/viewLayerService";
import { useDialogState } from "../../store/dialogState";
import { useDirectionsDialogState } from "../../store/directionsDialogState";
import { useOptionsState } from "../../store/optionsState";
import { rn } from "../../utils";
import { Dialog } from "./Dialog";
import "./directionsDialog.css";
import { closeDialog } from "./dialogService";

// This dialog is a compact route-picker + summary chart, not the dedicated full-width
// Rivers/Routes elevation profile dialog — a fixed width keeps it from stretching to
// (view.svgWidth - 400), which on a wide map viewport blows the whole dialog out to
// near-fullscreen.
const CHART_WIDTH = 480;
const CHART_HEIGHT = 180;
const X_OFFSET = 80;
const Y_OFFSET = 2;
const BIOMES_HEIGHT = 10;
const ROUTE_HIGHLIGHT_CLASS = "directions-route-highlight";

const MODE_ICON: Record<TravelMode, string> = { foot: "🚶", wagon: "🐎", ship: "⛵" };

type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatDuration(days: number, t: Translate): string {
  const { days: d, hours: h, minutes: m } = splitTravelDuration(days);
  if (d > 0) return t("directions.duration.daysHours", { days: d, hours: h });
  if (h > 0) return t("directions.duration.hoursMinutes", { hours: h, minutes: m });
  return t("directions.duration.minutes", { minutes: Math.max(m, 1) });
}

export const DirectionsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("directions"));
  const { fromName, toName, result, selectedMode, selectedRouteId, selectMode, selectRoute, reset } =
    useDirectionsDialogState();
  const heightUnit = useOptionsState(s => s.heightUnit);
  const distanceUnit = useOptionsState(s => s.distanceUnit);

  const modeResult = selectedMode && result ? result[selectedMode] : null;
  const routes: DirectionsRoute[] = modeResult?.available ? modeResult.routes : [];
  const selectedRoute: DirectionsRoute | null =
    routes.find(route => route.id === selectedRouteId) ?? (modeResult ? bestRoute(modeResult) : null);

  // Highlight the selected route on the map; clear it when it changes or the dialog closes.
  useEffect(() => {
    if (!isOpen || !selectedRoute) return;
    ensureRulersReady();
    if (!view.ruler) return;

    const p = worldContext.pack.cells.p;
    const pointsStr = selectedRoute.cells.map(cell => p[cell].join(",")).join(" ");
    const group = view.ruler.append("g").attr("class", ROUTE_HIGHLIGHT_CLASS).attr("pointer-events", "none");
    group.append("polyline").attr("points", pointsStr).attr("class", "white").attr("stroke-width", 3);
    group
      .append("polyline")
      .attr("points", pointsStr)
      .attr("class", "gray")
      .attr("stroke-width", 3.6)
      .attr("stroke-dasharray", 6);

    return () => {
      view.ruler?.selectAll(`.${ROUTE_HIGHLIGHT_CLASS}`).remove();
    };
  }, [isOpen, selectedRoute]);

  // Elevation chart for the selected land route (ship routes have no grade profile).
  useEffect(() => {
    if (!isOpen || !selectedRoute?.gradeProfile) return;
    const built = buildElevationChartData(selectedRoute.cells, false);
    if (!built) return;

    ElevationProfileRenderer.render("directionsElevationGraph", {
      chartData: built.chartData,
      cellsLength: selectedRoute.cells.length,
      routeLen: selectedRoute.distanceKm,
      chartWidth: CHART_WIDTH,
      chartHeight: CHART_HEIGHT,
      xOffset: X_OFFSET,
      yOffset: Y_OFFSET,
      biomesHeight: BIOMES_HEIGHT,
      worldContext,
      heightUnit,
      distanceUnit,
      curveIndex: 3,
      totalAscent: built.totalAscent,
      totalDescent: built.totalDescent
    });
  }, [isOpen, selectedRoute, heightUnit, distanceUnit]);

  function handleClose(): void {
    view.ruler?.selectAll(`.${ROUTE_HIGHLIGHT_CLASS}`).remove();
    reset();
    closeDialog("directions");
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.directions", { from: fromName, to: toName })}
      onClose={handleClose}
    >
      {result && (
        <div className="directions-dialog">
          <div className="directions-modes" role="tablist">
            {TRAVEL_MODES.map(mode => {
              const modeRes = result[mode];
              const best = bestRoute(modeRes);
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === mode}
                  className={`directions-mode${selectedMode === mode ? " active" : ""}`}
                  disabled={!best}
                  title={!modeRes.available ? t(`directions.reason.${modeRes.reasonKey}`) : undefined}
                  onClick={() => selectMode(mode)}
                >
                  <span className="directions-mode__icon">{MODE_ICON[mode]}</span>
                  <span className="directions-mode__label">{t(`directions.mode.${mode}`)}</span>
                  {best && (
                    <span className="directions-mode__summary">
                      {formatDuration(best.durationDays, t)} · {rn(best.distanceKm)} {distanceUnit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {routes.length > 1 && (
            <div className="directions-routes">
              {routes.map(route => (
                <button
                  key={route.id}
                  type="button"
                  className={`directions-route${route.id === selectedRoute?.id ? " active" : ""}`}
                  onClick={() => selectRoute(route.id)}
                >
                  <span className="directions-route__label">{t(`directions.route.${route.labelKey}`)}</span>
                  <span className="directions-route__stats">
                    {formatDuration(route.durationDays, t)} · {rn(route.distanceKm)} {distanceUnit}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedRoute?.gradeProfile ? (
            <div>
              <div id="directionsElevationGraph" />
              <div className="directions-grade-summary">
                {t("directions.gradeSummary", {
                  maxGrade: rn(selectedRoute.gradeProfile.maxAbsGrade * 100, 1),
                  ascent: rn(selectedRoute.ascentM),
                  descent: rn(selectedRoute.descentM),
                  heightUnit,
                  difficulty: passClassLabel(selectedRoute.gradeProfile.worstClass)
                })}
              </div>
            </div>
          ) : selectedRoute ? (
            <div className="directions-flat-note">{t("directions.noElevation")}</div>
          ) : (
            <div className="directions-empty">{t("directions.noRoute")}</div>
          )}
        </div>
      )}
    </Dialog>
  );
};
