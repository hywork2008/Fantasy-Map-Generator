import type React from "react";
import { useTranslation } from "react-i18next";
import {
  FAST_ADVANCE_PRESET_SELECT_IDS,
  FAST_ADVANCE_PRESETS,
  type FastAdvancePresetId,
  type FastAdvanceRates
} from "../../generators/fastAdvance/fastAdvancePresets";
import {
  HISTORY_MODE_PROFILE_IDS,
  HISTORY_MODE_PROFILES,
  type HistoryModeProfile,
  type HistoryModeProfileId,
  type StubFundingConfig
} from "../../generators/fastAdvance/historyModeProfiles";
import { listRegisteredSimulationSystemIds } from "../../generators/timeEngine";
import { useDialogState } from "../../store/dialogState";
import { useFastAdvanceState } from "../../store/fastAdvanceState";
import { SliderInput } from "../components/SliderInput";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const DIALOG_ID = "fastAdvanceSettings";

/**
 * The ⚙ dialog behind AdvanceTimeDialog's Fast-Forward row (docs/plan/advance-time-fast-forward.md §6).
 *
 * A radio group over every preset plus an "Advanced" section of growth-rate sliders. The sliders are
 * editable only while the "custom" preset is selected; a named preset shows its rate vector read-only.
 * Slider ranges are wide enough to display every named preset's value (treasury in particular spans
 * -65…+15 after the §5.3.3 calibration), not just the narrower §5.1 editing bands.
 */
interface RateSliderSpec {
  key: keyof FastAdvanceRates;
  labelKey: string;
  tipKey: string;
  unitKey: "dialogs.advanceTime.fastForwardPctPerYear" | "dialogs.advanceTime.fastForwardPct";
  min: number;
  max: number;
  step: number;
}

const RATE_SLIDERS: readonly RateSliderSpec[] = [
  {
    key: "populationGrowthPctPerYear",
    labelKey: "dialogs.advanceTime.fastForwardPopulationGrowth",
    tipKey: "dialogs.advanceTime.fastForwardPopulationGrowthTip",
    unitKey: "dialogs.advanceTime.fastForwardPctPerYear",
    min: -5,
    max: 5,
    step: 0.1
  },
  {
    key: "priceInflationPctPerYear",
    labelKey: "dialogs.advanceTime.fastForwardPriceInflation",
    tipKey: "dialogs.advanceTime.fastForwardPriceInflationTip",
    unitKey: "dialogs.advanceTime.fastForwardPctPerYear",
    min: -5,
    max: 8,
    step: 0.1
  },
  {
    key: "goodsStockGrowthPctPerYear",
    labelKey: "dialogs.advanceTime.fastForwardGoodsStockGrowth",
    tipKey: "dialogs.advanceTime.fastForwardGoodsStockGrowthTip",
    unitKey: "dialogs.advanceTime.fastForwardPctPerYear",
    min: -10,
    max: 25,
    step: 0.5
  },
  {
    key: "treasuryGrowthPctPerYear",
    labelKey: "dialogs.advanceTime.fastForwardTreasuryGrowth",
    tipKey: "dialogs.advanceTime.fastForwardTreasuryGrowthTip",
    unitKey: "dialogs.advanceTime.fastForwardPctPerYear",
    min: -80,
    max: 20,
    step: 1
  },
  {
    key: "variancePct",
    labelKey: "dialogs.advanceTime.fastForwardVariance",
    tipKey: "dialogs.advanceTime.fastForwardVarianceTip",
    unitKey: "dialogs.advanceTime.fastForwardPct",
    min: 0,
    max: 50,
    step: 1
  }
];

interface StubSliderSpec {
  key: keyof Omit<StubFundingConfig, "enabled">;
  labelKey: string;
  tipKey: string;
  min: number;
  max: number;
  step: number;
}

/**
 * Stub-funding knobs (docs/plan/advance-time-history-mode.md §6.3). `upkeepRatio` and
 * `warUpkeepMultiplier` are the decline knobs — their product above 1 is what makes a long war
 * bankrupt a realm and stop its expansion.
 */
