import type React from "react";
import { useState } from "react";
import { GenerationSettingsTab } from "./options/GenerationSettingsTab";
import { UiSettingsTab } from "./options/UiSettingsTab";

type OptionsSubTab = "generation" | "ui";

export const OptionsTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<OptionsSubTab>("generation");

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
          type="button"
        >
          UI
        </button>
      </div>

      {activeSubTab === "generation" && <GenerationSettingsTab />}
      {activeSubTab === "ui" && <UiSettingsTab />}
    </div>
  );
};
