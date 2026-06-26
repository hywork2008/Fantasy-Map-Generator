import type React from "react";
import { reliefEditorActions } from "../../controllers/relief-editor";
import type { ReliefIconSet } from "../../store/reliefEditorState";
import { useReliefEditorState } from "../../store/reliefEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

interface IconDef {
  type: string;
  tip: string;
  x?: string;
  y?: string;
  width: number;
  height: number;
}

const STD = { width: 40, height: 40 } as const;
const TREE = { x: "-25%", y: "-25%", width: 60, height: 60 } as const;

const ICON_SETS: Record<ReliefIconSet, IconDef[]> = {
  simple: [
    { type: "#relief-mount-1", tip: "Mountain", ...STD },
    { type: "#relief-hill-1", tip: "Hill", ...STD },
    { type: "#relief-deciduous-1", tip: "Deciduous Tree", ...TREE },
    { type: "#relief-conifer-1", tip: "Conifer Tree", ...TREE },
    { type: "#relief-palm-1", tip: "Palm", ...TREE },
    { type: "#relief-acacia-1", tip: "Acacia", ...TREE },
    { type: "#relief-swamp-1", tip: "Swamp", x: "-50%", y: "-50%", width: 80, height: 80 },
    { type: "#relief-grass-1", tip: "Grass", x: "-100%", y: "-100%", width: 120, height: 120 },
    { type: "#relief-dune-1", tip: "Dune", ...TREE }
  ],
  colored: [
    { type: "#relief-mount-2", tip: "Mountain", ...STD },
    { type: "#relief-mount-3", tip: "Mountain", ...STD },
    { type: "#relief-mount-4", tip: "Mountain", ...STD },
    { type: "#relief-mount-5", tip: "Mountain", ...STD },
    { type: "#relief-mount-6", tip: "Mountain", ...STD },
    { type: "#relief-mount-7", tip: "Mountain", ...STD },
    { type: "#relief-mountSnow-1", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-2", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-3", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-4", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-5", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-6", tip: "Snow Mountain", ...STD },
    { type: "#relief-vulcan-1", tip: "Volcano", ...STD },
    { type: "#relief-vulcan-2", tip: "Volcano", ...STD },
    { type: "#relief-vulcan-3", tip: "Volcano", ...STD },
    { type: "#relief-hill-2", tip: "Hill", ...STD },
    { type: "#relief-hill-3", tip: "Hill", ...STD },
    { type: "#relief-hill-4", tip: "Hill", ...STD },
    { type: "#relief-hill-5", tip: "Hill", ...STD },
    { type: "#relief-dune-2", tip: "Dune", ...STD },
    { type: "#relief-deciduous-2", tip: "Deciduous Tree", ...TREE },
    { type: "#relief-deciduous-3", tip: "Deciduous Tree", ...TREE },
    { type: "#relief-conifer-2", tip: "Conifer Tree", ...TREE },
    { type: "#relief-coniferSnow-1", tip: "Snow Conifer Tree", ...TREE },
    { type: "#relief-acacia-2", tip: "Acacia", ...TREE },
    { type: "#relief-palm-2", tip: "Palm", ...TREE },
    { type: "#relief-grass-2", tip: "Grass", ...TREE },
    { type: "#relief-swamp-2", tip: "Swamp", ...TREE },
    { type: "#relief-swamp-3", tip: "Swamp", ...TREE },
    { type: "#relief-cactus-1", tip: "Cactus", ...TREE },
    { type: "#relief-cactus-2", tip: "Cactus", ...TREE },
    { type: "#relief-cactus-3", tip: "Cactus", ...TREE },
    { type: "#relief-deadTree-1", tip: "Dead Tree", ...TREE },
    { type: "#relief-deadTree-2", tip: "Dead Tree", ...TREE }
  ],
  gray: [
    { type: "#relief-mount-2-bw", tip: "Mountain", ...STD },
    { type: "#relief-mount-3-bw", tip: "Mountain", ...STD },
    { type: "#relief-mount-4-bw", tip: "Mountain", ...STD },
    { type: "#relief-mount-5-bw", tip: "Mountain", ...STD },
    { type: "#relief-mount-6-bw", tip: "Mountain", ...STD },
    { type: "#relief-mount-7-bw", tip: "Mountain", ...STD },
    { type: "#relief-mountSnow-1-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-2-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-3-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-4-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-5-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-mountSnow-6-bw", tip: "Snow Mountain", ...STD },
    { type: "#relief-vulcan-1-bw", tip: "Volcano", ...STD },
    { type: "#relief-vulcan-2-bw", tip: "Volcano", ...STD },
    { type: "#relief-vulcan-3-bw", tip: "Volcano", ...STD },
    { type: "#relief-hill-2-bw", tip: "Hill", ...STD },
    { type: "#relief-hill-3-bw", tip: "Hill", ...STD },
    { type: "#relief-hill-4-bw", tip: "Hill", ...STD },
    { type: "#relief-hill-5-bw", tip: "Hill", ...STD },
    { type: "#relief-dune-2-bw", tip: "Dune", ...STD },
    { type: "#relief-deciduous-2-bw", tip: "Deciduous Tree", ...TREE },
    { type: "#relief-deciduous-3-bw", tip: "Deciduous Tree", ...TREE },
    { type: "#relief-conifer-2-bw", tip: "Conifer Tree", ...TREE },
    { type: "#relief-coniferSnow-1-bw", tip: "Snow Conifer Tree", ...TREE },
    { type: "#relief-acacia-2-bw", tip: "Acacia", ...TREE },
    { type: "#relief-palm-2-bw", tip: "Palm", ...TREE },
    { type: "#relief-grass-2-bw", tip: "Grass", ...TREE },
    { type: "#relief-swamp-2-bw", tip: "Swamp", ...TREE },
    { type: "#relief-swamp-3-bw", tip: "Swamp", ...TREE },
    { type: "#relief-cactus-1-bw", tip: "Cactus", ...TREE },
    { type: "#relief-cactus-2-bw", tip: "Cactus", ...TREE },
    { type: "#relief-cactus-3-bw", tip: "Cactus", ...TREE },
    { type: "#relief-deadTree-1-bw", tip: "Dead Tree", ...TREE },
    { type: "#relief-deadTree-2-bw", tip: "Dead Tree", ...TREE }
  ]
};

export const ReliefEditorDialog: React.FC = () => {
  const { isOpen, mode, iconSet, size, radius, spacing, selectedIconType } = useReliefEditorState();

  if (!isOpen) return null;

  const icons = ICON_SETS[iconSet];

  return (
    <Dialog isOpen={isOpen} title="Relief Editor" onClose={() => closeDialog("reliefEditor")}>
      <div data-tip="Select mode of operation">
        <div className="reliefEditorLabel">Mode:</div>
        <button
          type="button"
          data-tip="Edit individual selected icon"
          className={`icon-info ${mode === "individual" ? "pressed" : ""}`}
          onClick={reliefEditorActions.enterIndividualMode}
        />
        <button
          type="button"
          data-tip="Place icons in a bulk"
          className={`icon-brush ${mode === "bulkAdd" ? "pressed" : ""}`}
          onClick={reliefEditorActions.enterBulkAddMode}
        />
        <button
          type="button"
          data-tip="Remove icons in a bulk"
          className={`icon-eraser ${mode === "bulkRemove" ? "pressed" : ""}`}
          onClick={reliefEditorActions.enterBulkRemoveMode}
        />

        <div style={{ marginLeft: "4.6em" }}>Set:</div>
        <select
          value={iconSet}
          onChange={e => reliefEditorActions.changeIconSet(e.currentTarget.value as ReliefIconSet)}
        >
          <option value="simple">Simple</option>
          <option value="colored">Colored</option>
          <option value="gray">Gray</option>
        </select>
      </div>

      {mode !== "bulkRemove" && (
        <div data-tip="Set icon size for individual icon or for bulk placement">
          <div className="reliefEditorLabel">Size:</div>
          <input
            type="range"
            min="2"
            max="50"
            value={size}
            onChange={e => reliefEditorActions.changeIconSize(+e.currentTarget.value)}
          />
          <input
            type="number"
            min="2"
            value={size}
            onChange={e => reliefEditorActions.changeIconSize(+e.currentTarget.value)}
          />
        </div>
      )}

      {mode !== "individual" && (
        <div data-tip="Set brush radius for icons placement or deletion">
          <div className="reliefEditorLabel">Radius:</div>
          <input
            type="range"
            min="1"
            max="100"
            value={radius}
            onChange={e => reliefEditorActions.changeRadius(+e.currentTarget.value)}
          />
          <input
            type="number"
            min="1"
            value={radius}
            onChange={e => reliefEditorActions.changeRadius(+e.currentTarget.value)}
          />
        </div>
      )}

      {mode === "bulkAdd" && (
        <div data-tip="Set spacing between relief icons">
          <div className="reliefEditorLabel">Spacing:</div>
          <input
            type="range"
            min="2"
            max="20"
            value={spacing}
            onChange={e => reliefEditorActions.changeSpacing(+e.currentTarget.value)}
          />
          <input
            type="number"
            min="2"
            value={spacing}
            onChange={e => reliefEditorActions.changeSpacing(+e.currentTarget.value)}
          />
        </div>
      )}

      <div id="reliefIconsDiv" data-tip="Select icon">
        {icons.map(({ type, tip: tipText, x, y, width, height }) => (
          <svg
            key={type}
            data-type={type}
            data-tip={`Select ${tipText} icon`}
            aria-hidden="true"
            className={selectedIconType === type ? "pressed" : undefined}
            onClick={() => reliefEditorActions.changeIcon(type)}
          >
            <use href={type} x={x} y={y} width={width} height={height} />
          </svg>
        ))}

        {mode === "bulkRemove" && (
          <svg
            id="reliefIconsSeletionAny"
            data-tip="Select any type of icons"
            aria-hidden="true"
            className={selectedIconType === null ? "pressed" : undefined}
            onClick={reliefEditorActions.selectAnyIcon}
          >
            <text x="50%" y="50%">
              Any
            </text>
          </svg>
        )}
      </div>

      <div id="reliefFooter">
        <button
          type="button"
          data-tip="Edit Relief Icons style in Style Editor"
          className="icon-adjust"
          onClick={reliefEditorActions.editStyle}
        />
        <button
          type="button"
          data-tip="Copy selected relief icon"
          className="icon-clone"
          onClick={reliefEditorActions.copyIcon}
        />
        <button
          type="button"
          data-tip="Move selected relief icon to front"
          className="icon-level-up"
          onClick={reliefEditorActions.moveIconFront}
        />
        <button
          type="button"
          data-tip="Move selected relief icon back"
          className="icon-level-down"
          onClick={reliefEditorActions.moveIconBack}
        />
        <button
          data-tip="Remove selected relief icon or icon type"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
          onClick={reliefEditorActions.removeIcon}
        />
      </div>
    </Dialog>
  );
};
