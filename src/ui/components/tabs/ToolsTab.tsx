import React from "react";

export const ToolsTab: React.FC = () => {

  const triggerEvent = (eventName: string) => {
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: eventName } }));
  };

  return (
    <div id="toolsTabContent" className="tabcontent" style={{ display: "block" }}>
      <div className="separator">Edit</div>
      <div className="grid">
        <button data-tip="Click to open Biomes Editor" onClick={() => triggerEvent("editBiomesButton")}>Biomes</button>
        <button data-tip="Click to open Burgs Overview" onClick={() => triggerEvent("overviewBurgsButton")}>Burgs</button>
        <button data-tip="Click to open Coastline Settings Editor" onClick={() => triggerEvent("editCoastlineSettings")}>Coastlines</button>
        <button data-tip="Click to open Cultures Editor" onClick={() => triggerEvent("editCulturesButton")}>Cultures</button>
        <button data-tip="Click to open Diplomatical relationships Editor" onClick={() => triggerEvent("editDiplomacyButton")}>Diplomacy</button>
        <button data-tip="Click to open Emblem Editor" onClick={() => triggerEvent("editEmblemButton")}>Emblems</button>
        <button data-tip="Click to open Heightmap customization menu" onClick={() => triggerEvent("editHeightmapButton")}>Heightmap</button>
        <button data-tip="Click to open Markers Overview" onClick={() => triggerEvent("overviewMarkersButton")}>Markers</button>
        <button data-tip="Click to open Military Forces Overview" onClick={() => triggerEvent("overviewMilitaryButton")}>Military</button>
        <button data-tip="Click to open Namesbase Editor" onClick={() => triggerEvent("editNamesBaseButton")}>Namesbase</button>
        <button data-tip="Click to open Notes Editor" onClick={() => triggerEvent("editNotesButton")}>Notes</button>
        <button data-tip="Click to open Provinces Editor" onClick={() => triggerEvent("editProvincesButton")}>Provinces</button>
        <button data-tip="Click to open Religions Editor" onClick={() => triggerEvent("editReligions")}>Religions</button>
        <button data-tip="Click to open Rivers Overview" onClick={() => triggerEvent("overviewRiversButton")}>Rivers</button>
        <button data-tip="Click to open Routes Overview" onClick={() => triggerEvent("overviewRoutesButton")}>Routes</button>
        <button data-tip="Click to open States Editor" onClick={() => triggerEvent("editStatesButton")}>States</button>
        <button data-tip="Click to open Units Editor" onClick={() => triggerEvent("editUnitsButton")}>Units</button>
        <button data-tip="Click to open Zones Editor" onClick={() => triggerEvent("editZonesButton")}>Zones</button>
      </div>

      <div className="separator">Regenerate</div>
      <div className="grid" id="regenerateFeature">
        <button data-tip="Click to regenerate all unlocked burgs and routes" onClick={() => triggerEvent("regenerateBurgs")}>Burgs</button>
        <button data-tip="Click to regenerate non-locked cultures" onClick={() => triggerEvent("regenerateCultures")}>Cultures</button>
        <button data-tip="Click to regenerate all emblems" onClick={() => triggerEvent("regenerateEmblems")}>Emblems</button>
        <button data-tip="Click to regenerate icebergs and glaciers" onClick={() => triggerEvent("regenerateIce")}>Ice</button>
        <button data-tip="Click to update state labels placement" onClick={() => triggerEvent("regenerateStateLabels")}>State Labels</button>
        <button data-tip="Click to regenerate unlocked markers" onClick={() => triggerEvent("regenerateMarkers")}>Markers</button>
        <button data-tip="Click to recalculate military forces" onClick={() => triggerEvent("regenerateMilitary")}>Military</button>
        <button data-tip="Click to recalculate rural and urban population" onClick={() => triggerEvent("regeneratePopulation")}>Population</button>
        <button data-tip="Click to regenerate non-locked provinces" onClick={() => triggerEvent("regenerateProvinces")}>Provinces</button>
        <button data-tip="Click to regenerate all relief icons" onClick={() => triggerEvent("regenerateReliefIcons")}>Relief Icons</button>
        <button data-tip="Click to regenerate religions" onClick={() => triggerEvent("regenerateReligions")}>Religions</button>
        <button data-tip="Click to regenerate rivers" onClick={() => triggerEvent("regenerateRivers")}>Rivers</button>
        <button data-tip="Click to regenerate routes" onClick={() => triggerEvent("regenerateRoutes")}>Routes</button>
        <button data-tip="Click to regenerate non-locked states" onClick={() => triggerEvent("regenerateStates")}>States</button>
        <button data-tip="Click to regenerate zones" onClick={() => triggerEvent("regenerateZones")}>Zones</button>
      </div>

      <div className="separator">Click to add</div>
      <div className="grid" id="addFeature">
        <button id="addBurgTool" data-tip="Click to add a new burg" onClick={() => triggerEvent("addBurgTool")}>Burg</button>
        <button id="addLabel" data-tip="Click to add a free text label" onClick={() => triggerEvent("addLabel")}>Label</button>
        <button id="addMarker" data-tip="Click to add a new marker" onClick={() => triggerEvent("addMarker")}>Marker</button>
        <button id="addRiver" data-tip="Click to place a new river or extend an existing" onClick={() => triggerEvent("addRiver")}>River</button>
        <button id="addRoute" data-tip="Click to add a new route" onClick={() => triggerEvent("addRoute")}>Route</button>
      </div>
      
      <div className="separator">Click to configure</div>
      <div className="grid">
        <button data-tip="Click to view charts" onClick={() => triggerEvent("overviewChartsButton")}>Charts</button>
        <button data-tip="Click to configure cell details" onClick={() => triggerEvent("overviewCellsButton")}>Cell Details</button>
        <button data-tip="Click to toggle minimap" onClick={() => triggerEvent("openMinimapButton")}>Minimap</button>
        <button data-tip="Click to configure markers generation" onClick={() => triggerEvent("configRegenerateMarkers")}>Markers Config</button>
        <button data-tip="Click to create a submap from current map" onClick={() => triggerEvent("openSubmapTool")}>Submap</button>
        <button data-tip="Click to transform the map (scale, rotate, translate)" onClick={() => triggerEvent("openTransformTool")}>Transform</button>
        <button data-tip="Click to configure world settings (temperature, precipitation, etc.)" onClick={() => triggerEvent("openWorldConfigurator")}>World</button>
      </div>
    </div>
  );
};
