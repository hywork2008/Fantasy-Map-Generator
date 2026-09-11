import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelationshipCompatibilityDialog } from "./RelationshipCompatibilityDialog";

const state = vi.hoisted(() => ({
  open: true,
  people: [
    { i: 1, name: "First", personality: {} },
    { i: 2, name: "Second", personality: {} },
    { i: 3, name: "Deceased", personality: {}, dead: true }
  ],
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  openCharacterDetails: vi.fn()
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../../hostUi", () => ({
  useDialogState: (selector: (s: { openDialogs: Set<string> }) => unknown) =>
    selector({ openDialogs: new Set(state.open ? ["relationshipCompatibility"] : []) }),
  openDialog: state.openDialog,
  closeDialog: state.closeDialog,
  Dialog: ({ children, onClose }: { children: ReactNode; onClose: () => void }) =>
    createElement("div", null, children, createElement("button", { type: "button", onClick: onClose }, "Close"))
}));
vi.mock("../../charactersContext", () => ({
  getCharacters: () => state.people,
  getWorldContext: () => ({ pack: { cultures: [] } })
}));
vi.mock("../charactersUiState", () => ({
  useCharactersUiState: (selector: (s: object) => unknown) =>
    selector({ selectedCharacterId: 2, refreshToken: 0, openCharacterDetails: state.openCharacterDetails })
}));
vi.mock("../components/RelationshipCompatibilityPanel", () => ({
  RelationshipCompatibilityPanel: ({
    character,
    onOpenCharacter
  }: {
    character: { i: number; name: string };
    onOpenCharacter: (id: number) => void;
  }) =>
    createElement(
      "button",
      { type: "button", "data-panel": character.i, onClick: () => onOpenCharacter(1) },
      character.name
    )
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  state.open = true;
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = () => act(() => root.render(createElement(RelationshipCompatibilityDialog)));

describe("standalone compatibility dialog", () => {
  it("uses the current character, allows switching subjects and opens linked details", () => {
    render();
    expect(container.querySelector("[data-panel]")?.textContent).toBe("Second");
    expect(container.querySelectorAll("option")).toHaveLength(2);
    act(() => {
      const select = container.querySelector("select")!;
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("[data-panel]")?.textContent).toBe("First");
    act(() => (container.querySelector("[data-panel]") as HTMLButtonElement).click());
    expect(state.openCharacterDetails).toHaveBeenCalledWith(1);
    expect(state.openDialog).toHaveBeenCalledWith("characterDetails");
    act(() => [...container.querySelectorAll("button")].find(button => button.textContent === "Close")!.click());
    expect(state.closeDialog).toHaveBeenCalledWith("relationshipCompatibility");
  });
  it("does not render the comparison when closed", () => {
    state.open = false;
    render();
    expect(container.textContent).toBe("");
  });
  it("handles an empty roster", () => {
    const previous = state.people;
    state.people = [];
    try {
      render();
      expect(container.textContent).toContain("characters.compatibility.empty");
      expect(container.querySelector("[data-panel]")).toBeNull();
    } finally {
      state.people = previous;
    }
  });
});
