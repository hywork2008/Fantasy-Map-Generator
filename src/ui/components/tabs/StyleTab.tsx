import { useEffect, useState } from "react";
import {
  addStylePreset,
  applyMapFilterButton,
  initStyleTab,
  requestRemoveStylePreset,
  requestStylePresetChange,
  selectStyleElement
} from "../../../controllers/style";
import { useStyleState } from "../../../store/styleState";

import { EnvironmentStylePanel } from "./style/EnvironmentStylePanel";
import { OverlaysStylePanel } from "./style/OverlaysStylePanel";
import { PoliticalStylePanel } from "./style/PoliticalStylePanel";
import { SettlementsStylePanel } from "./style/SettlementsStylePanel";
import { STYLE_SUB_TAB_FIRST_ELEMENT, type StyleSubTab } from "./style/styleElementGroups";
import { TerrainStylePanel } from "./style/TerrainStylePanel";

export function StyleTab() {
  const [activeSubTab, setActiveSubTab] = useState<StyleSubTab>("environment");
  const activePreset = useStyleState(state => state.activePreset);
  const systemPresets = useStyleState(state => state.systemPresets);
  const customPresets = useStyleState(state => state.customPresets);
  const isSystemPreset = systemPresets.includes(activePreset);
  const activeMapFilter = useStyleState(state => state.activeMapFilter);

  useEffect(() => {
    initStyleTab();
  }, []);

  const handleSubTabChange = (tab: StyleSubTab) => {
    setActiveSubTab(tab);
    useStyleState.getState().setActiveElement(STYLE_SUB_TAB_FIRST_ELEMENT[tab]);
    selectStyleElement();
  };

  const CUSTOM_PRESET_PREFIX = "fmgStyle_";

  return (
    <div id="styleContent" className="tabcontent d-block">
      {/* ─── Preset selector ─── */}
      <p
        data-tip="Select a style preset. State labels may required regeneration if font is changed"
        className="d-inline-block"
      >
        Style preset:
      </p>
      <select
        data-tip="Select a style preset"
        id="stylePreset"
        value={activePreset}
        onChange={e => requestStylePresetChange(e.target.value)}
      >
        {systemPresets.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {customPresets.map(name => (
          <option key={CUSTOM_PRESET_PREFIX + name} value={CUSTOM_PRESET_PREFIX + name}>
            {name} [custom]
          </option>
        ))}
      </select>
      <button
        id="addStyleButton"
        data-tip="Click to save current style as a new preset"
        className="icon-plus sideButton d-inline-block"
        onClick={() => addStylePreset()}
        type="button"
      />
      <button
        id="removeStyleButton"
        data-tip="Click to remove current custom style preset"
        className="icon-minus sideButton"
        style={{ display: isSystemPreset ? "none" : "inline-block" }}
        onClick={() => requestRemoveStylePreset()}
        type="button"
      />
      {/* ─── Sub-tab bar ─── */}
      <div className="tab">
        {(["environment", "terrain", "political", "settlements", "overlays"] as StyleSubTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            className={`options${activeSubTab === tab ? " active" : ""}`}
            onClick={() => handleSubTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {/* ─── Active panel ─── */}
      {activeSubTab === "environment" && <EnvironmentStylePanel />}
      {activeSubTab === "terrain" && <TerrainStylePanel />}
      {activeSubTab === "political" && <PoliticalStylePanel />}
      {activeSubTab === "settlements" && <SettlementsStylePanel />}
      {activeSubTab === "overlays" && <OverlaysStylePanel />}
      {/* ─── Global map filters ─── */}
      <div
        id="mapFilters"
        data-tip="Set a filter to be applied to the map in general"
        onClick={e => {
          const btn = (e.target as HTMLElement).closest("button");
          if (!btn) return;
          applyMapFilterButton(btn.id);
        }}
      >
        <p>Toggle global filters:</p>
        <button type="button" id="grayscale" className={activeMapFilter === "grayscale" ? "radio pressed" : "radio"}>
          Grayscale
        </button>
        <button type="button" id="sepia" className={activeMapFilter === "sepia" ? "radio pressed" : "radio"}>
          Sepia
        </button>
        <button type="button" id="dingy" className={activeMapFilter === "dingy" ? "radio pressed" : "radio"}>
          Dingy
        </button>
        <button type="button" id="tint" className={activeMapFilter === "tint" ? "radio pressed" : "radio"}>
          Tint
        </button>
      </div>
    </div>
  );
}
