import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { burgEditorActions } from "../../controllers/burg-editor";
import { showElementLockTip } from "../../services/tooltipService";
import { useBurgEditorState } from "../../store/burgEditorState";
import { useDialogState } from "../../store/dialogState";
import { type ExtensionEditorTab, getEnabledEditorTabs, useExtensionState } from "../../store/extensionState";
import { IconButton } from "../components/IconButton";
import { PopulationPyramid } from "../components/PopulationPyramid";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

interface BurgEditorTabBarProps {
  tabs: ExtensionEditorTab[];
  activeTab: string;
  onSelect: (tabId: string) => void;
}

const BurgEditorTabBar: React.FC<BurgEditorTabBarProps> = ({ tabs, activeTab, onSelect }) => (
  <div
    id="burgEditorTabs"
    role="tablist"
    aria-label="Burg editor sections"
    style={{ display: "flex", borderBottom: "1px solid #555", marginBottom: "4px", fontSize: "1.1em" }}
  >
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "overview"}
      className={activeTab === "overview" ? "pressed" : ""}
      onClick={() => onSelect("overview")}
    >
      Overview
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
        {tab.label}
      </button>
    ))}
  </div>
);

export const BurgEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgEditor"));
  const burgData = useBurgEditorState(state => state.burgData);
  const groups = useBurgEditorState(state => state.groups);
  const cultures = useBurgEditorState(state => state.cultures);
  const isStyleSectionOpen = useBurgEditorState(state => state.isStyleSectionOpen);
  const isRelocateMode = useBurgEditorState(state => state.isRelocateMode);
  const [activeTab, setActiveTab] = useState("overview");
  const allEditorTabs = useExtensionState(state => state.editorTabs);
  const enabledExtensions = useExtensionState(state => state.enabledExtensions);
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
    <Dialog isOpen={isOpen} title="Edit Burg" onClose={() => closeDialog("burgEditor")}>
      {editorTabs.length > 0 && <BurgEditorTabBar tabs={editorTabs} activeTab={activeTab} onSelect={setActiveTab} />}
      {activeTab === "overview" ? (
        <div id="burgBody">
          <div className="d-flex">
            <svg
              data-tip="Burg emblem. Click to edit"
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
                <tr data-tip="Type to rename the burg">
                  <th scope="row">
                    <label htmlFor="burgName">Name:</label>
                  </th>
                  <td>
                    <input
                      id="burgName"
                      autoCorrect="off"
                      spellCheck="false"
                      value={burgData.name}
                      onChange={e => burgEditorActions.changeName(e.target.value)}
                    />
                    <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                      🔊
                    </span>
                    <IconButton
                      id="burgNameReRandom"
                      data-tip="Generate random name for the burg"
                      className="icon-globe pointer"
                      onClick={() => burgEditorActions.generateNameRandom()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip="Select burg group. Groups defines burg icon, label size and style">
                  <th scope="row">Group:</th>
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
                      data-tip="Configure burg groups"
                      className="icon-cog pointer"
                      onClick={() => burgEditorActions.editBurgGroups()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip="Select burg type. Type slightly affects emblem generation">
                  <th scope="row">Type:</th>
                  <td>
                    <select
                      id="burgType"
                      value={burgData.type}
                      onChange={e => burgEditorActions.changeType(e.target.value)}
                    >
                      <option value="Generic">Generic</option>
                      <option value="River">River</option>
                      <option value="Lake">Lake</option>
                      <option value="Naval">Naval</option>
                      <option value="Nomadic">Nomadic</option>
                      <option value="Hunting">Hunting</option>
                      <option value="Highland">Highland</option>
                    </select>
                  </td>
                </tr>
                <tr data-tip="Select dominant culture">
                  <th scope="row">Culture:</th>
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
                      data-tip="Generate culture-specific name for the burg"
                      className="icon-book pointer"
                      onClick={() => burgEditorActions.generateNameCulture()}
                    ></IconButton>
                  </td>
                </tr>
                <tr data-tip="Set burg population">
                  <th scope="row">
                    <label htmlFor="burgPopulation">Population:</label>
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
                    />
                  </td>
                </tr>
                <tr data-tip="Burg average yearly temperature">
                  <th scope="row">Temperature:</th>
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
                        data-tip="Show temperature graph for the burg"
                        className="icon-chart-area pointer"
                        onClick={() => burgEditorActions.showTemperatureGraph()}
                      ></i>
                    </div>
                  </td>
                </tr>
                <tr data-tip="Burg height above mean sea level">
                  <th scope="row">Elevation:</th>
                  <td>
                    <span id="burgElevation">{burgData.elevation}</span> above sea level
                  </td>
                </tr>
                <tr data-tip="Burg average daily production">
                  <th scope="row">Production:</th>
                  <td>
                    <span id="burgProduction" className="d-inline-flex">
                      {burgData.production}
                    </span>
                  </td>
                </tr>
                <tr data-tip="Wealth is gross product per population point for the current production run. It is a per-capita productivity measure, not the burg's cumulative treasury.">
                  <th scope="row">Wealth</th>
                  <td>
                    <span id="burgWealth">{burgData.wealth}</span>
                  </td>
                </tr>
                <tr data-tip="Treasury is the burg's cumulative cash balance after all production, purchases, and sales.">
                  <th scope="row">Treasury</th>
                  <td>
                    <span id="burgTreasury">{burgData.treasury}</span>
                  </td>
                </tr>
                <tr data-tip="Share of the current burg population that its imported food capacity could support.">
                  <th scope="row">Food imports</th>
                  <td>
                    <span id="burgFoodImportDependency">{burgData.foodImportDependency}</span>
                  </td>
                </tr>
                <tr data-tip="Basic employment (administration, mining, smelting, trade) that earns income from outside the burg, in adult-worker points. Drives population growth in Megacity mode.">
                  <th scope="row">Basic employment</th>
                  <td>
                    <span id="burgBasicEmploymentDemand">{burgData.basicEmploymentDemand}</span>
                  </td>
                </tr>
                <tr data-tip="Service employment (inns, brokers, artisans) that basic employment supports, in adult-worker points.">
                  <th scope="row">Service employment</th>
                  <td>
                    <span id="burgServiceEmploymentDemand">{burgData.serviceEmploymentDemand}</span>
                  </td>
                </tr>
                <tr data-tip="Labor: adult ledger — household care (non-market) is excluded from unemployment. Residual > 0 means market jobs could expand.">
                  <th scope="row">Labor residual</th>
                  <td>
                    <span id="burgLaborResidual">{burgData.laborResidual}</span>
                  </td>
                </tr>
                <tr data-tip="Labor: estimated market unemployment among adults after household care and assigned work (not a census; display model).">
                  <th scope="row">Market unemployment</th>
                  <td>
                    <span id="burgMarketUnemployment">{burgData.marketUnemployment}</span>
                  </td>
                </tr>
                <tr data-tip="Labor: suggested sector to grow when residual labor remains (housing gap, services, trade, craft, …).">
                  <th scope="row">Employment focus</th>
                  <td>
                    <span id="burgEmploymentFocus">{burgData.employmentFocus}</span>
                  </td>
                </tr>
                <tr data-tip="Labor: compact employment composition (adults, care, assigned, residual, focus). Display-only.">
                  <th scope="row">Labor ledger</th>
                  <td>
                    <span
                      id="burgEmploymentComposition"
                      style={{ whiteSpace: "pre-line", display: "inline-block", textAlign: "left" }}
                    >
                      {burgData.employmentComposition}
                    </span>
                  </td>
                </tr>
                <tr data-tip="Housing: built permanent dwellings vs required (household size 4.5; people = population × populationRate). Requires Economy and a market burg.">
                  <th scope="row">Dwellings</th>
                  <td>
                    <span id="burgDwellings">{burgData.dwellings}</span>
                  </td>
                </tr>
                <tr data-tip="Housing: share of required dwellings still unbuilt. Raises mason/carpenter jobs and Stone/Brick/Wood demand.">
                  <th scope="row">Housing gap</th>
                  <td>
                    <span id="burgHousingGap">{burgData.housingGap}</span>
                  </td>
                </tr>
                <tr data-tip="Housing: estimated new dwellings under construction this year (labor-limited; ~25% of the remaining gap when fully staffed). Material shortages can slow real progress further.">
                  <th scope="row">Under construction</th>
                  <td>
                    <span id="burgUnderConstruction">{burgData.underConstruction}</span>
                  </td>
                </tr>
                <tr data-tip="Housing: mason + carpenter workers assigned to this burg (adult population points).">
                  <th scope="row">Construction workers</th>
                  <td>
                    <span id="burgConstructionWorkers">{burgData.constructionWorkers}</span>
                  </td>
                </tr>
                <tr data-tip="Jobs: construction hire-board openings. Anonymous yearly hire only fills ~85% of demand so these seats stay open for applicants (player/NPC).">
                  <th scope="row">Construction jobs</th>
                  <td>
                    <span id="burgConstructionJobs">{burgData.constructionJobs}</span>
                  </td>
                </tr>
                <tr data-tip="Commercial short-stay lodging. Inn beds are not permanent homes and do not raise housing capacity.">
                  <th scope="row">Inns</th>
                  <td>
                    <span id="burgInns">{burgData.inns}</span>
                  </td>
                </tr>
                <tr data-tip="Demography: estimated pregnant women (urban pregnancy pipeline). Economy enabled only; forts excluded.">
                  <th scope="row">Pregnant</th>
                  <td>
                    <span id="burgPregnant">{burgData.pregnant}</span>
                  </td>
                </tr>
                <tr data-tip="Demography: lower bound on near-term births/year. Live births use max(continuous growth, pregnancy due).">
                  <th scope="row">Expected births</th>
                  <td>
                    <span id="burgExpectedBirths">{burgData.expectedBirths}</span>
                  </td>
                </tr>
                <tr data-tip="Valuation: housing replacement cost at the current culture building recipe × walls/citadel premium.">
                  <th scope="row">Settlement value</th>
                  <td>
                    <span id="burgSettlementValue">{burgData.settlementValue}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Features:</th>
                  <td>
                    <IconButton
                      id="burgCapital"
                      data-tip="Shows whether the burg is a state capital. Click to toggle"
                      className={`burgFeature icon-star pointer ${!burgData.capital ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("capital")}
                    ></IconButton>
                    <IconButton
                      id="burgPort"
                      data-tip="Shows whether the burg is a port. Click to toggle"
                      className={`burgFeature icon-anchor pointer ${!burgData.port ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("port")}
                    ></IconButton>
                    <IconButton
                      id="burgCitadel"
                      data-tip="Shows whether the burg has a citadel (castle). Click to toggle"
                      className={`burgFeature icon-chess-rook pointer ${!burgData.citadel ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("citadel")}
                    ></IconButton>
                    <IconButton
                      id="burgWalls"
                      data-tip="Shows whether the burg is walled. Click to toggle"
                      className={`burgFeature icon-fort-awesome pointer ${!burgData.walls ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("walls")}
                    ></IconButton>
                    <IconButton
                      id="burgPlaza"
                      data-tip="Shows whether the burg is a trade center (has big marketplace). Click to toggle"
                      className={`burgFeature icon-store pointer ${!burgData.plaza ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("plaza")}
                    ></IconButton>
                    <IconButton
                      id="burgTemple"
                      data-tip="Shows whether the burg is a religious center. Click to toggle"
                      className={`burgFeature icon-chess-bishop pointer ${!burgData.temple ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("temple")}
                    ></IconButton>
                    <IconButton
                      id="burgShanty"
                      data-tip="Shows whether the burg has a shanty town. Click to toggle"
                      className={`burgFeature icon-campground pointer ${!burgData.shanty ? "inactive" : ""}`}
                      onClick={() => burgEditorActions.toggleFeature("shanty")}
                    ></IconButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {burgData.previewUrl && (
            <div id="burgPreviewSection" data-tip="Burg map preview" className="d-flex">
              <div className="d-flex">
                <span>Burg preview:</span>
                <div className="d-flex">
                  <i
                    id="burgLinkOpen"
                    data-tip="Open burg map in a new tab"
                    className="icon-link-ext pointer"
                    onClick={() => burgEditorActions.openBurgLink()}
                  ></i>
                </div>
              </div>
              <div id="burgPreviewObject">
                <object data={burgData.previewUrl} aria-label="Burg Map Preview" />
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
