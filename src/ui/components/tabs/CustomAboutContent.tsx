import type React from "react";
import { useTranslation } from "react-i18next";

export const CustomAboutContent: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <p>{t("about.costOfLivingHeading")}</p>
      <p>{t("about.costOfLivingIntro")}</p>
      <ul>
        <li>{t("about.costOfLivingPeasant")}</li>
        <li>{t("about.costOfLivingUrban")}</li>
        <li>{t("about.costOfLivingFamily")}</li>
        <li>{t("about.costOfLivingHouse")}</li>
      </ul>
    </>
  );
};
