import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../../../context/worldContext";
import { setConflictAutonomy } from "../../../../controllers/simulationSettings";
import {
  CONTAINER_REUSE_COST_LIMITS,
  getContainerReuseCost,
  setContainerReuseCost
} from "../../../../simulation/containerReuseSettings";
import {
  CRAFT_EMPLOYMENT_SHARE_LIMITS,
  getCraftEmploymentShare,
  setCraftEmploymentShare
} from "../../../../simulation/craftSettings";
import {
  getHouseholdHoneyKilograms,
  HOUSEHOLD_HONEY_KG_LIMITS,
  setHouseholdHoneyKilograms
} from "../../../../simulation/householdHoneySettings";
import {
  CRAFT_SALE_PAYMENT_MODES,
  type CraftSalePaymentMode,
  getMarketGenerationSpacing,
  getMarketSettings,
  HAY_PAYMENT_MODES,
  HAY_TRADE_MODES,
  type HayPaymentMode,
  type HayTradeMode,
  HOUSEHOLD_GOODS_PAYMENT_MODES,
  type HouseholdGoodsPaymentMode,
  MARKET_DISSOLVE_CARGO_MODES,
  MARKET_SETTING_LIMITS,
  type MarketDissolveCargoMode,
  type MarketSettings,
  MERCHANT_PROFIT_USES,
  type MerchantProfitUse,
  setMarketSettings
} from "../../../../simulation/marketSettings";
import {
  getTreelessTownAleWoodland,
  setTreelessTownAleWoodland,
  TREELESS_TOWN_ALE_WOODLAND_LIMITS
} from "../../../../simulation/townAleSettings";
import { getTownMeadLiters, setTownMeadLiters, TOWN_MEAD_LITERS_LIMITS } from "../../../../simulation/townMeadSettings";
import { useOptionsState } from "../../../../store/optionsState";
import { MIN_CURRENCY_EXCHANGE_RATE } from "../../../../utils/currency";
import { lock } from "../../../../utils/domUtils";
import {
  clampTechnologyDevelopmentSpeed,
  MAX_TECHNOLOGY_DEVELOPMENT_SPEED,
  MIN_TECHNOLOGY_DEVELOPMENT_SPEED
} from "../../../../utils/technologyDevelopmentSpeed";
import {
  clampTechnologyRequirementEase,
  MAX_TECHNOLOGY_REQUIREMENT_EASE,
  MIN_TECHNOLOGY_REQUIREMENT_EASE
} from "../../../../utils/technologyRequirementEase";
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

  const [marketSettings, setMarketSettingsState] = useState(getMarketSettings);
  const updateMarketSetting = (key: keyof MarketSettings, value: string) => {
    const number = Number(value);
    if (Number.isFinite(number)) setMarketSettingsState(setMarketSettings({ [key]: number }));
  };
  const [craftEmploymentShare, setCraftEmploymentShareState] = useState(getCraftEmploymentShare);
  const [treelessTownAleWoodland, setTreelessTownAleWoodlandState] = useState(getTreelessTownAleWoodland);
  const [householdHoneyKilograms, setHouseholdHoneyKilogramsState] = useState(getHouseholdHoneyKilograms);
  const [townMeadLiters, setTownMeadLitersState] = useState(getTownMeadLiters);
  const [containerReuseCost, setContainerReuseCostState] = useState(getContainerReuseCost);
  const generationSpacing = getMarketGenerationSpacing(
    worldContext.graphWidth,
    worldContext.graphHeight,
    worldContext.pack?.burgs?.length ?? 0
  );

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
              </label>{" "}
              <label>
                <input
                  type="radio"
                  name="conflictAutonomy"
                  value="peace"
                  checked={options.conflictAutonomy === "peace"}
                  onChange={e => setConflictAutonomy(e.target.value)}
                />{" "}
                {t("simulation.peace")}
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

          <tr data-tip={t("simulation.maxWarDisparityRatioEnabledTip")}>
            <td>
              <LockIconButton id="maxWarDisparityRatioEnabled" />
            </td>
            <td>
              <label htmlFor="maxWarDisparityRatioEnabled">{t("simulation.maxWarDisparityRatioEnabled")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="maxWarDisparityRatioEnabled"
                type="checkbox"
                checked={options.maxWarDisparityRatioEnabled}
                onChange={e => updateOptionAndLock("maxWarDisparityRatioEnabled", e.target.checked)}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.maxWarDisparityRatioTip")}>
            <td>
              <LockIconButton id="maxWarDisparityRatio" />
            </td>
            <td>{t("simulation.maxWarDisparityRatio")}</td>
            <td colSpan={2}>
              <SliderInput
                min="1"
                max="20"
                step="0.5"
                value={options.maxWarDisparityRatio}
                disabled={!options.maxWarDisparityRatioEnabled}
                onChange={v => updateOptionAndLock("maxWarDisparityRatio", Number(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.technologyDevelopmentSpeedTip")}>
            <td>
              <LockIconButton id="technologyDevelopmentSpeed" />
            </td>
            <td>{t("simulation.technologyDevelopmentSpeed")}</td>
            <td colSpan={2}>
              <SliderInput
                min={MIN_TECHNOLOGY_DEVELOPMENT_SPEED}
                max={MAX_TECHNOLOGY_DEVELOPMENT_SPEED}
                step="1"
                value={options.technologyDevelopmentSpeed}
                onChange={v => updateOptionAndLock("technologyDevelopmentSpeed", clampTechnologyDevelopmentSpeed(v))}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.technologyRequirementEaseTip")}>
            <td>
              <LockIconButton id="technologyRequirementEase" />
            </td>
            <td>{t("simulation.technologyRequirementEase")}</td>
            <td colSpan={2}>
              <SliderInput
                id="technologyRequirementEase"
                min={MIN_TECHNOLOGY_REQUIREMENT_EASE}
                max={MAX_TECHNOLOGY_REQUIREMENT_EASE}
                step="1"
                value={options.technologyRequirementEase}
                onChange={v => updateOptionAndLock("technologyRequirementEase", clampTechnologyRequirementEase(v))}
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
              <p data-tip={t("simulation.marketsHeadingTip")}>{t("simulation.marketsHeading")}</p>
            </td>
          </tr>
          <tr data-tip={t("simulation.marketFoundingSpacingTip")}>
            <td />
            <td>{t("simulation.marketFoundingSpacing")}</td>
            <td>
              <SliderInput
                id="marketFoundingSpacing"
                min={MARKET_SETTING_LIMITS.foundingSpacingFactor.min}
                max={MARKET_SETTING_LIMITS.foundingSpacingFactor.max}
                step={MARKET_SETTING_LIMITS.foundingSpacingFactor.step}
                value={marketSettings.foundingSpacingFactor}
                onChange={v => updateMarketSetting("foundingSpacingFactor", v)}
              />
            </td>
            <td>
              {t("simulation.marketFoundingSpacingDistance", {
                distance: Math.round(generationSpacing * marketSettings.foundingSpacingFactor)
              })}
            </td>
          </tr>
          <tr data-tip={t("simulation.marketDissolveWealthShareTip")}>
            <td />
            <td>{t("simulation.marketDissolveWealthShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="marketDissolveWealthShare"
                min={MARKET_SETTING_LIMITS.dissolveWealthShare.min * 100}
                max={MARKET_SETTING_LIMITS.dissolveWealthShare.max * 100}
                step={MARKET_SETTING_LIMITS.dissolveWealthShare.step * 100}
                value={Math.round(marketSettings.dissolveWealthShare * 100)}
                onChange={v => updateMarketSetting("dissolveWealthShare", String(Number(v) / 100))}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.marketDissolveMonthsTip")}>
            <td />
            <td>{t("simulation.marketDissolveMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="marketDissolveMonths"
                min={MARKET_SETTING_LIMITS.dissolveMonths.min}
                max={MARKET_SETTING_LIMITS.dissolveMonths.max}
                step={MARKET_SETTING_LIMITS.dissolveMonths.step}
                value={marketSettings.dissolveMonths}
                onChange={v => updateMarketSetting("dissolveMonths", v)}
              />
            </td>
          </tr>

          <tr data-tip={t("simulation.marketDissolveCargoTip")}>
            <td />
            <td>
              <label htmlFor="marketDissolveCargo">{t("simulation.marketDissolveCargo")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="marketDissolveCargo"
                value={marketSettings.dissolveCargo}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ dissolveCargo: e.target.value as MarketDissolveCargoMode })
                  )
                }
              >
                {MARKET_DISSOLVE_CARGO_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.marketDissolveCargo_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr data-tip={t("simulation.marketSurplusReserveFactorTip")}>
            <td />
            <td>{t("simulation.marketSurplusReserveFactor")}</td>
            <td colSpan={2}>
              <SliderInput
                id="marketSurplusReserveFactor"
                min={MARKET_SETTING_LIMITS.surplusReserveFactor.min}
                max={MARKET_SETTING_LIMITS.surplusReserveFactor.max}
                step={MARKET_SETTING_LIMITS.surplusReserveFactor.step}
                value={marketSettings.surplusReserveFactor}
                onChange={v => updateMarketSetting("surplusReserveFactor", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.marketSurplusRuralWeightTip")}>
            <td />
            <td>{t("simulation.marketSurplusRuralWeight")}</td>
            <td colSpan={2}>
              <SliderInput
                id="marketSurplusRuralWeight"
                min={MARKET_SETTING_LIMITS.surplusRuralWeight.min * 100}
                max={MARKET_SETTING_LIMITS.surplusRuralWeight.max * 100}
                step={MARKET_SETTING_LIMITS.surplusRuralWeight.step * 100}
                value={Math.round(marketSettings.surplusRuralWeight * 100)}
                onChange={v => updateMarketSetting("surplusRuralWeight", String(Number(v) / 100))}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.merchantProfitShareTip")}>
            <td />
            <td>{t("simulation.merchantProfitShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="merchantProfitShare"
                min={MARKET_SETTING_LIMITS.merchantProfitShare.min * 100}
                max={MARKET_SETTING_LIMITS.merchantProfitShare.max * 100}
                step={MARKET_SETTING_LIMITS.merchantProfitShare.step * 100}
                value={Math.round(marketSettings.merchantProfitShare * 100)}
                onChange={v => updateMarketSetting("merchantProfitShare", String(Number(v) / 100))}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.merchantProfitUseTip")}>
            <td />
            <td>
              <label htmlFor="merchantProfitUse">{t("simulation.merchantProfitUse")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="merchantProfitUse"
                value={marketSettings.merchantProfitUse}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ merchantProfitUse: e.target.value as MerchantProfitUse }))
                }
              >
                {MERCHANT_PROFIT_USES.map(use => (
                  <option key={use} value={use}>
                    {t(`simulation.merchantProfitUse_${use}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.merchantReserveYearsTip")}>
            <td />
            <td>{t("simulation.merchantReserveYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="merchantReserveYears"
                min={MARKET_SETTING_LIMITS.merchantReserveYears.min}
                max={MARKET_SETTING_LIMITS.merchantReserveYears.max}
                step={MARKET_SETTING_LIMITS.merchantReserveYears.step}
                value={marketSettings.merchantReserveYears}
                onChange={v => updateMarketSetting("merchantReserveYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.hayTradeTip")}>
            <td />
            <td>
              <label htmlFor="hayTrade">{t("simulation.hayTrade")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="hayTrade"
                value={marketSettings.hayTrade}
                onChange={e => setMarketSettingsState(setMarketSettings({ hayTrade: e.target.value as HayTradeMode }))}
              >
                {HAY_TRADE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.hayTrade_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.hayPaymentTip")}>
            <td />
            <td>
              <label htmlFor="hayPayment">{t("simulation.hayPayment")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="hayPayment"
                value={marketSettings.hayPayment}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ hayPayment: e.target.value as HayPaymentMode }))
                }
              >
                {HAY_PAYMENT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.hayPayment_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.craftSalePaymentTip")}>
            <td />
            <td>
              <label htmlFor="craftSalePayment">{t("simulation.craftSalePayment")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="craftSalePayment"
                value={marketSettings.craftSalePayment}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      craftSalePayment: e.target.value as CraftSalePaymentMode
                    })
                  )
                }
              >
                {CRAFT_SALE_PAYMENT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.craftSalePayment_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.householdGoodsPaymentTip")}>
            <td />
            <td>
              <label htmlFor="householdGoodsPayment">{t("simulation.householdGoodsPayment")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="householdGoodsPayment"
                value={marketSettings.householdGoodsPayment}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      householdGoodsPayment: e.target.value as HouseholdGoodsPaymentMode
                    })
                  )
                }
              >
                {HOUSEHOLD_GOODS_PAYMENT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.householdGoodsPayment_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr>
            <td colSpan={4}>
              <p data-tip={t("simulation.craftsHeadingTip")}>{t("simulation.craftsHeading")}</p>
            </td>
          </tr>
          <tr data-tip={t("simulation.craftEmploymentShareTip")}>
            <td />
            <td>{t("simulation.craftEmploymentShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="craftEmploymentShare"
                min={CRAFT_EMPLOYMENT_SHARE_LIMITS.min * 100}
                max={CRAFT_EMPLOYMENT_SHARE_LIMITS.max * 100}
                step={CRAFT_EMPLOYMENT_SHARE_LIMITS.step * 100}
                value={Math.round(craftEmploymentShare * 100)}
                onChange={v => {
                  const share = Number(v) / 100;
                  if (Number.isFinite(share)) setCraftEmploymentShareState(setCraftEmploymentShare(share));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.treelessTownAleWoodlandTip")}>
            <td />
            <td>{t("simulation.treelessTownAleWoodland")}</td>
            <td colSpan={2}>
              <SliderInput
                id="treelessTownAleWoodland"
                min={TREELESS_TOWN_ALE_WOODLAND_LIMITS.min * 100}
                max={TREELESS_TOWN_ALE_WOODLAND_LIMITS.max * 100}
                step={TREELESS_TOWN_ALE_WOODLAND_LIMITS.step * 100}
                value={Math.round(treelessTownAleWoodland * 100)}
                onChange={v => {
                  const share = Number(v) / 100;
                  if (Number.isFinite(share)) setTreelessTownAleWoodlandState(setTreelessTownAleWoodland(share));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.householdHoneyKilogramsTip")}>
            <td />
            <td>{t("simulation.householdHoneyKilograms")}</td>
            <td colSpan={2}>
              <SliderInput
                id="householdHoneyKilograms"
                min={HOUSEHOLD_HONEY_KG_LIMITS.min}
                max={HOUSEHOLD_HONEY_KG_LIMITS.max}
                step={HOUSEHOLD_HONEY_KG_LIMITS.step}
                value={householdHoneyKilograms}
                onChange={v => {
                  const kilograms = Number(v);
                  if (Number.isFinite(kilograms))
                    setHouseholdHoneyKilogramsState(setHouseholdHoneyKilograms(kilograms));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.townMeadLitersTip")}>
            <td />
            <td>{t("simulation.townMeadLiters")}</td>
            <td colSpan={2}>
              <SliderInput
                id="townMeadLiters"
                min={TOWN_MEAD_LITERS_LIMITS.min}
                max={TOWN_MEAD_LITERS_LIMITS.max}
                step={TOWN_MEAD_LITERS_LIMITS.step}
                value={townMeadLiters}
                onChange={v => {
                  const liters = Number(v);
                  if (Number.isFinite(liters)) setTownMeadLitersState(setTownMeadLiters(liters));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.containerReuseCostTip")}>
            <td />
            <td>{t("simulation.containerReuseCost")}</td>
            <td colSpan={2}>
              <SliderInput
                id="containerReuseCost"
                min={CONTAINER_REUSE_COST_LIMITS.min * 100}
                max={CONTAINER_REUSE_COST_LIMITS.max * 100}
                step={CONTAINER_REUSE_COST_LIMITS.step * 100}
                value={Math.round(containerReuseCost * 100)}
                onChange={v => {
                  const share = Number(v) / 100;
                  if (Number.isFinite(share)) setContainerReuseCostState(setContainerReuseCost(share));
                }}
              />
            </td>
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
          <tr data-tip={t("simulation.dayRollbackTip")}>
            <td />
            <td>
              <label htmlFor="simDayRollback">{t("simulation.dayRollback")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="simDayRollback"
                type="checkbox"
                checked={options.simDayRollback}
                onChange={e => updateOption("simDayRollback", e.target.checked)}
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
