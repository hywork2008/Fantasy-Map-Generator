import type { State } from "../../hostTypes";
import type { Character } from "../characterTypes";
import { useCharactersUiState } from "../ui/charactersUiState";

export interface CharacterRowData {
  c: Character;
  stateName: string;
  stateId: number;
  title: string;
}

export function filterAndSortCharacters(
  characters: Character[],
  states: State[],
  options: {
    searchText: string;
    filterStateId: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }
): CharacterRowData[] {
  const { searchText, filterStateId, sortBy, sortOrder } = options;

  // 1. Map to row data
  let rows: CharacterRowData[] = characters.map(c => {
    const holding = c.titles[0];
    const stateId = c.state ?? holding?.entityId ?? -1;
    const stateName = states[stateId]?.name ?? "Unknown";
    return {
      c,
      stateId,
      stateName,
      title: holding?.title ?? ""
    };
  });

  // 2. Filter by state
  if (filterStateId !== -1) {
    rows = rows.filter(r => r.stateId === filterStateId);
  }

  // 3. Filter by search text
  if (searchText) {
    const search = searchText.toLowerCase();
    rows = rows.filter(r => {
      if (r.c.name.toLowerCase().includes(search)) return true;
      if (r.stateName.toLowerCase().includes(search)) return true;
      if (r.title.toLowerCase().includes(search)) return true;
      if (r.c.gender.toLowerCase().startsWith(search)) return true;
      return false;
    });
  }

  // 4. Sort
  rows.sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case "name":
        result = a.c.name.localeCompare(b.c.name);
        break;
      case "age":
        result = a.c.age - b.c.age;
        break;
      case "appearance":
        result = (a.c.appearance ?? 0) - (b.c.appearance ?? 0);
        break;
      case "prestige":
        result = (a.c.prestige ?? 0) - (b.c.prestige ?? 0);
        break;
      case "gender":
        result = a.c.gender.localeCompare(b.c.gender);
        break;
      case "title":
        result = a.title.localeCompare(b.title);
        break;
      case "state":
        result = a.stateName.localeCompare(b.stateName);
        break;
      // Skills
      case "diplomacy":
      case "martial":
      case "stewardship":
      case "intrigue":
      case "learning":
      case "prowess":
      case "artistry":
      case "engineering":
      case "geography":
        result =
          (a.c.skills?.[sortBy as keyof typeof a.c.skills] ?? 0) -
          (b.c.skills?.[sortBy as keyof typeof b.c.skills] ?? 0);
        break;
      // Personality
      case "boldness":
      case "compassion":
      case "greed":
      case "honor":
      case "rationality":
      case "sociability":
      case "vengefulness":
      case "zeal":
      case "energy":
      case "piety":
      case "guile":
      case "confidence":
        result =
          (a.c.personality?.[sortBy as keyof typeof a.c.personality] ?? 0) -
          (b.c.personality?.[sortBy as keyof typeof b.c.personality] ?? 0);
        break;
      default:
        result = 0;
    }

    if (result === 0) {
      // Fallback sort by ID to ensure stable sort
      result = a.c.i - b.c.i;
    }

    return sortOrder === "asc" ? result : -result;
  });

  return rows;
}

/** Called after every simulation tick so an already-open dialog reflects live character data. */
export function refreshCharactersOverviewIfOpen(isOpen: boolean): void {
  if (!isOpen) return;
  useCharactersUiState.getState().bumpRefreshToken();
}
