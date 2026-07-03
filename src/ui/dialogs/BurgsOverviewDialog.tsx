import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { zoomIntoBurg } from "../../actions";
import { worldContext } from "../../context/worldContext";
import { editBurg } from "../../controllers/burg-editor";
import { editBurgGroups } from "../../controllers/burg-group-editor";
import { burgHighlightOff, burgHighlightOn } from "../../controllers/burg-highlight";
import {
  downloadBurgsData,
  importBurgNames,
  regenerateBurgNames,
  renameBurgsInBulk,
  showBurgsChart,
  startAddBurgMode,
  stopAddBurgMode
} from "../../controllers/burgs-overview";
import { uploadFile } from "../../controllers/editors";
import { Burgs } from "../../generators/burgs-generator";
import { showElementLockTip, tip } from "../../services/tooltipService";
import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { useDialogState } from "../../store/dialogState";
import { si } from "../../utils";
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
    if (filterProvinceId !== -1) {
      filtered = filtered.filter(b => {
        const prov = worldContext.pack.cells.province![b.cell];
        return prov === filterProvinceId;
      });
    }
    if (filterGroup !== "") filtered = filtered.filter(b => b.group === filterGroup);

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
  }, [refreshCounter, searchText, filterStateId, filterCultureId, filterProvinceId, filterGroup, sortBy, sortOrder]);

  const allLocked = useMemo(() => {
    void refreshCounter;
    const active = (worldContext.pack?.burgs ?? []).filter(b => b.i && !b.removed);
    return active.length > 0 && active.every(b => b.lock);
  }, [refreshCounter]);

  function SortHeader({
    field,
    label,
    numeric,
    width
  }: {
    field: string;
    label: string;
    numeric?: boolean;
    width?: string;
  }) {
    return (
      <th
        data-tip={`Click to sort by ${label.toLowerCase()}`}
        className={`sortable ${numeric ? "icon-sort-number-down" : "alphabetically"}`}
        data-sortby={field}
        onClick={() => toggleSortBy(field)}
        style={{ width, minWidth: width }}
      >
        {label}
      </th>
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

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredBurgs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <Dialog
      isOpen={isOpen}
      title="Burgs Overview"
      onClose={() => closeDialog("burgsOverview")}
      className="fmg-dialog--overflow-hidden"
    >
      <div id="burgsOverviewContainer">
        <div id="burgsBody" className="table" ref={parentRef} style={{ overflow: "auto" }}>
          <table className="fmg-table">
            <thead style={{ zIndex: 3 }}>
              <tr id="burgsHeader">
                <SortHeader field="name" label="Burg" width="14em" />
                <SortHeader field="province" label="Province" width="7em" />
                <SortHeader field="state" label="State" width="7.5em" />
                <SortHeader field="culture" label="Culture" width="7.2em" />
                <SortHeader field="group" label="Group" width="6.5em" />
                <SortHeader field="population" label="Population" numeric width="7em" />
                <SortHeader field="features" label="Feat." width="3.5em" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredBurgs.length === 0 ? (
                <tr>
                  <td colSpan={8}>No burgs found</td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td colSpan={8} style={{ height: `${paddingTop}px` }} />
                    </tr>
                  )}
                  {virtualItems.map(virtualRow => {
                    const { b, population, province, stateName, cultureName } = filteredBurgs[virtualRow.index];
                    return (
                      <tr
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
                        <td>
                          <span
                            data-tip="Click to zoom into view"
                            className="icon-dot-circled pointer"
                            onClick={() => zoomIntoBurg(b.i!)}
                          />
                          <input data-tip="Burg name" className="burgName" value={b.name ?? ""} disabled readOnly />
                        </td>
                        <td>
                          <input data-tip="Burg province" value={province} disabled readOnly />
                        </td>
                        <td>
                          <input data-tip="Burg state" value={stateName} disabled readOnly />
                        </td>
                        <td>
                          <input data-tip="Dominant culture" value={cultureName} disabled readOnly />
                        </td>
                        <td>
                          <input data-tip="Burg group" value={b.group ?? ""} disabled readOnly />
                        </td>
                        <td>
                          <span data-tip="Burg population" className="icon-male" />
                          <input data-tip="Burg population" value={si(population)} disabled readOnly />
                        </td>
                        <td>
                          <div style={{ display: "inline-block" }}>
                            <span
                              data-tip={b.capital ? "This burg is a state capital" : "This burg is NOT a state capital"}
                              className={`icon-star-empty${b.capital ? "" : " inactive"}`}
                            />
                            <span
                              data-tip={b.port ? "This burg is a port" : "This burg is NOT a port"}
                              className={`icon-anchor${b.port ? "" : " inactive"}`}
                            />
                          </div>
                        </td>
                        <td>
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
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td colSpan={8} style={{ height: `${paddingBottom}px` }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

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
            Burgs:&nbsp;{filteredBurgs.length} of {validCount}
          </div>
          <div data-tip="Average population">
            Average population:&nbsp;
            {filteredBurgs.length ? si(totalPopulation / filteredBurgs.length) : "0"}
          </div>
        </div>

        <div id="burgsFooter" className="fmg-dialog-footer">
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
