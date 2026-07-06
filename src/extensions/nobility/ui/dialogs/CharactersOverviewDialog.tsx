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
    refreshToken,
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

  // refreshToken is an intentional extra dep: characters/states mutate in place
  // (e.g. Advance Time aging), so their references alone won't trigger a recompute.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  const filteredCharacters = useMemo(() => {
    return filterAndSortCharacters(characters, states, {
      searchText,
      filterStateId: filterStateId ?? -1,
      sortBy,
      sortOrder
    });
  }, [characters, states, searchText, filterStateId, sortBy, sortOrder, refreshToken]);

  const handleCharacterClick = (characterId: number) => {
    setSelectedCharacterId(characterId);
    openDialog("characterDetails");
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Name",
      "Title",
      "State",
      "Artistry",
      "Diplomacy",
      "Engineering",
      "Geography",
      "Intrigue",
      "Learning",
      "Martial",
      "Prowess",
      "Stewardship",
      "Boldness",
      "Compassion",
      "Confidence",
      "Energy",
      "Greed",
      "Guile",
      "Honor",
      "Piety",
      "Rationality",
      "Sociability",
      "Vengefulness",
      "Zeal"
    ];

    const escapeCsv = (val: unknown) => {
      if (val == null) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredCharacters.map(row => {
      const c = row.c;
      return [
        c.name,
        row.title,
        row.stateName,
        c.skills?.artistry ?? 0,
        c.skills?.diplomacy ?? 0,
        c.skills?.engineering ?? 0,
        c.skills?.geography ?? 0,
        c.skills?.intrigue ?? 0,
        c.skills?.learning ?? 0,
        c.skills?.martial ?? 0,
        c.skills?.prowess ?? 0,
        c.skills?.stewardship ?? 0,
        c.personality?.boldness ?? 0,
        c.personality?.compassion ?? 0,
        c.personality?.confidence ?? 0,
        c.personality?.energy ?? 0,
        c.personality?.greed ?? 0,
        c.personality?.guile ?? 0,
        c.personality?.honor ?? 0,
        c.personality?.piety ?? 0,
        c.personality?.rationality ?? 0,
        c.personality?.sociability ?? 0,
        c.personality?.vengefulness ?? 0,
        c.personality?.zeal ?? 0
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "characters_stats.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

        <div
          id="charactersTotal"
          className="totalLine"
          style={{ padding: "5px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div data-tip="Characters displayed">
            Characters: {filteredCharacters.length} of {characters.length}
          </div>
          {activeTab === "stats" && (
            <button type="button" className="btn" onClick={handleDownloadCsv}>
              <span className="icon-download" style={{ marginRight: "4px" }} />
              Export CSV
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
