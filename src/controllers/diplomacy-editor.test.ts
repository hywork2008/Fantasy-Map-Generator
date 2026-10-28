import { afterEach, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { getDiplomacyEditorState, setDiplomacyEditorState } from "../store/diplomacyEditorState";
import type { State } from "../types/models";

vi.mock("../renderers", () => ({}));
vi.mock("../runtime/worldRuntime", () => ({}));
vi.mock("../services/generationPipeline", () => ({}));
vi.mock("../services/tooltipService", () => ({}));
vi.mock("../services/viewLayerService", () => ({ viewLayerService: {} }));
vi.mock("../ui/dialogs/dialogService", () => ({ isDialogOpen: () => false }));
vi.mock("../utils", () => ({}));
vi.mock("../utils/editorBus", () => ({}));
vi.mock("../utils/editorHelpers", () => ({}));
vi.mock("../utils/layerUtils", () => ({}));
vi.mock("./diplomacy-badges", () => ({}));
vi.mock("./interactionManager", () => ({}));
vi.mock("./layers", () => ({}));
vi.mock("./style", () => ({ editStyle: vi.fn() }));

import { diplomacyEditorActions } from "./diplomacy-editor";

const originalStates = worldContext.pack.states;
const originalEditorState = getDiplomacyEditorState();
afterEach(() => {
  worldContext.pack.states = originalStates;
  setDiplomacyEditorState(originalEditorState, true);
});

it("opens relation editing with fresh state data before Diplomacy Editor has ever opened", () => {
  worldContext.pack.states = [
    { i: 0 },
    { i: 1, name: "Alpha", diplomacy: ["x", "x", "Neutral"] },
    { i: 2, name: "Beta", diplomacy: ["x", "Neutral", "x"] },
    { i: 3, name: "Removed", removed: true }
  ] as State[];
  setDiplomacyEditorState({ isOpen: false, selectedStateId: 0, states: [] });

  diplomacyEditorActions.selectRelation(1, 2, "Neutral");

  const state = getDiplomacyEditorState();
  expect(state.isOpen).toBe(false);
  expect(state.relationDialog).toEqual({ isOpen: true, subjectId: 1, objectId: 2, currentRelation: "Neutral" });
  expect(state.states.map(s => s.i)).toEqual([1, 2]);
});
