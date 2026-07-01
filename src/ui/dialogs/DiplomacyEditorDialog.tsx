import type React from "react";
import { diplomacyEditorActions } from "../../controllers/diplomacy-editor";
import { useDiplomacyEditorState } from "../../store/diplomacyEditorState";
import { FillBox } from "../components/FillBox";

export const DiplomacyEditorContent: React.FC = () => {
  const { states, selectedStateId } = useDiplomacyEditorState();

  const handleStateClick = (stateId: number) => {
    diplomacyEditorActions.selectState(stateId);
  };

  const handleRelationClick = (subjectId: number, objectId: number, currentRelation: string) => {
    diplomacyEditorActions.selectRelation(subjectId, objectId, currentRelation);
  };

  const handleMouseEnter = (stateId: number) => {
    diplomacyEditorActions.stateHighlightOn(stateId);
  };

  const handleMouseLeave = () => {
    diplomacyEditorActions.stateHighlightOff();
  };

  return (
    <div id="diplomacyEditorContainer">
      <div id="diplomacyHeader" className="header -diplomacy-editor-dialog__grid-template-columns-15em-6em">
        <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="name">
          State&nbsp;
        </div>
        <div
          data-tip="Click to sort by diplomatical relations"
          className="sortable alphabetically"
          data-sortby="relations"
        >
          Relations&nbsp;
        </div>
      </div>
      <div id="diplomacyBodySection" className="table">
        {states.map(s => {
          const isSelf = s.i === selectedStateId;
          if (isSelf) {
            return (
              <div key={s.i} className="states Self" data-id={s.i} data-tip={`List below shows relations to ${s.name}`}>
                <div className="-diplomacy-editor-dialog__width-max-content">{s.fullName}</div>
                <svg className="coaIcon" viewBox="0 0 200 200">
                  <title>Coat of Arms for {s.fullName || s.name}</title>
                  <use href={`#stateCOA${s.i}`} />
                </svg>
              </div>
            );
          }

          const tipText = `${s.name} ${s.inText} ${states.find(st => st.i === selectedStateId)?.name}`;
          const tipSelect = `${tipText}. Click to see relations to ${s.name}`;
          const tipChange = `Click to change relations. ${tipText}`;

          return (
            <div
              key={s.i}
              className="states"
              data-id={s.i}
              data-name={s.name}
              data-relations={s.relation}
              onClick={() => handleStateClick(s.i)}
              onMouseEnter={() => handleMouseEnter(s.i)}
              onMouseLeave={handleMouseLeave}
            >
              <svg data-tip={tipSelect} className="coaIcon" viewBox="0 0 200 200">
                <title>Coat of Arms for {s.fullName || s.name}</title>
                <use href={`#stateCOA${s.i}`} />
              </svg>
              <div data-tip={tipSelect} className="-diplomacy-editor-dialog__width-12em">
                {s.name}
              </div>
              <div
                data-tip={tipChange}
                className="changeRelations -diplomacy-editor-dialog__width-6em"
                onClick={e => {
                  e.stopPropagation();
                  handleRelationClick(s.i, selectedStateId, s.relation);
                }}
              >
                <FillBox fill={s.color} size=".9em" />
                {s.relation}
              </div>
            </div>
          );
        })}
      </div>
      <div className="info-line">
        Click on state name to see relations.
        <br />
        Click on relations name to change it
      </div>
      <div id="diplomacyFooter" className="fmg-dialog-footer" style={{ marginTop: "0.1em" }}>
        <button
          type="button"
          id="diplomacyEditorRefresh"
          data-tip="Refresh the Editor"
          className="icon-cw"
          onClick={diplomacyEditorActions.refreshDiplomacyEditor}
        />
        <button
          type="button"
          id="diplomacyEditStyle"
          data-tip="Edit states (including diplomacy view) style in Style Editor"
          className="icon-adjust"
          onClick={() => diplomacyEditorActions.editStyle("regions")}
        />
        <button
          type="button"
          id="diplomacyRegenerate"
          data-tip="Regenerate diplomatical relations"
          className="icon-retweet"
          onClick={diplomacyEditorActions.regenerateRelations}
        />
        <button
          type="button"
          id="diplomacyReset"
          data-tip="Reset diplomatical relations of selected state to Neutral"
          className="icon-eraser"
          onClick={diplomacyEditorActions.resetRelations}
        />
        <button
          type="button"
          id="diplomacyHistory"
          data-tip="Show relations history"
          className="icon-hourglass-1"
          onClick={diplomacyEditorActions.showRelationsHistory}
        />
        <button
          type="button"
          id="diplomacyShowMatrix"
          data-tip="Show relations matrix"
          className="icon-list-bullet"
          onClick={diplomacyEditorActions.openMatrix}
        />
        <button
          type="button"
          id="diplomacyExport"
          data-tip="Save state relations matrix as a text file (.csv)"
          className="icon-download"
          onClick={diplomacyEditorActions.downloadDiplomacyData}
        />
      </div>
    </div>
  );
};
