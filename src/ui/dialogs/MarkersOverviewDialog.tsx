import type React from "react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import { editMarker } from "../../controllers/markers-editor";
import {
  exportMarkers,
  markerHighlightById,
  markerInvertLock,
  markerInvertPin,
  markerToggleLock,
  markerTogglePin,
  markerZoomTo,
  removeAllUnlockedMarkers,
  removeMarkerById
} from "../../controllers/markers-overview";
import { configMarkersGeneration } from "../../controllers/tools";
import { Markers } from "../../generators/markers-generator";
import { showElementLockTip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { useMarkersOverviewState } from "../../store/markersOverviewState";
import { IconButton } from "../components/IconButton";
import { VirtualTableBody } from "../components/VirtualTableBody";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

export const MarkersOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("markersOverview"));
  const {
    searchText,
    addedMarkerIcon,
    typeMenuOpen,
    refreshCounter,
    setSearchText,
    setAddedMarkerType,
    setTypeMenuOpen,
    refresh
  } = useMarkersOverviewState();
  const menuRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const markerTypes = useMemo(() => [{ type: "empty", icon: "❓" }, ...Markers.getConfig()], []);

  const filteredMarkers = useMemo(() => {
    void refreshCounter;
    let markers = worldContext.pack?.markers ?? [];
    if (searchText) {
      const lower = searchText.toLowerCase();
      markers = markers.filter(m => (m.type ?? "").toLowerCase().includes(lower));
    }
    return markers;
  }, [refreshCounter, searchText]);

  function handlePinClick(i: number): void {
    markerTogglePin(i);
    refresh();
  }

  function handleLockClick(i: number): void {
    markerToggleLock(i);
    refresh();
  }

  function handleRemove(i: number): void {
    openConfirm("Are you sure you want to remove this marker? The action cannot be reverted", {
      title: "Remove marker",
      confirm: "Remove",
      onConfirm: () => {
        removeMarkerById(i);
        refresh();
      }
    });
  }

  function handleRemoveAll(): void {
    openConfirm("Are you sure you want to remove all non-locked markers? The action cannot be reverted", {
      title: "Remove all markers",
      confirm: "Remove all",
      onConfirm: () => {
        removeAllUnlockedMarkers();
        refresh();
      }
    });
  }

  function handleInvertPin(): void {
    markerInvertPin();
    refresh();
  }

  function handleInvertLock(): void {
    markerInvertLock();
    refresh();
  }

  function handleAddMarkerMode(): void {
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "addMarker" } }));
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.markersOverview")}
      onClose={() => closeDialog("markersOverview")}
      className="fmg-dialog--table"
    >
      <div id="markersOverviewContainer">
        <div ref={parentRef} id="markersBody" className="table">
          <table className="fmg-table">
            <thead>
              <tr id="markersHeader">
                <th data-tip="Click to sort by marker type" className="sortable alphabetically" data-sortby="type">
                  Type
                </th>
                <th
                  className="icon-pin pointer"
                  data-tip="Click to invert pin state for all markers"
                  onClick={handleInvertPin}
                />
                <th
                  className="icon-lock pointer"
                  data-tip="Click to invert lock state for all markers"
                  onClick={handleInvertLock}
                />
                <th></th>
              </tr>
            </thead>
            <VirtualTableBody
              items={filteredMarkers}
              scrollElementRef={parentRef}
              renderRow={({ i, type, icon, pinned, lock }) => (
                <tr key={i} className="states" data-i={i} data-type={type}>
                  <td className="d-flex">
                    {icon.startsWith("http") || icon.startsWith("data:image") ? (
                      <img src={icon} data-tip="Marker icon" alt="marker icon" />
                    ) : (
                      <span data-tip="Marker icon">{icon}</span>
                    )}
                    <div data-tip="Marker type">{type}</div>
                  </td>
                  <td>
                    <IconButton
                      className={`icon-pin pointer${pinned ? "" : " inactive"}`}
                      data-tip="Pin marker (display only pinned markers)"
                      onClick={() => handlePinClick(i)}
                    />
                  </td>
                  <td>
                    <IconButton
                      className={`locks pointer${lock ? " icon-lock" : " icon-lock-open inactive"}`}
                      onMouseOver={e => showElementLockTip(e.nativeEvent)}
                      onClick={() => handleLockClick(i)}
                    />
                  </td>
                  <td>
                    <IconButton
                      className="icon-target pointer"
                      data-tip="Locate the marker"
                      onClick={() => markerHighlightById(i)}
                    />
                    <IconButton
                      className="icon-pencil pointer"
                      data-tip="Edit marker"
                      onClick={() => {
                        markerZoomTo(i);
                        editMarker(i);
                      }}
                    />
                    <IconButton
                      data-tip="Remove marker"
                      className="icon-trash-empty pointer"
                      onClick={() => handleRemove(i)}
                    />
                  </td>
                </tr>
              )}
            />
          </table>
        </div>

        <div id="markersSearchRow">
          <label htmlFor="markersSearch" data-tip="Filter by type">
            Search:{" "}
            <input id="markersSearch" type="search" value={searchText} onChange={e => setSearchText(e.target.value)} />
          </label>
        </div>

        <div id="markersTotal" className="totalLine">
          <div data-tip="Markers number">
            Markers: {filteredMarkers.length} of {worldContext.pack?.markers?.length ?? 0}
          </div>
        </div>

        <div id="markersFooter" className="footer">
          <button type="button" data-tip="Refresh the Overview screen" className="icon-cw" onClick={refresh} />
          <span id="markerTypeSelectorWrapper" className="d-inline-block">
            <button
              type="button"
              data-tip="Select marker type for newly added markers."
              onClick={() => setTypeMenuOpen(!typeMenuOpen)}
            >
              {addedMarkerIcon}
            </button>
            {typeMenuOpen && (
              <div ref={menuRef} id="markerTypeSelectMenu" className="visible">
                {markerTypes.map(({ icon, type }) => (
                  <button key={type} type="button" className="d-block" onClick={() => setAddedMarkerType(type, icon)}>
                    {icon} {type}
                  </button>
                ))}
              </div>
            )}
          </span>
          <button
            type="button"
            data-tip="Add a new marker. Hold Shift to add multiple"
            className="icon-plus"
            onClick={handleAddMarkerMode}
          />
          <button
            type="button"
            data-tip="Config markers generation options"
            className="icon-cog"
            onClick={configMarkersGeneration}
          />
          <button
            type="button"
            data-tip="Remove all unlocked markers"
            className="icon-trash"
            onClick={handleRemoveAll}
          />
          <button
            type="button"
            data-tip="Save markers data as a text file (.csv)"
            className="icon-download"
            onClick={exportMarkers}
          />
        </div>
      </div>
    </Dialog>
  );
};
