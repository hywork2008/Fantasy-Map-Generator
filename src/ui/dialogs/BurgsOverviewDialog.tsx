import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { worldContext } from "../../context/worldContext";
import { editBurgGroups } from "../../controllers/burg-group-editor";
import {
  downloadBurgsData,
  filterAndSortBurgs,
  importBurgNames,
  regenerateBurgNames,
  renameBurgsInBulk,
  showBurgsChart,
  startAddBurgMode,
  stopAddBurgMode
} from "../../controllers/burgs-overview";
import { uploadFile } from "../../controllers/editors";
import { Burgs } from "../../generators/burgs-generator";
import { legacyMutation, patchBurg } from "../../runtime/worldRuntime";
import { tip } from "../../services/tooltipService";
import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { useDialogState } from "../../store/dialogState";
import { useExtensionState } from "../../store/extensionState";
import { si } from "../../utils";
import { BurgsTable } from "../components/tables/BurgsTable";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

export const BurgsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgsOverview"));
  const {
    sortBy,
    sortOrder,
    searchText,
    filterStateId,
    filterCultureId,
    filterProvinceId,
    filterGroup,
    addMode,
    refreshCounter,
    toggleSortBy,
    setSearchText,
    setFilterStateId,
    setFilterCultureId,
    setFilterProvinceId,
    setFilterGroup,
    setAddMode,
    refresh
  } = useBurgsOverviewState();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage add-burg map interaction
  useEffect(() => {
    if (!isOpen) return;
    if (addMode) {
      startAddBurgMode(() => {
        setAddMode(false);
        refresh();
      });
    } else {
      stopAddBurgMode();
    }
    return () => stopAddBurgMode();
  }, [addMode, isOpen, setAddMode, refresh]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && addMode) {
      setAddMode(false);
      stopAddBurgMode();
    }
  }, [isOpen, addMode, setAddMode]);

  const sortedStates = useMemo(() => {
    void refreshCounter;
    return (worldContext.pack?.states ?? []).filter(s => !s.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [refreshCounter]);

  const sortedCultures = useMemo(() => {
    void refreshCounter;
    return (worldContext.pack?.cultures ?? [])
      .filter(c => c.i && !c.removed)
      .sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [refreshCounter]);

  const sortedProvinces = useMemo(() => {
    void refreshCounter;
    return (worldContext.pack?.provinces ?? [])
      .filter(p => p.i && !p.removed)
      .sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [refreshCounter]);

  const uniqueGroups = useMemo(() => {
    void refreshCounter;
    const groups = new Set<string>();
    (worldContext.pack?.burgs ?? []).forEach(b => {
      if (b.i && !b.removed && b.group) groups.add(b.group);
    });
    return Array.from(groups).sort();
  }, [refreshCounter]);

  const overviewColumns = useExtensionState(state => state.burgOverviewColumns);

  const { filteredBurgs, totalPopulation, columnTotals, validCount } = useMemo(() => {
    void refreshCounter;
    const { rows, totalPopulation, columnTotals, validCount } = filterAndSortBurgs(worldContext.pack?.burgs ?? [], {
      searchText,
      filterStateId,
      filterCultureId,
      filterProvinceId,
      filterGroup,
      sortBy,
      sortOrder
    });
    return { filteredBurgs: rows, totalPopulation, columnTotals, validCount };
  }, [refreshCounter, searchText, filterStateId, filterCultureId, filterProvinceId, filterGroup, sortBy, sortOrder]);

  const allLocked = useMemo(() => {
    void refreshCounter;
    const active = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    return active.length > 0 && active.every(b => b.lock);
  }, [refreshCounter]);

  function handleToggleLockAll(): void {
    const activeBurgs = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    const locked = activeBurgs.every(b => b.lock);
    activeBurgs.forEach(b => {
      b.lock = !locked;
    });
    refresh();
  }

  function handleToggleLock(burgId: number): void {
    const burg = worldContext.pack.burgs[burgId];
    if (!burg) return;
    patchBurg({ burgId, lock: !burg.lock });
    refresh();
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

  function handleRemoveAll(): void {
    const count = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed && !b.capital && !b.lock).length;
    openConfirm(
      `Are you sure you want to remove all <i>unlocked</i> burgs except for capitals?<br><i>To remove a capital you have to remove its state first</i>`,
      {
        title: `Remove ${count} burgs`,
        confirm: "Remove",
        onConfirm: () => {
          legacyMutation(() => {
            for (const b of (worldContext.pack?.burgs ?? []).filter(b => b.i && !(b.capital || b.lock))) {
              Burgs.remove(b.i!);
            }
            return { result: undefined, topics: ["map.settlements", "map.annotations", "simulation.burgs"] };
          });
          refresh();
        }
      }
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      title="Burgs Overview"
      onClose={() => closeDialog("burgsOverview")}
      className="fmg-dialog--table"
    >
      <div id="burgsOverviewContainer">
        <BurgsTable
          rows={filteredBurgs}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={toggleSortBy}
          onRemoveBurg={handleRemoveBurg}
          onToggleLock={handleToggleLock}
          showProvinceColumn={false}
          showCultureColumn={false}
        />

        <div id="burgsFilters" data-tip="Apply a filter" className="d-flex">
          <label htmlFor="burgsSearch" data-tip="Filter by name, province, state, culture, or group">
            Search:{" "}
            <input id="burgsSearch" type="search" value={searchText} onChange={e => setSearchText(e.target.value)} />
          </label>
          <label htmlFor="burgsFilterState">
            State:
            <select id="burgsFilterState" value={filterStateId} onChange={e => setFilterStateId(+e.target.value)}>
              <option value="-1">all</option>
              <option value="0">{worldContext.pack?.states?.[0]?.name ?? "Neutral"}</option>
              {sortedStates
                .filter(s => s.i)
                .map(s => (
                  <option key={s.i} value={s.i}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label htmlFor="burgsFilterCulture">
            Culture:
            <select id="burgsFilterCulture" value={filterCultureId} onChange={e => setFilterCultureId(+e.target.value)}>
              <option value="-1">all</option>
              <option value="0">{worldContext.pack?.cultures?.[0]?.name ?? "Wildlands"}</option>
              {sortedCultures.map(c => (
                <option key={c.i} value={c.i}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="burgsFilterProvince">
            Province:
            <select
              id="burgsFilterProvince"
              value={filterProvinceId}
              onChange={e => setFilterProvinceId(+e.target.value)}
            >
              <option value="-1">all</option>
              {sortedProvinces.map(p => (
                <option key={p.i} value={p.i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="burgsFilterGroup">
            Group:
            <select id="burgsFilterGroup" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
              <option value="">all</option>
              {uniqueGroups.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div id="burgsTotal" className="totalLine">
          <div data-tip="Burgs displayed">
            Burgs:{filteredBurgs.length} of {validCount}
          </div>
          <div data-tip="Average population">
            Average population:
            {filteredBurgs.length ? si(totalPopulation / filteredBurgs.length) : "0"}
          </div>
          {overviewColumns.map(column => (
            <div key={column.id} data-tip={column.tip}>
              Avg {column.label}:
              {column.format(filteredBurgs.length ? (columnTotals[column.id] ?? 0) / filteredBurgs.length : 0)}
            </div>
          ))}
        </div>

        <div id="burgsFooter" className="footer">
          <button type="button" data-tip="Refresh the Editor" className="icon-cw" onClick={refresh} />
          <button type="button" data-tip="Edit burg groups" className="icon-cog" onClick={() => editBurgGroups()} />
          <button
            type="button"
            data-tip="Show burgs bubble chart"
            className="icon-chart-area"
            onClick={showBurgsChart}
          />
          <button
            type="button"
            data-tip="Regenerate burg names based on assigned culture"
            className="icon-retweet"
            onClick={() => regenerateBurgNames(refresh)}
          />
          <button
            type="button"
            data-tip="Add a new burg. Hold Shift to add multiple"
            className={`icon-plus${addMode ? " pressed" : ""}`}
            onClick={() => setAddMode(!addMode)}
          />
          <button
            type="button"
            data-tip="Save burgs-related data as a text file (.csv)"
            className="icon-download"
            onClick={() => downloadBurgsData()}
          />
          <button
            type="button"
            data-tip="Rename burgs in bulk"
            className="icon-upload"
            onClick={() => renameBurgsInBulk(() => fileInputRef.current?.click())}
          />
          <button
            type="button"
            data-tip="Lock or unlock all burgs"
            className={allLocked ? "icon-lock-open" : "icon-lock"}
            onClick={handleToggleLockAll}
          />
          <button
            type="button"
            data-tip="Remove all unlocked burgs except for capitals. To remove a capital remove its state first"
            className="icon-trash"
            onClick={handleRemoveAll}
          />
          <input
            ref={fileInputRef}
            type="file"
            id="burgsListToLoad"
            className="d-none"
            onChange={e => {
              if (e.target.files?.[0]) uploadFile(e.target as HTMLInputElement, data => importBurgNames(data, refresh));
            }}
          />
        </div>
      </div>
    </Dialog>
  );
};
