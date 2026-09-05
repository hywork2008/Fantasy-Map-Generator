import type React from "react";
import { useTranslation } from "react-i18next";
import {
  FAST_ADVANCE_PRESET_SELECT_IDS,
  FAST_ADVANCE_PRESETS,
  type FastAdvancePresetId,
  type FastAdvanceRates
} from "../../generators/fastAdvance/fastAdvancePresets";
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

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const FastAdvanceSettingsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has(DIALOG_ID));
  const preset = useFastAdvanceState(state => state.preset);
  const customRates = useFastAdvanceState(state => state.customRates);
  const setPreset = useFastAdvanceState(state => state.setPreset);
  const setCustomRate = useFastAdvanceState(state => state.setCustomRate);
  const resetCustomRates = useFastAdvanceState(state => state.resetCustomRates);

  const isCustom = preset === "custom";
  const rates: FastAdvanceRates = isCustom ? customRates : FAST_ADVANCE_PRESETS[preset];

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.advanceTime.fastForwardSettings")}
      onClose={() => closeDialog(DIALOG_ID)}
      style={{ minWidth: "340px" }}
      buttons={[
        {
          label: t("dialogs.advanceTime.fastForwardReset"),
          onClick: resetCustomRates,
          disabled: !isCustom
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

        <p style={{ margin: 0, fontSize: "0.9em", opacity: 0.85 }}>⚠ {t("dialogs.advanceTime.fastForwardWarning")}</p>
      </div>
    </Dialog>
  );
};
