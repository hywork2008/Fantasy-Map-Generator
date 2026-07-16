import type React from "react";
import { useEffect, useState } from "react";
import { useDebugSnapshotState } from "../../../store/debugSnapshotState";
import { useDialogState } from "../../../store/dialogState";
import { useExtensionState } from "../../../store/extensionState";
import { useHeightmapEditModeState } from "../../../store/heightmapDialogState";
import { useTimeSimulationState } from "../../../store/timeSimulationState";

interface StaticEditButton {
  key: string;
  domId?: string;
  label: string;
  tooltip: string;
  eventName: string;
  dialogId?: string;
}

const STATIC_EDIT_BUTTONS: StaticEditButton[] = [
  {
    key: "biomes",
    label: "Biomes",
    tooltip: "Click to open Biomes Editor",
    eventName: "editBiomesButton",
    dialogId: "biomesEditor"
  },
  {
    key: "burgs",
    label: "Burgs",
    tooltip: "Click to open Burgs Overview",
    eventName: "overviewBurgsButton",
    dialogId: "burgsOverview"
  },
  {
    key: "coastlines",
    label: "Coastlines",
    tooltip: "Click to open Coastline Settings Editor",
    eventName: "editCoastlineSettings",
    dialogId: "coastlineSettingsDialog"
  },
  {
    key: "cultures",
    label: "Cultures",
    tooltip: "Click to open Cultures Editor",
    eventName: "editCulturesButton",
    dialogId: "culturesEditor"
  },
  {
    key: "diplomacy",
    label: "Diplomacy",
    tooltip: "Click to open Diplomatical relationships Editor",
    eventName: "editDiplomacyButton",
    dialogId: "diplomacyEditor"
  },
  {
    key: "diplomacyHistory",
    label: "Relations history",
    tooltip: "Click to open Relations history",
    eventName: "openDiplomacyHistory",
    dialogId: "diplomacyHistory"
  },
  {
    key: "emblems",
    label: "Emblems",
    tooltip: "Click to open Emblem Editor",
    eventName: "editEmblemButton",
    dialogId: "emblemEditor"
  },
  {
    key: "editHeightmapButton",
    domId: "editHeightmapButton",
    label: "Heightmap",
    tooltip: "Click to open Heightmap customization menu",
    eventName: "editHeightmapButton"
  },
  {
    key: "markers",
    label: "Markers",
    tooltip: "Click to open Markers Overview",
    eventName: "overviewMarkersButton",
    dialogId: "markersOverview"
  },
  {
    key: "military",
    label: "Military",
    tooltip: "Click to open Military Forces Overview",
    eventName: "overviewMilitaryButton",
    dialogId: "militaryOverview"
  },
  {
    key: "namesbase",
    label: "Namesbase",
    tooltip: "Click to open Namesbase Editor",
    eventName: "editNamesBaseButton",
    dialogId: "namesbaseEditor"
  },
  {
    key: "notes",
    label: "Notes",
    tooltip: "Click to open Notes Editor",
    eventName: "editNotesButton",
    dialogId: "notesEditor"
  },
  {
    key: "population",
    label: "Population",
    tooltip: "Open Population Overview — living counts and death tallies by state (for rulers and design review)",
    eventName: "overviewPopulationButton",
    dialogId: "populationOverview"
  },
  {
    key: "provinces",
    label: "Provinces",
    tooltip: "Click to open Provinces Editor",
    eventName: "editProvincesButton",
    dialogId: "provincesEditor"
  },
  {
    key: "religions",
    label: "Religions",
    tooltip: "Click to open Religions Editor",
    eventName: "editReligions",
    dialogId: "religionsEditor"
  },
  {
    key: "rivers",
    label: "Rivers",
    tooltip: "Click to open Rivers Overview",
    eventName: "overviewRiversButton",
    dialogId: "riversOverview"
  },
  {
    key: "regiments",
    label: "Regiments",
    tooltip: "Click to open Regiments Overview",
    eventName: "overviewRegimentsButton",
    dialogId: "regimentsOverview"
  },
  {
    key: "routes",
    label: "Routes",
    tooltip: "Click to open Routes Overview",
    eventName: "overviewRoutesButton",
    dialogId: "routesOverview"
  },
  {
    key: "editStatesButton",
    domId: "editStatesButton",
    label: "States",
    tooltip: "Click to open States Editor",
    eventName: "editStatesButton",
    dialogId: "statesEditor"
  },
  {
    key: "units",
    label: "Units",
    tooltip: "Click to open Units Editor",
    eventName: "editUnitsButton",
    dialogId: "unitsEditor"
  },
  {
    key: "zones",
    label: "Zones",
    tooltip: "Click to open Zones Editor",
    eventName: "editZonesButton",
    dialogId: "zonesEditor"
  }
];

