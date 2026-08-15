import type React from "react";
import { useTranslation } from "react-i18next";
import { selectStyleElement } from "../../../../controllers/style";
import { useStyleState } from "../../../../store/styleState";
import { StyleElementControls } from "./StyleElementControls";
import { ENVIRONMENT_ELEMENTS } from "./styleElementGroups";

export const EnvironmentStylePanel: React.FC = () => {
  const { t } = useTranslation();
  const activeElement = useStyleState(state => state.activeElement);

  return (
    <div>
      <p data-tip={t("styleTab.selectElementTip")} className="d-inline-block">
        {t("styleTab.selectElement")}
      </p>
      <select
        data-tip={t("styleTab.selectElementTip")}
        id="styleElementSelect"
        value={
          ENVIRONMENT_ELEMENTS.some(e => e.value === activeElement) ? activeElement : ENVIRONMENT_ELEMENTS[0].value
        }
        onChange={e => {
          useStyleState.getState().setActiveElement(e.target.value);
          selectStyleElement();
        }}
      >
        {ENVIRONMENT_ELEMENTS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {t(`styleTab.elements.${opt.value}`, { defaultValue: opt.label })}
          </option>
        ))}
      </select>
      <StyleElementControls />
    </div>
  );
};
