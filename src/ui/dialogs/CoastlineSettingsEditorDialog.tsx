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
      <div className="d-flex">
        <label
          className="-coastline-settings-editor-dialog__display-flex--align-items-center--gap-8px--cursor- d-flex"
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
              background: enabled ? "#33bb88" : "#bbb",
              cursor: "pointer"
            }}
          >
            <span style={{ position: "absolute", top: "2px", left: enabled ? "18px" : "2px" }}></span>
          </span>
        </label>
        <div className="d-flex">
          <span>Preset</span>
          {Object.keys(COAST_PRESETS).map(name => (
            <button
              type="button"
              key={name}
              disabled={!enabled}
              onClick={() => coastlineSettingsActions.applyPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? "auto" : "none" }}>
        <table>
          <tbody>
            {SLIDER_DEFS.map(({ id, label, tip, min, max, step, key }) => {
              const value = settings[key];
              return (
                <tr key={id} data-tip={tip}>
                  <td className="--white-space-nowrap">{label}</td>
                  <td>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      onChange={e => coastlineSettingsActions.changeSetting(key, Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <span>{value}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      title="Reset to default"
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
      <div className="d-flex">
        <div>
          <div>Roughness profile</div>
          <canvas ref={roughnessCanvasRef} width="auto" height="100" className="d-block"></canvas>
        </div>
        <div>
          <div>Shape preview</div>
          <canvas ref={shapePreviewCanvasRef} width="100" height="100" className="d-block"></canvas>
        </div>
      </div>
    </>
  );
};
