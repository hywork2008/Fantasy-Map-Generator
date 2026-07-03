import type React from "react";
import { useEffect, useState } from "react";
import { clearMainTip } from "../../services/tooltipService";
import { useOptionsState } from "../../store/optionsState";
import { useViewState } from "../../store/viewState";
import { useDraggable } from "../dialogs/useDraggable";
import { CustomizationMenu } from "./CustomizationMenu";
import { Sticked } from "./Sticked";
import { AboutTab } from "./tabs/AboutTab";
import { ExtensionsTab } from "./tabs/ExtensionsTab";
import { LayersTab } from "./tabs/LayersTab";
import { OptionsTab } from "./tabs/OptionsTab";
import { StyleTab } from "./tabs/StyleTab";
import { ToolsTab } from "./tabs/ToolsTab";

const TABS = [
  { id: "layersTab", label: "Layers", tip: "Click to change map layers" },
  { id: "styleTab", label: "Style", tip: "Click to open style editor" },
  { id: "optionsTab", label: "Options", tip: "Click to change generation and UI options" },
  { id: "toolsTab", label: "Tools", tip: "Click to open tools menu" },
  { id: "extensionsTab", label: "Exts", tip: "Click to manage extensions" },
  { id: "aboutTab", label: "About", tip: "Click to see Generator info" }
] as const;

export const OptionsContainer: React.FC = () => {
  const { isMenuOpen, setMenuOpen, activeMenu, setActiveMenu, isCustomizationMode, setCustomizationMode } =
    useViewState();
  const uiSize = useOptionsState(state => state.uiSize);
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({ handleSelector: ".tab" });

  const [showGlow, setShowGlow] = useState(() => !localStorage.getItem("disable_click_arrow_tooltip"));

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

  const handleToggle = () => {
    if (!isMenuOpen && showGlow) {
      setShowGlow(false);
      clearMainTip();
      localStorage.setItem("disable_click_arrow_tooltip", "true");
    }
    setMenuOpen(!isMenuOpen);
  };

  return (
    <div id="optionsContainer" className="-options-container__opacity-1--pointer-events-auto">
      <div id="options" ref={containerRef} style={{ width: `${uiSize * 300}px` }} onMouseDownCapture={bringToFront}>
        <div className="tab">
          <button
            id="optionsHide"
            data-tip={isMenuOpen ? "Click to hide the Menu" : "Click to show the Menu"}
            className={`options${!isMenuOpen && showGlow ? " glow" : ""}`}
            onClick={handleToggle}
            type="button"
          >
            {isMenuOpen ? "◄" : "►"}
          </button>
          {TABS.map(tab => (
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

        {isMenuOpen && (
          <>
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

            <CustomizationMenu />
            <Sticked />

            <div className="fmg-dialog-resize" ref={resizeHandleRef} aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
};
