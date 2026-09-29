import { describe, expect, it } from "vitest";
import { serializeDocument } from "../io/dungeonEditorFile";
import { accessSummary } from "./connectivity";
import { MAX_FILE_BYTES, parseDocument } from "./document";
import { generateDungeon } from "./gen/pipeline";
import { DEFAULT_SETTINGS, type DungeonDocument } from "./types";

function fixture(): DungeonDocument {
  const result = generateDungeon(DEFAULT_SETTINGS);
  if (!result.ok) throw new Error("Fixture failed");
  return result.document;
}
describe("dungeon document loading", () => {
  it("round trips all editable geometry, locks and Unicode annotations", () => {
    const document = fixture();
    document.levels[0].spaces["s-1"].label = "隊商宿 <&> 中庭";
    document.levels[0].spaces["s-1"].locked = true;
    const result = parseDocument(serializeDocument(document));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document).toEqual(document);
  });
  it("accepts sealed edited rooms but reports reachability as a warning", () => {
    const document = fixture();
    document.levels[0].openings = {};
    document.levels[0].entrances = [];
    const result = parseDocument(serializeDocument(document));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diagnostics.some(item => item.severity === "warning")).toBe(true);
  });
  it("rejects broken references, corners, unsupported versions, overlapping openings and bad metadata", () => {
    const mutations: Array<(document: DungeonDocument) => void> = [
      doc => {
        doc.version = 2 as 1;
      },
      doc => {
        doc.levels[0].boundaries["b-1"].a = "v-missing";
      },
      doc => {
        doc.levels[0].spaces["s-1"].boundaryRefs[0].forward = false;
      },
      doc => {
        doc.levels[0].openings["o-1"].widthMeters = 1000;
      },
      doc => {
        doc.levels[0].openings["o-clone"] = { ...doc.levels[0].openings["o-1"], id: "o-clone" };
      },
      doc => {
        doc.levels[0].vertices["v-1"].point[0] = -10;
      },
      doc => {
        doc.generation.settings.roomCount = -100;
      },
      doc => {
        doc.generation.settings.widthMeters = 100;
      },
      doc => {
        doc.levels[0].fixtures["f-1"].footprint[0] = [0, 0];
      }
    ];
    for (const mutate of mutations) {
      const document = fixture();
      mutate(document);
      expect(parseDocument(serializeDocument(document)).ok).toBe(false);
    }
    expect(parseDocument("{}").ok).toBe(false);
    expect(parseDocument("not json").ok).toBe(false);
    expect(parseDocument(" ".repeat(MAX_FILE_BYTES + 1)).ok).toBe(false);
  });
  it("distinguishes secret and closed doors from structural and current access", () => {
    const document = fixture();
    const level = document.levels[0];
    const room = Object.values(level.spaces).find(space => space.kind === "room" && space.use === "厩")!;
    const boundaryIds = new Set(room.boundaryRefs.map(ref => ref.boundaryId));
    for (const opening of Object.values(level.openings))
      if (boundaryIds.has(opening.boundaryId)) opening.visibility = "secret";
    expect(accessSummary(level).reachable.has(room.id)).toBe(false);
    expect(accessSummary(level, "structural").reachable.has(room.id)).toBe(true);
    expect(accessSummary(level, "current").reachable.has(room.id)).toBe(false);
  });
});
