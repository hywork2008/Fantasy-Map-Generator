import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cellsDensityMap, getCellsDensityColor } from "../../controllers/options";
import { applyTransformMap, getTransformPreviewDims, loadTransformPreview } from "../../controllers/transform-tool";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { rn } from "../../utils";
import { Dialog } from "./Dialog";
import { closeAllDialogs, closeDialog } from "./dialogService";

const EXP = 1.0965;

export const TransformToolDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("transformTool"));
  const defaultPoints = useOptionsState(state => state.points);

  const [angleDeg, setAngleDeg] = useState(0);
  const [scaleInput, setScaleInput] = useState(0);
  const [shiftX, setShiftX] = useState(0);
  const [shiftY, setShiftY] = useState(0);
  const [mirrorH, setMirrorH] = useState(false);
  const [mirrorV, setMirrorV] = useState(false);
  const [pointsInput, setPointsInput] = useState(defaultPoints);

  const [previewDims, setPreviewDims] = useState({ previewWidth: 400, previewHeight: 200, previewScale: 1 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseStateRef = useRef({ isDown: false, mouseX: 0, mouseY: 0 });

  const scaleVal = rn(EXP ** scaleInput, 2);
  const cells = cellsDensityMap[pointsInput] ?? 10000;
  const cellsColor = getCellsDensityColor(cells);

  // Reset state and load preview when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const dims = getTransformPreviewDims();
    setPreviewDims(dims);

    setAngleDeg(0);
    setScaleInput(0);
    setShiftX(0);
    setShiftY(0);
    setMirrorH(false);
    setMirrorV(false);
    setPointsInput(defaultPoints);

    loadTransformPreview().then(url => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const SCALE = 4;
        canvas.width = dims.previewWidth * SCALE;
        canvas.height = dims.previewHeight * SCALE;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
    });
  }, [isOpen, defaultPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  const canvasTransform = `
    translate(${shiftX * previewDims.previewScale}px, ${shiftY * previewDims.previewScale}px)
    scale(${mirrorH ? -scaleVal : scaleVal}, ${mirrorV ? -scaleVal : scaleVal})
    rotate(${(angleDeg / 180) * Math.PI}rad)
  `.trim();

  function handlePreviewMouseDown(e: React.MouseEvent) {
    const state = mouseStateRef.current;
    state.isDown = true;
    state.mouseX = shiftX - e.clientX / previewDims.previewScale;
    state.mouseY = shiftY - e.clientY / previewDims.previewScale;
  }

  function handlePreviewMouseUp() {
    mouseStateRef.current.isDown = false;
  }

  function handlePreviewMouseMove(e: React.MouseEvent) {
    const state = mouseStateRef.current;
    if (!state.isDown) return;
    e.preventDefault();
    setShiftX(Math.round(state.mouseX + e.clientX / previewDims.previewScale));
    setShiftY(Math.round(state.mouseY + e.clientY / previewDims.previewScale));
  }

  function handlePreviewWheel(e: React.WheelEvent) {
    setScaleInput(v => v - Math.sign(e.deltaY));
  }

  function handleTransform() {
    closeAllDialogs();
    applyTransformMap({ angleDeg, scaleVal, shiftX, shiftY, mirrorH, mirrorV }, pointsInput);
  }

  return (
    <Dialog
      isOpen={isOpen}
      title="Transform Tool"
      onClose={() => closeDialog("transformTool")}
      buttons={[
        { label: "Transform", onClick: handleTransform },
        { label: "Cancel", onClick: () => closeDialog("transformTool") }
      ]}
    >
      <div>
        This operation is destructive and irreversible. It will create a completely new map based on the current one.
        Don't forget to save the .map file to your machine first!
      </div>

      <div style={{ display: "grid" }}>
        <div>Points number</div>
        <div>
          <input
            type="range"
            min="1"
            max="13"
            value={pointsInput}
            onChange={e => setPointsInput(Number(e.target.value))}
          />
          <output style={{ color: cellsColor }}>{cells / 1000}K</output>
        </div>

        <div>Shift</div>
        <div>
          <label>
            X: <input type="number" size={4} value={shiftX} onChange={e => setShiftX(Number(e.target.value))} />
          </label>
          <label>
            Y: <input type="number" size={4} value={shiftY} onChange={e => setShiftY(Number(e.target.value))} />
          </label>
        </div>

        <div>Rotate</div>
        <div>
          <input type="range" min="0" max="359" value={angleDeg} onChange={e => setAngleDeg(Number(e.target.value))} />
          <output>{angleDeg}°</output>
        </div>

        <div>Scale</div>
        <div>
          <input
            type="range"
            min="-25"
            max="25"
            value={scaleInput}
            onChange={e => setScaleInput(Number(e.target.value))}
          />
          <output>{scaleVal}x</output>
        </div>

        <div>Mirror</div>
        <div className="d-flex">
          <input
            type="checkbox"
            className="checkbox"
            id="transformMirrorH"
            checked={mirrorH}
            onChange={e => setMirrorH(e.target.checked)}
          />
          <label htmlFor="transformMirrorH" className="checkbox-label">
            horizontally
          </label>
          <input
            type="checkbox"
            className="checkbox"
            id="transformMirrorV"
            checked={mirrorV}
            onChange={e => setMirrorV(e.target.checked)}
          />
          <label htmlFor="transformMirrorV" className="checkbox-label">
            vertically
          </label>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: `${previewDims.previewWidth}px`,
          height: `${previewDims.previewHeight}px`
        }}
        onMouseDown={handlePreviewMouseDown}
        onMouseUp={handlePreviewMouseUp}
        onMouseMove={handlePreviewMouseMove}
        onWheel={handlePreviewWheel}
      >
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            width: `${previewDims.previewWidth}px`,
            height: `${previewDims.previewHeight}px`,
            transform: canvasTransform
          }}
        />
      </div>
    </Dialog>
  );
};
