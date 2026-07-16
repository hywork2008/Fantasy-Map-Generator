import type React from "react";
import { useMemo, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { filterAndSortBurgs } from "../../controllers/burgs-overview";
import { enterFocus } from "../../controllers/focus-view";
import { regeneratePopulationAndBurgs } from "../../controllers/population-editor";
import { computeProvinceRows } from "../../controllers/provinces-editor";
import { Burgs } from "../../generators/burgs-generator";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import {
  type ProvinceEditorTab,
  setProvinceEditorState,
  useProvinceEditorState
} from "../../store/provinceEditorState";
import { si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { BurgsTable } from "../components/tables/BurgsTable";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";
import { TableDialogLayout } from "./TableDialogLayout";

const TABS: { id: ProvinceEditorTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "burgs", label: "Burgs" }
];

export const ProvinceEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("provinceEditor"));
  const { provinceId, activeTab } = useProvinceEditorState();
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick(t => t + 1);

  const [burgSort, setBurgSort] = useState<{ sortBy: string; sortOrder: "asc" | "desc" }>({
    sortBy: "name",
    sortOrder: "asc"
  });

  // Guarded on isOpen: these read/recompute from worldContext.pack, which is only populated
  // once a map exists. The dialog is always mounted (see DialogsContainer) but only opened
  // via a pencil icon on an existing province row, so the hooks below must stay cheap/no-op
  // while closed rather than touching pack before it's ready.
  const provinceRow = useMemo(() => {
    void refreshTick;
    if (!isOpen) return null;
    return computeProvinceRows(-1).rows.find(p => p.i === provinceId) ?? null;
  }, [isOpen, provinceId, refreshTick]);

  const burgsData = useMemo(() => {
    void refreshTick;
    if (!isOpen) return { rows: [], totalPopulation: 0, validCount: 0 };
    return filterAndSortBurgs(worldContext.pack?.burgs ?? [], {
      filterProvinceId: provinceId,
      sortBy: burgSort.sortBy,
      sortOrder: burgSort.sortOrder
    });
  }, [isOpen, provinceId, burgSort, refreshTick]);

  function handleSortBurgs(field: string): void {
    setBurgSort(prev =>
      prev.sortBy === field
        ? { sortBy: field, sortOrder: prev.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "asc" }
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
        Burgs.remove(burgId);
        refresh();
      }
    });
  }

  function handleToggleLock(burgId: number): void {
    const burg = worldContext.pack.burgs[burgId];
    if (!burg) return;
    burg.lock = !burg.lock;
    refresh();
  }

  function handleRegenerate(): void {
    openConfirm(
      "This will reposition non-capital, non-locked burgs and redistribute rural population within this province — the province's total population is preserved. Continue?",
      {
        title: "Regenerate burgs & population",
        confirm: "Regenerate",
        onConfirm: () => {
          const { cells } = worldContext.pack;
          regeneratePopulationAndBurgs(cells.i.filter(i => cells.province[i] === provinceId));
          refresh();
        }
      }
    );
  }

  if (!isOpen || !provinceRow) return null;

  const areaUnit = getAreaUnit();

  return (
    <Dialog
      isOpen={isOpen}
      title={`Edit Province: ${provinceRow.name}`}
      onClose={() => closeDialog("provinceEditor")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        className="province-editor-dialog"
        header={
          <div className="tab-row d-flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "pressed" : ""}
                onClick={() => setProvinceEditorState({ activeTab: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
        footer={
          activeTab === "overview" ? (
            <>
              <button
                type="button"
                className="icon-target"
                data-tip="Narrow the map view to only this province"
                onClick={() => enterFocus("province", provinceId)}
              >
                Focus this province
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
          <div id="provinceEditorOverview">
            <table className="fmg-table fmg-property-table">
              <tbody>
                <tr>
                  <th scope="row">Form</th>
                  <td>{provinceRow.formName}</td>
                </tr>
                <tr>
                  <th scope="row">State</th>
                  <td>{provinceRow.stateName}</td>
                </tr>
                <tr>
                  <th scope="row">Capital</th>
                  <td>{provinceRow.capitalName}</td>
                </tr>
                <tr>
                  <th scope="row">Burgs</th>
                  <td>{provinceRow.burgCount}</td>
                </tr>
                <tr>
                  <th scope="row">Area</th>
                  <td>
                    {si(provinceRow.area)} {areaUnit}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Population</th>
                  <td>{si(provinceRow.population)}</td>
                </tr>
              </tbody>
            </table>
          </div>
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
