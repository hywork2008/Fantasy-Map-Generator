import { describe, expect, it } from "vitest";
import type { Marker } from "../types/models";
import type { WorldNote } from "../types/WorldState";
import { applyMapMarkerPatch, markerNoteId, nextMarkerId } from "./mapMarkerApi";

function marker(overrides: Partial<Marker> = {}): Marker {
  return { i: 0, type: "test", icon: "📍", cell: 0, ...overrides };
}

describe("nextMarkerId", () => {
  it("returns 0 for an empty markers array", () => {
    expect(nextMarkerId([])).toBe(0);
  });

  it("returns one past the last marker's id", () => {
    expect(nextMarkerId([marker({ i: 0 }), marker({ i: 5 })])).toBe(6);
  });
});

describe("markerNoteId", () => {
  it("matches the host's marker-id-suffixed convention (e.g. controllers/battle-screen.ts)", () => {
    expect(markerNoteId(0)).toBe("marker0");
    expect(markerNoteId(7)).toBe("marker7");
  });
});

describe("applyMapMarkerPatch", () => {
  it("patches marker fields in place", () => {
    const m = marker({ icon: "🏗️" });
    applyMapMarkerPatch(m, undefined, { icon: "📚" });
    expect(m.icon).toBe("📚");
  });

  it("never lets the patch overwrite the marker's own id", () => {
    const m = marker({ i: 3 });
    // MapMarkerPatch's type already excludes "i", but guard the runtime behavior too.
    applyMapMarkerPatch(m, undefined, {} as Parameters<typeof applyMapMarkerPatch>[2]);
    expect(m.i).toBe(3);
  });

  it("updates the paired note's name/legend when provided", () => {
    const m = marker();
    const note: WorldNote = { id: "marker0", name: "Old name", legend: "Old legend" };
    applyMapMarkerPatch(m, note, { noteName: "New name", noteLegend: "New legend" });
    expect(note.name).toBe("New name");
    expect(note.legend).toBe("New legend");
  });

  it("leaves the note's name/legend untouched when omitted from the patch", () => {
    const m = marker();
    const note: WorldNote = { id: "marker0", name: "Keep me", legend: "Keep me too" };
    applyMapMarkerPatch(m, note, { icon: "🏚️" });
    expect(note.name).toBe("Keep me");
    expect(note.legend).toBe("Keep me too");
  });

  it("is a no-op on the note side when no note is passed", () => {
    const m = marker();
    expect(() => applyMapMarkerPatch(m, undefined, { noteName: "x" })).not.toThrow();
  });
});
