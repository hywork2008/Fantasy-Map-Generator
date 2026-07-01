import type React from "react";
import { useEffect, useState } from "react";
import { regeneratePrompt } from "../../controllers/options";
import { clearMainTip } from "../../services/tooltipService";
import { useOptionsState } from "../../store/optionsState";
import { useViewState } from "../../store/viewState";
import { CustomizationMenu } from "./CustomizationMenu";
import { Sticked } from "./Sticked";
import { AboutTab } from "./tabs/AboutTab";
import { ExtensionsTab } from "./tabs/ExtensionsTab";
import { LayersTab } from "./tabs/LayersTab";
import { OptionsTab } from "./tabs/OptionsTab";
import { StyleTab } from "./tabs/StyleTab";
import { ToolsTab } from "./tabs/ToolsTab";

export const OptionsContainer: React.FC = () => {
  const { isMenuOpen, setMenuOpen, activeMenu, setActiveMenu, isCustomizationMode, setCustomizationMode } =
    useViewState();
  const uiSize = useOptionsState(state => state.uiSize);

  const [showGlow, setShowGlow] = useState(() => !localStorage.getItem("disable_click_arrow_tooltip"));
  const [showRegenerate, setShowRegenerate] = useState(false);

  useEffect(() => {
    const handleEnter = () => {
      setCustomizationMode(true);
      setActiveMenu("toolsTab");
    };
    const handleExit = () => {
      setCustomizationMode(false);
    };

    document.addEventListener("react-enter-heightmap-edit", handleEnter);
    document.addEventListener("react-exit-heightmap-edit", handleExit);

    return () => {
      document.removeEventListener("react-enter-heightmap-edit", handleEnter);
      document.removeEventListener("react-exit-heightmap-edit", handleExit);
    };
  }, [setCustomizationMode, setActiveMenu]);

  const handleTriggerClick = () => {
    if (showGlow) {
      setShowGlow(false);
      clearMainTip();
      localStorage.setItem("disable_click_arrow_tooltip", "true");
    }
    setMenuOpen(true);
  };

  return (
    <div id="optionsContainer" className="-options-container__opacity-1--pointer-events-auto">
      <div
        id="collapsible"
        style={{ display: isMenuOpen ? "none" : "block" }}
        onMouseLeave={() => setShowRegenerate(false)}
      >
        <button
          id="optionsTrigger"
          data-tip="Click to show the Menu"
          className={`options${showGlow ? " glow" : ""}`}
          onClick={handleTriggerClick}
          onMouseEnter={() => {
            if (!showGlow) setShowRegenerate(true);
          }}
          type="button"
        >
          ►
        </button>
        <button
          id="regenerate"
          data-tip="Click to generate a new map"
          className="options"
          style={{ display: showRegenerate ? "block" : "none" }}
          onClick={() => regeneratePrompt()}
          type="button"
        >
          New Map!
        </button>
      </div>

      <div id="options" style={{ display: isMenuOpen ? "block" : "none", width: `${uiSize * 300}px` }}>
        <div className="drag-trigger" data-tip="Drag to move the Menu"></div>

        <div className="tab">
          <button
            id="optionsHide"
            data-tip="Click to hide the Menu"
            className="options"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            ◄
          </button>
          {[
            { id: "layersTab", label: "Layers", tip: "Click to change map layers" },
            { id: "styleTab", label: "Style", tip: "Click to open style editor" },
            { id: "optionsTab", label: "Options", tip: "Click to change generation and UI options" },
            { id: "toolsTab", label: "Tools", tip: "Click to open tools menu" },
            { id: "extensionsTab", label: "Exts", tip: "Click to manage extensions" },
            { id: "aboutTab", label: "About", tip: "Click to see Generator info" }
          ].map(tab => (
            <button
              key={tab.id}
              id={tab.id}
              data-tip={tab.tip}
              className={`options ${activeMenu === tab.id ? "active" : ""}`}
              onClick={() => setActiveMenu(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* React Tabs */}
        <div style={{ display: activeMenu === "layersTab" ? "block" : "none" }}>
          <LayersTab />
        </div>
        <div style={{ display: activeMenu === "styleTab" ? "block" : "none" }}>
          <StyleTab />
        </div>
        <div style={{ display: activeMenu === "optionsTab" ? "block" : "none" }}>
          <OptionsTab />
        </div>
        <div style={{ display: activeMenu === "toolsTab" && !isCustomizationMode ? "block" : "none" }}>
          <ToolsTab />
        </div>
        <div style={{ display: activeMenu === "extensionsTab" ? "block" : "none" }}>
          <ExtensionsTab />
        </div>
        <div style={{ display: activeMenu === "aboutTab" ? "block" : "none" }}>
          <AboutTab />
        </div>

        {/* Heightmap customization tools - shown when in customization mode on Tools tab */}
        <CustomizationMenu />

        {/* Bottom action buttons */}
        <Sticked />
      </div>
    </div>
  );
};
