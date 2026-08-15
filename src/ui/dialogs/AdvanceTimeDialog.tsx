import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { simulationContext } from "../../context/simulationContext";
import { useDialogState } from "../../store/dialogState";
import { useTimeSimulationState } from "../../store/timeSimulationState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const AdvanceTimeDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("advanceTime"));
  const { isRunning, progress, totalDays, stopSimulation } = useTimeSimulationState();

  const [simulationClock, setSimulationClock] = useState(() => ({
    currentYear: simulationContext.currentYear,
    currentMonth: simulationContext.currentMonth,
    currentDay: simulationContext.currentDay,
    era: simulationContext.era
  }));
  const [advanceYears, setAdvanceYears] = useState(1);
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [advanceDays, setAdvanceDays] = useState(1);

  useEffect(() => {
    const onSimulationUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        currentYear: number;
        currentMonth: number;
        currentDay: number;
        era: string;
      };
      setSimulationClock(detail);
    };
    document.addEventListener("fmg:simulation-updated", onSimulationUpdated);
    return () => document.removeEventListener("fmg:simulation-updated", onSimulationUpdated);
  }, []);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.advanceTime")}
      onClose={() => closeDialog("advanceTime")}
      style={{ minWidth: "280px" }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <span data-tip={t("dialogs.advanceTime.clockTip")}>
          {simulationClock.currentYear} / {simulationClock.currentMonth} / {simulationClock.currentDay}{" "}
          {simulationClock.era}
        </span>
        {isRunning ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "5px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{t("dialogs.advanceTime.simulating")}</span>
              <span>{Math.floor((progress / totalDays) * 100)}%</span>
            </div>
            <progress value={progress} max={totalDays} style={{ width: "100%" }} />
            <button
              type="button"
              onClick={stopSimulation}
              style={{ marginTop: "5px", background: "indianred", color: "white", flex: 1 }}
            >
              {t("dialogs.advanceTime.stop")}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "5px" }}>
              <input
                type="number"
                min={0}
                step={1}
                value={advanceYears}
                onChange={e => setAdvanceYears(Number(e.target.value))}
                data-tip={t("dialogs.advanceTime.yearsTip")}
              />
              <button
                data-tip={t("dialogs.advanceTime.advanceYearTip")}
                type="button"
                style={{ flex: 1 }}
                onClick={() => {
                  document.dispatchEvent(
                    new CustomEvent("react-tool-action", {
                      detail: { action: "advanceTimeButton", years: advanceYears, months: 0, days: 0 }
                    })
                  );
                }}
              >
                {t("dialogs.advanceTime.advanceYear")}
              </button>
            </div>
            <div style={{ display: "flex", gap: "5px" }}>
              <input
                type="number"
                min={0}
                step={1}
                value={advanceMonths}
                onChange={e => setAdvanceMonths(Number(e.target.value))}
                data-tip={t("dialogs.advanceTime.monthsTip")}
              />
              <button
                data-tip={t("dialogs.advanceTime.advanceMonthTip")}
                type="button"
                style={{ flex: 1 }}
                onClick={() => {
                  document.dispatchEvent(
                    new CustomEvent("react-tool-action", {
                      detail: { action: "advanceTimeButton", years: 0, months: advanceMonths, days: 0 }
                    })
                  );
                }}
              >
                {t("dialogs.advanceTime.advanceMonth")}
              </button>
            </div>
            <div style={{ display: "flex", gap: "5px" }}>
              <input
                type="number"
                min={0}
                step={1}
                value={advanceDays}
                onChange={e => setAdvanceDays(Number(e.target.value))}
                data-tip={t("dialogs.advanceTime.daysTip")}
              />
              <button
                data-tip={t("dialogs.advanceTime.advanceDayTip")}
                type="button"
                style={{ flex: 1 }}
                onClick={() => {
                  document.dispatchEvent(
                    new CustomEvent("react-tool-action", {
                      detail: { action: "advanceTimeButton", years: 0, months: 0, days: advanceDays }
                    })
                  );
                }}
              >
                {t("dialogs.advanceTime.advanceDay")}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
