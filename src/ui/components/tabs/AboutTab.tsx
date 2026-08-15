import type React from "react";
import { useTranslation } from "react-i18next";
import { UITour } from "../../../services/ui-tour";
import { CustomAboutContent } from "./CustomAboutContent";
import { UpstreamAboutContent } from "./UpstreamAboutContent";

export const AboutTab: React.FC = () => {
  const { t } = useTranslation();
  const startTour = () => {
    UITour.start();
  };

  const useCustomAbout = import.meta.env.VITE_USE_CUSTOM_ABOUT === "true";

  return (
    <div id="aboutContent" className="tabcontent d-block">
      <p>
        <button id="startTourButton" onClick={startTour} data-tip={t("about.startTourTip")} type="button">
          {t("about.startTour")}
        </button>
      </p>

      {useCustomAbout ? <CustomAboutContent /> : <UpstreamAboutContent />}
    </div>
  );
};
