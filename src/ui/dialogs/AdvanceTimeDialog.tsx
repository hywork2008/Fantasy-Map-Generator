import type React from "react";
import { useEffect, useState } from "react";
import { simulationContext } from "../../context/simulationContext";
import { useDialogState } from "../../store/dialogState";
import { useTimeSimulationState } from "../../store/timeSimulationState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const AdvanceTimeDialog: React.FC = () => {
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
      title="Advance Time"
      onClose={() => closeDialog("advanceTime")}
      style={{ minWidth: "280px" }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <span data-tip="Current in-world year, month, day, and era">
          {simulationClock.currentYear} / {simulationClock.currentMonth} / {simulationClock.currentDay}{" "}
          {simulationClock.era}
        </span>
        {isRunning ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "5px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Simulating...</span>
              <span>{Math.floor((progress / totalDays) * 100)}%</span>
            </div>
            <progress value={progress} max={totalDays} style={{ width: "100%" }} />
            <button
              type="button"
              onClick={stopSimulation}
              style={{ marginTop: "5px", background: "indianred", color: "white", flex: 1 }}
            >
              Stop
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
                data-tip="Years to advance"
              />
              <button
                data-tip="Click to advance the world's simulation clock by a number of years"
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
                Advance Year
              </button>
            </div>
            <div style={{ display: "flex", gap: "5px" }}>
              <input
                type="number"
                min={0}
                step={1}
                value={advanceMonths}
                onChange={e => setAdvanceMonths(Number(e.target.value))}
                data-tip="Months to advance"
              />
              <button
                data-tip="Click to advance the world's simulation clock by a number of months"
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
                Advance Month
              </button>
            </div>
            <div style={{ display: "flex", gap: "5px" }}>
              <input
                type="number"
                min={0}
                step={1}
                value={advanceDays}
                onChange={e => setAdvanceDays(Number(e.target.value))}
                data-tip="Days to advance"
              />
              <button
                data-tip="Click to advance the world's simulation clock by a number of days"
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
                Advance Day
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
