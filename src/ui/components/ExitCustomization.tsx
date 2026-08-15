import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HeightmapEditorActions } from "../../controllers/heightmapEditor";

export const ExitCustomization: React.FC = () => {
  const { t } = useTranslation();
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const handleShow = (e: Event) => {
      const detail = (e as CustomEvent<{ opacity?: string; right?: string; bottom?: string; transform?: string }>)
        .detail;
      if (detail) {
        if (detail.opacity !== undefined) el.style.opacity = detail.opacity;
        if (detail.right !== undefined) el.style.right = detail.right;
        if (detail.bottom !== undefined) el.style.bottom = detail.bottom;
        if (detail.transform !== undefined) el.style.transform = detail.transform;
      }
      el.style.display = "block";
    };

    const handleHide = () => {
      el.style.display = "none";
    };

    document.addEventListener("react-show-exit-customization", handleShow);
    document.addEventListener("react-hide-exit-customization", handleHide);

    return () => {
      document.removeEventListener("react-show-exit-customization", handleShow);
      document.removeEventListener("react-hide-exit-customization", handleHide);
    };
  }, []);

  return (
    <div id="exitCustomization" ref={elRef} className="d-none">
      <div data-tip={t("exitCustomization.dragTip")}>
        <button
          type="button"
          data-tip={t("exitCustomization.labelTip")}
          id="finalizeHeightmap"
          onClick={() => HeightmapEditorActions.finalizeHeightmap()}
        >
          {t("exitCustomization.label")}
        </button>
      </div>
    </div>
  );
};
