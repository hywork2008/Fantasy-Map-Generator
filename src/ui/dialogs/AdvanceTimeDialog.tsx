import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { simulationContext } from "../../context/simulationContext";
import {
  FAST_ADVANCE_PRESET_SELECT_IDS,
  type FastAdvancePresetId
} from "../../generators/fastAdvance/fastAdvancePresets";
import { useDialogState } from "../../store/dialogState";
import { useFastAdvanceState } from "../../store/fastAdvanceState";
import { useTimeSimulationState } from "../../store/timeSimulationState";
import { Dialog } from "./Dialog";
import { closeDialog, openDialog } from "./dialogService";

export const AdvanceTimeDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("advanceTime"));
  const { isRunning, progress, totalDays, stopSimulation } = useTimeSimulationState();
  const fastAdvanceEnabled = useFastAdvanceState(state => state.enabled);
  const fastAdvancePreset = useFastAdvanceState(state => state.preset);
  const setFastAdvanceEnabled = useFastAdvanceState(state => state.setEnabled);
  const setFastAdvancePreset = useFastAdvanceState(state => state.setPreset);

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            padding: "5px",
            border: "1px solid",
            borderRadius: "4px"
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={fastAdvanceEnabled}
              onChange={e => setFastAdvanceEnabled(e.target.checked)}
            />
            <span data-tip={t("dialogs.advanceTime.fastForwardEnableTip")}>
              {t("dialogs.advanceTime.fastForwardEnable")}
            </span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <select
              value={fastAdvancePreset}
              disabled={!fastAdvanceEnabled}
              onChange={e => setFastAdvancePreset(e.target.value as FastAdvancePresetId)}
              data-tip={t("dialogs.advanceTime.fastForwardPresetLabel")}
              style={{ flex: 1 }}
            >
              {FAST_ADVANCE_PRESET_SELECT_IDS.map(id => (
                <option key={id} value={id}>
                  {t(`dialogs.advanceTime.fastForwardPresets.${id}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!fastAdvanceEnabled}
              onClick={() => openDialog("fastAdvanceSettings")}
              data-tip={t("dialogs.advanceTime.fastForwardSettingsTip")}
              aria-label={t("dialogs.advanceTime.fastForwardSettings")}
            >
              ⚙
            </button>
          </div>
        </div>
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
