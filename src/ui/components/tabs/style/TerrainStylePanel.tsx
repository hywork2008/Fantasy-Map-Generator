import type React from "react";
import { selectStyleElement } from "../../../../controllers/style";
import { useStyleState } from "../../../../store/styleState";
import { StyleElementControls } from "./StyleElementControls";
import { TERRAIN_ELEMENTS } from "./styleElementGroups";

export const TerrainStylePanel: React.FC = () => {
  const activeElement = useStyleState(state => state.activeElement);

  return (
    <div>
      <p data-tip="Select an element to edit its style" className="d-inline-block">
        Select element:
      </p>
      <select
        data-tip="Select an element to edit its style"
        id="styleElementSelect"
        value={TERRAIN_ELEMENTS.some(e => e.value === activeElement) ? activeElement : TERRAIN_ELEMENTS[0].value}
        onChange={e => {
          useStyleState.getState().setActiveElement(e.target.value);
          selectStyleElement();
        }}
      >
        {TERRAIN_ELEMENTS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <StyleElementControls />
    </div>
  );
};
