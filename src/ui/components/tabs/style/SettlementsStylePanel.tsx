import type React from "react";
import { selectStyleElement } from "../../../../controllers/style";
import { useStyleState } from "../../../../store/styleState";
import { StyleElementControls } from "./StyleElementControls";
import { SETTLEMENTS_ELEMENTS } from "./styleElementGroups";

export const SettlementsStylePanel: React.FC = () => {
  const activeElement = useStyleState(state => state.activeElement);

  return (
    <div>
      <p data-tip="Select an element to edit its style" style={{ display: "inline-block" }}>
        Select element:
      </p>
      <select
        data-tip="Select an element to edit its style"
        id="styleElementSelect"
        style={{ width: "42%" }}
        value={
          SETTLEMENTS_ELEMENTS.some(e => e.value === activeElement) ? activeElement : SETTLEMENTS_ELEMENTS[0].value
        }
        onChange={e => {
          useStyleState.getState().setActiveElement(e.target.value);
          selectStyleElement();
        }}
      >
        {SETTLEMENTS_ELEMENTS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <StyleElementControls />
    </div>
  );
};
