import type React from "react";

export const ToolsTab: React.FC = () => {
  const triggerEvent = (eventName: string) => {
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: eventName } }));
  };

  return (
    <div id="toolsContent" className="tabcontent" style={{ display: "block" }}>
      <div className="separator">Edit</div>
      <div className="grid">
        <button data-tip="Click to open Biomes Editor" type="button" onClick={() => triggerEvent("editBiomesButton")}>
          Biomes
        </button>
        <button
          data-tip="Click to open Burgs Overview"
          type="button"
          onClick={() => triggerEvent("overviewBurgsButton")}
        >
          Burgs
        </button>
        <button
          data-tip="Click to open Coastline Settings Editor"
          type="button"
          onClick={() => triggerEvent("editCoastlineSettings")}
        >
          Coastlines
        </button>
        <button
          data-tip="Click to open Cultures Editor"
          type="button"
          onClick={() => triggerEvent("editCulturesButton")}
        >
          Cultures
        </button>
        <button
          data-tip="Click to open Diplomatical relationships Editor"
          type="button"
          onClick={() => triggerEvent("editDiplomacyButton")}
        >
          Diplomacy
        </button>
        <button data-tip="Click to open Emblem Editor" type="button" onClick={() => triggerEvent("editEmblemButton")}>
          Emblems
        </button>
        <button
          data-tip="Click to open Heightmap customization menu"
          type="button"
          onClick={() => triggerEvent("editHeightmapButton")}
        >
          Heightmap
        </button>
        <button
          data-tip="Click to open Markers Overview"
          type="button"
          onClick={() => triggerEvent("overviewMarkersButton")}
        >
          Markers
        </button>
        <button
          data-tip="Click to open Military Forces Overview"
          type="button"
          onClick={() => triggerEvent("overviewMilitaryButton")}
        >
          Military
        </button>
        <button
          data-tip="Click to open Namesbase Editor"
          type="button"
          onClick={() => triggerEvent("editNamesBaseButton")}
        >
          Namesbase
        </button>
        <button data-tip="Click to open Notes Editor" type="button" onClick={() => triggerEvent("editNotesButton")}>
          Notes
        </button>
        <button
          data-tip="Click to open Provinces Editor"
          type="button"
          onClick={() => triggerEvent("editProvincesButton")}
        >
          Provinces
        </button>
        <button data-tip="Click to open Religions Editor" type="button" onClick={() => triggerEvent("editReligions")}>
          Religions
        </button>
        <button
          data-tip="Click to open Rivers Overview"
          type="button"
          onClick={() => triggerEvent("overviewRiversButton")}
        >
          Rivers
        </button>
        <button
          data-tip="Click to open Routes Overview"
          type="button"
          onClick={() => triggerEvent("overviewRoutesButton")}
        >
          Routes
        </button>
        <button data-tip="Click to open States Editor" type="button" onClick={() => triggerEvent("editStatesButton")}>
          States
        </button>
        <button data-tip="Click to open Units Editor" type="button" onClick={() => triggerEvent("editUnitsButton")}>
          Units
        </button>
        <button data-tip="Click to open Zones Editor" type="button" onClick={() => triggerEvent("editZonesButton")}>
          Zones
        </button>
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
          data-tip="Click to update state labels placement"
          type="button"
          onClick={() => triggerEvent("regenerateStateLabels")}
        >
          State Labels
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
        <button
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
          Relief Icons
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
          onClick={() => triggerEvent("overviewCellsButton")}
        >
          Cells
        </button>
        <button
          data-tip="Click to open Charts to overview cells data"
          type="button"
          onClick={() => triggerEvent("overviewChartsButton")}
        >
          Charts
        </button>
        <button
          data-tip="Click to open minimap overview. Click minimap to center view"
          type="button"
          onClick={() => triggerEvent("openMinimapButton")}
        >
          Minimap
        </button>
        <button
          data-tip="Click to open World Configurator (temperature, precipitation, etc.)"
          type="button"
          onClick={() => triggerEvent("openWorldConfigurator")}
        >
          World
        </button>
      </div>

      <div className="separator">Create</div>
      <div className="grid">
        <button
          data-tip="Click to generate a submap from the current viewport"
          type="button"
          onClick={() => triggerEvent("openSubmapTool")}
        >
          Submap
        </button>
        <button data-tip="Click to transform the map" type="button" onClick={() => triggerEvent("openTransformTool")}>
          Transform
        </button>
      </div>
    </div>
  );
};
