import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState } from "../store/optionsState";
import { lock, unlock } from "../utils/domUtils";
import { changeCultureSet } from "./options";

describe("changeCultureSet options controller", () => {
  beforeEach(() => {
    localStorage.clear();
    useOptionsState.setState({
      culturesSet: "world",
      maxWarDisparityRatio: 8,
      maxWarDisparityRatioEnabled: true
    });
  });

  afterEach(() => {
    localStorage.clear();
    unlock("maxWarDisparityRatio");
    unlock("maxWarDisparityRatioEnabled");
    useOptionsState.setState({
      culturesSet: "world",
      maxWarDisparityRatio: 8,
      maxWarDisparityRatioEnabled: true
    });
  });

  it("disables maxWarDisparityRatioEnabled when switching to highFantasy while keeping ratio at 8", () => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(false);
    expect(useOptionsState.getState().maxWarDisparityRatio).toBe(8);
  });

  it("disables maxWarDisparityRatioEnabled when switching to darkFantasy while keeping ratio at 8", () => {
    useOptionsState.setState({ culturesSet: "darkFantasy" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(false);
    expect(useOptionsState.getState().maxWarDisparityRatio).toBe(8);
  });

  it("re-enables maxWarDisparityRatioEnabled when switching back to world from fantasy if unlocked", () => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(false);

    useOptionsState.setState({ culturesSet: "world" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(true);
    expect(useOptionsState.getState().maxWarDisparityRatio).toBe(8);
  });

  it("does not overwrite maxWarDisparityRatioEnabled if locked by user", () => {
    useOptionsState.setState({ maxWarDisparityRatioEnabled: true });
    lock("maxWarDisparityRatioEnabled");

    useOptionsState.setState({ culturesSet: "highFantasy" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(true);

    useOptionsState.setState({ maxWarDisparityRatioEnabled: false });
    lock("maxWarDisparityRatioEnabled");
    useOptionsState.setState({ culturesSet: "world" });
    changeCultureSet();
    expect(useOptionsState.getState().maxWarDisparityRatioEnabled).toBe(false);
  });
});
