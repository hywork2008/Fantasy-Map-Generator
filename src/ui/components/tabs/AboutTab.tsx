import type React from "react";
import { UITour } from "../../../services/ui-tour";
import { CustomAboutContent } from "./CustomAboutContent";
import { UpstreamAboutContent } from "./UpstreamAboutContent";

export const AboutTab: React.FC = () => {
  const startTour = () => {
    UITour.start();
  };

  const useCustomAbout = import.meta.env.VITE_USE_CUSTOM_ABOUT === "true";

  return (
    <div id="aboutContent" className="tabcontent" style={{ display: "block" }}>
      <p style={{ textAlign: "center", marginTop: "1em" }}>
        <button
          id="startTourButton"
          onClick={startTour}
          data-tip="Take an interactive tour of the map generator"
          type="button"
        >
          &#9654; Take an Interactive Tour
        </button>
      </p>

      {useCustomAbout ? <CustomAboutContent /> : <UpstreamAboutContent />}
    </div>
  );
};
