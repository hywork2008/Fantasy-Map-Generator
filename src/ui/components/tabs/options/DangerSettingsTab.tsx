import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useOptionsState } from "../../../../store/optionsState";
import { lock } from "../../../../utils/domUtils";
import { LockIconButton } from "../../LockIconButton";

type RarityGroup = {
  headingKey: "rarity5" | "rarity4" | "rarity3" | "rarity12";
  rarityLabelKey: "rarityLabel5" | "rarityLabel4" | "rarityLabel3" | "rarityLabel12";
  minKey: "dangerRarity5Min" | "dangerRarity4Min" | "dangerRarity3Min" | "dangerRarity1Min";
  maxKey: "dangerRarity5Max" | "dangerRarity4Max" | "dangerRarity3Max" | "dangerRarity1Max";
  powerKey: "dangerRarity5Power" | "dangerRarity4Power" | "dangerRarity3Power" | "dangerRarity1Power";
  typeKey: "dangerRarity5Type" | "dangerRarity4Type" | "dangerRarity3Type" | "dangerRarity1Type";
  spawnMax: number;
};

const RARITY_GROUPS: RarityGroup[] = [
  {
    headingKey: "rarity5",
    rarityLabelKey: "rarityLabel5",
    minKey: "dangerRarity5Min",
    maxKey: "dangerRarity5Max",
    powerKey: "dangerRarity5Power",
    typeKey: "dangerRarity5Type",
    spawnMax: 100
  },
  {
    headingKey: "rarity4",
    rarityLabelKey: "rarityLabel4",
    minKey: "dangerRarity4Min",
    maxKey: "dangerRarity4Max",
    powerKey: "dangerRarity4Power",
    typeKey: "dangerRarity4Type",
    spawnMax: 100
  },
  {
    headingKey: "rarity3",
    rarityLabelKey: "rarityLabel3",
    minKey: "dangerRarity3Min",
    maxKey: "dangerRarity3Max",
    powerKey: "dangerRarity3Power",
    typeKey: "dangerRarity3Type",
    spawnMax: 100
  },
  {
    headingKey: "rarity12",
    rarityLabelKey: "rarityLabel12",
    minKey: "dangerRarity1Min",
    maxKey: "dangerRarity1Max",
    powerKey: "dangerRarity1Power",
    typeKey: "dangerRarity1Type",
    spawnMax: 1000
  }
];

export const DangerSettingsTab = () => {
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

  return (
    <div>
      <p data-tip={t("dangerSettings.headingTip")}>{t("dangerSettings.heading")}</p>
      <table>
        <tbody>
          <tr data-tip={t("dangerSettings.enableTip")}>
            <td>
              <LockIconButton id="dangerEnabled" />
            </td>
            <td>
              <label htmlFor="dangerEnabled">{t("dangerSettings.enable")}</label>
            </td>
            <td colSpan={2}>
              <input
                id="dangerEnabled"
                type="checkbox"
                checked={options.dangerEnabled}
                onChange={e => updateOptionAndLock("dangerEnabled", e.target.checked)}
              />
            </td>
          </tr>
          <tr data-tip={t("dangerSettings.renderingTip")}>
            <td></td>
            <td>{t("dangerSettings.rendering")}</td>
            <td>
              <select
                id="dangerRenderingMode"
                value={options.dangerRenderingMode}
                onChange={e => {
                  const mode = e.target.value as "contour" | "choropleth";
                  updateOption("dangerRenderingMode", mode);
                  document.dispatchEvent(new CustomEvent("react-change-danger-rendering-mode"));
                }}
              >
                <option value="contour">{t("dangerSettings.renderingContour")}</option>
                <option value="choropleth">{t("dangerSettings.renderingHeatmap")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          <tr data-tip={t("dangerSettings.threatCalculationTip")}>
            <td>
              <LockIconButton id="threatCalculation" />
            </td>
            <td>{t("dangerSettings.threatCalculation")}</td>
            <td>
              <select
                id="threatCalculation"
                value={options.threatCalculation}
                onChange={e => {
                  updateOptionAndLock("threatCalculation", e.target.value as "additive" | "max" | "nonlinear");
                  // Rebuild danger paint from living monsters so the layer reflects the mode
                  // immediately. Population capacity still requires a full map regenerate.
                  document.dispatchEvent(new CustomEvent("react-change-threat-calculation"));
                }}
              >
                <option value="additive">{t("dangerSettings.threatAdditive")}</option>
                <option value="max">{t("dangerSettings.threatMax")}</option>
                <option value="nonlinear">{t("dangerSettings.threatNonlinear")}</option>
              </select>
            </td>
            <td></td>
          </tr>

          {RARITY_GROUPS.map(group => {
            const rarity = t(`dangerSettings.${group.rarityLabelKey}`);
            return (
              <Fragment key={group.headingKey}>
                <tr>
                  <td colSpan={4} style={{ fontWeight: "bold", paddingTop: "10px" }}>
                    {t(`dangerSettings.${group.headingKey}`)}
                  </td>
                </tr>
                <tr data-tip={t("dangerSettings.spawnCountTip", { rarity })}>
                  <td></td>
                  <td>{t("dangerSettings.spawnCount")}</td>
                  <td>
                    <span data-tip={t("dangerSettings.minSpawn")}>{t("common.min")}</span>
                    <input
                      className="paired"
                      type="number"
                      min="0"
                      max={group.spawnMax}
                      value={options[group.minKey]}
                      onChange={e => updateOption(group.minKey, Number(e.target.value))}
                    />
                    <span data-tip={t("dangerSettings.maxSpawn")}>{t("common.max")}</span>
                    <input
                      className="paired"
                      type="number"
                      min="0"
                      max={group.spawnMax}
                      value={options[group.maxKey]}
                      onChange={e => updateOption(group.maxKey, Number(e.target.value))}
                    />
                  </td>
                  <td></td>
                </tr>
                <tr data-tip={t("dangerSettings.powerTip", { rarity })}>
                  <td></td>
                  <td>{t("dangerSettings.power")}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={options[group.powerKey]}
                      onChange={e => updateOption(group.powerKey, Number(e.target.value))}
                    />
                  </td>
                  <td></td>
                </tr>
                <tr data-tip={t("dangerSettings.typeNameTip", { rarity })}>
                  <td></td>
                  <td>{t("dangerSettings.typeName")}</td>
                  <td>
                    <input
                      type="text"
                      value={options[group.typeKey]}
                      onChange={e => updateOption(group.typeKey, e.target.value)}
                    />
                  </td>
                  <td></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
