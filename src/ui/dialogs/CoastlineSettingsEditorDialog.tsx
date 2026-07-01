import type React from "react";
import { useEffect, useRef } from "react";
import { COAST_PRESETS, coastlineSettingsActions, SLIDER_DEFS } from "../../controllers/coastline-editor";
import { useCoastlineEditorState } from "../../store/coastlineEditorState";

export const CoastlineSettingsEditorContent: React.FC = () => {
  const { enabled, settings } = useCoastlineEditorState();

  const roughnessCanvasRef = useRef<HTMLCanvasElement>(null);
  const shapePreviewCanvasRef = useRef<HTMLCanvasElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger preview updates when settings change
  useEffect(() => {
    if (roughnessCanvasRef.current && shapePreviewCanvasRef.current) {
      coastlineSettingsActions.updatePreviews(roughnessCanvasRef.current, shapePreviewCanvasRef.current);
    }
  }, [enabled, settings]);

  return (
    <>
      <div className="-coastline-settings-editor-dialog__display-flex--justify-content-space-between--gap-1">
        <label
          className="-coastline-settings-editor-dialog__display-flex--align-items-center--gap-8px--cursor-"
          data-tip="Enable or disable coastline fractalization. When disabled, coastlines are simple arcs between feature vertices. Enabling adds naturalistic roughness but can increase rendering time, especially at high detail levels."
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => coastlineSettingsActions.toggleEnabled(e.target.checked)}
            className="-coastline-settings-editor-dialog__position-absolute--opacity-0--pointer-events-none-"
          />
          <span
            style={{
              position: "relative",
              display: "inline-block",
              width: "36px",
              height: "20px",
              borderRadius: "10px",
              background: enabled ? "#33bb88" : "#bbb",
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: enabled ? "18px" : "2px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.3)"
              }}
            ></span>
          </span>
        </label>
        <div className="-coastline-settings-editor-dialog__display-flex--align-items-center--gap-4px">
          <span className="-coastline-settings-editor-dialog__color-999--font-size-85em">Preset</span>
          {Object.keys(COAST_PRESETS).map(name => (
            <button
              type="button"
              key={name}
              disabled={!enabled}
              className="-coastline-settings-editor-dialog__font-size-78em--padding-2px-8px"
              onClick={() => coastlineSettingsActions.applyPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? "auto" : "none" }}>
        <table className="-coastline-settings-editor-dialog__border-collapse-collapse--width-100">
          <tbody>
            {SLIDER_DEFS.map(({ id, label, tip, min, max, step, key }) => {
              const value = settings[key];
              return (
                <tr key={id} data-tip={tip}>
                  <td className="-coastline-settings-editor-dialog__padding-2px-0--white-space-nowrap">{label}</td>
                  <td className="-coastline-settings-editor-dialog__padding-2px-4px">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      className="-coastline-settings-editor-dialog__width-160px--vertical-align-middle"
                      onChange={e => coastlineSettingsActions.changeSetting(key, Number(e.target.value))}
                    />
                  </td>
                  <td className="-coastline-settings-editor-dialog__padding-2px-6px--min-width-2em--text-align-right">
                    <span className="-coastline-settings-editor-dialog__font-family-monospace--font-size-85em">
                      {value}
                    </span>
                  </td>
                  <td className="-coastline-settings-editor-dialog__padding-2px-0">
                    <button
                      type="button"
                      title="Reset to default"
                      className="-coastline-settings-editor-dialog__font-size-75em--padding-1px-5px--cursor-pointer"
                      onClick={() => coastlineSettingsActions.resetSetting(key)}
                    >
                      ↺
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="-coastline-settings-editor-dialog__display-flex--gap-6px--margin-top-10px--align-item">
        <div className="-coastline-settings-editor-dialog__flex-1--min-width-0">
          <div className="-coastline-settings-editor-dialog__color-999--font-size-85em--margin-bottom-3px">
            Roughness profile
          </div>
          <canvas
            ref={roughnessCanvasRef}
            width="auto"
            height="100"
            className="-coastline-settings-editor-dialog__display-block"
          ></canvas>
        </div>
        <div>
          <div className="-coastline-settings-editor-dialog__color-999--font-size-85em--margin-bottom-3px">
            Shape preview
          </div>
          <canvas
            ref={shapePreviewCanvasRef}
            width="100"
            height="100"
            className="-coastline-settings-editor-dialog__display-block"
          ></canvas>
        </div>
      </div>
    </>
  );
};
