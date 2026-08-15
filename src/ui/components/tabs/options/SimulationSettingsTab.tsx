import type React from "react";
import { useTranslation } from "react-i18next";
import { setConflictAutonomy } from "../../../../controllers/simulationSettings";
import { useOptionsState } from "../../../../store/optionsState";
import { MIN_CURRENCY_EXCHANGE_RATE } from "../../../../utils/currency";
import { lock } from "../../../../utils/domUtils";
import { LockIconButton } from "../../LockIconButton";
import { SliderInput } from "../../SliderInput";

export const SimulationSettingsTab: React.FC = () => {
  const { t } = useTranslation();
  const options = useOptionsState();
  const updateOption = options.setOption;

  const updateOptionAndLock = <K extends keyof Omit<typeof options, "setOption" | "setOptions">>(
    key: K,
    value: (typeof options)[K]
  ) => {
    updateOption(key, value);
    lock(key as string);
  };

  const updateCurrencyRate = (key: "goldToSilverRate" | "silverToCopperRate", value: string) => {
    const rate = Number(value);
    if (!Number.isInteger(rate) || rate < MIN_CURRENCY_EXCHANGE_RATE) return;
    updateOptionAndLock(key, rate);
  };

  return (
    <div>
      <p data-tip={t("simulation.headingTip")}>{t("simulation.heading")}</p>
      <table>
        <tbody>
          <tr data-tip={t("simulation.baseBirthRateTip")}>
            <td>
              <LockIconButton id="demographicBirthRate" />
            </td>
            <td>{t("simulation.baseBirthRate")}</td>
            <td colSpan={2}>
              <SliderInput
                min="0.05"
                max="1.0"
                step="0.025"
                value={options.demographicBirthRate}
                onChange={v => updateOptionAndLock("demographicBirthRate", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.childMortalityTip")}>
            <td>
              <LockIconButton id="demographicChildMortalityRate" />
            </td>
            <td>{t("simulation.childMortality")}</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="90"
                step="1"
                value={Math.round(options.demographicChildMortalityRate * 100)}
                onChange={v => updateOptionAndLock("demographicChildMortalityRate", Number(v) / 100)}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.conflictAutonomyTip")}>
            <td />
            <td>{t("simulation.conflictAutonomy")}</td>
            <td colSpan={2}>
              <label>
                <input
                  type="radio"
                  name="conflictAutonomy"
                  value="autonomous"
                  checked={options.conflictAutonomy === "autonomous"}
                  onChange={e => setConflictAutonomy(e.target.value)}
                />{" "}
                {t("simulation.autonomous")}
              </label>{" "}
              <label>
                <input
                  type="radio"
                  name="conflictAutonomy"
                  value="playerDirected"
                  checked={options.conflictAutonomy === "playerDirected"}
                  onChange={e => setConflictAutonomy(e.target.value)}
                />{" "}
                {t("simulation.playerDirected")}
              </label>
            </td>
          </tr>

          <tr data-tip={t("simulation.warFrequencyTip")}>
            <td>
              <LockIconButton id="warFrequency" />
            </td>
            <td>{t("simulation.warFrequency")}</td>
            <td colSpan={2}>
              <SliderInput
                min="0"
                max="3"
                step="0.1"
                value={options.warFrequency}
                onChange={v => updateOptionAndLock("warFrequency", Number(v))}
              />
            </td>
          </tr>

          <tr>
            <td colSpan={4}>
              <p data-tip={t("simulation.currencyHeadingTip")}>{t("simulation.currencyHeading")}</p>
            </td>
          </tr>
          <tr data-tip={t("simulation.goldToSilverTip")}>
            <td>
              <LockIconButton id="goldToSilverRate" />
            </td>
            <td>
              <label htmlFor="goldToSilverRate">{t("simulation.oneGoldPiece")}</label>
            </td>
            <td>
              ={" "}
              <input
                id="goldToSilverRate"
                type="number"
                min={MIN_CURRENCY_EXCHANGE_RATE}
                step="1"
                value={options.goldToSilverRate}
                onChange={e => updateCurrencyRate("goldToSilverRate", e.target.value)}
              />
            </td>
            <td>{t("simulation.silverPieces")}</td>
          </tr>
          <tr data-tip={t("simulation.silverToCopperTip")}>
            <td>
              <LockIconButton id="silverToCopperRate" />
            </td>
            <td>
              <label htmlFor="silverToCopperRate">{t("simulation.oneSilverPiece")}</label>
            </td>
            <td>
              ={" "}
              <input
                id="silverToCopperRate"
                type="number"
                min={MIN_CURRENCY_EXCHANGE_RATE}
                step="1"
                value={options.silverToCopperRate}
                onChange={e => updateCurrencyRate("silverToCopperRate", e.target.value)}
              />
            </td>
            <td>{t("simulation.copperPieces")}</td>
          </tr>

          <tr>
            <td colSpan={4}>
              <p data-tip={t("simulation.systemsHeadingTip")}>{t("simulation.systemsHeading")}</p>
            </td>
          </tr>
          <tr data-tip={t("simulation.demographicsTip")}>
            <td />
            <td>
              <label htmlFor="simDemographics">{t("simulation.demographics")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="simDemographics"
                type="checkbox"
                checked={options.simDemographics}
                onChange={e => updateOption("simDemographics", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.manpowerLedgerTip")}>
            <td />
            <td>
              <label htmlFor="simManpower">{t("simulation.manpowerLedger")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="simManpower"
                type="checkbox"
                checked={options.simManpower}
                onChange={e => updateOption("simManpower", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.settlementGrowthTip")}>
            <td />
            <td>
              <label htmlFor="ruralUrbanMigration">{t("simulation.settlementGrowth")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralUrbanMigration"
                value={options.ruralUrbanMigration}
                onChange={e => updateOption("ruralUrbanMigration", e.target.value as "independent" | "megacity")}
              >
                <option value="independent">{t("simulation.growthIndependent")}</option>
                <option value="megacity">{t("simulation.growthMegacity")}</option>
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.militaryRecoveryTip")}>
            <td />
            <td>
              <label htmlFor="simMilitaryRecovery">{t("simulation.militaryRecovery")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="simMilitaryRecovery"
                type="checkbox"
                checked={options.simMilitaryRecovery}
                onChange={e => updateOption("simMilitaryRecovery", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.recruitQualityTip")}>
            <td />
            <td>
              <label htmlFor="recruitQualityEnabled">{t("simulation.recruitQuality")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="recruitQualityEnabled"
                type="checkbox"
                checked={options.recruitQualityEnabled}
                onChange={e => updateOption("recruitQualityEnabled", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.femaleLevyTip")}>
            <td />
            <td>
              <label htmlFor="femaleLevyEnabled">{t("simulation.femaleLevy")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="femaleLevyEnabled"
                type="checkbox"
                checked={options.femaleLevyEnabled}
                onChange={e => updateOption("femaleLevyEnabled", e.target.checked)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
