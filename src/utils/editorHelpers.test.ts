import { afterEach, describe, expect, it, vi } from "vitest";
import { useOptionsState } from "../store/optionsState";
import { getFileName } from "./editorHelpers";

describe("getFileName", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("supports an underscore between the map name and timestamp for FMG archives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 18, 36));
    useOptionsState.setState({ mapName: "Laria" });

    expect(getFileName(undefined, "_")).toBe("Laria_2026-10-12-18-36");
  });

  it("keeps the existing space separator for other exports", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 18, 36));
    useOptionsState.setState({ mapName: "Laria" });

    expect(getFileName("Routes")).toBe("Laria Routes 2026-10-12-18-36");
  });
});
