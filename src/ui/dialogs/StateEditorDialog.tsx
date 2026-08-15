import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import { filterAndSortBurgs } from "../../controllers/burgs-overview";
import { enterFocus } from "../../controllers/focus-view";
import { regeneratePopulationAndBurgs } from "../../controllers/population-editor";
import { computeProvinceRows, sortProvinceRows } from "../../controllers/provinces-editor";
import { computeStateRows } from "../../controllers/states-editor";
import { estimatePolityAgeForRace, FOUNDING_COUPLES_DEFAULT, formatPolityAgeYears } from "../../data/polityAgeEstimate";
import { HUMAN_RACE_ID } from "../../data/races";
import { Burgs } from "../../generators/burgs-generator";
import { legacyMutation, patchBurg } from "../../runtime/worldRuntime";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { type ExtensionEditorTab, getEnabledEditorTabs, useExtensionState } from "../../store/extensionState";
import { type StateEditorTab, setStateEditorState, useStateEditorState } from "../../store/stateEditorState";
import { si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { BurgsTable } from "../components/tables/BurgsTable";
import { ProvincesTable } from "../components/tables/ProvincesTable";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";
import { TableDialogLayout } from "./TableDialogLayout";

const TABS: { id: StateEditorTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "provinces", label: "Provinces" },
  { id: "burgs", label: "Burgs" }
];

