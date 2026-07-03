import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { provincesEditorActions } from "../../controllers/provinces-editor";
import { useProvincesEditorState } from "../../store/provincesEditorState";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";

export const ProvinceMergeDialog: React.FC = () => {
  const mergeDialog = useProvincesEditorState(state => state.mergeDialog);
  const [rulingProvinceId, setRulingProvinceId] = useState<number | null>(null);
  const [provincesToMerge, setProvincesToMerge] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (mergeDialog) {
      setRulingProvinceId(null);
      setProvincesToMerge(new Set());
    }
  }, [mergeDialog]);

  const handleToggleMerge = useCallback((provinceId: number, checked: boolean) => {
    setProvincesToMerge(prev => {
      const next = new Set(prev);
      if (checked) next.add(provinceId);
      else next.delete(provinceId);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    provincesEditorActions.confirmMerge(rulingProvinceId, Array.from(provincesToMerge));
  }, [rulingProvinceId, provincesToMerge]);

  const handleClose = useCallback(() => {
    provincesEditorActions.closeMergeDialog();
  }, []);

  if (!mergeDialog) return null;

  return (
    <Dialog
      isOpen={true}
      title="Merge provinces"
      onClose={handleClose}
      buttons={[
        { label: "Merge", onClick: handleApply },
        { label: "Cancel", onClick: handleClose }
      ]}
    >
      <div>
        <p>
          Check the <b>checkbox</b> next to each province you want to merge. Use the <b>radio button</b> to pick the{" "}
          <em>primary province</em> that will absorb all others. Hover over a row to highlight the province on the map.
        </p>
        <div className="d-grid">
          {mergeDialog.map(p => (
            <div
              key={p.i}
              data-tip={p.fullName || p.name}
              className="d-flex"
              onMouseEnter={() => provincesEditorActions.provinceHighlightOn(p.i)}
              onMouseLeave={() => provincesEditorActions.provinceHighlightOff(null)}
            >
              <input
                type="radio"
                name="rulingProvince"
                value={p.i}
                checked={rulingProvinceId === p.i}
                onChange={() => setRulingProvinceId(p.i)}
              />
              <input
                id={`selectProvince${p.i}`}
                className="checkbox"
                type="checkbox"
                checked={provincesToMerge.has(p.i)}
                onChange={e => handleToggleMerge(p.i, e.target.checked)}
              />
              <label htmlFor={`selectProvince${p.i}`} className="checkbox-label d-flex">
                {/* @ts-ignore */}
                <FillBox fill={p.color} disabled />
                <svg className="coaIcon" viewBox="0 0 200 200" aria-hidden="true">
                  <use href={`#provinceCOA${p.i}`} />
                </svg>
                {p.name}
              </label>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
