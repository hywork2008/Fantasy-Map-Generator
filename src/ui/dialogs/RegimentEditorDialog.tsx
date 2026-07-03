import type React from "react";
import { regimentEditorActions } from "../../controllers/regiment-editor";
import { useRegimentEditorState } from "../../store/regimentEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentEditorDialog: React.FC = () => {
  const { isOpen, mode, name, isNaval, icon, units } = useRegimentEditorState();

  if (!isOpen) return null;

  const isExternal = icon.startsWith("http") || icon.startsWith("data:image");
  const emblemContent = isExternal ? (
    <img src={icon} alt="emblem" />
  ) : (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted SVG content for regiment emblem
    <span dangerouslySetInnerHTML={{ __html: icon }} />
  );

  return (
    <Dialog isOpen={isOpen} title="Regiment Editor" onClose={() => closeDialog("regimentEditor")}>
      <div id="regimentBody">
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

        <div data-tip="Regiment emblem" className="d-flex">
          <div className="label">Emblem:</div>
          <div id="regimentEmblem">{emblemContent}</div>
          <button type="button" onClick={regimentEditorActions.changeEmblem}>
            change
          </button>
        </div>

        <div id="regimentComposition" className="table">
          {units.map(({ name: unitName, type, count }) => (
            <div key={unitName} data-tip={`${capitalize(unitName)} number. Input to change`}>
              <div className="label">{capitalize(unitName)}:</div>
              <input
                type="number"
                min={0}
                step={1}
                value={count}
                onChange={e => regimentEditorActions.changeUnit(unitName, +e.currentTarget.value || 0)}
              />
              <i>{type}</i>
            </div>
          ))}
        </div>
      </div>

      <div id="regimentFooter">
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
    </Dialog>
  );
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
