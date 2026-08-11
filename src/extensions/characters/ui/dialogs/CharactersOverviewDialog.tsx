import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOptionsState } from "../../../hostCore";
import { closeDialog, Dialog, openDialog, useDialogState } from "../../../hostUi";
import { getCharacters, getSelectedAbilityPreset, getWorldContext } from "../../charactersContext";
import { filterAndSortCharacters, isFantasyCulturesSet } from "../../controllers/characters-overview";
import { getAbilityValue } from "../../personFactory";
import {
  CHARACTER_OVERVIEW_ROLE_FILTERS,
  type CharacterOverviewRoleFilter,
  getCharacterOverviewRoleFilterLabel
} from "../../utils/characterLabels";
import { useCharactersUiState } from "../charactersUiState";
import { CharactersStatsTable } from "../components/tables/CharactersStatsTable";
import { CharactersTable } from "../components/tables/CharactersTable";

export const CharactersOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("charactersOverview"));
  const { i18n } = useTranslation();
  const culturesSet = useOptionsState(state => state.culturesSet);
  const showRace = isFantasyCulturesSet(culturesSet);

  const {
    sortBy,
    sortOrder,
    searchText,
    filterStateId,
    filterRoleClass,
    activeTab,
    refreshToken,
    toggleSortBy,
    setSearchText,
    setFilterStateId,
    setFilterRoleClass,
    setActiveTab,
    openCharacterDetails
  } = useCharactersUiState();

  const worldContext = getWorldContext();
  const characters = getCharacters().filter(c => !c.dead);
  const states = worldContext.pack.states ?? [];
  const races = worldContext.pack.races ?? [];
  const cultures = worldContext.pack.cultures ?? [];
  const abilityPreset = getSelectedAbilityPreset();
  const showFamily = abilityPreset.id === "ck3e";

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
      filterRoleClass,
      sortBy,
      sortOrder,
      races,
      cultures
    });
  }, [
    characters,
    states,
    races,
    cultures,
    searchText,
    filterStateId,
    filterRoleClass,
    sortBy,
    sortOrder,
    refreshToken,
    i18n.language
  ]);

  const handleCharacterClick = (characterId: number) => {
    openCharacterDetails(characterId);
    openDialog("characterDetails");
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Name",
      "Title",
      "State",
      "Wealth",
      ...(showRace ? ["Race"] : []),
      ...(showFamily ? ["Marital Status", "Children"] : []),
      ...abilityPreset.stats.map(stat => stat.label)
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
        c.wealth ?? 0,
        ...(showRace ? [row.raceName] : []),
        ...(showFamily ? [(c.family?.spouses ?? 0) > 0 ? "Married" : "Unmarried", c.family?.children ?? 0] : []),
        ...abilityPreset.stats.map(stat => getAbilityValue(c, stat.key) ?? stat.default)
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
      className="fmg-dialog--table"
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
            showRace={showRace}
            showFamily={showFamily}
          />
        ) : (
          <CharactersStatsTable
            rows={filteredCharacters}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={toggleSortBy}
            onCharacterClick={handleCharacterClick}
            abilityPreset={abilityPreset}
          />
        )}

        <div id="charactersFilters" data-tip="Apply a filter" className="d-flex" style={{ padding: "5px" }}>
          <label htmlFor="charactersSearch" data-tip="Filter by name, state, title, role, or gender">
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
          <label
            htmlFor="charactersFilterRoleClass"
            style={{ marginLeft: "10px" }}
            data-tip="Filter by title/role class, or by an active Guild Master or Guild Apprentice role."
          >
            Title/Role:{" "}
            <select
              id="charactersFilterRoleClass"
              value={filterRoleClass ?? ""}
              onChange={e => {
                const value = e.target.value;
                setFilterRoleClass(value ? (value as CharacterOverviewRoleFilter) : null);
              }}
            >
              <option value="">all</option>
              {CHARACTER_OVERVIEW_ROLE_FILTERS.map(roleFilter => (
                <option key={roleFilter} value={roleFilter}>
                  {getCharacterOverviewRoleFilterLabel(roleFilter)}
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
