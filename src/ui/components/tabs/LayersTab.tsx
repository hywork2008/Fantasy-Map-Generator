import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setRenderMode } from "../../../actions";
import { handleLayersPresetChange, removePreset, savePreset, toggleLayerById } from "../../../controllers/layers";
import { changeViewMode } from "../../../controllers/viewMode";
import { useGenerationProgressState } from "../../../store/generationProgressState";
import { DEFAULT_LAYERS, type LayerConfig, useLayerState } from "../../../store/layerState";
import { useViewModeState } from "../../../store/viewModeState";

export const LayersTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { layers, setLayers, activeLayers, presets, presetLabels, activePreset, presetDisabled, reorderLayers } =
    useLayerState();
  const { activeViewMode } = useViewModeState();
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
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

  const [isWebglRendering, setIsWebglRendering] = useState(
    () => localStorage.getItem("fmg-render-mode") === "webglHybrid"
  );

  useEffect(() => {
    const syncRenderMode = (event: Event) => {
      const mode = (event as CustomEvent<"svg" | "webglHybrid">).detail;
      if (mode === "svg" || mode === "webglHybrid") setIsWebglRendering(mode === "webglHybrid");
    };
    document.addEventListener("fmg:render-mode-changed", syncRenderMode);
    return () => document.removeEventListener("fmg:render-mode-changed", syncRenderMode);
  }, []);

  const isCustom = activePreset === "custom";

  return (
    <div id="layersContent" className="tabcontent d-block">
      <div className="renderer-mode-control" data-tip={t("layersTab.webglRenderingTip")}>
        <span id="webglRenderingLabel" className="renderer-mode-label">
          {t("layersTab.webglRendering")}
        </span>
        <label
          className="renderer-mode-switch"
          title={isWebglRendering ? t("layersTab.useSvg") : t("layersTab.useWebgl")}
        >
          <input
            id="webglRenderingToggle"
            type="checkbox"
            role="switch"
            aria-labelledby="webglRenderingLabel"
            aria-checked={isWebglRendering}
            checked={isWebglRendering}
            disabled={isMapGenerationInProgress}
            onChange={event => {
              const enabled = event.target.checked;
              setIsWebglRendering(enabled);
              setRenderMode(enabled ? "webglHybrid" : "svg");
            }}
          />
          <span className="renderer-mode-switch-track" aria-hidden="true" />
          <span className="renderer-mode-switch-thumb" aria-hidden="true" />
        </label>
        <output className="renderer-mode-status" aria-live="polite">
          {isWebglRendering ? t("common.on") : t("common.off")}
        </output>
      </div>

      <p data-tip={t("layersTab.presetTip")} className="d-inline-block">
        {t("layersTab.preset")}
      </p>
      <select
        data-tip={t("layersTab.presetTip")}
        id="layersPreset"
        value={activePreset}
        disabled={presetDisabled || isMapGenerationInProgress}
        onChange={handlePresetChange}
      >
        {Object.keys(presets).map(preset => (
          <option key={preset} value={preset} hidden={preset === "custom"}>
            {t(`layersTab.presets.${preset}`, { defaultValue: presetLabels[preset] ?? preset })}
          </option>
        ))}
        {/* If custom is active but not in presets, we still show it because it's the current value */}
        {isCustom && !presets.custom && (
          <option hidden value="custom">
            {t("layersTab.presets.custom", { defaultValue: presetLabels.custom })}
          </option>
        )}
      </select>

      <button
        id="savePresetButton"
        data-tip={t("layersTab.savePresetTip")}
        className="icon-plus sideButton"
        style={{ display: isCustom ? "inline-block" : "none" }}
        onClick={() => savePreset()}
        disabled={isMapGenerationInProgress}
        type="button"
      ></button>
      <button
        id="removePresetButton"
        data-tip={t("layersTab.removePresetTip")}
        className="icon-minus sideButton"
        style={{ display: isCustom ? "none" : "inline-block" }}
        onClick={() => removePreset()}
        disabled={isMapGenerationInProgress}
        type="button"
      ></button>

      <p>{t("layersTab.displayedLayers")}</p>
      <div data-tip={t("layersTab.layersListTip")} id="mapLayers">
        {layers.map((layer, index) => {
          const isOn = activeLayers[layer.id];
          return (
            <button
              key={layer.id}
              id={layer.id}
              type="button"
              data-tip={
                i18n.exists(`layersTab.tooltips.${layer.id}`) ? t(`layersTab.tooltips.${layer.id}`) : layer.tooltip
              }
              data-shortcut={layer.shortcut}
              className={`${isOn ? "" : "buttonoff"} ${layer.isSolid ? "solid" : ""}`}
              disabled={isMapGenerationInProgress}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onClick={e => handleToggle(e, layer)}
            >
              {i18n.exists(`layersTab.names.${layer.id}`) ? t(`layersTab.names.${layer.id}`) : layer.name}
            </button>
          );
        })}
      </div>
      <div className="tip">{t("layersTab.toggleTip")}</div>
      <div className="tip">{t("layersTab.styleTip")}</div>

      <div id="viewMode" data-tip={t("layersTab.viewModeTip")}>
        <p>{t("layersTab.viewMode")}</p>
        <button
          data-tip={t("layersTab.standardTip")}
          id="viewStandard"
          className={activeViewMode === "viewStandard" ? "pressed" : ""}
          onClick={handleViewMode}
          disabled={isMapGenerationInProgress}
          type="button"
        >
          {t("layersTab.standard")}
        </button>
        <button
          data-tip={t("layersTab.scene3dTip")}
          id="viewMesh"
          className={activeViewMode === "viewMesh" ? "pressed" : ""}
          onClick={handleViewMode}
          disabled={isMapGenerationInProgress}
          type="button"
        >
          {t("layersTab.scene3d")}
        </button>
        <button
          data-tip={t("layersTab.globeTip")}
          id="viewGlobe"
          className={activeViewMode === "viewGlobe" ? "pressed" : ""}
          onClick={handleViewMode}
          disabled={isMapGenerationInProgress}
          type="button"
        >
          {t("layersTab.globe")}
        </button>
      </div>
    </div>
  );
};
