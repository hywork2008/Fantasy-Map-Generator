import type React from "react";
import { useTranslation } from "react-i18next";
import { diplomacyEditorActions, type RelationKey, relations } from "../../controllers/diplomacy-editor";
import { useDialogState } from "../../store/dialogState";
import { useDiplomacyEditorState } from "../../store/diplomacyEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const DiplomacyMatrixDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("diplomacyMatrix"));
  const matrix = useDiplomacyEditorState(state => state.matrix);

  const handleCellClick = (subjectId: number, objectId: number, relation: string) => {
    if (subjectId !== objectId && relations[relation as RelationKey]) {
      diplomacyEditorActions.selectRelation(subjectId, objectId, relation);
    }
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.diplomacyMatrix")} onClose={() => closeDialog("diplomacyMatrix")}>
      <div id="diplomacyMatrixBody" className="matrix-table">
        <table>
          <thead>
            <tr>
              <th data-tip="&#8205;"></th>
              {matrix.map(state => (
                <th key={state.i} data-tip={`Relations to ${state.fullName}`}>
                  {state.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map(state => (
              <tr key={state.i} data-id={state.i}>
                <th data-tip={`Relations of ${state.fullName}`}>{state.name}</th>
                {matrix.map(objectState => {
                  const relation = state.diplomacy[objectState.i];
                  const relationObj = relations[relation as RelationKey];
                  if (!relationObj) {
                    return (
                      <td key={objectState.i} className={relation}>
                        {relation}
                      </td>
                    );
                  }

                  const tipText = `${state.fullName} ${relationObj.inText} ${objectState.fullName}`;
                  return (
                    <td
                      key={objectState.i}
                      data-id={objectState.i}
                      data-tip={tipText}
                      className={relation}
                      onClick={() => handleCellClick(state.i, objectState.i, relation)}
                    >
                      {relation}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};
