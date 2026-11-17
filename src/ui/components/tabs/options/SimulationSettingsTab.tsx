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
  CRAFT_CREDIT_MONTHS_LIMITS,
  getCraftCreditMonths,
  setCraftCreditMonths
} from "../../../../simulation/craftCreditSettings";
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
  BEDDING_CASH_RESERVE_MODES,
  type BeddingCashReserveMode,
  BOOTS_LABOR_MODES,
  type BootsLaborMode,
  BYPRODUCT_EXPORT_MODES,
  BYPRODUCT_FARMGATE_MODES,
  BYPRODUCT_PRICING_MODES,
  type ByproductExportMode,
  type ByproductFarmgateMode,
  type ByproductPricingMode,
  CANDLE_DEMAND_MODES,
  type CandleDemandMode,
  CELL_CHEESE_SALE_MODES,
  type CellCheeseSaleMode,
  CHARACTER_RESERVE_MODES,
  CHEESE_REFERENCE_PRICE_MODES,
  type CharacterReserveMode,
  type CheeseReferencePriceMode,
  CRAFT_SALE_PAYMENT_MODES,
  type CraftSalePaymentMode,
  DAIRY_DEMAND_MODES,
  DAIRY_TRADITION_SOURCE_MODES,
  type DairyDemandMode,
  type DairyTraditionSourceMode,
  FEED_CRISIS_BUDGET_MODES,
  FEED_SHORTFALL_RESPONSE_MODES,
  FEED_SHORTFALL_TIMING_MODES,
  type FeedCrisisBudgetMode,
  type FeedShortfallResponseMode,
  type FeedShortfallTimingMode,
  FODDER_VALUE_MODES,
  FOOTWEAR_DEMAND_MODES,
  type FodderValueMode,
  type FootwearDemandMode,
  FUEL_CHOICE_MODES,
  type FuelChoiceMode,
  GRAIN_FEED_MODES,
  GRAIN_REPAYMENT_MODES,
  type GrainFeedMode,
  type GrainRepaymentMode,
  GUILD_MASTER_INCOME_MODES,
  GUILD_MASTER_SEAT_MODES,
  GUILD_SURPLUS_USE_MODES,
  type GuildMasterIncomeMode,
  type GuildMasterSeatMode,
  type GuildSurplusUseMode,
  getMarketGenerationSpacing,
  getMarketSettings,
  HAY_CATCH_UP_MODES,
  HAY_PAYMENT_MODES,
  HAY_PLAN_HERD_MODES,
  HAY_TRADE_MODES,
  type HayCatchUpMode,
  type HayPaymentMode,
  type HayPlanHerdMode,
  type HayTradeMode,
  HEIRLESS_ESTATE_MODES,
  HERD_OFFTAKE_SPREAD_MODES,
  type HeirlessEstateMode,
  type HerdOfftakeSpreadMode,
  HOUSEHOLD_GOOD_VALUE_MODES,
  HOUSEHOLD_GOODS_PAYMENT_MODES,
  type HouseholdGoodsPaymentMode,
  type HouseholdGoodValueMode,
  LEAN_CONDITION_MODES,
  LEAN_CULL_MODES,
  LEAN_DEATH_MODES,
  type LeanConditionMode,
  type LeanCullMode,
  type LeanDeathMode,
  MARKET_DISSOLVE_CARGO_MODES,
  MARKET_SETTING_LIMITS,
  type MarketDissolveCargoMode,
  type MarketSettings,
  MERCHANT_PROFIT_USES,
  type MerchantProfitUse,
  PEAT_CUT_PLAN_MODES,
  type PeatCutPlanMode,
  RURAL_DAIRY_USE_MODES,
  RURAL_REST_DAYS_MODES,
  RURAL_TOWN_SPENDING_MODES,
  RURAL_WORK_YEAR_MODES,
  type RuralDairyUseMode,
  type RuralRestDaysMode,
  type RuralTownSpendingMode,
  type RuralWorkYearMode,
  STATE_BUDGET_INCOME_MODES,
  type StateBudgetIncomeMode,
  setMarketSettings,
  URBAN_HARVEST_HELP_MODES,
  type UrbanHarvestHelpMode,
  WAX_SURPLUS_MODES,
  type WaxSurplusMode
} from "../../../../simulation/marketSettings";
import {
  getRaisinStorageLoss,
  RAISIN_STORAGE_LOSS_LIMITS,
  setRaisinStorageLoss
} from "../../../../simulation/raisinStorageSettings";
import {
  getTreelessTownAleWoodland,
  setTreelessTownAleWoodland,
  TREELESS_TOWN_ALE_WOODLAND_LIMITS
} from "../../../../simulation/townAleSettings";
import { getTownMeadLiters, setTownMeadLiters, TOWN_MEAD_LITERS_LIMITS } from "../../../../simulation/townMeadSettings";
import {
  getTownSoapKilograms,
  setTownSoapKilograms,
  TOWN_SOAP_KG_LIMITS
} from "../../../../simulation/townSoapSettings";
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
  const [townSoapKilograms, setTownSoapKilogramsState] = useState(getTownSoapKilograms);
  const [craftCreditMonths, setCraftCreditMonthsState] = useState(getCraftCreditMonths);
  const [raisinStorageLoss, setRaisinStorageLossState] = useState(getRaisinStorageLoss);
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
          <tr data-tip={t("simulation.marketHarvestReserveMonthsTip")}>
            <td />
            <td>{t("simulation.marketHarvestReserveMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="marketHarvestReserveMonths"
                min={MARKET_SETTING_LIMITS.harvestReserveMonths.min}
                max={MARKET_SETTING_LIMITS.harvestReserveMonths.max}
                step={MARKET_SETTING_LIMITS.harvestReserveMonths.step}
                value={marketSettings.harvestReserveMonths}
                onChange={v => updateMarketSetting("harvestReserveMonths", v)}
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
          <tr data-tip={t("simulation.characterReserveTip")}>
            <td />
            <td>
              <label htmlFor="characterReserve">{t("simulation.characterReserve")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="characterReserve"
                value={marketSettings.characterReserve}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ characterReserve: e.target.value as CharacterReserveMode })
                  )
                }
              >
                {CHARACTER_RESERVE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.characterReserve_${mode}`)}
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
          <tr data-tip={t("simulation.rulerReserveYearsTip")}>
            <td />
            <td>{t("simulation.rulerReserveYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="rulerReserveYears"
                min={MARKET_SETTING_LIMITS.rulerReserveYears.min}
                max={MARKET_SETTING_LIMITS.rulerReserveYears.max}
                step={MARKET_SETTING_LIMITS.rulerReserveYears.step}
                value={marketSettings.rulerReserveYears}
                onChange={v => updateMarketSetting("rulerReserveYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.officeReserveYearsTip")}>
            <td />
            <td>{t("simulation.officeReserveYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="officeReserveYears"
                min={MARKET_SETTING_LIMITS.officeReserveYears.min}
                max={MARKET_SETTING_LIMITS.officeReserveYears.max}
                step={MARKET_SETTING_LIMITS.officeReserveYears.step}
                value={marketSettings.officeReserveYears}
                onChange={v => updateMarketSetting("officeReserveYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.commanderReserveYearsTip")}>
            <td />
            <td>{t("simulation.commanderReserveYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="commanderReserveYears"
                min={MARKET_SETTING_LIMITS.commanderReserveYears.min}
                max={MARKET_SETTING_LIMITS.commanderReserveYears.max}
                step={MARKET_SETTING_LIMITS.commanderReserveYears.step}
                value={marketSettings.commanderReserveYears}
                onChange={v => updateMarketSetting("commanderReserveYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.commonReserveYearsTip")}>
            <td />
            <td>{t("simulation.commonReserveYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="commonReserveYears"
                min={MARKET_SETTING_LIMITS.commonReserveYears.min}
                max={MARKET_SETTING_LIMITS.commonReserveYears.max}
                step={MARKET_SETTING_LIMITS.commonReserveYears.step}
                value={marketSettings.commonReserveYears}
                onChange={v => updateMarketSetting("commonReserveYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.heirlessEstateTip")}>
            <td />
            <td>
              <label htmlFor="heirlessEstate">{t("simulation.heirlessEstate")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="heirlessEstate"
                value={marketSettings.heirlessEstate}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ heirlessEstate: e.target.value as HeirlessEstateMode }))
                }
              >
                {HEIRLESS_ESTATE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.heirlessEstate_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.estateClaimMonthsTip")}>
            <td />
            <td>{t("simulation.estateClaimMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="estateClaimMonths"
                min={MARKET_SETTING_LIMITS.estateClaimMonths.min}
                max={MARKET_SETTING_LIMITS.estateClaimMonths.max}
                step={MARKET_SETTING_LIMITS.estateClaimMonths.step}
                value={marketSettings.estateClaimMonths}
                onChange={v => updateMarketSetting("estateClaimMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.stateBudgetIncomeTip")}>
            <td />
            <td>
              <label htmlFor="stateBudgetIncome">{t("simulation.stateBudgetIncome")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="stateBudgetIncome"
                value={marketSettings.stateBudgetIncome}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ stateBudgetIncome: e.target.value as StateBudgetIncomeMode })
                  )
                }
              >
                {STATE_BUDGET_INCOME_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.stateBudgetIncome_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.guildMasterSeatTip")}>
            <td />
            <td>
              <label htmlFor="guildMasterSeat">{t("simulation.guildMasterSeat")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="guildMasterSeat"
                value={marketSettings.guildMasterSeat}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ guildMasterSeat: e.target.value as GuildMasterSeatMode }))
                }
              >
                {GUILD_MASTER_SEAT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.guildMasterSeat_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.guildMasterIncomeTip")}>
            <td />
            <td>
              <label htmlFor="guildMasterIncome">{t("simulation.guildMasterIncome")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="guildMasterIncome"
                value={marketSettings.guildMasterIncome}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ guildMasterIncome: e.target.value as GuildMasterIncomeMode })
                  )
                }
              >
                {GUILD_MASTER_INCOME_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.guildMasterIncome_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.guildMasterWorkshopShareTip")}>
            <td />
            <td>{t("simulation.guildMasterWorkshopShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="guildMasterWorkshopShare"
                min={MARKET_SETTING_LIMITS.guildMasterWorkshopShare.min}
                max={MARKET_SETTING_LIMITS.guildMasterWorkshopShare.max}
                step={MARKET_SETTING_LIMITS.guildMasterWorkshopShare.step}
                value={marketSettings.guildMasterWorkshopShare}
                onChange={v => updateMarketSetting("guildMasterWorkshopShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.guildMasterRetireRatioTip")}>
            <td />
            <td>{t("simulation.guildMasterRetireRatio")}</td>
            <td colSpan={2}>
              <SliderInput
                id="guildMasterRetireRatio"
                min={MARKET_SETTING_LIMITS.guildMasterRetireRatio.min}
                max={MARKET_SETTING_LIMITS.guildMasterRetireRatio.max}
                step={MARKET_SETTING_LIMITS.guildMasterRetireRatio.step}
                value={marketSettings.guildMasterRetireRatio}
                onChange={v => updateMarketSetting("guildMasterRetireRatio", v)}
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
          <tr data-tip={t("simulation.grainRepaymentTip")}>
            <td />
            <td>
              <label htmlFor="grainRepayment">{t("simulation.grainRepayment")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="grainRepayment"
                value={marketSettings.grainRepayment}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      grainRepayment: e.target.value as GrainRepaymentMode
                    })
                  )
                }
              >
                {GRAIN_REPAYMENT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.grainRepayment_${mode}`)}
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
          <tr data-tip={t("simulation.ruralTownSpendingTip")}>
            <td />
            <td>
              <label htmlFor="ruralTownSpending">{t("simulation.ruralTownSpending")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralTownSpending"
                value={marketSettings.ruralTownSpending}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      ruralTownSpending: e.target.value as RuralTownSpendingMode
                    })
                  )
                }
              >
                {RURAL_TOWN_SPENDING_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.ruralTownSpending_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralPurseMonthsTip")}>
            <td />
            <td>{t("simulation.ruralPurseMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralPurseMonths"
                min={MARKET_SETTING_LIMITS.ruralPurseMonths.min}
                max={MARKET_SETTING_LIMITS.ruralPurseMonths.max}
                step={MARKET_SETTING_LIMITS.ruralPurseMonths.step}
                value={marketSettings.ruralPurseMonths}
                onChange={v => updateMarketSetting("ruralPurseMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralSpendElasticityAboveTip")}>
            <td />
            <td>{t("simulation.ruralSpendElasticityAbove")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralSpendElasticityAbove"
                min={MARKET_SETTING_LIMITS.ruralSpendElasticityAbove.min}
                max={MARKET_SETTING_LIMITS.ruralSpendElasticityAbove.max}
                step={MARKET_SETTING_LIMITS.ruralSpendElasticityAbove.step}
                value={marketSettings.ruralSpendElasticityAbove}
                onChange={v => updateMarketSetting("ruralSpendElasticityAbove", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralSpendElasticityBelowTip")}>
            <td />
            <td>{t("simulation.ruralSpendElasticityBelow")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralSpendElasticityBelow"
                min={MARKET_SETTING_LIMITS.ruralSpendElasticityBelow.min}
                max={MARKET_SETTING_LIMITS.ruralSpendElasticityBelow.max}
                step={MARKET_SETTING_LIMITS.ruralSpendElasticityBelow.step}
                value={marketSettings.ruralSpendElasticityBelow}
                onChange={v => updateMarketSetting("ruralSpendElasticityBelow", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralTownServicesTip")}>
            <td />
            <td>{t("simulation.ruralTownServices")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralTownServices"
                min={MARKET_SETTING_LIMITS.ruralTownServices.min}
                max={MARKET_SETTING_LIMITS.ruralTownServices.max}
                step={MARKET_SETTING_LIMITS.ruralTownServices.step}
                value={marketSettings.ruralTownServices}
                onChange={v => updateMarketSetting("ruralTownServices", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.footwearDemandTip")}>
            <td />
            <td>
              <label htmlFor="footwearDemand">{t("simulation.footwearDemand")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="footwearDemand"
                value={marketSettings.footwearDemand}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      footwearDemand: e.target.value as FootwearDemandMode
                    })
                  )
                }
              >
                {FOOTWEAR_DEMAND_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.footwearDemand_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.footwearPairsPerPersonTip")}>
            <td />
            <td>{t("simulation.footwearPairsPerPerson")}</td>
            <td colSpan={2}>
              <SliderInput
                id="footwearPairsPerPerson"
                min={MARKET_SETTING_LIMITS.footwearPairsPerPerson.min}
                max={MARKET_SETTING_LIMITS.footwearPairsPerPerson.max}
                step={MARKET_SETTING_LIMITS.footwearPairsPerPerson.step}
                value={marketSettings.footwearPairsPerPerson}
                onChange={v => updateMarketSetting("footwearPairsPerPerson", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leatherGoodsShareTip")}>
            <td />
            <td>{t("simulation.leatherGoodsShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leatherGoodsShare"
                min={MARKET_SETTING_LIMITS.leatherGoodsShare.min}
                max={MARKET_SETTING_LIMITS.leatherGoodsShare.max}
                step={MARKET_SETTING_LIMITS.leatherGoodsShare.step}
                value={marketSettings.leatherGoodsShare}
                onChange={v => updateMarketSetting("leatherGoodsShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.urbanHarvestHelpTip")}>
            <td />
            <td>
              <label htmlFor="urbanHarvestHelp">{t("simulation.urbanHarvestHelp")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="urbanHarvestHelp"
                value={marketSettings.urbanHarvestHelp}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ urbanHarvestHelp: e.target.value as UrbanHarvestHelpMode })
                  )
                }
              >
                {URBAN_HARVEST_HELP_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.urbanHarvestHelp_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.urbanHarvestHelpShareTip")}>
            <td />
            <td>{t("simulation.urbanHarvestHelpShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="urbanHarvestHelpShare"
                min={MARKET_SETTING_LIMITS.urbanHarvestHelpShare.min}
                max={MARKET_SETTING_LIMITS.urbanHarvestHelpShare.max}
                step={MARKET_SETTING_LIMITS.urbanHarvestHelpShare.step}
                value={marketSettings.urbanHarvestHelpShare}
                onChange={v => updateMarketSetting("urbanHarvestHelpShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.hayCatchUpTip")}>
            <td />
            <td>
              <label htmlFor="hayCatchUp">{t("simulation.hayCatchUp")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="hayCatchUp"
                value={marketSettings.hayCatchUp}
                onChange={e => setMarketSettings({ hayCatchUp: e.target.value as HayCatchUpMode })}
              >
                {HAY_CATCH_UP_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.hayCatchUp_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.hayCatchUpMonthsTip")}>
            <td />
            <td>{t("simulation.hayCatchUpMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="hayCatchUpMonths"
                min={MARKET_SETTING_LIMITS.hayCatchUpMonths.min}
                max={MARKET_SETTING_LIMITS.hayCatchUpMonths.max}
                step={MARKET_SETTING_LIMITS.hayCatchUpMonths.step}
                value={marketSettings.hayCatchUpMonths}
                onChange={v => updateMarketSetting("hayCatchUpMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralWorkYearTip")}>
            <td />
            <td>
              <label htmlFor="ruralWorkYear">{t("simulation.ruralWorkYear")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralWorkYear"
                value={marketSettings.ruralWorkYear}
                onChange={e => setMarketSettings({ ruralWorkYear: e.target.value as RuralWorkYearMode })}
              >
                {RURAL_WORK_YEAR_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.ruralWorkYear_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralWorkDaysPerYearTip")}>
            <td />
            <td>{t("simulation.ruralWorkDaysPerYear")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralWorkDaysPerYear"
                min={MARKET_SETTING_LIMITS.ruralWorkDaysPerYear.min}
                max={MARKET_SETTING_LIMITS.ruralWorkDaysPerYear.max}
                step={MARKET_SETTING_LIMITS.ruralWorkDaysPerYear.step}
                value={marketSettings.ruralWorkDaysPerYear}
                onChange={v => updateMarketSetting("ruralWorkDaysPerYear", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralChoreDaysPerAdultTip")}>
            <td />
            <td>{t("simulation.ruralChoreDaysPerAdult")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralChoreDaysPerAdult"
                min={MARKET_SETTING_LIMITS.ruralChoreDaysPerAdult.min}
                max={MARKET_SETTING_LIMITS.ruralChoreDaysPerAdult.max}
                step={MARKET_SETTING_LIMITS.ruralChoreDaysPerAdult.step}
                value={marketSettings.ruralChoreDaysPerAdult}
                onChange={v => updateMarketSetting("ruralChoreDaysPerAdult", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralRestDaysTip")}>
            <td />
            <td>
              <label htmlFor="ruralRestDays">{t("simulation.ruralRestDays")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralRestDays"
                value={marketSettings.ruralRestDays}
                onChange={e => setMarketSettings({ ruralRestDays: e.target.value as RuralRestDaysMode })}
              >
                {RURAL_REST_DAYS_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.ruralRestDays_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralRestDaysCustomTip")}>
            <td />
            <td>{t("simulation.ruralRestDaysCustom")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralRestDaysCustom"
                min={MARKET_SETTING_LIMITS.ruralRestDaysCustom.min}
                max={MARKET_SETTING_LIMITS.ruralRestDaysCustom.max}
                step={MARKET_SETTING_LIMITS.ruralRestDaysCustom.step}
                value={marketSettings.ruralRestDaysCustom}
                onChange={v => updateMarketSetting("ruralRestDaysCustom", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.grainFeedTip")}>
            <td />
            <td>
              <label htmlFor="grainFeed">{t("simulation.grainFeed")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="grainFeed"
                value={marketSettings.grainFeed}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ grainFeed: e.target.value as GrainFeedMode }))
                }
              >
                {GRAIN_FEED_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.grainFeed_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.feedShortfallResponseTip")}>
            <td />
            <td>
              <label htmlFor="feedShortfallResponse">{t("simulation.feedShortfallResponse")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="feedShortfallResponse"
                value={marketSettings.feedShortfallResponse}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ feedShortfallResponse: e.target.value as FeedShortfallResponseMode })
                  )
                }
              >
                {FEED_SHORTFALL_RESPONSE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.feedShortfallResponse_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.feedShortfallTimingTip")}>
            <td />
            <td>
              <label htmlFor="feedShortfallTiming">{t("simulation.feedShortfallTiming")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="feedShortfallTiming"
                value={marketSettings.feedShortfallTiming}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ feedShortfallTiming: e.target.value as FeedShortfallTimingMode })
                  )
                }
              >
                {FEED_SHORTFALL_TIMING_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.feedShortfallTiming_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.feedShortfallWorkShareTip")}>
            <td />
            <td>{t("simulation.feedShortfallWorkShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="feedShortfallWorkShare"
                min={MARKET_SETTING_LIMITS.feedShortfallWorkShare.min}
                max={MARKET_SETTING_LIMITS.feedShortfallWorkShare.max}
                step={MARKET_SETTING_LIMITS.feedShortfallWorkShare.step}
                value={marketSettings.feedShortfallWorkShare}
                onChange={v => updateMarketSetting("feedShortfallWorkShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanConditionTip")}>
            <td />
            <td>
              <label htmlFor="leanCondition">{t("simulation.leanCondition")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="leanCondition"
                value={marketSettings.leanCondition}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ leanCondition: e.target.value as LeanConditionMode }))
                }
              >
                {LEAN_CONDITION_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.leanCondition_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.leanReserveMonthsTip")}>
            <td />
            <td>{t("simulation.leanReserveMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leanReserveMonths"
                min={MARKET_SETTING_LIMITS.leanReserveMonths.min}
                max={MARKET_SETTING_LIMITS.leanReserveMonths.max}
                step={MARKET_SETTING_LIMITS.leanReserveMonths.step}
                value={marketSettings.leanReserveMonths}
                onChange={v => updateMarketSetting("leanReserveMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanMaxCarcassLossTip")}>
            <td />
            <td>{t("simulation.leanMaxCarcassLoss")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leanMaxCarcassLoss"
                min={MARKET_SETTING_LIMITS.leanMaxCarcassLoss.min}
                max={MARKET_SETTING_LIMITS.leanMaxCarcassLoss.max}
                step={MARKET_SETTING_LIMITS.leanMaxCarcassLoss.step}
                value={marketSettings.leanMaxCarcassLoss}
                onChange={v => updateMarketSetting("leanMaxCarcassLoss", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanRefeedShareTip")}>
            <td />
            <td>{t("simulation.leanRefeedShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leanRefeedShare"
                min={MARKET_SETTING_LIMITS.leanRefeedShare.min}
                max={MARKET_SETTING_LIMITS.leanRefeedShare.max}
                step={MARKET_SETTING_LIMITS.leanRefeedShare.step}
                value={marketSettings.leanRefeedShare}
                onChange={v => updateMarketSetting("leanRefeedShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanMilkLossTip")}>
            <td />
            <td>{t("simulation.leanMilkLoss")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leanMilkLoss"
                min={MARKET_SETTING_LIMITS.leanMilkLoss.min}
                max={MARKET_SETTING_LIMITS.leanMilkLoss.max}
                step={MARKET_SETTING_LIMITS.leanMilkLoss.step}
                value={marketSettings.leanMilkLoss}
                onChange={v => updateMarketSetting("leanMilkLoss", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanCullTip")}>
            <td />
            <td>
              <label htmlFor="leanCull">{t("simulation.leanCull")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="leanCull"
                value={marketSettings.leanCull}
                onChange={e => setMarketSettingsState(setMarketSettings({ leanCull: e.target.value as LeanCullMode }))}
              >
                {LEAN_CULL_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.leanCull_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.leanCullThresholdTip")}>
            <td />
            <td>{t("simulation.leanCullThreshold")}</td>
            <td colSpan={2}>
              <SliderInput
                id="leanCullThreshold"
                min={MARKET_SETTING_LIMITS.leanCullThreshold.min}
                max={MARKET_SETTING_LIMITS.leanCullThreshold.max}
                step={MARKET_SETTING_LIMITS.leanCullThreshold.step}
                value={marketSettings.leanCullThreshold}
                onChange={v => updateMarketSetting("leanCullThreshold", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.leanDeathsTip")}>
            <td />
            <td>
              <label htmlFor="leanDeaths">{t("simulation.leanDeaths")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="leanDeaths"
                value={marketSettings.leanDeaths}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ leanDeaths: e.target.value as LeanDeathMode }))
                }
              >
                {LEAN_DEATH_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.leanDeaths_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.fodderValueTip")}>
            <td />
            <td>
              <label htmlFor="fodderValue">{t("simulation.fodderValue")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="fodderValue"
                value={marketSettings.fodderValue}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ fodderValue: e.target.value as FodderValueMode }))
                }
              >
                {FODDER_VALUE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.fodderValue_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.feedCrisisBudgetTip")}>
            <td />
            <td>
              <label htmlFor="feedCrisisBudget">{t("simulation.feedCrisisBudget")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="feedCrisisBudget"
                value={marketSettings.feedCrisisBudget}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ feedCrisisBudget: e.target.value as FeedCrisisBudgetMode })
                  )
                }
              >
                {FEED_CRISIS_BUDGET_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.feedCrisisBudget_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.feedCrisisCashShareTip")}>
            <td />
            <td>{t("simulation.feedCrisisCashShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="feedCrisisCashShare"
                min={MARKET_SETTING_LIMITS.feedCrisisCashShare.min}
                max={MARKET_SETTING_LIMITS.feedCrisisCashShare.max}
                step={MARKET_SETTING_LIMITS.feedCrisisCashShare.step}
                value={marketSettings.feedCrisisCashShare}
                onChange={v => updateMarketSetting("feedCrisisCashShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.hayPlanHerdTip")}>
            <td />
            <td>
              <label htmlFor="hayPlanHerd">{t("simulation.hayPlanHerd")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="hayPlanHerd"
                value={marketSettings.hayPlanHerd}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ hayPlanHerd: e.target.value as HayPlanHerdMode }))
                }
              >
                {HAY_PLAN_HERD_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.hayPlanHerd_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.herdOfftakeSpreadTip")}>
            <td />
            <td>
              <label htmlFor="herdOfftakeSpread">{t("simulation.herdOfftakeSpread")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="herdOfftakeSpread"
                value={marketSettings.herdOfftakeSpread}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ herdOfftakeSpread: e.target.value as HerdOfftakeSpreadMode })
                  )
                }
              >
                {HERD_OFFTAKE_SPREAD_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.herdOfftakeSpread_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductFarmgateTip")}>
            <td />
            <td>
              <label htmlFor="byproductFarmgate">{t("simulation.byproductFarmgate")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="byproductFarmgate"
                value={marketSettings.byproductFarmgate}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ byproductFarmgate: e.target.value as ByproductFarmgateMode })
                  )
                }
              >
                {BYPRODUCT_FARMGATE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.byproductFarmgate_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.summerHideLossTip")}>
            <td />
            <td>{t("simulation.summerHideLoss")}</td>
            <td colSpan={2}>
              <SliderInput
                id="summerHideLoss"
                min={MARKET_SETTING_LIMITS.summerHideLoss.min}
                max={MARKET_SETTING_LIMITS.summerHideLoss.max}
                step={MARKET_SETTING_LIMITS.summerHideLoss.step}
                value={marketSettings.summerHideLoss}
                onChange={v => updateMarketSetting("summerHideLoss", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.bootsLaborTip")}>
            <td />
            <td>
              <label htmlFor="bootsLabor">{t("simulation.bootsLabor")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="bootsLabor"
                value={marketSettings.bootsLabor}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ bootsLabor: e.target.value as BootsLaborMode }))
                }
              >
                {BOOTS_LABOR_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.bootsLabor_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductPricingTip")}>
            <td />
            <td>
              <label htmlFor="byproductPricing">{t("simulation.byproductPricing")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="byproductPricing"
                value={marketSettings.byproductPricing}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({ byproductPricing: e.target.value as ByproductPricingMode })
                  )
                }
              >
                {BYPRODUCT_PRICING_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.byproductPricing_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.beeswaxPricingTip")}>
            <td />
            <td>
              <label htmlFor="beeswaxPricing">{t("simulation.beeswaxPricing")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="beeswaxPricing"
                value={marketSettings.beeswaxPricing}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ beeswaxPricing: e.target.value as ByproductPricingMode }))
                }
              >
                {BYPRODUCT_PRICING_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.beeswaxPricing_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.waxSurplusTip")}>
            <td />
            <td>
              <label htmlFor="waxSurplus">{t("simulation.waxSurplus")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="waxSurplus"
                value={marketSettings.waxSurplus}
                onChange={e =>
                  setMarketSettingsState(setMarketSettings({ waxSurplus: e.target.value as WaxSurplusMode }))
                }
              >
                {WAX_SURPLUS_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.waxSurplus_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.waxKeepMonthsTip")}>
            <td />
            <td>{t("simulation.waxKeepMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="waxKeepMonths"
                min={MARKET_SETTING_LIMITS.waxKeepMonths.min}
                max={MARKET_SETTING_LIMITS.waxKeepMonths.max}
                step={MARKET_SETTING_LIMITS.waxKeepMonths.step}
                value={marketSettings.waxKeepMonths}
                onChange={v => updateMarketSetting("waxKeepMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.waxTitheRateTip")}>
            <td />
            <td>{t("simulation.waxTitheRate")}</td>
            <td colSpan={2}>
              <SliderInput
                id="waxTitheRate"
                min={MARKET_SETTING_LIMITS.waxTitheRate.min}
                max={MARKET_SETTING_LIMITS.waxTitheRate.max}
                step={MARKET_SETTING_LIMITS.waxTitheRate.step}
                value={marketSettings.waxTitheRate}
                onChange={v => updateMarketSetting("waxTitheRate", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralShoemakersPerThousandTip")}>
            <td />
            <td>{t("simulation.ruralShoemakersPerThousand")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralShoemakersPerThousand"
                min={MARKET_SETTING_LIMITS.ruralShoemakersPerThousand.min}
                max={MARKET_SETTING_LIMITS.ruralShoemakersPerThousand.max}
                step={MARKET_SETTING_LIMITS.ruralShoemakersPerThousand.step}
                value={marketSettings.ruralShoemakersPerThousand}
                onChange={v => updateMarketSetting("ruralShoemakersPerThousand", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.householdGoodValuesTip")}>
            <td />
            <td>
              <label htmlFor="householdGoodValues">{t("simulation.householdGoodValues")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="householdGoodValues"
                value={marketSettings.householdGoodValues}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      householdGoodValues: e.target.value as HouseholdGoodValueMode
                    })
                  )
                }
              >
                {HOUSEHOLD_GOOD_VALUE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.householdGoodValues_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.curryingTallowKgPerHideTip")}>
            <td />
            <td>{t("simulation.curryingTallowKgPerHide")}</td>
            <td colSpan={2}>
              <SliderInput
                id="curryingTallowKgPerHide"
                min={MARKET_SETTING_LIMITS.curryingTallowKgPerHide.min}
                max={MARKET_SETTING_LIMITS.curryingTallowKgPerHide.max}
                step={MARKET_SETTING_LIMITS.curryingTallowKgPerHide.step}
                value={marketSettings.curryingTallowKgPerHide}
                onChange={v => updateMarketSetting("curryingTallowKgPerHide", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductExportTip")}>
            <td />
            <td>
              <label htmlFor="byproductExport">{t("simulation.byproductExport")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="byproductExport"
                value={marketSettings.byproductExport}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      byproductExport: e.target.value as ByproductExportMode
                    })
                  )
                }
              >
                {BYPRODUCT_EXPORT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.byproductExport_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductExportReserveMonthsTip")}>
            <td />
            <td>{t("simulation.byproductExportReserveMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="byproductExportReserveMonths"
                min={MARKET_SETTING_LIMITS.byproductExportReserveMonths.min}
                max={MARKET_SETTING_LIMITS.byproductExportReserveMonths.max}
                step={MARKET_SETTING_LIMITS.byproductExportReserveMonths.step}
                value={marketSettings.byproductExportReserveMonths}
                onChange={v => updateMarketSetting("byproductExportReserveMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductExportShareTip")}>
            <td />
            <td>{t("simulation.byproductExportShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="byproductExportShare"
                min={MARKET_SETTING_LIMITS.byproductExportShare.min}
                max={MARKET_SETTING_LIMITS.byproductExportShare.max}
                step={MARKET_SETTING_LIMITS.byproductExportShare.step}
                value={marketSettings.byproductExportShare}
                onChange={v => updateMarketSetting("byproductExportShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductReturnMonthsTip")}>
            <td />
            <td>{t("simulation.byproductReturnMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="byproductReturnMonths"
                min={MARKET_SETTING_LIMITS.byproductReturnMonths.min}
                max={MARKET_SETTING_LIMITS.byproductReturnMonths.max}
                step={MARKET_SETTING_LIMITS.byproductReturnMonths.step}
                value={marketSettings.byproductReturnMonths}
                onChange={v => updateMarketSetting("byproductReturnMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductKeepMonthsTip")}>
            <td />
            <td>{t("simulation.byproductKeepMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="byproductKeepMonths"
                min={MARKET_SETTING_LIMITS.byproductKeepMonths.min}
                max={MARKET_SETTING_LIMITS.byproductKeepMonths.max}
                step={MARKET_SETTING_LIMITS.byproductKeepMonths.step}
                value={marketSettings.byproductKeepMonths}
                onChange={v => updateMarketSetting("byproductKeepMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.byproductExcessSpoilTip")}>
            <td />
            <td>{t("simulation.byproductExcessSpoil")}</td>
            <td colSpan={2}>
              <SliderInput
                id="byproductExcessSpoil"
                min={MARKET_SETTING_LIMITS.byproductExcessSpoil.min}
                max={MARKET_SETTING_LIMITS.byproductExcessSpoil.max}
                step={MARKET_SETTING_LIMITS.byproductExcessSpoil.step}
                value={marketSettings.byproductExcessSpoil}
                onChange={v => updateMarketSetting("byproductExcessSpoil", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.beeswaxExportTip")}>
            <td />
            <td>
              <label htmlFor="beeswaxExport">{t("simulation.beeswaxExport")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="beeswaxExport"
                value={marketSettings.beeswaxExport}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      beeswaxExport: e.target.value as ByproductExportMode
                    })
                  )
                }
              >
                {BYPRODUCT_EXPORT_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.beeswaxExport_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.fuelChoiceTip")}>
            <td />
            <td>
              <label htmlFor="fuelChoice">{t("simulation.fuelChoice")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="fuelChoice"
                value={marketSettings.fuelChoice}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      fuelChoice: e.target.value as FuelChoiceMode
                    })
                  )
                }
              >
                {FUEL_CHOICE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.fuelChoice_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.fuelPriceElasticityTip")}>
            <td />
            <td>{t("simulation.fuelPriceElasticity")}</td>
            <td colSpan={2}>
              <SliderInput
                id="fuelPriceElasticity"
                min={MARKET_SETTING_LIMITS.fuelPriceElasticity.min}
                max={MARKET_SETTING_LIMITS.fuelPriceElasticity.max}
                step={MARKET_SETTING_LIMITS.fuelPriceElasticity.step}
                value={marketSettings.fuelPriceElasticity}
                onChange={v => updateMarketSetting("fuelPriceElasticity", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.peatCutPlanTip")}>
            <td />
            <td>
              <label htmlFor="peatCutPlan">{t("simulation.peatCutPlan")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="peatCutPlan"
                value={marketSettings.peatCutPlan}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      peatCutPlan: e.target.value as PeatCutPlanMode
                    })
                  )
                }
              >
                {PEAT_CUT_PLAN_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.peatCutPlan_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.cellCheeseSaleTip")}>
            <td />
            <td>
              <label htmlFor="cellCheeseSale">{t("simulation.cellCheeseSale")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="cellCheeseSale"
                value={marketSettings.cellCheeseSale}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      cellCheeseSale: e.target.value as CellCheeseSaleMode
                    })
                  )
                }
              >
                {CELL_CHEESE_SALE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.cellCheeseSale_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralDairyUseTip")}>
            <td />
            <td>
              <label htmlFor="ruralDairyUse">{t("simulation.ruralDairyUse")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="ruralDairyUse"
                value={marketSettings.ruralDairyUse}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      ruralDairyUse: e.target.value as RuralDairyUseMode
                    })
                  )
                }
              >
                {RURAL_DAIRY_USE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.ruralDairyUse_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.cheeseMakingDaysPerMilkLotTip")}>
            <td />
            <td>{t("simulation.cheeseMakingDaysPerMilkLot")}</td>
            <td colSpan={2}>
              <SliderInput
                id="cheeseMakingDaysPerMilkLot"
                min={MARKET_SETTING_LIMITS.cheeseMakingDaysPerMilkLot.min}
                max={MARKET_SETTING_LIMITS.cheeseMakingDaysPerMilkLot.max}
                step={MARKET_SETTING_LIMITS.cheeseMakingDaysPerMilkLot.step}
                value={marketSettings.cheeseMakingDaysPerMilkLot}
                onChange={v => updateMarketSetting("cheeseMakingDaysPerMilkLot", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralCheeseEatShareTip")}>
            <td />
            <td>{t("simulation.ruralCheeseEatShare")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralCheeseEatShare"
                min={MARKET_SETTING_LIMITS.ruralCheeseEatShare.min}
                max={MARKET_SETTING_LIMITS.ruralCheeseEatShare.max}
                step={MARKET_SETTING_LIMITS.ruralCheeseEatShare.step}
                value={marketSettings.ruralCheeseEatShare}
                onChange={v => updateMarketSetting("ruralCheeseEatShare", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.dairyDemandTip")}>
            <td />
            <td>
              <label htmlFor="dairyDemand">{t("simulation.dairyDemand")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="dairyDemand"
                value={marketSettings.dairyDemand}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      dairyDemand: e.target.value as DairyDemandMode
                    })
                  )
                }
              >
                {DAIRY_DEMAND_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.dairyDemand_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.cheeseReferencePriceTip")}>
            <td />
            <td>
              <label htmlFor="cheeseReferencePrice">{t("simulation.cheeseReferencePrice")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="cheeseReferencePrice"
                value={marketSettings.cheeseReferencePrice}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      cheeseReferencePrice: e.target.value as CheeseReferencePriceMode
                    })
                  )
                }
              >
                {CHEESE_REFERENCE_PRICE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.cheeseReferencePrice_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.beddingCashReserveTip")}>
            <td />
            <td>
              <label htmlFor="beddingCashReserve">{t("simulation.beddingCashReserve")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="beddingCashReserve"
                value={marketSettings.beddingCashReserve}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      beddingCashReserve: e.target.value as BeddingCashReserveMode
                    })
                  )
                }
              >
                {BEDDING_CASH_RESERVE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.beddingCashReserve_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.dairyTraditionSourceTip")}>
            <td />
            <td>
              <label htmlFor="dairyTraditionSource">{t("simulation.dairyTraditionSource")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="dairyTraditionSource"
                value={marketSettings.dairyTraditionSource}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      dairyTraditionSource: e.target.value as DairyTraditionSourceMode
                    })
                  )
                }
              >
                {DAIRY_TRADITION_SOURCE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.dairyTraditionSource_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.dairyTraditionHalfLifeYearsTip")}>
            <td />
            <td>{t("simulation.dairyTraditionHalfLifeYears")}</td>
            <td colSpan={2}>
              <SliderInput
                id="dairyTraditionHalfLifeYears"
                min={MARKET_SETTING_LIMITS.dairyTraditionHalfLifeYears.min}
                max={MARKET_SETTING_LIMITS.dairyTraditionHalfLifeYears.max}
                step={MARKET_SETTING_LIMITS.dairyTraditionHalfLifeYears.step}
                value={marketSettings.dairyTraditionHalfLifeYears}
                onChange={v => updateMarketSetting("dairyTraditionHalfLifeYears", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.animalProteinCapGramsPerDayTip")}>
            <td />
            <td>{t("simulation.animalProteinCapGramsPerDay")}</td>
            <td colSpan={2}>
              <SliderInput
                id="animalProteinCapGramsPerDay"
                min={MARKET_SETTING_LIMITS.animalProteinCapGramsPerDay.min}
                max={MARKET_SETTING_LIMITS.animalProteinCapGramsPerDay.max}
                step={MARKET_SETTING_LIMITS.animalProteinCapGramsPerDay.step}
                value={marketSettings.animalProteinCapGramsPerDay}
                onChange={v => updateMarketSetting("animalProteinCapGramsPerDay", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.cheeseStorageLossPerMonthTip")}>
            <td />
            <td>{t("simulation.cheeseStorageLossPerMonth")}</td>
            <td colSpan={2}>
              <SliderInput
                id="cheeseStorageLossPerMonth"
                min={MARKET_SETTING_LIMITS.cheeseStorageLossPerMonth.min}
                max={MARKET_SETTING_LIMITS.cheeseStorageLossPerMonth.max}
                step={MARKET_SETTING_LIMITS.cheeseStorageLossPerMonth.step}
                value={marketSettings.cheeseStorageLossPerMonth}
                onChange={v => updateMarketSetting("cheeseStorageLossPerMonth", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.cheesePriceElasticityTip")}>
            <td />
            <td>{t("simulation.cheesePriceElasticity")}</td>
            <td colSpan={2}>
              <SliderInput
                id="cheesePriceElasticity"
                min={MARKET_SETTING_LIMITS.cheesePriceElasticity.min}
                max={MARKET_SETTING_LIMITS.cheesePriceElasticity.max}
                step={MARKET_SETTING_LIMITS.cheesePriceElasticity.step}
                value={marketSettings.cheesePriceElasticity}
                onChange={v => updateMarketSetting("cheesePriceElasticity", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.guildSurplusUseTip")}>
            <td />
            <td>
              <label htmlFor="guildSurplusUse">{t("simulation.guildSurplusUse")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="guildSurplusUse"
                value={marketSettings.guildSurplusUse}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      guildSurplusUse: e.target.value as GuildSurplusUseMode
                    })
                  )
                }
              >
                {GUILD_SURPLUS_USE_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.guildSurplusUse_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.guildSpendRateTip")}>
            <td />
            <td>{t("simulation.guildSpendRate")}</td>
            <td colSpan={2}>
              <SliderInput
                id="guildSpendRate"
                min={MARKET_SETTING_LIMITS.guildSpendRate.min}
                max={MARKET_SETTING_LIMITS.guildSpendRate.max}
                step={MARKET_SETTING_LIMITS.guildSpendRate.step}
                value={marketSettings.guildSpendRate}
                onChange={v => updateMarketSetting("guildSpendRate", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.guildReserveMonthsTip")}>
            <td />
            <td>{t("simulation.guildReserveMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="guildReserveMonths"
                min={MARKET_SETTING_LIMITS.guildReserveMonths.min}
                max={MARKET_SETTING_LIMITS.guildReserveMonths.max}
                step={MARKET_SETTING_LIMITS.guildReserveMonths.step}
                value={marketSettings.guildReserveMonths}
                onChange={v => updateMarketSetting("guildReserveMonths", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.candleDemandTip")}>
            <td />
            <td>
              <label htmlFor="candleDemand">{t("simulation.candleDemand")}</label>
            </td>
            <td colSpan={2}>
              <select
                id="candleDemand"
                value={marketSettings.candleDemand}
                onChange={e =>
                  setMarketSettingsState(
                    setMarketSettings({
                      candleDemand: e.target.value as CandleDemandMode
                    })
                  )
                }
              >
                {CANDLE_DEMAND_MODES.map(mode => (
                  <option key={mode} value={mode}>
                    {t(`simulation.candleDemand_${mode}`)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr data-tip={t("simulation.candleKgPerPersonTip")}>
            <td />
            <td>{t("simulation.candleKgPerPerson")}</td>
            <td colSpan={2}>
              <SliderInput
                id="candleKgPerPerson"
                min={MARKET_SETTING_LIMITS.candleKgPerPerson.min}
                max={MARKET_SETTING_LIMITS.candleKgPerPerson.max}
                step={MARKET_SETTING_LIMITS.candleKgPerPerson.step}
                value={marketSettings.candleKgPerPerson}
                onChange={v => updateMarketSetting("candleKgPerPerson", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.waxCandleKgPerPersonTip")}>
            <td />
            <td>{t("simulation.waxCandleKgPerPerson")}</td>
            <td colSpan={2}>
              <SliderInput
                id="waxCandleKgPerPerson"
                min={MARKET_SETTING_LIMITS.waxCandleKgPerPerson.min}
                max={MARKET_SETTING_LIMITS.waxCandleKgPerPerson.max}
                step={MARKET_SETTING_LIMITS.waxCandleKgPerPerson.step}
                value={marketSettings.waxCandleKgPerPerson}
                onChange={v => updateMarketSetting("waxCandleKgPerPerson", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.ruralChandlersPerThousandTip")}>
            <td />
            <td>{t("simulation.ruralChandlersPerThousand")}</td>
            <td colSpan={2}>
              <SliderInput
                id="ruralChandlersPerThousand"
                min={MARKET_SETTING_LIMITS.ruralChandlersPerThousand.min}
                max={MARKET_SETTING_LIMITS.ruralChandlersPerThousand.max}
                step={MARKET_SETTING_LIMITS.ruralChandlersPerThousand.step}
                value={marketSettings.ruralChandlersPerThousand}
                onChange={v => updateMarketSetting("ruralChandlersPerThousand", v)}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.wageSubsistenceMultipleTip")}>
            <td />
            <td>{t("simulation.wageSubsistenceMultiple")}</td>
            <td colSpan={2}>
              <SliderInput
                id="wageSubsistenceMultiple"
                min={MARKET_SETTING_LIMITS.wageSubsistenceMultiple.min}
                max={MARKET_SETTING_LIMITS.wageSubsistenceMultiple.max}
                step={MARKET_SETTING_LIMITS.wageSubsistenceMultiple.step}
                value={marketSettings.wageSubsistenceMultiple}
                onChange={v => updateMarketSetting("wageSubsistenceMultiple", v)}
              />
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
          <tr data-tip={t("simulation.townSoapKilogramsTip")}>
            <td />
            <td>{t("simulation.townSoapKilograms")}</td>
            <td colSpan={2}>
              <SliderInput
                id="townSoapKilograms"
                min={TOWN_SOAP_KG_LIMITS.min}
                max={TOWN_SOAP_KG_LIMITS.max}
                step={TOWN_SOAP_KG_LIMITS.step}
                value={townSoapKilograms}
                onChange={v => {
                  const kilograms = Number(v);
                  if (Number.isFinite(kilograms)) setTownSoapKilogramsState(setTownSoapKilograms(kilograms));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.craftCreditMonthsTip")}>
            <td />
            <td>{t("simulation.craftCreditMonths")}</td>
            <td colSpan={2}>
              <SliderInput
                id="craftCreditMonths"
                min={CRAFT_CREDIT_MONTHS_LIMITS.min}
                max={CRAFT_CREDIT_MONTHS_LIMITS.max}
                step={CRAFT_CREDIT_MONTHS_LIMITS.step}
                value={craftCreditMonths}
                onChange={v => {
                  const months = Number(v);
                  if (Number.isFinite(months)) setCraftCreditMonthsState(setCraftCreditMonths(months));
                }}
              />
            </td>
          </tr>
          <tr data-tip={t("simulation.raisinStorageLossTip")}>
            <td />
            <td>{t("simulation.raisinStorageLoss")}</td>
            <td colSpan={2}>
              <SliderInput
                id="raisinStorageLoss"
                min={RAISIN_STORAGE_LOSS_LIMITS.min * 100}
                max={RAISIN_STORAGE_LOSS_LIMITS.max * 100}
                step={RAISIN_STORAGE_LOSS_LIMITS.step * 100}
                value={Math.round(raisinStorageLoss * 1000) / 10}
                onChange={v => {
                  const percent = Number(v);
                  if (Number.isFinite(percent)) setRaisinStorageLossState(setRaisinStorageLoss(percent / 100));
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
