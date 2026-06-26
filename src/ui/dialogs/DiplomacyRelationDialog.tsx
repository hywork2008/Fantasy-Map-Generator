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
      <div style={{ display: "flex", flexDirection: "column", gap: ".3em", padding: "0.1em 0", minWidth: "250px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
          <svg className="coaIcon" viewBox="0 0 200 200">
            <title>Coat of Arms for {subject.fullName || subject.name}</title>
            <use href={`#stateCOA${subject.i}`} />
          </svg>
          <b>{subject.fullName || subject.name}</b>
        </header>

        <main style={{ display: "flex", gap: "1em", marginTop: "0.5em" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: ".3em" }}>
            {Object.entries(relations).map(([relation, data]) => {
              const { color, inText, tip } = data as { color: string; inText: string; tip: string };
              return (
                <div key={relation} data-tip={tip}>
                  <label className="pointer" style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
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

          <section style={{ display: "flex", flexDirection: "column", gap: ".3em", minWidth: "150px" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3em" }}
            >
              <span style={{ fontWeight: 500, fontSize: "0.95em" }}>States:</span>
              <button
                type="button"
                style={{ padding: "0.3em 0.8em", cursor: "pointer", fontSize: "0.9em" }}
                data-tip="Toggle selection of all states"
                onClick={toggleAll}
              >
                Select All / None
              </button>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: ".3em", maxHeight: "300px", overflowY: "auto" }}
            >
              {objectStates.map(s => (
                <div key={s.i} data-tip={s.fullName || s.name}>
                  <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1em", marginTop: "1em" }}>
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
