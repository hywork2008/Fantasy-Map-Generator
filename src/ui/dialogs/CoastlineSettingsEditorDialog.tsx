import type React from "react";
import { useEffect, useRef } from "react";
import { COAST_PRESETS, coastlineSettingsActions, SLIDER_DEFS } from "../../controllers/coastline-editor";
import { useCoastlineEditorState } from "../../store/coastlineEditorState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CoastlineSettingsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("coastlineSettingsDialog"));
  const { enabled, settings } = useCoastlineEditorState();

  const roughnessCanvasRef = useRef<HTMLCanvasElement>(null);
  const shapePreviewCanvasRef = useRef<HTMLCanvasElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger preview updates when settings change
  useEffect(() => {
    if (isOpen && roughnessCanvasRef.current && shapePreviewCanvasRef.current) {
      coastlineSettingsActions.updatePreviews(roughnessCanvasRef.current, shapePreviewCanvasRef.current);
    }
  }, [isOpen, enabled, settings]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Coastline Settings Editor"
      onClose={() => closeDialog("coastlineSettingsDialog")}
      style={{ width: "auto" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "8px",
          paddingBottom: "8px",
          borderBottom: "1px solid #ddd"
        }}
      >
        <label
          style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}
          data-tip="Enable or disable coastline fractalization. When disabled, coastlines are simple arcs between feature vertices. Enabling adds naturalistic roughness but can increase rendering time, especially at high detail levels."
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => coastlineSettingsActions.toggleEnabled(e.target.checked)}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
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
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: "#999", fontSize: ".85em" }}>Preset</span>
          {Object.keys(COAST_PRESETS).map(name => (
            <button
              type="button"
              key={name}
              disabled={!enabled}
              style={{ fontSize: ".78em", padding: "2px 8px" }}
              onClick={() => coastlineSettingsActions.applyPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? "auto" : "none" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {SLIDER_DEFS.map(({ id, label, tip, min, max, step, key }) => {
              const value = settings[key];
              return (
                <tr key={id} data-tip={tip}>
                  <td style={{ padding: "2px 0", whiteSpace: "nowrap" }}>{label}</td>
                  <td style={{ padding: "2px 4px" }}>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      style={{ width: "160px", verticalAlign: "middle" }}
                      onChange={e => coastlineSettingsActions.changeSetting(key, Number(e.target.value))}
                    />
                  </td>
                  <td style={{ padding: "2px 6px", minWidth: "2em", textAlign: "right" }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".85em" }}>{value}</span>
                  </td>
                  <td style={{ padding: "2px 0" }}>
                    <button
                      type="button"
                      title="Reset to default"
                      style={{ fontSize: ".75em", padding: "1px 5px", cursor: "pointer" }}
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
      <div style={{ display: "flex", gap: "6px", marginTop: "10px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#999", fontSize: ".85em", marginBottom: "3px" }}>Roughness profile</div>
          <canvas ref={roughnessCanvasRef} width="auto" height="100" style={{ display: "block" }}></canvas>
        </div>
        <div>
          <div style={{ color: "#999", fontSize: ".85em", marginBottom: "3px" }}>Shape preview</div>
          <canvas ref={shapePreviewCanvasRef} width="100" height="100" style={{ display: "block" }}></canvas>
        </div>
      </div>
    </Dialog>
  );
};
