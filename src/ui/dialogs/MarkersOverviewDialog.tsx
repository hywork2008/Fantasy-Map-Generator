import type React from "react";
import { useMemo, useRef } from "react";
import { worldContext } from "../../context/worldContext";
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
import { editMarker } from "../../editors/markers-editor";
import { Markers } from "../../modules/markers-generator";
import { useDialogState } from "../../store/dialogState";
import { useMarkersOverviewState } from "../../store/markersOverviewState";
import { showElementLockTip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

export const MarkersOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("markersOverview"));
  const {
    searchText,
    addedMarkerType,
    addedMarkerIcon,
    typeMenuOpen,
    refreshCounter,
    setSearchText,
    setAddedMarkerType,
    setTypeMenuOpen,
    refresh
  } = useMarkersOverviewState();
  const menuRef = useRef<HTMLDivElement>(null);

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
    // Set the selected marker type before triggering add mode
    const input = document.getElementById("addedMarkerType") as HTMLInputElement | null;
    if (input) input.value = addedMarkerType;

    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "addMarker" } }));
  }

  return (
    <Dialog isOpen={isOpen} title="Markers Overview" onClose={() => closeDialog("markersOverview")}>
      <div id="markersOverviewContainer">
        <div>
          <div id="markersHeader" className="header" style={{ gridTemplateColumns: "15em 1em 3em" }}>
            <div data-tip="Click to sort by marker type" className="sortable alphabetically" data-sortby="type">
              Type&nbsp;
            </div>
            <div
              style={{ color: "#6e5e66" }}
              data-tip="Click to invert pin state for all markers"
              className="icon-pin pointer"
              onClick={handleInvertPin}
            />
            <div
              style={{ color: "#6e5e66" }}
              data-tip="Click to invert lock state for all markers"
              className="icon-lock pointer"
              onClick={handleInvertLock}
            />
          </div>

          <div id="markersBody" className="table">
            {filteredMarkers.map(({ i, type, icon, pinned, lock }) => (
              <div key={i} className="states" data-i={i} data-type={type}>
                {icon.startsWith("http") || icon.startsWith("data:image") ? (
                  <img
                    src={icon}
                    data-tip="Marker icon"
                    style={{ width: "1.2em", height: "1.2em", verticalAlign: "middle" }}
                    alt="marker icon"
                  />
                ) : (
                  <span data-tip="Marker icon" style={{ width: "1.2em" }}>
                    {icon}
                  </span>
                )}
                <div data-tip="Marker type" style={{ width: "10em" }}>
                  {type}
                </div>
                <span
                  style={{ paddingRight: ".1em" }}
                  data-tip="Edit marker"
                  className="icon-pencil pointer"
                  onClick={() => {
                    markerZoomTo(i);
                    editMarker(i);
                  }}
                />
                <span
                  style={{ paddingRight: ".1em" }}
                  data-tip="Locate the marker"
                  className="icon-target pointer"
                  onClick={() => markerHighlightById(i)}
                />
                <span
                  style={{ paddingRight: ".1em" }}
                  data-tip="Pin marker (display only pinned markers)"
                  className={`icon-pin pointer${pinned ? "" : " inactive"}`}
                  onClick={() => handlePinClick(i)}
                />
                <span
                  style={{ paddingRight: ".1em" }}
                  className={`locks pointer${lock ? " icon-lock" : " icon-lock-open inactive"}`}
                  onMouseOver={e => showElementLockTip(e.nativeEvent)}
                  onClick={() => handleLockClick(i)}
                />
                <span data-tip="Remove marker" className="icon-trash-empty pointer" onClick={() => handleRemove(i)} />
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="markersSearch" data-tip="Filter by type">
              Search:{" "}
              <input
                id="markersSearch"
                type="search"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </label>
          </div>

          <div id="markersTotal" className="totalLine">
            <div data-tip="Markers number">
              Markers: {filteredMarkers.length} of {worldContext.pack?.markers?.length ?? 0}
            </div>
          </div>

          <div id="markersFooter">
            <button type="button" data-tip="Refresh the Overview screen" className="icon-cw" onClick={refresh} />
            <input type="hidden" id="addedMarkerType" name="addedMarkerType" defaultValue={addedMarkerType} />
            <span id="markerTypeSelectorWrapper" style={{ position: "relative", display: "inline-block" }}>
              <button
                type="button"
                data-tip="Select marker type for newly added markers."
                onClick={() => setTypeMenuOpen(!typeMenuOpen)}
              >
                {addedMarkerIcon}
              </button>
              {typeMenuOpen && (
                <div
                  ref={menuRef}
                  id="markerTypeSelectMenu"
                  className="visible"
                  style={{
                    position: "absolute",
                    zIndex: 10,
                    background: "#fff",
                    border: "1px solid #ccc",
                    padding: "4px"
                  }}
                >
                  {markerTypes.map(({ icon, type }) => (
                    <button
                      key={type}
                      type="button"
                      style={{ display: "block", width: "100%", textAlign: "left" }}
                      onClick={() => setAddedMarkerType(type, icon)}
                    >
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
      </div>
    </Dialog>
  );
};
