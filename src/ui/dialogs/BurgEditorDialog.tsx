import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { burgEditorActions } from "../../controllers/burg-editor";
import { showElementLockTip } from "../../services/tooltipService";
import { useBurgEditorState } from "../../store/burgEditorState";
import { useDialogState } from "../../store/dialogState";
import { type ExtensionEditorTab, getEnabledEditorTabs, useExtensionState } from "../../store/extensionState";
import { IconButton } from "../components/IconButton";
import { PopulationPyramid } from "../components/PopulationPyramid";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

/** Matches economy/index.tsx's ECONOMY_EXTENSION_ID. Kept as a literal here (rather than an
 * import) so this dialog doesn't pull in the economy extension's module graph just to key
 * one row-visibility check. */
const ECONOMY_EXTENSION_ID = "economy";

interface BurgEditorTabBarProps {
  tabs: ExtensionEditorTab[];
  activeTab: string;
  onSelect: (tabId: string) => void;
}

const BurgEditorTabBar: React.FC<BurgEditorTabBarProps> = ({ tabs, activeTab, onSelect }) => {
  const { t } = useTranslation();
  return (
    <div
      id="burgEditorTabs"
      role="tablist"
      aria-label={t("dialogs.burgEditor.tabsAria")}
      style={{ display: "flex", borderBottom: "1px solid #555", marginBottom: "4px", fontSize: "1.1em" }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "overview"}
        className={activeTab === "overview" ? "pressed" : ""}
        onClick={() => onSelect("overview")}
      >
        {t("dialogs.burgEditor.overview")}
      </button>
      {tabs.map(tab => (
        <button
          key={tab.id}
          id={`burgEditorTab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "pressed" : ""}
          onClick={() => onSelect(tab.id)}
        >
          {t(`extensions.editorTabs.${tab.id}`, { defaultValue: tab.label })}
        </button>
      ))}
    </div>
  );
};

export const BurgEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("burgEditor"));
  const burgData = useBurgEditorState(state => state.burgData);
  const groups = useBurgEditorState(state => state.groups);
  const cultures = useBurgEditorState(state => state.cultures);
  const isStyleSectionOpen = useBurgEditorState(state => state.isStyleSectionOpen);
  const isRelocateMode = useBurgEditorState(state => state.isRelocateMode);
  const [activeTab, setActiveTab] = useState("overview");
  const allEditorTabs = useExtensionState(state => state.editorTabs);
  const enabledExtensions = useExtensionState(state => state.enabledExtensions);
  const isEconomyEnabled = useExtensionState(state => Boolean(state.enabledExtensions[ECONOMY_EXTENSION_ID]));
  const editorTabs = useMemo(
    () => getEnabledEditorTabs(allEditorTabs, enabledExtensions, "burgEditor"),
    [allEditorTabs, enabledExtensions]
  );

  useEffect(() => {
    if (isOpen) setActiveTab("overview");
  }, [isOpen]);

  useEffect(() => {
    if (activeTab !== "overview" && !editorTabs.some(tab => tab.id === activeTab)) setActiveTab("overview");
  }, [activeTab, editorTabs]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { editorId?: string; tabId?: string } | undefined;
      if (detail?.editorId === "burgEditor" && detail.tabId) setActiveTab(detail.tabId);
    };
    document.addEventListener("fmg:activate-editor-tab", handler);
    return () => document.removeEventListener("fmg:activate-editor-tab", handler);
  }, []);

  if (!isOpen || !burgData) return null;

  const ActiveExtensionComponent = editorTabs.find(tab => tab.id === activeTab)?.component;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.editBurg")}
      onClose={() => closeDialog("burgEditor")}
      anchorTitlebarOnOpen
      className="fmg-dialog--burg-editor"
    >
      {editorTabs.length > 0 && <BurgEditorTabBar tabs={editorTabs} activeTab={activeTab} onSelect={setActiveTab} />}
      {activeTab === "overview" ? (
        <div id="burgBody">
          <div className="d-flex">
            <svg
              data-tip={t("dialogs.burgEditor.emblemTip")}
              className="pointer"
              viewBox="0 0 200 200"
              width="13em"
              height="13em"
              aria-hidden="true"
              onClick={() => burgEditorActions.openEmblemEdit()}
            >
              <use id="burgEmblem" href={`#${burgData.emblemId}`}></use>
            </svg>
            <table>
              <tbody>
                <tr>
                  <td colSpan={2} id="burgProvinceAndState">
                    {burgData.provinceAndState}
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.nameTip")}>
                  <th scope="row">
                    <label htmlFor="burgName">{t("dialogs.burgEditor.name")}</label>
                  </th>
                  <td>
                    <input
                      id="burgName"
                      autoCorrect="off"
                      spellCheck="false"
                      value={burgData.name}
                      onChange={e => burgEditorActions.changeName(e.target.value)}
                    />
                    <span data-tip={t("dialogs.burgEditor.nameSpeakTip")} className="speaker">
                      🔊
                    </span>
                    <IconButton
                      id="burgNameReRandom"
                      data-tip={t("dialogs.burgEditor.nameRandomTip")}
                      className="icon-globe pointer"
                      onClick={() => burgEditorActions.generateNameRandom()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.groupTip")}>
                  <th scope="row">{t("dialogs.burgEditor.group")}</th>
                  <td>
                    <select
                      id="burgGroup"
                      value={burgData.group}
                      onChange={e => burgEditorActions.changeGroup(e.target.value)}
                    >
                      {groups.map(g => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      id="burgGroupConfigure"
                      data-tip={t("dialogs.burgEditor.groupConfigureTip")}
                      className="icon-cog pointer"
                      onClick={() => burgEditorActions.editBurgGroups()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.typeTip")}>
                  <th scope="row">{t("dialogs.burgEditor.type")}</th>
                  <td>
                    <select
                      id="burgType"
                      value={burgData.type}
                      onChange={e => burgEditorActions.changeType(e.target.value)}
                    >
                      <option value="Generic">{t("dialogs.burgEditor.types.generic")}</option>
                      <option value="River">{t("dialogs.burgEditor.types.river")}</option>
                      <option value="Lake">{t("dialogs.burgEditor.types.lake")}</option>
                      <option value="Naval">{t("dialogs.burgEditor.types.naval")}</option>
                      <option value="Nomadic">{t("dialogs.burgEditor.types.nomadic")}</option>
                      <option value="Hunting">{t("dialogs.burgEditor.types.hunting")}</option>
                      <option value="Highland">{t("dialogs.burgEditor.types.highland")}</option>
                    </select>
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.cultureTip")}>
                  <th scope="row">{t("dialogs.burgEditor.culture")}</th>
                  <td>
                    <select
                      id="burgCulture"
                      value={burgData.culture}
                      onChange={e => burgEditorActions.changeCulture(Number(e.target.value))}
                    >
                      {cultures.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      id="burgNameReCulture"
                      data-tip={t("dialogs.burgEditor.cultureGenerateTip")}
                      className="icon-book pointer"
                      onClick={() => burgEditorActions.generateNameCulture()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.populationTip")}>
                  <th scope="row">
                    <label htmlFor="burgPopulation">{t("dialogs.burgEditor.population")}</label>
                  </th>
                  <td>
                    <input
                      id="burgPopulation"
                      type="number"
                      min="0"
                      step="1"
                      value={burgData.population}
                      onChange={e => burgEditorActions.changePopulation(e.target.value)}
                    />
                    <PopulationPyramid
                      childrenCount={burgData.children}
                      maleAdults={burgData.maleAdults}
                      femaleAdults={burgData.femaleAdults}
                      elders={burgData.elders}
                      ageBands={burgData.populationAgeBands}
                    />
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.temperatureTip")}>
                  <th scope="row">{t("dialogs.burgEditor.temperature")}</th>
                  <td className="d-flex">
                    <span id="burgTemperature">{burgData.temperature}</span>
                    <div className="d-flex">
                      <i
                        className="icon-info-circled"
                        id="burgTemperatureLikeIn"
                        data-tip={burgData.temperatureLikeIn}
                      ></i>
                      <i
                        id="burgTemperatureGraph"
                        data-tip={t("dialogs.burgEditor.temperatureGraphTip")}
                        className="icon-chart-area pointer"
                        onClick={() => burgEditorActions.showTemperatureGraph()}
                      ></i>
                    </div>
                  </td>
                </tr>
                <tr data-tip={t("dialogs.burgEditor.elevationTip")}>
                  <th scope="row">{t("dialogs.burgEditor.elevation")}</th>
                  <td>
                    <span id="burgElevation">{burgData.elevation}</span> {t("dialogs.burgEditor.aboveSeaLevel")}
                  </td>
                </tr>
                {isEconomyEnabled && (
                  <>
                    <tr data-tip={t("dialogs.burgEditor.productionTip")}>
                      <th scope="row">{t("dialogs.burgEditor.production")}</th>
                      <td>
                        <span id="burgProduction" className="d-inline-flex">
                          {burgData.production}
                        </span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.wealthTip")}>
                      <th scope="row">{t("dialogs.burgEditor.wealth")}</th>
                      <td>
                        <span id="burgWealth">{burgData.wealth}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.treasuryTip")}>
                      <th scope="row">{t("dialogs.burgEditor.treasury")}</th>
                      <td>
                        <span id="burgTreasury">{burgData.treasury}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.cellGrainTip")}>
                      <th scope="row">{t("dialogs.burgEditor.cellGrain")}</th>
                      <td>
                        <span id="burgCellGrainProduction">{burgData.cellGrainProduction}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.marketGrainTip")}>
                      <th scope="row">{t("dialogs.burgEditor.marketGrain")}</th>
                      <td>
                        <span id="burgMarketGrainProduction">{burgData.marketGrainProduction}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.foodImportsTip")}>
                      <th scope="row">{t("dialogs.burgEditor.foodImports")}</th>
                      <td>
                        <span id="burgMarketFoodImports">{burgData.marketFoodImports}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.foodReserveGapTip")}>
                      <th scope="row">{t("dialogs.burgEditor.foodReserveGap")}</th>
                      <td>
                        <span id="burgMarketFoodReserveGap">{burgData.marketFoodReserveGap}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.marketFoodStockTip")}>
                      <th scope="row">{t("dialogs.burgEditor.marketFoodStock")}</th>
                      <td>
                        <span id="burgMarketFoodStock">{burgData.marketFoodStock}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.basicEmploymentTip")}>
                      <th scope="row">{t("dialogs.burgEditor.basicEmployment")}</th>
                      <td>
                        <span id="burgBasicEmploymentDemand">{burgData.basicEmploymentDemand}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.serviceEmploymentTip")}>
                      <th scope="row">{t("dialogs.burgEditor.serviceEmployment")}</th>
                      <td>
                        <span id="burgServiceEmploymentDemand">{burgData.serviceEmploymentDemand}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.laborResidualTip")}>
                      <th scope="row">{t("dialogs.burgEditor.laborResidual")}</th>
                      <td>
                        <span id="burgLaborResidual">{burgData.laborResidual}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.marketUnemploymentTip")}>
                      <th scope="row">{t("dialogs.burgEditor.marketUnemployment")}</th>
                      <td>
                        <span id="burgMarketUnemployment">{burgData.marketUnemployment}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.employmentFocusTip")}>
                      <th scope="row">{t("dialogs.burgEditor.employmentFocus")}</th>
                      <td>
                        <span id="burgEmploymentFocus">{burgData.employmentFocus}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.laborLedgerTip")}>
                      <th scope="row">{t("dialogs.burgEditor.laborLedger")}</th>
                      <td>
                        <span
                          id="burgEmploymentComposition"
                          style={{ whiteSpace: "pre-line", display: "inline-block", textAlign: "left" }}
                        >
                          {burgData.employmentComposition}
                        </span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.dwellingsTip")}>
                      <th scope="row">{t("dialogs.burgEditor.dwellings")}</th>
                      <td>
                        <span id="burgDwellings">{burgData.dwellings}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.housingGapTip")}>
                      <th scope="row">{t("dialogs.burgEditor.housingGap")}</th>
                      <td>
                        <span id="burgHousingGap">{burgData.housingGap}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.underConstructionTip")}>
                      <th scope="row">{t("dialogs.burgEditor.underConstruction")}</th>
                      <td>
                        <span id="burgUnderConstruction">{burgData.underConstruction}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.constructionWorkersTip")}>
                      <th scope="row">{t("dialogs.burgEditor.constructionWorkers")}</th>
                      <td>
                        <span id="burgConstructionWorkers">{burgData.constructionWorkers}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.constructionJobsTip")}>
                      <th scope="row">{t("dialogs.burgEditor.constructionJobs")}</th>
                      <td>
                        <span id="burgConstructionJobs">{burgData.constructionJobs}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.innsTip")}>
                      <th scope="row">{t("dialogs.burgEditor.inns")}</th>
                      <td>
                        <span id="burgInns">{burgData.inns}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.waterSanitationTip")}>
                      <th scope="row">{t("dialogs.burgEditor.waterSanitation")}</th>
                      <td>
                        <span id="burgWaterSanitation">{burgData.waterSanitation}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.sanitationScoreTip")}>
                      <th scope="row">{t("dialogs.burgEditor.sanitationScore")}</th>
                      <td>
                        <span id="burgSanitationScore">{burgData.sanitationScore}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.medicalCareTip")}>
                      <th scope="row">{t("dialogs.burgEditor.medicalCare")}</th>
                      <td>
                        <span id="burgMedicalCareScore">{burgData.medicalCareScore}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.pregnantTip")}>
                      <th scope="row">{t("dialogs.burgEditor.pregnant")}</th>
                      <td>
                        <span id="burgPregnant">{burgData.pregnant}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.expectedBirthsTip")}>
                      <th scope="row">{t("dialogs.burgEditor.expectedBirths")}</th>
                      <td>
                        <span id="burgExpectedBirths">{burgData.expectedBirths}</span>
                      </td>
                    </tr>
                    <tr data-tip={t("dialogs.burgEditor.settlementValueTip")}>
                      <th scope="row">{t("dialogs.burgEditor.settlementValue")}</th>
                      <td>
                        <span id="burgSettlementValue">{burgData.settlementValue}</span>
                      </td>
                    </tr>
                  </>
                )}
                <tr>
                  <th scope="row">{t("dialogs.burgEditor.features")}</th>
                  <td>
                    <IconButton
                      id="burgCapital"
                      data-tip={t("dialogs.burgEditor.featureCapitalTip")}
                      className={`burgFeature icon-star pointer ${!burgData.capital ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("capital")}
                    ></IconButton>
                    <IconButton
                      id="burgPort"
                      data-tip={t("dialogs.burgEditor.featurePortTip")}
                      className={`burgFeature icon-anchor pointer ${!burgData.port ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("port")}
                    ></IconButton>
                    <IconButton
                      id="burgCitadel"
                      data-tip={t("dialogs.burgEditor.featureCitadelTip")}
                      className={`burgFeature icon-chess-rook pointer ${!burgData.citadel ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("citadel")}
                    ></IconButton>
                    <IconButton
                      id="burgWalls"
                      data-tip={t("dialogs.burgEditor.featureWallsTip")}
                      className={`burgFeature icon-fort-awesome pointer ${!burgData.walls ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("walls")}
                    ></IconButton>
                    <IconButton
                      id="burgPlaza"
                      data-tip={t("dialogs.burgEditor.featurePlazaTip")}
                      className={`burgFeature icon-store pointer ${!burgData.plaza ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("plaza")}
                    ></IconButton>
                    <IconButton
                      id="burgTemple"
                      data-tip={t("dialogs.burgEditor.featureTempleTip")}
                      className={`burgFeature icon-chess-bishop pointer ${!burgData.temple ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("temple")}
                    ></IconButton>
                    <IconButton
                      id="burgShanty"
                      data-tip={t("dialogs.burgEditor.featureShantyTip")}
                      className={`burgFeature icon-campground pointer ${!burgData.shanty ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("shanty")}
                    ></IconButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {burgData.previewUrl && (
            <div id="burgPreviewSection" data-tip={t("dialogs.burgEditor.previewSectionTip")} className="d-flex">
              <div className="d-flex">
                <span>{t("dialogs.burgEditor.previewLabel")}</span>
                <div className="d-flex">
                  <i
                    id="burgLinkOpen"
                    data-tip={t("dialogs.burgEditor.previewOpenTip")}
                    className="icon-link-ext pointer"
                    onClick={() => burgEditorActions.openBurgLink()}
                  ></i>
                </div>
              </div>
              <div id="burgPreviewObject">
                <object data={burgData.previewUrl} aria-label={t("dialogs.burgEditor.previewAriaLabel")} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div id="burgBody">{ActiveExtensionComponent ? <ActiveExtensionComponent /> : null}</div>
      )}
      <div id="burgFooter">
        {isStyleSectionOpen ? (
          <div id="burgStyleSection" className="d-inline-block">
            <button
              type="button"
              id="burgStyleHide"
              data-tip="Hide style edit section"
              className="icon-brush"
              onClick={() => burgEditorActions.hideStyleSection()}
            ></button>
            <button
              type="button"
              id="burgEditLabelStyle"
              data-tip="Edit label style for burg group in Style Editor"
              className="icon-font"
              onClick={() => burgEditorActions.editGroupLabelStyle()}
            ></button>
            <button
              type="button"
              id="burgEditIconStyle"
              data-tip="Edit icon style for burg group in Style Editor"
              className="icon-dot-circled"
              onClick={() => burgEditorActions.editGroupIconStyle()}
            ></button>
            {burgData.port && (
              <button
                type="button"
                id="burgEditAnchorStyle"
                data-tip="Edit port icon (anchor) style for burg group in Style Editor"
                className="icon-anchor"
                onClick={() => burgEditorActions.editGroupAnchorStyle()}
              ></button>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              id="burgStyleShow"
              data-tip="Show style edit section"
              className="icon-brush"
              onClick={() => burgEditorActions.showStyleSection()}
            ></button>

            <button
              type="button"
              id="burgEditEmblem"
              data-tip="Edit emblem"
              className="icon-shield-alt"
              onClick={() => burgEditorActions.openEmblemEdit()}
            ></button>
            <button
              type="button"
              id="burgSetPreviewLink"
              data-tip="Set custom burg map URL"
              className="icon-map-o"
              onClick={() => burgEditorActions.setCustomPreview()}
            ></button>
            <button
              type="button"
              id="burgCopySiteDescriptor"
              data-tip="Copy the City Generator site input (local terrain, river course, road entries) as JSON"
              className="icon-docs"
              onClick={() => burgEditorActions.copyCityGeneratorInput()}
            ></button>
            <button
              type="button"
              id="burgLocate"
              data-tip="Zoom map and center view in the burg"
              className="icon-target"
              onClick={() => burgEditorActions.zoomIntoBurg()}
            ></button>
            <button
              type="button"
              id="burgProductionOverview"
              data-tip="Show production overview for this burg"
              className="icon-chart-bar"
              onClick={() =>
                document.dispatchEvent(
                  new CustomEvent("react-tool-action", {
                    detail: { action: "burgProductionOverview", burgId: burgData.id }
                  })
                )
              }
            ></button>
            <button
              type="button"
              id="burgTravelHere"
              data-tip="Travel the player character to this burg"
              aria-label="Travel player character here"
              className="burg-footer-emoji"
              onClick={() =>
                document.dispatchEvent(
                  new CustomEvent("react-tool-action", {
                    detail: { action: "travelPlayerCharacterToBurg", burgId: burgData.id }
                  })
                )
              }
            >
              🐴
            </button>
            <button
              type="button"
              id="burgRelocate"
              data-tip="Relocate burg. Click on map to move the burg"
              className={`icon-map-pin ${isRelocateMode ? "pressed" : ""}`}
              onClick={() => burgEditorActions.toggleRelocateBurg()}
            ></button>
            <button
              type="button"
              id="burglLegend"
              data-tip="Edit free text notes (legend) for this burg"
              className="icon-edit"
              onClick={() => burgEditorActions.editBurgLegend()}
            ></button>
            <button
              type="button"
              id="burgLock"
              className={burgData.lock ? "icon-lock" : "icon-lock-open"}
              onMouseOver={e => showElementLockTip(e.nativeEvent)}
              onClick={() => burgEditorActions.toggleBurgLockButton()}
            ></button>
            <button
              type="button"
              id="burgRemove"
              data-tip="Remove non-capital burg"
              data-shortcut="Delete"
              className="icon-trash fastDelete"
              onClick={() => burgEditorActions.removeSelectedBurg()}
            ></button>
          </>
        )}
      </div>
    </Dialog>
  );
};