const StateEditorTabBar: React.FC<{
  tabs: readonly ExtensionEditorTab[];
  activeTab: string;
  onSelect: (tabId: string) => void;
}> = ({ tabs, activeTab, onSelect }) => (
  <div className="tab-row d-flex" role="tablist" aria-label="State editor sections">
    {TABS.map(tab => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        className={activeTab === tab.id ? "pressed" : ""}
        onClick={() => onSelect(tab.id)}
      >
        {tab.label}
      </button>
    ))}
    {tabs.map(tab => (
      <button
        key={tab.id}
        id={`stateEditorTab-${tab.id}`}
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

export const StateEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("stateEditor"));
  const { stateId, activeTab } = useStateEditorState();
  const allEditorTabs = useExtensionState(state => state.editorTabs);
  const enabledExtensions = useExtensionState(state => state.enabledExtensions);
  const editorTabs = useMemo(
    () => getEnabledEditorTabs(allEditorTabs, enabledExtensions, "stateEditor"),
    [allEditorTabs, enabledExtensions]
  );
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick(t => t + 1);

  const [provinceSort, setProvinceSort] = useState({ sortBy: "name", sortDirection: 1 });
  const [burgSort, setBurgSort] = useState<{ sortBy: string; sortOrder: "asc" | "desc" }>({
    sortBy: "name",
    sortOrder: "asc"
  });

  // Guarded on isOpen: these read/recompute from worldContext.pack, which is only populated
  // once a map exists. The dialog is only ever opened via a pencil icon on an existing
  // state/province row, but it's always mounted (see DialogsContainer), so the hooks below
  // must stay cheap/no-op while closed rather than touching pack before it's ready.
  const stateRow = useMemo(() => {
    void refreshTick;
    if (!isOpen) return null;
    return computeStateRows().rows.find(s => s.i === stateId) ?? null;
  }, [isOpen, stateId, refreshTick]);

  const provincesData = useMemo(() => {
    void refreshTick;
    if (!isOpen)
      return { rows: [], stateOptions: [], totalProvinces: 0, totalBurgs: 0, totalArea: 0, totalPopulation: 0 };
    return computeProvinceRows(stateId);
  }, [isOpen, stateId, refreshTick]);

  const sortedProvinces = useMemo(
    () => sortProvinceRows(provincesData.rows, provinceSort.sortBy, provinceSort.sortDirection),
    [provincesData.rows, provinceSort]
  );

  const burgsData = useMemo(() => {
    void refreshTick;
    if (!isOpen) return { rows: [], totalPopulation: 0, validCount: 0 };
    return filterAndSortBurgs(worldContext.pack?.burgs ?? [], {
      filterStateId: stateId,
      sortBy: burgSort.sortBy,
      sortOrder: burgSort.sortOrder
    });
  }, [isOpen, stateId, burgSort, refreshTick]);

  /** Demographic “how old could this realm be?” from race fertility + population. */
  const polityAge = useMemo(() => {
    void refreshTick;
    if (!isOpen || stateRow == null || !stateRow.i) return null;
    const culture = worldContext.pack?.cultures?.[stateRow.culture];
    const raceId = culture?.race ?? HUMAN_RACE_ID;
    return estimatePolityAgeForRace(stateRow.population, worldContext.pack?.races, raceId, FOUNDING_COUPLES_DEFAULT);
  }, [isOpen, stateRow, refreshTick]);

  function handleSortProvinces(field: string): void {
    setProvinceSort(prev =>
      prev.sortBy === field
        ? { sortBy: field, sortDirection: -prev.sortDirection }
        : { sortBy: field, sortDirection: -1 }
    );
  }

  function handleSortBurgs(field: string): void {
    setBurgSort(prev =>
      prev.sortBy === field
        ? { sortBy: field, sortOrder: prev.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "desc" }
    );
  }

  function handleRemoveBurg(burgId: number): void {
    if (worldContext.pack.burgs[burgId]?.capital) {
      tip("You cannot remove the capital. Please change the state capital first", false, "error");
      return;
    }
    openConfirm("Are you sure you want to remove the burg? This action cannot be reverted", {
      title: "Remove burg",
      confirm: "Remove",
      onConfirm: () => {
        legacyMutation(() => {
          Burgs.remove(burgId);
          return { result: undefined, topics: ["map.settlements", "map.annotations", "simulation.burgs"] };
        });
        refresh();
      }
    });
  }

  function handleToggleLock(burgId: number): void {
    const burg = worldContext.pack.burgs[burgId];
    if (!burg) return;
    patchBurg({ burgId, lock: !burg.lock });
    refresh();
  }

  function handleRegenerate(): void {
    openConfirm(
      "This will reposition non-capital, non-locked burgs and redistribute rural population within this state — the state's total population is preserved. Continue?",
      {
        title: "Regenerate burgs & population",
        confirm: "Regenerate",
        onConfirm: () => {
          const { cells } = worldContext.pack;
          regeneratePopulationAndBurgs(cells.i.filter(i => cells.state[i] === stateId));
          refresh();
        }
      }
    );
  }

  if (!isOpen || !stateRow) return null;

  const areaUnit = getAreaUnit();
  const ActiveExtensionComponent = editorTabs.find(tab => tab.id === activeTab)?.component;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.editState", { name: stateRow.name })}
      onClose={() => closeDialog("stateEditor")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        className="state-editor-dialog"
        header={
          <StateEditorTabBar
            tabs={editorTabs}
            activeTab={activeTab}
            onSelect={tabId => setStateEditorState({ activeTab: tabId })}
          />
        }
        footer={
          activeTab === "overview" ? (
            <>
              <button
                type="button"
                className="icon-target"
                data-tip="Narrow the map view to only this state"
                onClick={() => enterFocus("state", stateId)}
              >
                Focus this state
              </button>
              <button
                type="button"
                className="icon-shuffle"
                data-tip="Regenerate non-capital burgs and redistribute rural population, preserving totals"
                onClick={handleRegenerate}
              >
                Regenerate burgs &amp; population
              </button>
            </>
          ) : undefined
        }
      >
        {activeTab === "overview" && (
          <div id="stateEditorOverview">
            <table className="fmg-table fmg-property-table">
              <tbody>
                <tr>
                  <th scope="row">Form</th>
                  <td>{stateRow.formName}</td>
                </tr>
                <tr>
                  <th scope="row">Capital</th>
                  <td>{stateRow.capitalName}</td>
                </tr>
                <tr>
                  <th scope="row">Culture</th>
                  <td>{stateRow.cultureName}</td>
                </tr>
                {polityAge && (
                  <tr
                    data-tip={
                      polityAge.status === "ok"
                        ? `${polityAge.note} Assumes closed birth growth (no migration/conquest absorption), full juvenile survival, and mono-race majority. Order-of-magnitude only.`
                        : polityAge.note
                    }
                  >
                    <th scope="row">Dominant race</th>
                    <td>{polityAge.raceName}</td>
                  </tr>
                )}
                <tr>
                  <th scope="row">Type</th>
                  <td>{stateRow.type}</td>
                </tr>
                <tr>
                  <th scope="row">Provinces</th>
                  <td>{provincesData.totalProvinces}</td>
                </tr>
                <tr>
                  <th scope="row">Burgs</th>
                  <td>{stateRow.burgs}</td>
                </tr>
                <tr>
                  <th scope="row">Area</th>
                  <td>
                    {si(stateRow.area)} {areaUnit}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Population</th>
                  <td>{si(stateRow.population)}</td>
                </tr>
                {polityAge && (
                  <tr
                    data-tip={
                      polityAge.status === "ok"
                        ? `Estimated years if the realm grew from ${FOUNDING_COUPLES_DEFAULT} fertile ${polityAge.raceName} couples (N₀=${polityAge.foundingPopulation}) under average lifetime births R_max≈${polityAge.rMax.toFixed(2)} and generation length T≈${Math.round(polityAge.generationYears)} years. Ignores war, famine, migration, and carrying capacity. Hover note: ${polityAge.note}`
                        : polityAge.note
                    }
                  >
                    <th scope="row">Est. polity age</th>
                    <td>
                      {polityAge.status === "ok" ? (
                        <>
                          {formatPolityAgeYears(polityAge.years)}
                          {polityAge.generations !== null && (
                            <span style={{ opacity: 0.75 }}>
                              {" "}
                              (≈ {polityAge.generations} gen. from {FOUNDING_COUPLES_DEFAULT} couples)
                            </span>
                          )}
                        </>
                      ) : polityAge.status === "too_small" ? (
                        <>Recent founding ({formatPolityAgeYears(0)})</>
                      ) : (
                        <>
                          — <span style={{ opacity: 0.8 }}>{polityAge.note}</span>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {ActiveExtensionComponent && <ActiveExtensionComponent />}

        {activeTab === "provinces" && (
          <ProvincesTable
            provinces={sortedProvinces}
            sortBy={provinceSort.sortBy}
            sortDirection={provinceSort.sortDirection}
            onSort={handleSortProvinces}
            isPercentageMode={false}
            totalArea={provincesData.totalArea}
            totalPopulation={provincesData.totalPopulation}
            totalBurgs={provincesData.totalBurgs}
            hideStateColumn
          />
        )}

        {activeTab === "burgs" && (
          <BurgsTable
            rows={burgsData.rows}
            sortBy={burgSort.sortBy}
            sortOrder={burgSort.sortOrder}
            onSort={handleSortBurgs}
            onRemoveBurg={handleRemoveBurg}
            onToggleLock={handleToggleLock}
          />
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
