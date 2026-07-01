import type React from "react";
import { useEffect, useState } from "react";
import { diplomacyEditorActions, relations } from "../../controllers/diplomacy-editor";
import { setDiplomacyEditorState, useDiplomacyEditorState } from "../../store/diplomacyEditorState";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";

export const DiplomacyRelationDialog: React.FC = () => {
  const { relationDialog, states } = useDiplomacyEditorState();
  const { isOpen, subjectId, objectId, currentRelation } = relationDialog;

  const [selectedRelation, setSelectedRelation] = useState<string>(currentRelation);
  const [selectedObjects, setSelectedObjects] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedRelation(currentRelation);
      setSelectedObjects(new Set([objectId]));
    }
  }, [isOpen, currentRelation, objectId]);

  const closeRelationDialog = () => {
    setDiplomacyEditorState({
      relationDialog: { ...relationDialog, isOpen: false }
    });
  };

  const handleApply = () => {
    Array.from(selectedObjects).forEach(oid => {
      diplomacyEditorActions.changeRelation(subjectId, oid, currentRelation, selectedRelation);
    });
    closeRelationDialog();
  };

  if (!isOpen) return null;

  const subject = states.find(s => s.i === subjectId);
  if (!subject) return null;

  const objectStates = states.filter(s => s.i && s.i !== subjectId);
  const allSelected = selectedObjects.size === objectStates.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedObjects(new Set());
    } else {
      setSelectedObjects(new Set(objectStates.map(s => s.i)));
    }
  };

  const toggleObject = (id: number) => {
    const newSelected = new Set(selectedObjects);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedObjects(newSelected);
  };

  return (
    <Dialog isOpen={isOpen} title="Change relations" onClose={closeRelationDialog}>
      <div className="-diplomacy-relation-dialog__display-flex--flex-direction-column--gap-3em--padding-0-1em-0--min-width-250px">
        <header className="-diplomacy-relation-dialog__display-flex--align-items-center--gap-0-5em">
          <svg className="coaIcon" viewBox="0 0 200 200">
            <title>Coat of Arms for {subject.fullName || subject.name}</title>
            <use href={`#stateCOA${subject.i}`} />
          </svg>
          <b>{subject.fullName || subject.name}</b>
        </header>

        <main className="-diplomacy-relation-dialog__display-flex--gap-1em--margin-top-0-5em">
          <section className="-diplomacy-relation-dialog__display-flex--flex-direction-column--gap-3em">
            {Object.entries(relations).map(([relation, data]) => {
              const { color, inText, tip } = data as { color: string; inText: string; tip: string };
              return (
                <div key={relation} data-tip={tip}>
                  <label className="pointer -diplomacy-relation-dialog__display-flex--align-items-center--gap-0-5em">
                    <input
                      type="radio"
                      name="relationSelect"
                      value={relation}
                      checked={selectedRelation === relation}
                      onChange={() => setSelectedRelation(relation)}
                    />
                    <FillBox fill={color} size=".8em" />
                    {inText}
                  </label>
                </div>
              );
            })}
          </section>

          <section className="-diplomacy-relation-dialog__display-flex--flex-direction-column--gap-3em--min-width-150px">
            <div className="-diplomacy-relation-dialog__display-flex--justify-content-space-between--align-items-center--margin-bottom-0">
              <span className="-diplomacy-relation-dialog__font-weight-500--font-size-0-95em">States:</span>
              <button
                type="button"
                className="-diplomacy-relation-dialog__padding-0-3em-0-8em--cursor-pointer--font-size-0-9em"
                data-tip="Toggle selection of all states"
                onClick={toggleAll}
              >
                Select All / None
              </button>
            </div>
            <div className="-diplomacy-relation-dialog__display-flex--flex-direction-column--gap-3em--max-height-300px--overflow-y-auto">
              {objectStates.map(s => (
                <div key={s.i} data-tip={s.fullName || s.name}>
                  <label className="checkbox-label -diplomacy-relation-dialog__display-flex--align-items-center--gap-0-5em">
                    <input
                      className="checkbox"
                      type="checkbox"
                      checked={selectedObjects.has(s.i)}
                      onChange={() => toggleObject(s.i)}
                    />
                    <svg className="coaIcon" viewBox="0 0 200 200">
                      <title>Coat of Arms for {s.fullName || s.name}</title>
                      <use href={`#stateCOA${s.i}`} />
                    </svg>
                    {s.fullName || s.name}
                  </label>
                </div>
              ))}
            </div>
          </section>
        </main>

        <div className="-diplomacy-relation-dialog__display-flex--justify-content-flex-end--gap-1em--m">
          <button type="button" className="button" onClick={closeRelationDialog}>
            Cancel
          </button>
          <button type="button" className="button" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </Dialog>
  );
};
