import type React from "react";
import { useEffect, useRef } from "react";
import { diplomacyEditorActions } from "../../controllers/diplomacy-editor";
import { type ConflictStatus, useDiplomacyEditorState } from "../../store/diplomacyEditorState";
import { useOptionsState } from "../../store/optionsState";
import { si } from "../../utils";
import { IconButton } from "../components/IconButton";
import { VirtualTableBody } from "../components/VirtualTableBody";

const conflictStatusCopy: Record<ConflictStatus, { label: string; tip: string; color: string }> = {
  autonomous: {
    label: "Autonomous",
    tip: "This Enemy relationship may be advanced by the political AI.",
    color: "#4f6f52"
  },
  player: {
    label: "Player-directed",
    tip: "This conflict was explicitly authorized by the player and may advance during time simulation.",
    color: "#7656a6"
  },
  suspended: {
    label: "Suspended",
    tip: "Player-directed mode prevents this Enemy relationship from advancing until the player explicitly authorizes it.",
    color: "#9a6a20"
  },
  none: { label: "—", tip: "No active conflict", color: "#777777" }
};

const ConflictStatusBadge: React.FC<{ status: ConflictStatus }> = ({ status }) => {
  const { label, tip, color } = conflictStatusCopy[status];
  return (
    <span data-tip={tip} style={{ color, fontSize: "0.85em", fontWeight: 600, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
};

export const DiplomacyEditorContent: React.FC = () => {
  const { states, selectedStateId } = useDiplomacyEditorState();
  const conflictAutonomy = useOptionsState(s => s.conflictAutonomy);

  useEffect(() => {
    const refreshConflictStatuses = () => diplomacyEditorActions.refreshDiplomacyEditor();
    document.addEventListener("fmg:conflict-autonomy-changed", refreshConflictStatuses);
    return () => document.removeEventListener("fmg:conflict-autonomy-changed", refreshConflictStatuses);
  }, []);

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

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <div id="diplomacyEditorContainer">
      <div ref={parentRef} id="diplomacyBodySection" className="table">
        <table className="fmg-table">
          <thead>
            <tr id="diplomacyHeader">
              <th data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="name">
                State
              </th>
              <th
                data-tip="Click to sort by diplomatical relations"
                className="sortable alphabetically"
                data-sortby="relations"
              >
                Relations
              </th>
              <th data-tip="Click to sort by total military forces" className="sortable" data-sortby="totalForces">
                Total Forces
              </th>
              <th data-tip="Shows whether this state pair may advance a conflict as time passes">Conflict</th>
            </tr>
          </thead>
          <VirtualTableBody
            items={states}
            scrollElementRef={parentRef}
            renderRow={s => {
              const isSelf = s.i === selectedStateId;
              if (isSelf) {
                return (
                  <tr
                    key={s.i}
                    className="states Self"
                    data-id={s.i}
                    data-tip={`List below shows relations to ${s.name}`}
                  >
                    <td className="d-flex">
                      <div>{s.fullName}</div>
                      <svg className="coaIcon" viewBox="0 0 200 200">
                        <title>Coat of Arms for {s.fullName || s.name}</title>
                        <use href={`#stateCOA${s.i}`} />
                      </svg>
                    </td>
                    <td></td>
                    <td className="numeric">{si(s.totalForces)}</td>
                    <td>
                      <ConflictStatusBadge status="none" />
                    </td>
                  </tr>
                );
              }

              const tipText = `${s.name} ${s.inText} ${states.find(st => st.i === selectedStateId)?.name}`;
              const tipSelect = `${tipText}. Click to see relations to ${s.name}`;
              const tipChange = `Click to change relations. ${tipText}`;

              return (
                <tr
                  key={s.i}
                  className="states"
                  data-id={s.i}
                  data-name={s.name}
                  data-relations={s.relation}
                  data-totalforces={s.totalForces}
                  onClick={() => handleStateClick(s.i)}
                  onMouseEnter={() => handleMouseEnter(s.i)}
                  onMouseLeave={handleMouseLeave}
                >
                  <td className="d-flex">
                    <svg data-tip={tipSelect} className="coaIcon" viewBox="0 0 200 200">
                      <title>Coat of Arms for {s.fullName || s.name}</title>
                      <use href={`#stateCOA${s.i}`} />
                    </svg>
                    <div data-tip={tipSelect}>{s.name}</div>
                  </td>
                  <td>
                    <IconButton
                      data-tip={tipChange}
                      className="changeRelations d-flex"
                      onClick={e => {
                        e.stopPropagation();
                        handleRelationClick(s.i, selectedStateId, s.relation);
                      }}
                    >
                      <svg width=".9em" height=".9em" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <rect x={0} y={0} width="100%" height="100%" fill={s.color} stroke="#666666" strokeWidth={2} />
                      </svg>
                      {s.relation}
                    </IconButton>
                  </td>
                  <td className="numeric" data-tip={`${s.name} total military forces`}>
                    {si(s.totalForces)}
                  </td>
                  <td>
                    <ConflictStatusBadge status={s.conflictStatus} />
                  </td>
                </tr>
              );
            }}
          />
        </table>
      </div>
      <div className="info-line">
        Conflict policy: {conflictAutonomy === "autonomous" ? "Autonomous" : "Player-directed"}.{" "}
        {conflictAutonomy === "autonomous"
          ? "Rulers may advance eligible conflicts."
          : "Only explicitly authorized Enemy relationships advance."}
        <br />
        Click on state name to see relations.
        <br />
        Click on relations name to change it
      </div>
      <div id="diplomacyFooter" className="footer">
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
