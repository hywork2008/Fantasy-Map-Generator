import { select } from "d3";
import { afterEach, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { getDiplomacyEditorState, setDiplomacyEditorState } from "../store/diplomacyEditorState";
import type { State } from "../types/models";
import { renderDiplomacyBadges } from "./diplomacy-badges";

vi.mock("../services/viewLayerService", () => ({
  viewLayerService: {
    get debug() {
      return select("#debug");
    }
  }
}));

const originalPack = worldContext.pack;
const originalEditorState = getDiplomacyEditorState();
let svg: SVGSVGElement;

afterEach(() => {
  svg?.remove();
  worldContext.pack = originalPack;
  setDiplomacyEditorState(originalEditorState, true);
});

it.each([
  ["relation half", "g[clip-path]"],
  ["military ring", "path"]
])("opens relation editing from the %s with fresh state data", (_name, selector) => {
  worldContext.pack = {
    ...originalPack,
    cells: {
      ...originalPack.cells,
      state: new Uint16Array([1, 2]),
      c: [[1], [0]],
      p: [
        [0, 0],
        [10, 0]
      ]
    },
    states: [
      { i: 0, diplomacy: [] },
      { i: 1, name: "Alpha", diplomacy: ["x", "x", "Neutral"] },
      { i: 2, name: "Beta", diplomacy: ["x", "Neutral", "x"] }
    ] as State[],
    burgs: []
  };
  setDiplomacyEditorState({ isOpen: false, selectedStateId: 0, states: [] });
  svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const debug = document.createElementNS("http://www.w3.org/2000/svg", "g");
  debug.id = "debug";
  svg.append(debug);
  document.body.append(svg);
  renderDiplomacyBadges();
  worldContext.pack.states[2].name = "Updated Beta";

  const target = svg.querySelector(`#diplomacyBadges ${selector}`);
  expect(target).not.toBeNull();
  target!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const state = getDiplomacyEditorState();
  expect(state.isOpen).toBe(false);
  expect(state.relationDialog).toEqual({ isOpen: true, subjectId: 1, objectId: 2, currentRelation: "Neutral" });
  expect(state.states.map(row => row.name)).toEqual(["Alpha", "Updated Beta"]);
});
