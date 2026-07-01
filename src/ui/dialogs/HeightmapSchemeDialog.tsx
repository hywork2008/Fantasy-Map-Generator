import { interpolateRgb, interpolateRgbBasis, scaleSequential } from "d3";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { useDialogState } from "../../store/dialogState";
import { drawHeights, toHEX } from "../../utils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface HeightmapSchemeConfig {
  [key: string]: unknown;
  initialStops: string[];
  onConfirm: (stops: string) => void;
}

const DIALOG_ID = "heightmapScheme";

export const HeightmapSchemeDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as HeightmapSchemeConfig | undefined;
  const [stops, setStops] = useState<string[]>([]);
  const previewRef = useRef<HTMLImageElement>(null);

  // Reset stops when config changes
  const configRef = useRef<HeightmapSchemeConfig | undefined>(undefined);
  if (config !== configRef.current) {
    configRef.current = config;
    if (config) setStops([...config.initialStops]);
  }

  // Update preview when stops change
  useEffect(() => {
    if (!config || stops.length === 0 || !previewRef.current) return;
    const scheme = scaleSequential(interpolateRgbBasis(stops));
    const src = drawHeights({
      heights: Array.from(worldContext.grid.cells.h),
      width: worldContext.grid.cellsX,
      height: worldContext.grid.cellsY,
      scheme,
      renderOcean: false
    });
    previewRef.current.src = src;
  }, [stops, config]);

  const handleColorChange = useCallback((idx: number, value: string) => {
    setStops(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }, []);

  const handleRemoveStop = useCallback((idx: number) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddStop = useCallback((idx: number) => {
    setStops(prev => {
      const next = [...prev];
      const mid = toHEX(interpolateRgb(prev[idx], prev[idx + 1])(0.5));
      next.splice(idx + 1, 0, mid);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const joined = stops.join(",");
    config?.onConfirm(joined);
    closeDialog(DIALOG_ID);
  }, [config, stops]);

  const handleCancel = useCallback(() => closeDialog(DIALOG_ID), []);

  if (!config) return null;

  const gradient = `linear-gradient(to right, ${stops.join(",")})`;

  return (
    <Dialog
      isOpen={true}
      title="Create heightmap color scheme"
      onClose={handleCancel}
      buttons={[
        { label: "Create", onClick: handleConfirm },
        { label: "Cancel", onClick: handleCancel }
      ]}
    >
      <div>
        <i>Define heightmap gradient colors from high to low altitude</i>
        <img
          ref={previewRef}
          alt="heightmap preview"
          className="-heightmap-scheme-dialog__margin-top-0-5em--width-100--display-block"
        />
        <div className="-heightmap-scheme-dialog__margin-block-0-5em--display-flex--flex-wrap-wrap--align-items-center--gap-2px">
          {stops.map((stop, idx) => (
            <React.Fragment key={stop}>
              <input
                type="color"
                className="stop -heightmap-scheme-dialog__width-2-5em--border-none"
                value={stop}
                data-tip="Click to set the color"
                onChange={e => handleColorChange(idx, e.target.value)}
              />
              {idx > 0 && idx < stops.length - 1 && (
                <button
                  type="button"
                  className="remove -heightmap-scheme-dialog__margin-top-0-3em--height-max-content"
                  data-tip="Remove color stop"
                  onClick={() => handleRemoveStop(idx)}
                >
                  x
                </button>
              )}
              {idx < stops.length - 1 && (
                <button
                  type="button"
                  className="add -heightmap-scheme-dialog__margin-top-0-3em--height-max-content"
                  data-tip="Add color stop in between"
                  onClick={() => handleAddStop(idx)}
                >
                  +
                </button>
              )}
            </React.Fragment>
          ))}
        </div>
        <div style={{ height: "1.9em", border: "1px solid #767676", background: gradient }} />
      </div>
    </Dialog>
  );
};
