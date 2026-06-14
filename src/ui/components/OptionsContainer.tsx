import React, { useEffect } from "react";
import { useViewState } from "../../store/viewState";
import { AboutTab } from "./tabs/AboutTab";
import { LayersTab } from "./tabs/LayersTab";
import { StyleTab } from "./tabs/StyleTab";
import { OptionsTab } from "./tabs/OptionsTab";
import { ToolsTab } from "./tabs/ToolsTab";
import { Sticked } from "./Sticked";
import { CustomizationMenu } from "./CustomizationMenu";

export const OptionsContainer: React.FC = () => {
  const { isMenuOpen, setMenuOpen, activeMenu, setActiveMenu, isCustomizationMode, setCustomizationMode } = useViewState();

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

  return (
    <div id="optionsContainer" style={{ opacity: 1, pointerEvents: "auto" }}>
      <div id="collapsible" style={{ display: isMenuOpen ? "none" : "block" }}>
        <button
          id="optionsTrigger"
          data-tip="Click to show the Menu"
          className="options glow"
          onClick={() => setMenuOpen(true)}
        >
          ►
        </button>
        <button
          id="regenerate"
          data-tip="Click to generate a new map"
          className="options"
          style={{ display: "none" }}
        >
          New Map!
        </button>
      </div>

      <div id="options" style={{ display: isMenuOpen ? "block" : "none" }}>
        <div className="drag-trigger" data-tip="Drag to move the Menu"></div>

        <div className="tab">
          <button
            id="optionsHide"
            data-tip="Click to hide the Menu"
            className="options"
            onClick={() => setMenuOpen(false)}
          >
            ◄
          </button>
          {[
            { id: "layersTab", label: "Layers" },
            { id: "styleTab", label: "Style" },
            { id: "optionsTab", label: "Options" },
            { id: "toolsTab", label: "Tools" },
            { id: "aboutTab", label: "About" }
          ].map(tab => (
            <button
              key={tab.id}
              id={tab.id}
              className={`options ${activeMenu === tab.id ? "active" : ""}`}
              onClick={() => setActiveMenu(tab.id)}
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