const STUB_SLIDERS: readonly StubSliderSpec[] = [
  {
    key: "revenuePerCapitaPerYear",
    labelKey: "dialogs.advanceTime.historyStubRevenue",
    tipKey: "dialogs.advanceTime.historyStubRevenueTip",
    min: 0,
    max: 1,
    step: 0.01
  },
  {
    key: "upkeepRatio",
    labelKey: "dialogs.advanceTime.historyStubUpkeep",
    tipKey: "dialogs.advanceTime.historyStubUpkeepTip",
    min: 0,
    max: 1.5,
    step: 0.05
  },
  {
    key: "warUpkeepMultiplier",
    labelKey: "dialogs.advanceTime.historyStubWarUpkeep",
    tipKey: "dialogs.advanceTime.historyStubWarUpkeepTip",
    min: 1,
    max: 4,
    step: 0.1
  },
  {
    key: "floorRatio",
    labelKey: "dialogs.advanceTime.historyStubFloor",
    tipKey: "dialogs.advanceTime.historyStubFloorTip",
    min: 0,
    max: 1,
    step: 0.05
  }
];

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Resolves the profile the radio group currently describes — a named preset, or the custom one. */
function resolveDisplayedProfile(profileId: HistoryModeProfileId, custom: HistoryModeProfile): HistoryModeProfile {
  return profileId === "custom" ? custom : HISTORY_MODE_PROFILES[profileId];
}

