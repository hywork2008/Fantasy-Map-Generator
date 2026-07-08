import type React from "react";
import { useState } from "react";
import { useDebugSnapshotState } from "../../store/debugSnapshotState";
import { exportSnapshotsToAPI, restoreSnapshot } from "../../utils/aiDebugExporter";
import { Dialog } from "./Dialog";

export const DebugSnapshotDialog: React.FC = () => {
  const { snapshots, isOpen, setIsOpen, toggleLock, removeSnapshot, clearUnlocked } = useDebugSnapshotState();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const handleToggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportSelected = async () => {
    const selected = snapshots.filter(s => selectedIds.has(s.id));
    if (selected.length === 0) return;
    const success = await exportSnapshotsToAPI(selected);
    if (success) {
      alert("Successfully exported to docs/debug/");
    } else {
      alert("Failed to export. Check console.");
    }
  };

  const handleRestore = (id: number) => {
    const snapshot = snapshots.find(s => s.id === id);
    if (snapshot) {
      restoreSnapshot(snapshot.data);
      alert(`Restored to Year ${snapshot.year} (${snapshot.label})`);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="AI Debug Snapshots"
      onClose={() => setIsOpen(false)}
      style={{ width: "500px", maxWidth: "90vw" }}
      buttons={[
        { label: `Export Selected (${selectedIds.size})`, onClick: handleExportSelected },
        { label: "Delete Unlocked", onClick: clearUnlocked }
      ]}
    >
      <div style={{ overflowY: "auto", maxHeight: "60vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #555" }}>
              <th style={{ padding: "8px" }}>Select</th>
              <th>Year (Tick)</th>
              <th>Label</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid #444" }}>
                <td style={{ padding: "8px" }}>
                  <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => handleToggleSelect(s.id)} />
                </td>
                <td>
                  {s.year} ({s.tickCount})
                </td>
                <td>{s.label}</td>
                <td style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
                  <button type="button" onClick={() => handleRestore(s.id)} title="Restore Map to this state">
                    🔙
                  </button>
                  <button type="button" onClick={() => toggleLock(s.id)} title={s.isLocked ? "Unlock" : "Lock"}>
                    {s.isLocked ? "🔒" : "🔓"}
                  </button>
                  <button type="button" onClick={() => removeSnapshot(s.id)} title="Delete" disabled={s.isLocked}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "16px" }}>
                  No snapshots yet. Generate map or advance time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};
