import type React from "react";
import { selectStyleElement } from "../../../../controllers/style";
import { useStyleState } from "../../../../store/styleState";
import { StyleElementControls } from "./StyleElementControls";
import { POLITICAL_ELEMENTS } from "./styleElementGroups";

export const PoliticalStylePanel: React.FC = () => {
  const activeElement = useStyleState(state => state.activeElement);

  return (
    <div>
      <p data-tip="Select an element to edit its style" className="-political-style-panel__display-inline-block">
        Select element:
      </p>
      <select
        data-tip="Select an element to edit its style"
        id="styleElementSelect"
        className="-political-style-panel__width-42"
        value={POLITICAL_ELEMENTS.some(e => e.value === activeElement) ? activeElement : POLITICAL_ELEMENTS[0].value}
        onChange={e => {
          useStyleState.getState().setActiveElement(e.target.value);
          selectStyleElement();
        }}
      >
        {POLITICAL_ELEMENTS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <StyleElementControls />
    </div>
  );
};