export const ToolsTab: React.FC = () => {
  const { actions: allActions, enabledExtensions } = useExtensionState();
  const openDialogs = useDialogState(state => state.openDialogs);
  const { isRunning, progress, totalDays, stopSimulation } = useTimeSimulationState();
  const isHeightmapModeOpen = useHeightmapEditModeState(state => state.isOpen);
  const actions = allActions.filter(a => a.tab === "tools" && enabledExtensions[a.extensionId]);
  const editActions = actions.filter(a => a.section === "edit");
  const regenerateActions = actions.filter(a => a.section === "regenerate");

  const [simulationClock, setSimulationClock] = useState(() => ({
    currentYear: window.fmg.simulation.currentYear,
    currentMonth: window.fmg.simulation.currentMonth,
    currentDay: window.fmg.simulation.currentDay,
    era: window.fmg.simulation.era
  }));
  const [advanceYears, setAdvanceYears] = useState(1);
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [advanceDays, setAdvanceDays] = useState(1);

  useEffect(() => {
    const onSimulationUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        currentYear: number;
        currentMonth: number;
        currentDay: number;
        era: string;
      };
      setSimulationClock(detail);
    };
    document.addEventListener("fmg:simulation-updated", onSimulationUpdated);
    return () => document.removeEventListener("fmg:simulation-updated", onSimulationUpdated);
  }, []);

  const triggerEvent = (eventName: string) => {
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: eventName } }));
  };

  const allEditButtons = [
    ...STATIC_EDIT_BUTTONS.map(b => ({
      key: b.key,
      domId: b.domId,
      label: b.label,
      tooltip: b.tooltip,
      dialogId: b.dialogId,
      onClick: () => triggerEvent(b.eventName)
    })),
    ...editActions.map(a => ({
      key: a.id,
      domId: undefined as string | undefined,
      label: a.label,
      tooltip: a.tooltip ?? "",
      dialogId: a.dialogId,
      onClick: a.onClick
    }))
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div id="toolsContent" className="tabcontent d-block">
      <div className="separator">Edit</div>
      <div className="grid">
        {allEditButtons.map(btn => (
          <button
            key={btn.key}
            id={btn.domId}
            data-tip={btn.tooltip}
            type="button"
            className={
              btn.key === "editHeightmapButton"
                ? openDialogs.has("brushesPanel") || isHeightmapModeOpen
                  ? "pressed"
                  : undefined
                : btn.dialogId && openDialogs.has(btn.dialogId)
                  ? "pressed"
                  : undefined
            }
            onClick={btn.onClick}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="separator">Regenerate</div>
      <div className="grid" id="regenerateFeature">
        <button
          data-tip="Click to regenerate all unlocked burgs and routes"
          type="button"
          onClick={() => triggerEvent("regenerateBurgs")}
        >
          Burgs
        </button>
        <button
          data-tip="Click to regenerate non-locked cultures"
          type="button"
          onClick={() => triggerEvent("regenerateCultures")}
        >
          Cultures
        </button>

        <button
          data-tip="Click to regenerate all emblems"
          type="button"
          onClick={() => triggerEvent("regenerateEmblems")}
        >
          Emblems
        </button>

        <button
          data-tip="Click to regenerate icebergs and glaciers"
          type="button"
          onClick={() => triggerEvent("regenerateIce")}
        >
          Ice
        </button>
        <button
          data-tip="Click to regenerate unlocked markers"
          type="button"
          onClick={() => triggerEvent("regenerateMarkers")}
        >
          Markers{" "}
          <i
            className="icon-cog"
            data-tip="Click to set number multiplier"
            onClick={e => {
              e.stopPropagation();
              triggerEvent("configRegenerateMarkers");
            }}
          />
        </button>
        {regenerateActions.map(action => (
          <button key={action.id} data-tip={action.tooltip} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}

        <button
          id="regenerateMilitary"
          data-tip="Click to recalculate military forces"
          type="button"
          onClick={() => triggerEvent("regenerateMilitary")}
        >
          Military
        </button>
        <button
          data-tip="Click to recalculate rural and urban population"
          type="button"
          onClick={() => triggerEvent("regeneratePopulation")}
        >
          Population
        </button>

        <button
          data-tip="Click to regenerate non-locked provinces"
          type="button"
          onClick={() => triggerEvent("regenerateProvinces")}
        >
          Provinces
        </button>
        <button
          data-tip="Click to regenerate all relief icons"
          type="button"
          onClick={() => triggerEvent("regenerateReliefIcons")}
        >
          Relief Icons{" "}
          <i
            className="icon-cog"
            data-tip="Click to open relief icons settings"
            onClick={e => {
              e.stopPropagation();
              triggerEvent("configRegenerateRelief");
            }}
          />
        </button>
        <button
          data-tip="Click to regenerate religions"
          type="button"
          onClick={() => triggerEvent("regenerateReligions")}
        >
          Religions
        </button>
        <button data-tip="Click to regenerate rivers" type="button" onClick={() => triggerEvent("regenerateRivers")}>
          Rivers
        </button>
        <button data-tip="Click to regenerate routes" type="button" onClick={() => triggerEvent("regenerateRoutes")}>
          Routes
        </button>
        <button
          data-tip="Click to update state labels placement"
          type="button"
          onClick={() => triggerEvent("regenerateStateLabels")}
        >
          State Labels
        </button>
        <button
          data-tip="Click to regenerate non-locked states"
          type="button"
          onClick={() => triggerEvent("regenerateStates")}
        >
          States
        </button>
        <button data-tip="Click to regenerate zones" type="button" onClick={() => triggerEvent("regenerateZones")}>
          Zones
        </button>
      </div>
      <div className="separator">Add</div>
      <div className="grid" id="addFeature">
        <button
          id="addBurgTool"
          data-tip="Click on map to place a burg. Hold Shift to add multiple"
          type="button"
          onClick={() => triggerEvent("addBurgTool")}
        >
          Burg
        </button>
        <button
          id="addLabel"
          data-tip="Click on map to place label. Hold Shift to add multiple"
          type="button"
          onClick={() => triggerEvent("addLabel")}
        >
          Label
        </button>
        <button
          id="addMarker"
          data-tip="Click on map to place a marker. Hold Shift to add multiple"
          type="button"
          onClick={() => triggerEvent("addMarker")}
        >
          Marker
        </button>
        <button
          id="addRiver"
          data-tip="Click on map to place a river. Hold Shift to add multiple"
          type="button"
          onClick={() => triggerEvent("addRiver")}
        >
          River
        </button>
        <button
          id="addRoute"
          data-tip="Open route creation dialog"
          type="button"
          onClick={() => triggerEvent("addRoute")}
        >
          Route
        </button>
      </div>
      <div className="separator">Show</div>
      <div className="grid">
        <button
          data-tip="Click to open Cell details view"
          type="button"
          className={openDialogs.has("cellInfo") ? "pressed" : undefined}
          onClick={() => triggerEvent("overviewCellsButton")}
        >
          Cells
        </button>
        <button
          data-tip="Click to open Charts to overview cells data"
          type="button"
          className={openDialogs.has("chartsOverview") ? "pressed" : undefined}
          onClick={() => triggerEvent("overviewChartsButton")}
        >
          Charts
        </button>
        <button
          data-tip="Click to open minimap overview. Click minimap to center view"
          type="button"
          className={openDialogs.has("minimap") ? "pressed" : undefined}
          onClick={() => triggerEvent("openMinimapButton")}
        >
          Minimap
        </button>
        <button
          data-tip="Click to open World Configurator (temperature, precipitation, etc.)"
          type="button"
          className={openDialogs.has("worldConfigurator") ? "pressed" : undefined}
          onClick={() => triggerEvent("openWorldConfigurator")}
        >
          World
        </button>
        {import.meta.env.DEV && (
          <button
            data-tip="Open the AI Debug Snapshot manager to export generation history"
            type="button"
            onClick={() => useDebugSnapshotState.getState().setIsOpen(true)}
            style={{ marginTop: "4px" }}
          >
            Snapshots
          </button>
        )}
      </div>
      <div className="separator">Simulation</div>
      <div className="grid">
        <span data-tip="Current in-world year, month, day, and era">
          {simulationClock.currentYear} / {simulationClock.currentMonth} / {simulationClock.currentDay}{" "}
          {simulationClock.era}
        </span>
        <div>Advance Time</div>
        <div style={{ display: "flex", gap: "5px", flexDirection: "column" }}>
          {isRunning ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "5px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Simulating...</span>
                <span>{Math.floor((progress / totalDays) * 100)}%</span>
              </div>
              <progress value={progress} max={totalDays} style={{ width: "100%" }} />
              <button
                type="button"
                onClick={stopSimulation}
                style={{ marginTop: "5px", background: "indianred", color: "white", flex: 1 }}
              >
                Stop
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={advanceYears}
                  onChange={e => setAdvanceYears(Number(e.target.value))}
                  data-tip="Years to advance"
                />
                <button
                  data-tip="Click to advance the world's simulation clock by a number of years"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => {
                    document.dispatchEvent(
                      new CustomEvent("react-tool-action", {
                        detail: { action: "advanceTimeButton", years: advanceYears, months: 0, days: 0 }
                      })
                    );
                  }}
                >
                  Advance Year
                </button>
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={advanceMonths}
                  onChange={e => setAdvanceMonths(Number(e.target.value))}
                  data-tip="Months to advance"
                />
                <button
                  data-tip="Click to advance the world's simulation clock by a number of months"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => {
                    document.dispatchEvent(
                      new CustomEvent("react-tool-action", {
                        detail: { action: "advanceTimeButton", years: 0, months: advanceMonths, days: 0 }
                      })
                    );
                  }}
                >
                  Advance Month
                </button>
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={advanceDays}
                  onChange={e => setAdvanceDays(Number(e.target.value))}
                  data-tip="Days to advance"
                />
                <button
                  data-tip="Click to advance the world's simulation clock by a number of days"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => {
                    document.dispatchEvent(
                      new CustomEvent("react-tool-action", {
                        detail: { action: "advanceTimeButton", years: 0, months: 0, days: advanceDays }
                      })
                    );
                  }}
                >
                  Advance Day
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="separator">Create</div>
      <div className="grid">
        <button
          data-tip="Click to generate a submap from the current viewport"
          type="button"
          className={openDialogs.has("submapTool") ? "pressed" : undefined}
          onClick={() => triggerEvent("openSubmapTool")}
        >
          Submap
        </button>
        <button
          data-tip="Click to transform the map"
          type="button"
          className={openDialogs.has("transformTool") ? "pressed" : undefined}
          onClick={() => triggerEvent("openTransformTool")}
        >
          Transform
        </button>
      </div>
    </div>
  );
};