export const FastAdvanceSettingsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has(DIALOG_ID));
  const preset = useFastAdvanceState(state => state.preset);
  const customRates = useFastAdvanceState(state => state.customRates);
  const setPreset = useFastAdvanceState(state => state.setPreset);
  const setCustomRate = useFastAdvanceState(state => state.setCustomRate);
  const resetCustomRates = useFastAdvanceState(state => state.resetCustomRates);
  const historyProfileId = useFastAdvanceState(state => state.historyProfile);
  const customHistoryProfile = useFastAdvanceState(state => state.customHistoryProfile);
  const setHistoryProfile = useFastAdvanceState(state => state.setHistoryProfile);
  const setHistoryStride = useFastAdvanceState(state => state.setHistoryStride);
  const setStubFunding = useFastAdvanceState(state => state.setStubFunding);
  const setHistorySystemDisabled = useFastAdvanceState(state => state.setHistorySystemDisabled);
  const resetCustomHistoryProfile = useFastAdvanceState(state => state.resetCustomHistoryProfile);

  const isCustom = preset === "custom";
  const rates: FastAdvanceRates = isCustom ? customRates : FAST_ADVANCE_PRESETS[preset];

  const isCustomHistory = historyProfileId === "custom";
  const historyProfile = resolveDisplayedProfile(historyProfileId, customHistoryProfile);
  const historyEnabled = historyProfileId !== "off";
  const disabledSystemIds = new Set(historyProfile.disabledSystemIds);
  // Read from the live registry rather than a hardcoded list, so a newly added system shows up in
  // this list without anyone remembering to update the dialog (§8).
  const registeredSystemIds = isOpen ? listRegisteredSimulationSystemIds() : [];

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.advanceTime.fastForwardSettings")}
      onClose={() => closeDialog(DIALOG_ID)}
      style={{ minWidth: "340px" }}
      buttons={[
        {
          label: t("dialogs.advanceTime.fastForwardReset"),
          onClick: () => {
            if (isCustom) resetCustomRates();
            if (isCustomHistory) resetCustomHistoryProfile();
          },
          disabled: !isCustom && !isCustomHistory
        },
        { label: t("common.close"), onClick: () => closeDialog(DIALOG_ID) }
      ]}
    >
      <div style={{ display: "grid", gap: "10px" }}>
        <fieldset style={{ border: "1px solid", borderRadius: "4px", padding: "6px 8px" }}>
          <legend>{t("dialogs.advanceTime.fastForwardPresetLabel")}</legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(90px, 1fr))",
              gap: "4px 10px"
            }}
          >
            {FAST_ADVANCE_PRESET_SELECT_IDS.map((id: FastAdvancePresetId) => (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="fastAdvancePreset"
                  value={id}
                  checked={preset === id}
                  onChange={() => setPreset(id)}
                />
                <span>{t(`dialogs.advanceTime.fastForwardPresets.${id}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <details open>
          <summary style={{ cursor: "pointer" }}>{t("dialogs.advanceTime.fastForwardAdvanced")}</summary>
          <p style={{ margin: "6px 0", opacity: 0.75, fontSize: "0.9em" }}>
            {t("dialogs.advanceTime.fastForwardCustomHint")}
          </p>
          <div style={{ display: "grid", gap: "6px" }}>
            {RATE_SLIDERS.map(spec => (
              <div key={spec.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span data-tip={t(spec.tipKey)} style={{ minWidth: "130px" }}>
                  {t(spec.labelKey)}
                </span>
                <SliderInput
                  className=""
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={rates[spec.key]}
                  disabled={!isCustom}
                  onChange={v => setCustomRate(spec.key, clamp(Number(v), spec.min, spec.max))}
                />
                <span style={{ minWidth: "34px", textAlign: "right", opacity: 0.8 }}>{t(spec.unitKey)}</span>
              </div>
            ))}
          </div>
        </details>

        <fieldset style={{ border: "1px solid", borderRadius: "4px", padding: "6px 8px" }}>
          <legend>{t("dialogs.advanceTime.historyModeLabel")}</legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
              gap: "4px 10px"
            }}
          >
            {HISTORY_MODE_PROFILE_IDS.map((id: HistoryModeProfileId) => (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="historyModeProfile"
                  value={id}
                  checked={historyProfileId === id}
                  onChange={() => setHistoryProfile(id)}
                />
                <span>{t(`dialogs.advanceTime.historyProfiles.${id}`)}</span>
              </label>
            ))}
          </div>
          <p style={{ margin: "6px 0 0", opacity: 0.75, fontSize: "0.9em" }}>
            {t(`dialogs.advanceTime.historyProfileHints.${historyProfileId}`)}
          </p>
          {historyEnabled && historyProfile.forceAutonomousConflict ? (
            <p style={{ margin: "4px 0 0", opacity: 0.85, fontSize: "0.9em" }}>
              ⚔ {t("dialogs.advanceTime.historyAutonomousConflictNote")}
            </p>
          ) : null}
        </fieldset>

        {historyEnabled ? (
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span data-tip={t("dialogs.advanceTime.historyStrideTip")} style={{ minWidth: "130px" }}>
                {t("dialogs.advanceTime.historyStride")}
              </span>
              {(["day", "month"] as const).map(stride => (
                <label key={stride} style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="historyStride"
                    value={stride}
                    checked={historyProfile.stride === stride}
                    disabled={!isCustomHistory}
                    onChange={() => setHistoryStride(stride)}
                  />
                  <span>{t(`dialogs.advanceTime.historyStrides.${stride}`)}</span>
                </label>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={historyProfile.stubFunding.enabled}
                disabled={!isCustomHistory}
                onChange={e => setStubFunding("enabled", e.target.checked)}
              />
              <span data-tip={t("dialogs.advanceTime.historyStubFundingTip")}>
                {t("dialogs.advanceTime.historyStubFunding")}
              </span>
            </label>

            <div style={{ display: "grid", gap: "6px" }}>
              {STUB_SLIDERS.map(spec => (
                <div key={spec.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span data-tip={t(spec.tipKey)} style={{ minWidth: "130px" }}>
                    {t(spec.labelKey)}
                  </span>
                  <SliderInput
                    className=""
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={historyProfile.stubFunding[spec.key]}
                    disabled={!isCustomHistory || !historyProfile.stubFunding.enabled}
                    onChange={v => setStubFunding(spec.key, clamp(Number(v), spec.min, spec.max))}
                  />
                </div>
              ))}
            </div>

            <details>
              <summary style={{ cursor: "pointer" }}>
                {t("dialogs.advanceTime.historyDisabledSystems", { total: disabledSystemIds.size })}
              </summary>
              <p style={{ margin: "6px 0", opacity: 0.75, fontSize: "0.9em" }}>
                {t("dialogs.advanceTime.historyDisabledSystemsHint")}
              </p>
              <div style={{ display: "grid", gap: "2px", maxHeight: "200px", overflowY: "auto" }}>
                {registeredSystemIds.map(id => (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={disabledSystemIds.has(id)}
                      disabled={!isCustomHistory}
                      onChange={e => setHistorySystemDisabled(id, e.target.checked)}
                    />
                    <span style={{ fontFamily: "monospace", fontSize: "0.9em" }}>{id}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        <p style={{ margin: 0, fontSize: "0.9em", opacity: 0.85 }}>⚠ {t("dialogs.advanceTime.fastForwardWarning")}</p>
      </div>
    </Dialog>
  );
};
