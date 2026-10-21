import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createRoster } from "../../roster/model";
import { defaultPresetQuery } from "../../roster/presetTypes";
import { useCharactersUiState } from "../charactersUiState";
import { RosterPresetPanel } from "./RosterPresetPanel";

vi.mock("../../charactersContext", () => ({ getWorldContext: () => ({ pack: {} }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  useCharactersUiState.setState({ presetOpen: false, presetQuery: defaultPresetQuery() });
  vi.unstubAllGlobals();
});
it("renders an expanded preset chooser while initial world collections are not ready", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useCharactersUiState.getState().setPresetOpen(true);
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    act(() => root.render(<RosterPresetPanel roster={createRoster("seed", 1000)} command={() => undefined} />));
    expect(container.textContent).toContain("rosterPresets.churchSetup");
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(14);
  } finally {
    act(() => root.unmount());
  }
});
