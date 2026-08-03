import type { FC } from "react";
import { openDialog, useBurgEditorState } from "../../../hostUi";
import { getCharacters } from "../../charactersContext";
import type { Character } from "../../characterTypes";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../../utils/characterLabels";
import { useCharactersUiState } from "../charactersUiState";

/** Lists living characters whose current location is the burg open in Edit Burg. */
export function getBurgResidents(characters: readonly Character[], burgId: number | undefined): Character[] {
  if (burgId === undefined) return [];

  return characters
    .filter(character => !character.dead && character.location === burgId)
    .toSorted((left, right) => left.name.localeCompare(right.name) || left.i - right.i);
}

function getOccupation(character: Character): string {
  const title = character.titles[0];
  if (title) return getCharacterTitleLabel(title.title);

  const role = character.roles?.[0];
  return role ? getCharacterRoleLabel(role) : "Unassigned";
}

/** Character roster for the burg currently open in the host's Edit Burg dialog. */
export const BurgEditorCharactersTab: FC = () => {
  const burgId = useBurgEditorState(state => state.burgData?.id);
  // Characters mutate in place during simulation; this subscription keeps the tab current.
  useCharactersUiState(state => state.refreshToken);
  const openCharacterDetails = useCharactersUiState(state => state.openCharacterDetails);
  const residents = getBurgResidents(getCharacters(), burgId);

  const handleCharacterClick = (characterId: number): void => {
    openCharacterDetails(characterId);
    openDialog("characterDetails");
  };

  if (!residents.length) {
    return (
      <div id="burgCharactersTab" role="status">
        No characters are currently staying in this burg.
      </div>
    );
  }

  return (
    <div id="burgCharactersTab">
      <table id="burgCharactersTable" className="fmg-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Occupation</th>
          </tr>
        </thead>
        <tbody>
          {residents.map(character => (
            <tr key={character.i}>
              <td>
                <button
                  type="button"
                  className="link"
                  data-tip="Open Character Details"
                  onClick={() => handleCharacterClick(character.i)}
                >
                  {character.name}
                </button>
              </td>
              <td>{getOccupation(character)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
