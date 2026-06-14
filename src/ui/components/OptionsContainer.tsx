import React, { useEffect, useRef } from "react";
import { useViewState } from "../../store/viewState";
import { AboutTab } from "./tabs/AboutTab";

export const OptionsContainer: React.FC = () => {
  const { isMenuOpen, setMenuOpen, activeMenu, setActiveMenu } = useViewState();
  const contentRef = useRef<HTMLDivElement>(null);

  // Re-parent legacy DOM tabs into our React container
  useEffect(() => {
    const tabs = [
      "layersContent",
      "styleContent",
      "optionsContent",
      "toolsContent"
    ];

    if (contentRef.current) {
      tabs.forEach(tabId => {
        const el = document.getElementById(tabId);
        if (el) {
          contentRef.current!.appendChild(el);
        }
      });
    }

    return () => {
      // Cleanup: move them back to body or leave them (since they live for the whole app)
    };
  }, []);

  // Update display of legacy tabs based on activeMenu
  useEffect(() => {
    const tabs = [
      { id: "layersContent", tabId: "layersTab" },
      { id: "styleContent", tabId: "styleTab" },
      { id: "optionsContent", tabId: "optionsTab" },
      { id: "toolsContent", tabId: "toolsTab" }
    ];

    tabs.forEach(({ id, tabId }) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = activeMenu === tabId ? "block" : "none";
      }
    });
  }, [activeMenu]);

  // If menu is closed, show the trigger
  if (!isMenuOpen) {
    return (
      <div id="optionsContainer" style={{ opacity: 1, pointerEvents: "auto" }}>
        <div id="collapsible">
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
            style={{ display: "none" }} // Logic for new map hover handles this later
          >
            New Map!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="optionsContainer" style={{ opacity: 1, pointerEvents: "auto" }}>
      <div id="options" style={{ display: "block" }}>
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

        {/* This div holds the legacy DOM elements */}
        <div ref={contentRef} />

        {/* React Tabs */}
        {activeMenu === "aboutTab" && <AboutTab />}
      </div>
    </div>
  );
};
