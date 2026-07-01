import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { statesEditorActions } from "../../controllers/states-editor";
import { useStatesEditorState } from "../../store/statesEditorState";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";

export const StateMergeDialog: React.FC = () => {
  const mergeDialog = useStatesEditorState(state => state.mergeDialog);
  const [rulingStateId, setRulingStateId] = useState<number | null>(null);
  const [statesToMerge, setStatesToMerge] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (mergeDialog) {
      setRulingStateId(null);
      setStatesToMerge(new Set());
    }
  }, [mergeDialog]);

  const handleToggleMerge = useCallback((stateId: number, checked: boolean) => {
    setStatesToMerge(prev => {
      const next = new Set(prev);
      if (checked) next.add(stateId);
      else next.delete(stateId);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    statesEditorActions.confirmMerge(rulingStateId, Array.from(statesToMerge));
  }, [rulingStateId, statesToMerge]);

  const handleClose = useCallback(() => {
    statesEditorActions.closeMergeDialog();
  }, []);

  if (!mergeDialog) return null;

  return (
    <Dialog
      isOpen={true}
      title="Merge states"
      onClose={handleClose}
      buttons={[
        { label: "Merge", onClick: handleApply },
        { label: "Cancel", onClick: handleClose }
      ]}
    >
      <div className="-state-merge-dialog__width-36em">
        <p className="-state-merge-dialog__margin-0-0-1em-0">
          Check the <b>checkbox</b> next to each state you want to merge. Use the <b>radio button</b> to pick the{" "}
          <em>ruling state</em> that will absorb all others (its name, color, and capital will be kept). Hover over a
          row to highlight the state on the map.
        </p>
        <div className="-state-merge-dialog__display-grid--grid-template-columns-1fr-1fr--gap-0-3em">
          {mergeDialog.map(s => (
            <div
              key={s.i}
              data-tip={s.fullName}
              className="-state-merge-dialog__display-flex--align-items-center--gap-0-3em--cursor-default"
              onMouseEnter={() => statesEditorActions.highlightStateOnMap(s.i)}
              onMouseLeave={statesEditorActions.clearStateHighlight}
            >
              <input
                type="radio"
                name="rulingState"
                value={s.i}
                checked={rulingStateId === s.i}
                onChange={() => setRulingStateId(s.i)}
              />
              <input
                id={`selectState${s.i}`}
                className="checkbox"
                type="checkbox"
                checked={statesToMerge.has(s.i)}
                onChange={e => handleToggleMerge(s.i, e.target.checked)}
              />
              <label
                htmlFor={`selectState${s.i}`}
                className="checkbox-label -state-merge-dialog__display-flex--align-items-center--gap-0-3em--cursor-pointer"
              >
                {/* @ts-ignore */}
                <FillBox fill={s.color} disabled />
                <svg className="coaIcon" viewBox="0 0 200 200" aria-hidden="true">
                  <use href={`#stateCOA${s.i}`} />
                </svg>
                {s.fullName}
              </label>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
