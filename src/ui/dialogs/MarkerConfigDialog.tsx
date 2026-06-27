import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { regenerateMarkers } from "../../controllers/tools";
import { Markers } from "../../generators/markers-generator";
import { useDialogState } from "../../store/dialogState";
import type { MarkerConfig } from "../../types/MarkerConfig";
import { EditorBus } from "../../utils/editorBus";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface MarkerConfigDialogTrigger {
  open: true;
}

type RowState = {
  type: string;
  icon: string;
  isExternal: boolean;
  multiplier: number;
};

const DIALOG_ID = "markerConfig";

function buildRows(config: MarkerConfig[]): RowState[] {
  return config.map(({ type, icon, multiplier }) => ({
    type,
    icon,
    multiplier,
    isExternal: icon.startsWith("http") || icon.startsWith("data:image")
  }));
}

function getMarkerCount(type: string): number {
  return worldContext.pack.markers.filter((m: { type: string }) => m.type === type).length;
}

export const MarkerConfigDialog: React.FC = () => {
  const isOpen = useDialogState(s => s.openDialogs.has(DIALOG_ID));
  const [rows, setRows] = useState<RowState[]>([]);
  const config = Markers.getConfig();

  useEffect(() => {
    if (isOpen) setRows(buildRows(config));
  }, [isOpen, config]);

  const handleIconChange = useCallback(
    (index: number) => {
      EditorBus.selectIcon(rows[index].icon, value => {
        const isExternal = value.startsWith("http") || value.startsWith("data:image");
        setRows(prev => prev.map((r, i) => (i === index ? { ...r, icon: value, isExternal } : r)));
      });
    },
    [rows]
  );

  const handleTypeChange = useCallback((index: number, value: string) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, type: value } : r)));
  }, []);

  const handleMultiplierChange = useCallback((index: number, value: number) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, multiplier: value } : r)));
  }, []);

  const applyChanges = useCallback(() => {
    const newConfig = config.map((markerType, index) => ({
      ...markerType,
      type: rows[index]?.type ?? markerType.type,
      icon: rows[index]?.icon ?? markerType.icon,
      multiplier: rows[index]?.multiplier ?? markerType.multiplier
    }));
    Markers.setConfig(newConfig);
  }, [config, rows]);

  const handleRegenerateAndRefresh = useCallback(() => {
    applyChanges();
    regenerateMarkers();
    const refreshedRows = buildRows(Markers.getConfig());
    setRows(refreshedRows);
  }, [applyChanges]);

  const handleClose = useCallback(() => {
    closeDialog(DIALOG_ID);
  }, []);

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={true}
      title="Markers generation settings"
      onClose={handleClose}
      buttons={[
        { label: "Regenerate", onClick: handleRegenerateAndRefresh },
        { label: "Close", onClick: handleClose }
      ]}
    >
      <table className="table">
        <thead style={{ fontWeight: "bold" }}>
          <tr>
            <td data-tip="Marker type name">Type</td>
            <td data-tip="Marker icon">Icon</td>
            <td data-tip="Marker number multiplier">Multiplier</td>
            <td data-tip="Number of markers of that type on the current map">Number</td>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.type}>
              <td>
                <input className="type" value={row.type} onChange={e => handleTypeChange(index, e.target.value)} />
              </td>
              <td style={{ position: "relative" }}>
                {row.isExternal ? (
                  <img
                    className="image"
                    src={row.icon}
                    style={{ width: "1.2em", height: "1.2em", verticalAlign: "middle" }}
                    alt=""
                  />
                ) : (
                  <span className="emoji" style={{ fontSize: "1.2em" }}>
                    {row.icon}
                  </span>
                )}
                <button type="button" className="changeIcon icon-pencil" onClick={() => handleIconChange(index)} />
              </td>
              <td>
                <input
                  className="multiplier"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={row.multiplier}
                  onChange={e => handleMultiplierChange(index, e.target.valueAsNumber)}
                />
              </td>
              <td style={{ textAlign: "center" }}>{getMarkerCount(row.type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
};
