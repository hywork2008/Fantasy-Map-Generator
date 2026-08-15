import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { diplomacyEditorActions, relations } from "../../controllers/diplomacy-editor";
import { setDiplomacyEditorState, useDiplomacyEditorState } from "../../store/diplomacyEditorState";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";

export const DiplomacyRelationDialog: React.FC = () => {
  const { t } = useTranslation();
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
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.changeRelations")}
      onClose={closeRelationDialog}
      buttons={[
        { label: "Apply", onClick: handleApply },
        { label: "Cancel", onClick: closeRelationDialog }
      ]}
    >
      <form className="diplomacy-relation-form" onSubmit={event => event.preventDefault()}>
        <header className="diplomacy-relation-subject">
          <svg className="coaIcon" viewBox="0 0 200 200">
            <title>Coat of Arms for {subject.fullName || subject.name}</title>
            <use href={`#stateCOA${subject.i}`} />
          </svg>
          <b>{subject.fullName || subject.name}</b>
        </header>

        <div className="diplomacy-relation-tables">
          <table className="diplomacy-relation-table">
            <thead>
              <tr>
                <th scope="col">Relation</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(relations).map(([relation, data]) => {
                const { color, inText, tip } = data as { color: string; inText: string; tip: string };
                return (
                  <tr key={relation} data-tip={tip}>
                    <td>
                      <label className="pointer diplomacy-relation-choice">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <table className="diplomacy-relation-table diplomacy-relation-states-table">
            <thead>
              <tr>
                <th scope="col">States</th>
                <th scope="col" className="diplomacy-relation-selection-control">
                  <button type="button" data-tip="Toggle selection of all states" onClick={toggleAll}>
                    Select All / None
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {objectStates.map(s => (
                <tr key={s.i} data-tip={s.fullName || s.name}>
                  <td colSpan={2}>
                    <label className="checkbox-label diplomacy-relation-choice">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </Dialog>
  );
};
