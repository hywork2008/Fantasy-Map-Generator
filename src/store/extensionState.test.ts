import { afterEach, describe, expect, it } from "vitest";
import { type ExtensionEditorTab, getEnabledEditorTabs, useExtensionState } from "./extensionState";
import { generationProgressStore } from "./generationProgressState";

const extensionId = "generation-lock-test-extension";

afterEach(() => {
  generationProgressStore.getState().finish();
  useExtensionState.getState().unregisterExtension(extensionId);
});

describe("extension state", () => {
  it("only exposes registered editor tabs for enabled extensions", () => {
    const component = () => null;
    const tabs: ExtensionEditorTab[] = [
      { id: "economy-inns", extensionId: "economy", editorId: "burgEditor", label: "Inns", component },
      { id: "guilds", extensionId: "guilds", editorId: "burgEditor", label: "Guilds", component },
      { id: "states-treasury", extensionId: "economy", editorId: "statesEditor", label: "Treasury", component }
    ];

    expect(getEnabledEditorTabs(tabs, { economy: true, guilds: false }, "burgEditor").map(tab => tab.id)).toEqual([
      "economy-inns"
    ]);
  });

  it("allows an extension to be enabled while staged map generation is open", () => {
    useExtensionState
      .getState()
      .registerExtension({ id: extensionId, name: "Generation lock test", description: "Test extension" }, false);
    generationProgressStore.getState().beginStage(0, true);

    expect(useExtensionState.getState().toggleExtension(extensionId, true)).toBe(true);
    expect(useExtensionState.getState().enabledExtensions[extensionId]).toBe(true);
    expect(useExtensionState.getState().toggleError).toBeNull();
  });
});
