import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { worldContext } from "../../context/worldContext";
import { editBurg } from "../../controllers/burg-editor";
import { editBurgGroups } from "../../controllers/burg-group-editor";
import {
  burgHighlightOff,
  burgHighlightOn,
  downloadBurgsData,
  importBurgNames,
  regenerateBurgNames,
  renameBurgsInBulk,
  showBurgsChart,
  startAddBurgMode,
  stopAddBurgMode,
  zoomIntoBurg
} from "../../controllers/burgs-overview";
import { uploadFile } from "../../controllers/editors";
import { Burgs } from "../../generators/burgs-generator";
import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { useDialogState } from "../../store/dialogState";
import { si } from "../../utils";
import { showElementLockTip, tip } from "../../utils/uiHelpers";
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
    addMode,
    refreshCounter,
    toggleSortBy,
    setSearchText,
    setFilterStateId,
    setFilterCultureId,
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

  const { filteredBurgs, totalPopulation, validCount } = useMemo(() => {
    void refreshCounter;
    const validBurgs = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    let filtered = validBurgs;

    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter(b => {
        const state = (worldContext.pack.states[b.state!]?.name ?? "").toLowerCase();
        const prov = worldContext.pack.cells.province![b.cell];
        const province = prov ? (worldContext.pack.provinces![prov]?.name ?? "").toLowerCase() : "";
        const culture = (worldContext.pack.cultures[b.culture!]?.name ?? "").toLowerCase();
        return (
          (b.name ?? "").toLowerCase().includes(lower) ||
          state.includes(lower) ||
          province.includes(lower) ||
          culture.includes(lower) ||
          (b.group ?? "").toLowerCase().includes(lower)
        );
      });
    }
    if (filterStateId !== -1) filtered = filtered.filter(b => b.state === filterStateId);
    if (filterCultureId !== -1) filtered = filtered.filter(b => b.culture === filterCultureId);

    const rows = filtered.map(b => {
      const population = (b.population ?? 0) * worldContext.populationRate * worldContext.urbanization;
      const prov = worldContext.pack.cells.province![b.cell];
      const province = prov ? (worldContext.pack.provinces![prov]?.name ?? "") : "";
      const stateName = worldContext.pack.states[b.state!]?.name ?? "";
      const cultureName = worldContext.pack.cultures[b.culture!]?.name ?? "";
      const features = b.capital && b.port ? "a-capital-port" : b.capital ? "c-capital" : b.port ? "p-port" : "z-burg";
      return { b, population, province, stateName, cultureName, features };
    });

    // Sort
    const sorted = [...rows].sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;
      if (sortBy === "name") {
        valA = a.b.name ?? "";
        valB = b.b.name ?? "";
      } else if (sortBy === "province") {
        valA = a.province;
        valB = b.province;
      } else if (sortBy === "state") {
        valA = a.stateName;
        valB = b.stateName;
      } else if (sortBy === "culture") {
        valA = a.cultureName;
        valB = b.cultureName;
      } else if (sortBy === "group") {
        valA = a.b.group ?? "";
        valB = b.b.group ?? "";
      } else if (sortBy === "population") {
        valA = a.population;
        valB = b.population;
      } else if (sortBy === "features") {
        valA = a.features;
        valB = b.features;
      }
      const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : valA - (valB as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });

    const total = sorted.reduce((acc, { population }) => acc + population, 0);
    return { filteredBurgs: sorted, totalPopulation: total, validCount: validBurgs.length };
  }, [refreshCounter, searchText, filterStateId, filterCultureId, sortBy, sortOrder]);

  const allLocked = useMemo(() => {
    void refreshCounter;
    const active = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    return active.length > 0 && active.every(b => b.lock);
  }, [refreshCounter]);

  function SortHeader({ field, label, numeric }: { field: string; label: string; numeric?: boolean }) {
    return (
      <div
        data-tip={`Click to sort by ${label.toLowerCase()}`}
        className={`sortable ${numeric ? "icon-sort-number-down" : "alphabetically"}`}
        data-sortby={field}
        onClick={() => toggleSortBy(field)}
        style={{ cursor: "pointer" }}
      >
        {label}
      </div>
    );
  }

  function handleToggleLockAll(): void {
    const activeBurgs = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    const locked = activeBurgs.every(b => b.lock);
    activeBurgs.forEach(b => {
      b.lock = !locked;
    });
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
        Burgs.remove(burgId);
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
          for (const b of (worldContext.pack?.burgs ?? []).filter(b => b.i && !(b.capital || b.lock)))
            Burgs.remove(b.i!);
          refresh();
        }
      }
    );
  }

  return (
    <Dialog isOpen={isOpen} title="Burgs Overview" onClose={() => closeDialog("burgsOverview")}>
      <div id="burgsOverviewContainer">
        <div>
          <div id="burgsHeader" className="header" style={{ gridTemplateColumns: "9em 7em 7.5em 7.2em 6.5em 7em 6em" }}>
            <SortHeader field="name" label="Burg" />
            <SortHeader field="province" label="Province" />
            <SortHeader field="state" label="State" />
            <SortHeader field="culture" label="Culture" />
            <SortHeader field="group" label="Group" />
            <SortHeader field="population" label="Population" numeric />
            <SortHeader field="features" label="Features" />
          </div>

          <div id="burgsBody" className="table">
            {filteredBurgs.length === 0 ? (
              <div style={{ paddingBlock: "0.3em" }}>No burgs found</div>
            ) : (
              filteredBurgs.map(({ b, population, province, stateName, cultureName }) => (
                <div
                  key={b.i}
                  className="states"
                  data-id={b.i}
                  data-name={b.name}
                  data-state={stateName}
                  data-province={province}
                  data-culture={cultureName}
                  data-group={b.group}
                  data-population={population}
                  onMouseEnter={() => burgHighlightOn(b.i!)}
                  onMouseLeave={() => burgHighlightOff()}
                >
                  <span
                    data-tip="Click to zoom into view"
                    className="icon-dot-circled pointer"
                    onClick={() => zoomIntoBurg(b.i!)}
                  />
                  <input data-tip="Burg name" className="burgName" value={b.name ?? ""} disabled readOnly />
                  <input data-tip="Burg province" value={province} disabled readOnly />
                  <input data-tip="Burg state" value={stateName} disabled readOnly />
                  <input data-tip="Dominant culture" value={cultureName} disabled readOnly />
                  <input data-tip="Burg group" value={b.group ?? ""} disabled readOnly />
                  <span data-tip="Burg population" className="icon-male" />
                  <input data-tip="Burg population" value={si(population)} style={{ width: "5em" }} disabled readOnly />
                  <div style={{ width: "3em" }}>
                    <span
                      data-tip={b.capital ? "This burg is a state capital" : "This burg is NOT a state capital"}
                      className={`icon-star-empty${b.capital ? "" : " inactive"}`}
                      style={{ padding: "0 1px" }}
                    />
                    <span
                      data-tip={b.port ? "This burg is a port" : "This burg is NOT a port"}
                      className={`icon-anchor${b.port ? "" : " inactive"}`}
                      style={{ fontSize: ".9em", padding: "0 1px" }}
                    />
                  </div>
                  <span data-tip="Edit burg" className="icon-pencil pointer" onClick={() => editBurg(b.i!)} />
                  <span
                    className={`locks pointer${b.lock ? " icon-lock" : " icon-lock-open inactive"}`}
                    onMouseOver={e => showElementLockTip(e.nativeEvent)}
                    onClick={() => {
                      b.lock = !b.lock;
                      refresh();
                    }}
                  />
                  <span
                    data-tip="Remove burg"
                    className="icon-trash-empty pointer"
                    onClick={() => handleRemoveBurg(b.i!)}
                  />
                </div>
              ))
            )}
          </div>

          <div
            id="burgsFilters"
            data-tip="Apply a filter"
            style={{ paddingBlock: "0.1em", display: "flex", gap: "0.5em", width: "100%" }}
          >
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
              <select
                id="burgsFilterCulture"
                value={filterCultureId}
                onChange={e => setFilterCultureId(+e.target.value)}
              >
                <option value="-1">all</option>
                <option value="0">{worldContext.pack?.cultures?.[0]?.name ?? "Wildlands"}</option>
                {sortedCultures.map(c => (
                  <option key={c.i} value={c.i}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div id="burgsTotal" className="totalLine">
            <div data-tip="Burgs displayed" style={{ marginLeft: 4 }}>
              Burgs:&nbsp;{filteredBurgs.length} of {validCount}
            </div>
            <div data-tip="Average population" style={{ marginLeft: 14 }}>
              Average population:&nbsp;
              {filteredBurgs.length ? si(totalPopulation / filteredBurgs.length) : "0"}
            </div>
          </div>

          <div id="burgsFooter">
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
              onClick={downloadBurgsData}
            />
            <button type="button" data-tip="Rename burgs in bulk" className="icon-upload" onClick={renameBurgsInBulk} />
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
              style={{ display: "none" }}
              onChange={e => {
                if (e.target.files?.[0])
                  uploadFile(e.target as HTMLInputElement, data => importBurgNames(data, refresh));
              }}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
