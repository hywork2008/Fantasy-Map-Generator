import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      <p data-tip={t("styleTab.presetTip")} className="d-inline-block">
        {t("styleTab.preset")}
      </p>
      <select
        data-tip={t("styleTab.presetSelectTip")}
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
            {t("styleTab.customSuffix", { name })}
          </option>
        ))}
      </select>
      <button
        id="addStyleButton"
        data-tip={t("styleTab.addPresetTip")}
        className="icon-plus sideButton d-inline-block"
        onClick={() => addStylePreset()}
        type="button"
      />
      <button
        id="removeStyleButton"
        data-tip={t("styleTab.removePresetTip")}
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
            {t(`styleTab.subTabs.${tab}`)}
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
        data-tip={t("styleTab.filtersTip")}
        onClick={e => {
          const btn = (e.target as HTMLElement).closest("button");
          if (!btn) return;
          applyMapFilterButton(btn.id);
        }}
      >
        <p>{t("styleTab.filters")}</p>
        <button type="button" id="grayscale" className={activeMapFilter === "grayscale" ? "radio pressed" : "radio"}>
          {t("styleTab.grayscale")}
        </button>
        <button type="button" id="sepia" className={activeMapFilter === "sepia" ? "radio pressed" : "radio"}>
          {t("styleTab.sepia")}
        </button>
        <button type="button" id="dingy" className={activeMapFilter === "dingy" ? "radio pressed" : "radio"}>
          {t("styleTab.dingy")}
        </button>
        <button type="button" id="tint" className={activeMapFilter === "tint" ? "radio pressed" : "radio"}>
          {t("styleTab.tint")}
        </button>
      </div>
    </div>
  );
}
