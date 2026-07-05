import type React from "react";
import { useMemo } from "react";
import { closeDialog, Dialog, openDialog, useDialogState } from "../../../hostUi";
import { filterAndSortCharacters } from "../../controllers/characters-overview";
import { getWorldContext } from "../../nobilityContext";
import { CharactersStatsTable } from "../components/tables/CharactersStatsTable";
import { CharactersTable } from "../components/tables/CharactersTable";
import { useNobilityUiState } from "../nobilityUiState";

export const CharactersOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("charactersOverview"));

  const {
    sortBy,
    sortOrder,
    searchText,
    filterStateId,
    activeTab,
    toggleSortBy,
    setSearchText,
    setFilterStateId,
    setSelectedCharacterId,
    setActiveTab
  } = useNobilityUiState();

  const worldContext = getWorldContext();
  const characters = worldContext.pack.characters ?? [];
  const states = worldContext.pack.states ?? [];

  const sortedStates = useMemo(() => {
    return states.filter(s => s.i && !s.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
  }, [states]);

  const filteredCharacters = useMemo(() => {
    return filterAndSortCharacters(characters, states, {
      searchText,
      filterStateId: filterStateId ?? -1,
      sortBy,
      sortOrder
    });
  }, [characters, states, searchText, filterStateId, sortBy, sortOrder]);

  const handleCharacterClick = (characterId: number) => {
    setSelectedCharacterId(characterId);
    openDialog("characterDetails");
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Characters Overview"
      onClose={() => closeDialog("charactersOverview")}
      className="overflow-hidden"
    >
      <div id="charactersOverviewContainer">
        <div className="tab" style={{ display: "flex", flexShrink: 0 }}>
          <button
            type="button"
            className={`options ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`options ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            Capabilities & Stats
          </button>
        </div>

        {activeTab === "overview" ? (
          <CharactersTable
            rows={filteredCharacters}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSortBy}
            onCharacterClick={handleCharacterClick}
          />
        ) : (
          <CharactersStatsTable
            rows={filteredCharacters}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSortBy}
            onCharacterClick={handleCharacterClick}
          />
        )}

        <div id="charactersFilters" data-tip="Apply a filter" className="d-flex" style={{ padding: "5px" }}>
          <label htmlFor="charactersSearch" data-tip="Filter by name, state, title, or gender">
            Search:{" "}
            <input
              id="charactersSearch"
              type="search"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </label>
          <label htmlFor="charactersFilterState" style={{ marginLeft: "10px" }}>
            State:{" "}
            <select
              id="charactersFilterState"
              value={filterStateId ?? "-1"}
              onChange={e => setFilterStateId(+e.target.value)}
            >
              <option value="-1">all</option>
              <option value="0">{states[0]?.name ?? "Neutral"}</option>
              {sortedStates.map(s => (
                <option key={s.i} value={s.i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div id="charactersTotal" className="totalLine" style={{ padding: "5px" }}>
          <div data-tip="Characters displayed">
            Characters: {filteredCharacters.length} of {characters.length}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
