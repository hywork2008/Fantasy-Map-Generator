import type React from "react";
import { useEffect, useState } from "react";
import { useGenerationProgressState } from "../../../store/generationProgressState";
import { DangerSettingsTab } from "./options/DangerSettingsTab";
import { GenerationSettingsTab } from "./options/GenerationSettingsTab";
import { SimulationSettingsTab } from "./options/SimulationSettingsTab";
import { UiSettingsTab } from "./options/UiSettingsTab";

type OptionsSubTab = "generation" | "ui" | "simulation" | "danger";

export const OptionsTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<OptionsSubTab>("generation");
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);

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
          disabled={isMapGenerationInProgress}
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
          disabled={isMapGenerationInProgress}
          type="button"
        >
          Danger
        </button>
      </div>

      {activeSubTab === "generation" && <GenerationSettingsTab />}
      {activeSubTab === "ui" && <UiSettingsTab />}
      {activeSubTab === "simulation" && <SimulationSettingsTab />}
      {activeSubTab === "danger" && <DangerSettingsTab />}
    </div>
  );
};
