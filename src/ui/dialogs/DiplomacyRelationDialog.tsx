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
      <div className="d-flex">
        <header className="d-flex">
          <svg className="coaIcon" viewBox="0 0 200 200">
            <title>Coat of Arms for {subject.fullName || subject.name}</title>
            <use href={`#stateCOA${subject.i}`} />
          </svg>
          <b>{subject.fullName || subject.name}</b>
        </header>

        <main className="d-flex">
          <section className="d-flex">
            {Object.entries(relations).map(([relation, data]) => {
              const { color, inText, tip } = data as { color: string; inText: string; tip: string };
              return (
                <div key={relation} data-tip={tip}>
                  <label className="pointer d-flex">
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

          <section className="d-flex">
            <div className="d-flex">
              <span>States:</span>
              <button type="button" data-tip="Toggle selection of all states" onClick={toggleAll}>
                Select All / None
              </button>
            </div>
            <div className="-diplomacy-relation-dialog__display-flex--flex-direction-column--gap-3em--max-height-300px--overflow-y-auto d-flex">
              {objectStates.map(s => (
                <div key={s.i} data-tip={s.fullName || s.name}>
                  <label className="checkbox-label d-flex">
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

        <div className="d-flex">
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
