import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearMainTip } from "../../services/tooltipService";
import { useGenerationProgressState } from "../../store/generationProgressState";
import { useMapReadyTaskState } from "../../store/mapReadyTaskState";
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
  { id: "layersTab", labelKey: "menu.layers", tipKey: "menu.layersTip" },
  { id: "styleTab", labelKey: "menu.style", tipKey: "menu.styleTip" },
  { id: "optionsTab", labelKey: "menu.options", tipKey: "menu.optionsTip" },
  { id: "toolsTab", labelKey: "menu.tools", tipKey: "menu.toolsTip" },
  { id: "extensionsTab", labelKey: "menu.extensions", tipKey: "menu.extensionsTip" },
  { id: "aboutTab", labelKey: "menu.about", tipKey: "menu.aboutTip" }
] as const;

export const OptionsContainer: React.FC = () => {
  const { t } = useTranslation();
  const { isMenuOpen, setMenuOpen, activeMenu, setActiveMenu, isCustomizationMode, setCustomizationMode } =
    useViewState();
  const uiSize = useOptionsState(state => state.uiSize);
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const canConfigureLandscapeReview = useGenerationProgressState(
    state => state.isOpen && !state.isGenerating && state.currentStage === 0
  );
  const isMapReadyTaskRunning = useMapReadyTaskState(state => state.isRunning);
  // Every visible part of the compact tab bar is a button, so permit it to
  // start a drag while retaining ordinary click behavior when it is not moved.
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({
    handleSelector: ".tab",
    allowInteractiveHandle: true
  });

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

  useEffect(() => {
    if (!isMapGenerationInProgress) return;
    setMenuOpen(true);
    setActiveMenu("optionsTab");
  }, [isMapGenerationInProgress, setActiveMenu, setMenuOpen]);

  const handleToggle = () => {
    if (!isMenuOpen && showGlow) {
      setShowGlow(false);
      clearMainTip();
      localStorage.setItem("disable_click_arrow_tooltip", "true");
    }
    setMenuOpen(!isMenuOpen);
  };

  return (
    <div id="optionsContainer">
      <div id="options" ref={containerRef} style={{ width: `${uiSize * 300}px` }} onMouseDownCapture={bringToFront}>
        <div className="tab">
          <button
            id="optionsHide"
            data-tip={isMenuOpen ? t("menu.hideMenu") : t("menu.showMenu")}
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
              data-tip={
                isMapGenerationInProgress &&
                tab.id !== "optionsTab" &&
                !(canConfigureLandscapeReview && tab.id === "extensionsTab")
                  ? t("menu.unavailableWhileBuilding")
                  : isMapReadyTaskRunning && tab.id === "toolsTab"
                    ? t("menu.unavailableWhilePreparing")
                    : t(tab.tipKey)
              }
              className={`options ${activeMenu === tab.id ? "active" : ""}`}
              onClick={() => setActiveMenu(tab.id)}
              disabled={
                (isMapGenerationInProgress &&
                  tab.id !== "optionsTab" &&
                  !(canConfigureLandscapeReview && tab.id === "extensionsTab")) ||
                (isMapReadyTaskRunning && tab.id === "toolsTab")
              }
              type="button"
            >
              {t(tab.labelKey)}
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
