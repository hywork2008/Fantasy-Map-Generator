import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { diplomacyHistoryDialogStore } from "../../store/diplomacyHistoryDialogState";
import { warDetailsDialogStore } from "../../store/warDetailsDialogState";
import type { PackedGraph } from "../../types/PackedGraph";

describe("DiplomacyHistoryDialog & WarDetailsDialog state safety", () => {
  it("clears chronicle on close in diplomacyHistoryDialogStore", () => {
    diplomacyHistoryDialogStore.getState().open({
      chronicle: [["War of the Roses", { id: "e1", action: "attacked", yearsAgo: 1, from: 1, to: 2 }]],
      onSave: () => {},
      onClear: () => {},
      onChange: () => {}
    });

    expect(diplomacyHistoryDialogStore.getState().isOpen).toBe(true);
    expect(diplomacyHistoryDialogStore.getState().chronicle.length).toBe(1);

    diplomacyHistoryDialogStore.getState().close();

    expect(diplomacyHistoryDialogStore.getState().isOpen).toBe(false);
    expect(diplomacyHistoryDialogStore.getState().chronicle.length).toBe(0);
  });

  it("handles wiped worldContext.pack without crashing", () => {
    const savedPack = worldContext.pack;
    try {
      // Simulate map regeneration where worldContext.pack is wiped
      worldContext.pack = {} as PackedGraph;

      expect(worldContext.pack.states).toBeUndefined();

      // Ensure stores can close safely
      diplomacyHistoryDialogStore.getState().close();
      warDetailsDialogStore.getState().close();

      expect(diplomacyHistoryDialogStore.getState().isOpen).toBe(false);
      expect(warDetailsDialogStore.getState().isOpen).toBe(false);
    } finally {
      worldContext.pack = savedPack;
    }
  });
});
