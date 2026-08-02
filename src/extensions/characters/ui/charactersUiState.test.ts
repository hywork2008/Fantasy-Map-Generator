import { beforeEach, describe, expect, it } from "vitest";
import { useCharactersUiState } from "./charactersUiState";

describe("charactersUiState details history", () => {
  beforeEach(() => {
    useCharactersUiState.getState().clearCharacterDetailsHistory();
  });

  it("openCharacterDetails starts a fresh history", () => {
    const store = useCharactersUiState.getState();
    store.openCharacterDetails(1);
    store.pushCharacterDetails(2);
    store.openCharacterDetails(9);
    const state = useCharactersUiState.getState();
    expect(state.selectedCharacterId).toBe(9);
    expect(state.detailsHistory).toEqual([9]);
    expect(state.detailsHistoryIndex).toBe(0);
  });

  it("push truncates forward history after going back", () => {
    const store = useCharactersUiState.getState();
    store.openCharacterDetails(1);
    store.pushCharacterDetails(2);
    store.pushCharacterDetails(3);
    store.goBackCharacterDetails();
    store.goBackCharacterDetails();
    store.pushCharacterDetails(4);
    const state = useCharactersUiState.getState();
    expect(state.detailsHistory).toEqual([1, 4]);
    expect(state.selectedCharacterId).toBe(4);
    expect(state.detailsHistoryIndex).toBe(1);
  });

  it("back and forward move the selection", () => {
    const store = useCharactersUiState.getState();
    store.openCharacterDetails(1);
    store.pushCharacterDetails(2);
    store.pushCharacterDetails(3);
    store.goBackCharacterDetails();
    expect(useCharactersUiState.getState().selectedCharacterId).toBe(2);
    store.goForwardCharacterDetails();
    expect(useCharactersUiState.getState().selectedCharacterId).toBe(3);
  });

  it("clearCharacterDetailsHistory resets selection and stack", () => {
    const store = useCharactersUiState.getState();
    store.openCharacterDetails(1);
    store.pushCharacterDetails(2);
    store.clearCharacterDetailsHistory();
    const state = useCharactersUiState.getState();
    expect(state.selectedCharacterId).toBeNull();
    expect(state.detailsHistory).toEqual([]);
    expect(state.detailsHistoryIndex).toBe(-1);
  });
});
