import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { simulationContext } from "../../context/simulationContext";
import { regimentEditorActions } from "../../controllers/regiment-editor";
import { tip } from "../../services/tooltipService";
import { useRegimentEditorState } from "../../store/regimentEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, mode, name, isNaval, icon, units, stateId, regimentId } = useRegimentEditorState();
  const [activeTab, setActiveTab] = useState<"general" | "strategic">("general");

  const handleCopyIds = () => {
    const codeSnippet = `\`window.fmg.world.pack.states[${stateId}].military.find(r => r.i === ${regimentId})\``;
    navigator.clipboard.writeText(codeSnippet);
    tip("Copied to clipboard", true, "success", 2000);
  };

  if (!isOpen) return null;

  const isExternal = icon.startsWith("http") || icon.startsWith("data:image");
  const emblemContent = isExternal ? (
    <img src={icon} alt="emblem" />
  ) : (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted SVG content for regiment emblem
    <span dangerouslySetInnerHTML={{ __html: icon }} />
  );

  const strategicGoals = stateId != null ? (simulationContext.strategicGoals?.[stateId] ?? []) : [];

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.regimentEditor")}
      onClose={() => closeDialog("regimentEditor")}
      className="overflow-hidden"
    >
      <div id="regimentEditorContainer">
        <div className="header" style={{ display: "flex", gap: "8px", padding: "4px", backgroundColor: "#eee" }}>
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={activeTab === "general" ? "pressed" : ""}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("strategic")}
            className={activeTab === "strategic" ? "pressed" : ""}
          >
            Strategic Goals
          </button>
        </div>

        {activeTab === "general" && (
          <div id="regimentBody" className="table" style={{ padding: "8px" }}>
            <div>
              <button
                type="button"
                className={isNaval ? "icon-anchor" : "icon-users"}
                data-tip="Regiment type (land or naval). Click to change"
                onClick={regimentEditorActions.changeType}
              />
              <input
                id="regimentName"
                value={name}
                data-tip="Type to rename the regiment"
                autoCorrect="off"
                spellCheck={false}
                onChange={e => regimentEditorActions.changeName(e.currentTarget.value)}
              />
              <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                🔊
              </span>
              <i
                data-tip="Click to restore regiment's default name"
                className="icon-ccw pointer"
                onClick={regimentEditorActions.restoreName}
              />
            </div>

            <div
              data-tip="Internal IDs to find in window.fmg.world.pack.states[stateId].military"
              className="d-flex"
              style={{ fontSize: "0.8em", color: "gray", marginTop: "4px", marginBottom: "4px" }}
            >
              <div className="label">IDs:</div>
              <div>
                State: {stateId}, Regiment: {regimentId}
              </div>
              <i
                data-tip="Copy the path to this regiment to clipboard (for AI)"
                className="icon-docs pointer"
                style={{ marginLeft: "6px" }}
                onClick={handleCopyIds}
              />
            </div>

            <div data-tip="Regiment emblem" className="d-flex">
              <div className="label">Emblem:</div>
              <div id="regimentEmblem">{emblemContent}</div>
              <button type="button" onClick={regimentEditorActions.changeEmblem}>
                change
              </button>
            </div>

            <div id="regimentComposition" style={{ marginTop: "8px" }}>
              {units.map(({ name: unitName, type, count }) => (
                <div key={unitName} data-tip={`${capitalize(unitName)} number. Input to change`} className="d-flex">
                  <div className="label">{capitalize(unitName)}:</div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={count}
                    onChange={e => regimentEditorActions.changeUnit(unitName, +e.currentTarget.value || 0)}
                  />
                  <i style={{ marginLeft: "4px" }}>{type}</i>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "strategic" && (
          <div className="table" style={{ flex: 1, overflowY: "auto" }}>
            <table className="fmg-table">
              <thead>
                <tr>
                  <th>Target State</th>
                  <th>Target Burg</th>
                  <th>Type</th>
                  <th>Tension</th>
                  <th>Casualties</th>
                </tr>
              </thead>
              <tbody>
                {strategicGoals.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "8px" }}>
                      No strategic goals
                    </td>
                  </tr>
                ) : (
                  strategicGoals.map(g => (
                    <tr key={`${g.targetState}-${g.targetBurg}-${g.type}`}>
                      <td>{g.targetState}</td>
                      <td>{g.targetBurg}</td>
                      <td>{g.type}</td>
                      <td>{g.tension}</td>
                      <td>{g.expectedCasualties}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div id="regimentFooter" className="footer">
          <button
            type="button"
            data-tip="Attack foreign regiment"
            className={`icon-target ${mode === "attacking" ? "pressed" : ""}`}
            onClick={regimentEditorActions.toggleAttack}
          />
          <button
            type="button"
            data-tip="Create a new regiment or fleet"
            className={`icon-user-plus ${mode === "adding" ? "pressed" : ""}`}
            onClick={regimentEditorActions.toggleAdd}
          />
          <button
            type="button"
            data-tip="Split regiment into 2 separate ones"
            className="icon-half"
            onClick={regimentEditorActions.splitRegiment}
          />
          <button
            data-tip="Attach regiment to another one (include this regiment to another one)"
            className={`icon-attach ${mode === "attaching" ? "pressed" : ""}`}
            type="button"
            onClick={regimentEditorActions.toggleAttach}
          />
          <button
            data-tip="Regenerate legend for this regiment"
            className="icon-retweet"
            type="button"
            onClick={regimentEditorActions.regenerateLegend}
          />
          <button
            data-tip="Edit free text notes (legend) for this regiment"
            className="icon-edit"
            type="button"
            onClick={regimentEditorActions.editLegend}
          />
          <button
            data-tip="Remove regiment"
            data-shortcut="Delete"
            className="icon-trash fastDelete"
            type="button"
            onClick={regimentEditorActions.removeRegiment}
          />
        </div>
      </div>
    </Dialog>
  );
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
