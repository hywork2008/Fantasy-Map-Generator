import { FANTASY_CULTURE_SETS, isFantasyCulturesSet } from "../../../data/raceCivicStance";
import type { Culture, Race, State } from "../../hostTypes";
import { inferRoleClass } from "../backstoryProfile";
import type { Character, CharacterRoleClass } from "../characterTypes";
import { useCharactersUiState } from "../ui/charactersUiState";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../utils/characterLabels";

/** Culture sets where non-human races are first-class and worth a dedicated Race column. */
export { FANTASY_CULTURE_SETS, isFantasyCulturesSet };

export interface CharacterRowData {
  c: Character;
  stateName: string;
  stateId: number;
  title: string;
  /** Semantic title/role class (King/Emperor/Khan → `"ruler"`). */
  roleClass: CharacterRoleClass;
  /** Display name from pack.races (or culture.race fallback). */
  raceName: string;
}

export function resolveCharacterRaceName(
  character: Character,
  races?: readonly Pick<Race, "i" | "name" | "removed">[] | null,
  cultures?: readonly Pick<Culture, "i" | "race">[] | null
): string {
  const raceId = character.race ?? cultures?.[character.culture]?.race;
  // Wildlands / catalog Unknown (0) is not a playable folk — display as Human.
  if (raceId === undefined || raceId === null || raceId === 0) {
    const human = races?.find(r => r.i === 1) ?? races?.[1];
    return human?.name && !human.removed ? human.name : "Human";
  }
  const race = races?.[raceId];
  if (!race || race.removed) {
    const human = races?.find(r => r.i === 1) ?? races?.[1];
    return human?.name && !human.removed ? human.name : "Human";
  }
  // Catalog slot 0 is literally named "Unknown"
  if (race.i === 0 || race.name === "Unknown") {
    const human = races?.find(r => r.i === 1) ?? races?.[1];
    return human?.name && !human.removed ? human.name : "Human";
  }
  return race.name || "Human";
}

export function filterAndSortCharacters(
  characters: Character[],
  states: State[],
  options: {
    searchText: string;
    filterStateId: number;
    /** When set, keep only characters whose inferred role class matches. */
    filterRoleClass?: CharacterRoleClass | null;
    sortBy: string;
    sortOrder: "asc" | "desc";
    races?: readonly Pick<Race, "i" | "name" | "removed">[] | null;
    cultures?: readonly Pick<Culture, "i" | "race">[] | null;
  }
): CharacterRowData[] {
  const {
    searchText,
    filterStateId,
    filterRoleClass = null,
    sortBy,
    sortOrder,
    races = null,
    cultures = null
  } = options;

  // 1. Map to row data
  let rows: CharacterRowData[] = characters.map(c => {
    const holding = c.titles[0];
    const role = c.roles?.[0];
    const stateId = c.state ?? holding?.entityId ?? -1;
    const stateName = states[stateId]?.name ?? "Unknown";
    return {
      c,
      stateId,
      stateName,
      title: holding ? getCharacterTitleLabel(holding.title) : role ? getCharacterRoleLabel(role) : "",
      roleClass: inferRoleClass(c),
      raceName: resolveCharacterRaceName(c, races, cultures)
    };
  });

  // 2. Filter by state
  if (filterStateId !== -1) {
    rows = rows.filter(r => r.stateId === filterStateId);
  }

  // 3. Filter by semantic title/role class (groups King/Emperor/etc. as rulers)
  if (filterRoleClass) {
    rows = rows.filter(r => r.roleClass === filterRoleClass);
  }

  // 4. Filter by search text
  if (searchText) {
    const search = searchText.toLowerCase();
    rows = rows.filter(r => {
      if (r.c.name.toLowerCase().includes(search)) return true;
      if (r.stateName.toLowerCase().includes(search)) return true;
      if (r.title.toLowerCase().includes(search)) return true;
      if (
        r.c.roles?.some(
          role => role.kind.toLowerCase().includes(search) || getCharacterRoleLabel(role).toLowerCase().includes(search)
        )
      ) {
        return true;
      }
      if (r.c.gender.toLowerCase().startsWith(search)) return true;
      if (r.raceName.toLowerCase().includes(search)) return true;
      return false;
    });
  }

  // 5. Sort
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
      case "wealth":
        result = (a.c.wealth ?? 0) - (b.c.wealth ?? 0);
        break;
      case "race":
        result = a.raceName.localeCompare(b.raceName);
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
      case "maritalStatus":
        result = Number((a.c.family?.spouses ?? 0) > 0) - Number((b.c.family?.spouses ?? 0) > 0);
        break;
      case "children":
        result = (a.c.family?.children ?? 0) - (b.c.family?.children ?? 0);
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
