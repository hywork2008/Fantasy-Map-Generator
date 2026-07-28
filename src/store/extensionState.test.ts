import { afterEach, describe, expect, it } from "vitest";
import { useExtensionState } from "./extensionState";
import { generationProgressStore } from "./generationProgressState";

const extensionId = "generation-lock-test-extension";

afterEach(() => {
  generationProgressStore.getState().finish();
  useExtensionState.getState().unregisterExtension(extensionId);
});

describe("extension state", () => {
  it("does not enable an extension while staged map generation is open", () => {
    useExtensionState
      .getState()
      .registerExtension({ id: extensionId, name: "Generation lock test", description: "Test extension" }, false);
    generationProgressStore.getState().beginStage(0);

    expect(useExtensionState.getState().toggleExtension(extensionId, true)).toBe(false);
    expect(useExtensionState.getState().enabledExtensions[extensionId]).toBe(false);
    expect(useExtensionState.getState().toggleError).toBe(
      "Extensions cannot be changed while map generation is in progress."
    );
  });
});
