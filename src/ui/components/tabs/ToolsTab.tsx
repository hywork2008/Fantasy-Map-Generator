import type React from "react";
import { worldContext } from "../../../context/worldContext";
import { useDebugSnapshotState } from "../../../store/debugSnapshotState";
import { useDialogState } from "../../../store/dialogState";
import { useExtensionState } from "../../../store/extensionState";
import { useHeightmapEditModeState } from "../../../store/heightmapDialogState";

interface StaticEditButton {
  key: string;
  domId?: string;
  label: string;
  tooltip: string;
  eventName: string;
  dialogId?: string;
}

interface StaticRegenerateButton {
  key: string;
  domId?: string;
  label: string;
  tooltip: string;
  eventName: string;
  /** Optional gear-icon config control rendered after the label. */
  config?: { tooltip: string; eventName: string };
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

const STATIC_REGENERATE_BUTTONS: StaticRegenerateButton[] = [
  {
    key: "burgs",
    label: "Burgs",
    tooltip: "Click to regenerate all unlocked burgs and routes",
    eventName: "regenerateBurgs"
  },
  {
    key: "cultures",
    label: "Cultures",
    tooltip: "Click to regenerate non-locked cultures",
    eventName: "regenerateCultures"
  },
  {
    key: "emblems",
    label: "Emblems",
    tooltip: "Click to regenerate all emblems",
    eventName: "regenerateEmblems"
  },
  {
    key: "ice",
    label: "Ice",
    tooltip: "Click to regenerate icebergs and glaciers",
    eventName: "regenerateIce"
  },
  {
    key: "markers",
    label: "Markers",
    tooltip: "Click to regenerate unlocked markers",
    eventName: "regenerateMarkers",
    config: { tooltip: "Click to set number multiplier", eventName: "configRegenerateMarkers" }
  },
  {
    key: "military",
    domId: "regenerateMilitary",
    label: "Military",
    tooltip: "Click to recalculate military forces",
    eventName: "regenerateMilitary"
  },
  {
    key: "population",
    label: "Population",
    tooltip: "Click to recalculate rural and urban population",
    eventName: "regeneratePopulation"
  },
  {
    key: "provinces",
    label: "Provinces",
    tooltip: "Click to regenerate non-locked provinces",
    eventName: "regenerateProvinces"
  },
  {
    key: "reliefIcons",
    label: "Relief Icons",
    tooltip: "Click to regenerate all relief icons",
    eventName: "regenerateReliefIcons",
    config: { tooltip: "Click to open relief icons settings", eventName: "configRegenerateRelief" }
  },
  {
    key: "religions",
    label: "Religions",
    tooltip: "Click to regenerate religions",
    eventName: "regenerateReligions"
  },
  {
    key: "rivers",
    label: "Rivers",
    tooltip: "Click to regenerate rivers",
    eventName: "regenerateRivers"
  },
  {
    key: "routes",
    label: "Routes",
    tooltip: "Click to regenerate routes",
    eventName: "regenerateRoutes"
  },
  {
    key: "settlementPattern",
    label: "Settlement Pattern",
    tooltip:
      "Click to re-derive the settled footprint from the current settlement pattern / Oikoumene land share / population options and rebuild burgs, states, provinces, religions and military from it. Replaces all burgs and states — locked ones cannot be preserved.",
    eventName: "regenerateSettlementPattern"
  },
  {
    key: "stateLabels",
    label: "State Labels",
    tooltip: "Click to update state labels placement",
    eventName: "regenerateStateLabels"
  },
  {
    key: "states",
    label: "States",
    tooltip: "Click to regenerate non-locked states",
    eventName: "regenerateStates"
  },
  {
    key: "zones",
    label: "Zones",
    tooltip: "Click to regenerate zones",
    eventName: "regenerateZones"
  }
];

export const ToolsTab: React.FC = () => {
  const { actions: allActions, enabledExtensions } = useExtensionState();
  const openDialogs = useDialogState(state => state.openDialogs);
  const isHeightmapModeOpen = useHeightmapEditModeState(state => state.isOpen);
  const actions = allActions.filter(a => a.tab === "tools" && enabledExtensions[a.extensionId]);
  const editActions = actions.filter(a => a.section === "edit");
  const regenerateActions = actions.filter(a => a.section === "regenerate");
  const isFrontierMap =
    worldContext.options.initialSettlementPattern === "frontier" ||
    worldContext.options.initialSettlementPattern === "marches" ||
    worldContext.options.initialSettlementPattern === "scattered";

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

  const allRegenerateButtons = [
    ...STATIC_REGENERATE_BUTTONS.map(b => ({
      key: b.key,
      domId: b.domId,
      label: b.label,
      tooltip: b.tooltip,
      onClick: () => triggerEvent(b.eventName),
      config: b.config
    })),
    ...regenerateActions.map(a => ({
      key: a.id,
      domId: undefined as string | undefined,
      label: a.label,
      tooltip: a.tooltip ?? "",
      onClick: a.onClick,
      config: undefined as StaticRegenerateButton["config"] | undefined
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
        {allRegenerateButtons.map(btn => {
          const config = btn.config;
          return (
            <button key={btn.key} id={btn.domId} data-tip={btn.tooltip} type="button" onClick={btn.onClick}>
              {btn.label}
              {config ? (
                <>
                  {" "}
                  <i
                    className="icon-cog"
                    data-tip={config.tooltip}
                    onClick={e => {
                      e.stopPropagation();
                      triggerEvent(config.eventName);
                    }}
                  />
                </>
              ) : null}
            </button>
          );
        })}
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
        <button
          data-tip="Click to open the Advance Time dialog and step the world's simulation clock forward by years, months, or days"
          type="button"
          className={openDialogs.has("advanceTime") ? "pressed" : undefined}
          onClick={() => triggerEvent("openAdvanceTimeDialog")}
        >
          Advance Time
        </button>
        {isFrontierMap && (
          <button
            data-tip="Click to open the Frontier operations dialog (outposts, viable candidates, and blocked expansion)"
            type="button"
            className={openDialogs.has("frontierOperations") ? "pressed" : undefined}
            onClick={() => triggerEvent("openFrontierOperationsDialog")}
          >
            Frontier Operations
          </button>
        )}
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
