import type React from "react";
import { useEffect, useState } from "react";
import { culturesSetUsesFrontierSettlement } from "../../../generators/threatProfiles";
import { useGenerationProgressState } from "../../../store/generationProgressState";
import { useOptionsState } from "../../../store/optionsState";
import { DangerSettingsTab } from "./options/DangerSettingsTab";
import { GenerationSettingsTab } from "./options/GenerationSettingsTab";
import { SimulationSettingsTab } from "./options/SimulationSettingsTab";
import { UiSettingsTab } from "./options/UiSettingsTab";

type OptionsSubTab = "generation" | "ui" | "simulation" | "danger";

export const OptionsTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<OptionsSubTab>("generation");
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const canConfigureLandscapeReview = useGenerationProgressState(
    state => state.isOpen && !state.isGenerating && state.currentStage === 0
  );
  const culturesSet = useOptionsState(state => state.culturesSet);
  const canConfigureDanger =
    !isMapGenerationInProgress || (canConfigureLandscapeReview && culturesSetUsesFrontierSettlement(culturesSet));

  useEffect(() => {
    if (isMapGenerationInProgress) setActiveSubTab("generation");
  }, [isMapGenerationInProgress]);

  return (
    <div id="optionsTabContent" className="tabcontent d-block">
      <div className="tab">
        <button
          className={`options${activeSubTab === "generation" ? " active" : ""}`}
          onClick={() => setActiveSubTab("generation")}
          type="button"
        >
          Generation
        </button>
        <button
          className={`options${activeSubTab === "ui" ? " active" : ""}`}
          onClick={() => setActiveSubTab("ui")}
          disabled={isMapGenerationInProgress && !canConfigureLandscapeReview}
          type="button"
        >
          UI
        </button>
        <button
          className={`options${activeSubTab === "simulation" ? " active" : ""}`}
          onClick={() => setActiveSubTab("simulation")}
          disabled={isMapGenerationInProgress}
          type="button"
        >
          Simulation
        </button>
        <button
          className={`options${activeSubTab === "danger" ? " active" : ""}`}
          onClick={() => setActiveSubTab("danger")}
          disabled={!canConfigureDanger}
          type="button"
        >
          Danger
        </button>
      </div>

      <div className="options-subtab-panel">
        {activeSubTab === "generation" && <GenerationSettingsTab />}
        {activeSubTab === "ui" && <UiSettingsTab />}
        {activeSubTab === "simulation" && <SimulationSettingsTab />}
        {activeSubTab === "danger" && <DangerSettingsTab />}
      </div>
    </div>
  );
};
