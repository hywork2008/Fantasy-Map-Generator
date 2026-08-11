import type React from "react";
import { useMemo } from "react";
import { Dialog, openDialog } from "../../../hostUi";
import { getCharacters, getWorldContext } from "../../charactersContext";
import { usePlayerCharacterState } from "../../store/playerCharacterState";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../../utils/characterLabels";
import { useCharactersUiState } from "../charactersUiState";
import "./playerCharacterPanel.css";

function characterPosition(character: ReturnType<typeof getCharacters>[number]): string {
  const title = character.titles[0];
  if (title) return getCharacterTitleLabel(title.title);
  const role = character.roles?.[0];
  return role ? getCharacterRoleLabel(role) : "Unassigned";
}

/** Always-visible, Characters-owned top-right player focus panel. */
export const PlayerCharacterPanel: React.FC = () => {
  const playerCharacterId = usePlayerCharacterState(state => state.playerCharacterId);
  const refreshToken = usePlayerCharacterState(state => state.refreshToken);
  const openCharacterDetails = useCharactersUiState(state => state.openCharacterDetails);

  // Character data changes in place, hence the explicit refresh token dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  const character = useMemo(
    () =>
      playerCharacterId === null ? undefined : getCharacters().find(candidate => candidate.i === playerCharacterId),
    [playerCharacterId, refreshToken]
  );
  const location = character?.location === undefined ? undefined : getWorldContext().pack.burgs?.[character.location];

  const handleOpenDetails = (): void => {
    if (!character) return;
    openCharacterDetails(character.i);
    openDialog("characterDetails");
  };

  const handleCreate = (): void => openDialog("playerCharacter");

  return (
    <Dialog isOpen title="Player Character" showCloseAllDialogsButton={false} className="player-character-panel">
      {character && !character.dead ? (
        <>
          <div className="pcp-content">
            <h2 className="pcp-name">{character.name}</h2>
            <dl className="pcp-fields">
              <dt>Role</dt>
              <dd>{characterPosition(character)}</dd>
              <dt>Location</dt>
              <dd>{location?.name ?? "Unknown"}</dd>
              <dt>Age</dt>
              <dd>{character.age}</dd>
              <dt>Wealth</dt>
              <dd>{Math.round(character.wealth ?? 0)}</dd>
            </dl>
          </div>
          <div className="pcp-actions">
            <button type="button" className="pcp-action" onClick={handleOpenDetails}>
              Character Details
            </button>
          </div>
        </>
      ) : (
        <div className="pcp-empty">
          <p>No player character is selected.</p>
          <button type="button" className="pcp-action" onClick={handleCreate}>
            Create Player Character
          </button>
        </div>
      )}
    </Dialog>
  );
};
