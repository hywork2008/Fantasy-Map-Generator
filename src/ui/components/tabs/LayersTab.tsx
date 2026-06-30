import type React from "react";
import { useEffect, useState } from "react";
import { viewContext } from "../../../context/viewContext";
import { handleLayersPresetChange, removePreset, savePreset, toggleLayerById } from "../../../controllers/layers";
import { changeViewMode } from "../../../controllers/viewMode";
import { DEFAULT_LAYERS, type LayerConfig, useLayerState } from "../../../store/layerState";

export const LayersTab: React.FC = () => {
  const { layers, setLayers, activeLayers, presets, presetLabels, activePreset, presetDisabled, reorderLayers } =
    useLayerState();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Initialize defaults if not set
  useEffect(() => {
    if (layers.length === 0) {
      setLayers(DEFAULT_LAYERS);
    }
  }, [layers, setLayers]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, _index: number) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    reorderLayers(draggedIndex, dropIndex);
    setDraggedIndex(null);
  };

  const handleToggle = (e: React.MouseEvent, layer: LayerConfig) => {
    toggleLayerById(layer.id, e.nativeEvent);
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleLayersPresetChange(e.target.value);
  };

  const handleViewMode = (e: React.MouseEvent) => {
    changeViewMode(e.nativeEvent);
  };

  const isCustom = activePreset === "custom";

  return (
    <div id="layersContent" className="tabcontent" style={{ display: "block" }}>
      <p data-tip="Select a map layers preset" style={{ display: "inline-block", marginRight: "8px" }}>
        Layers preset:
      </p>
      <select
        data-tip="Select a map layers preset"
        id="layersPreset"
        value={activePreset}
        disabled={presetDisabled}
        onChange={handlePresetChange}
        style={{ width: "45%" }}
      >
        {Object.keys(presets).map(preset => (
          <option key={preset} value={preset} hidden={preset === "custom"}>
            {presetLabels[preset] ?? preset}
          </option>
        ))}
        {/* If custom is active but not in presets, we still show it because it's the current value */}
        {isCustom && !presets.custom && (
          <option hidden value="custom">
            {presetLabels.custom ?? "Custom (not saved)"}
          </option>
        )}
      </select>

      <button
        id="savePresetButton"
        data-tip="Click to save displayed layers as a new preset"
        className="icon-plus sideButton"
        style={{ display: isCustom ? "inline-block" : "none" }}
        onClick={() => savePreset()}
        type="button"
      ></button>
      <button
        id="removePresetButton"
        data-tip="Click to remove current custom preset"
        className="icon-minus sideButton"
        style={{ display: isCustom ? "none" : "inline-block" }}
        onClick={() => removePreset()}
        type="button"
      ></button>

      <p>Displayed layers and layers order:</p>
      <ul
        data-tip="Click to toggle a layer, drag to raise or lower a layer. Ctrl + click to edit layer style"
        id="mapLayers"
      >
        {layers.map((layer, index) => {
          const isOn = activeLayers[layer.id];
          return (
            <li
              key={layer.id}
              id={layer.id}
              data-tip={layer.tooltip}
              data-shortcut={layer.shortcut}
              className={`${isOn ? "" : "buttonoff"} ${layer.isSolid ? "solid" : ""}`}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onClick={e => handleToggle(e, layer)}
            >
              {layer.name}
            </li>
          );
        })}
      </ul>
      <div className="tip">Click to toggle, drag to raise or lower the layer</div>
      <div className="tip">Ctrl + click to edit layer style</div>

      <div id="viewMode" data-tip="Set view node">
        <p>View mode:</p>
        <button
          data-tip="Standard view mode that allows to edit the map"
          id="viewStandard"
          className={viewContext.customization !== 1 ? "pressed" : ""}
          onClick={handleViewMode}
          type="button"
        >
          Standard
        </button>
        <button
          data-tip="Map presentation in 3D scene. Works best for heightmap. Cannot be used for editing"
          id="viewMesh"
          onClick={handleViewMode}
          type="button"
        >
          3D scene
        </button>
        <button
          data-tip="Project map on globe. Cannot be used for editing"
          id="viewGlobe"
          onClick={handleViewMode}
          type="button"
        >
          Globe
        </button>
      </div>
    </div>
  );
};
