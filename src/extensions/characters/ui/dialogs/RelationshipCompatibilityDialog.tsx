import "./relationshipCompatibilityDialog.css";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, openDialog, useDialogState } from "../../../hostUi";
import { getCharacters, getWorldContext } from "../../charactersContext";
import { useCharactersUiState } from "../charactersUiState";
import { RelationshipCompatibilityPanel } from "../components/RelationshipCompatibilityPanel";

export function RelationshipCompatibilityDialog() {
  const isOpen = useDialogState(state => state.openDialogs.has("relationshipCompatibility"));
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const currentId = useCharactersUiState(state => state.selectedCharacterId);
  const openCharacterDetails = useCharactersUiState(state => state.openCharacterDetails);
  useCharactersUiState(state => state.refreshToken);
  if (!isOpen) return null;
  const characters = getCharacters();
  const available = characters.filter(character => !character.dead && character.personality);
  const character = available.find(person => person.i === (selectedId ?? currentId)) ?? available[0];
  const options = available.filter(
    person => person.i === character?.i || person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  return (
    <Dialog
      isOpen={isOpen}
      title={t("characters.compatibility.title")}
      onClose={() => closeDialog("relationshipCompatibility")}
      className="relationship-compatibility-dialog"
    >
      <div className="relationship-compatibility-layout">
        <div className="relationship-compatibility-controls">
          <label>
            {t("characters.compatibility.subjectSearch")}{" "}
            <input value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label>
            {t("characters.compatibility.subject")}{" "}
            <select value={character?.i ?? ""} onChange={event => setSelectedId(Number(event.target.value))}>
              {options.map(person => (
                <option key={person.i} value={person.i}>
                  {person.name} (#{person.i})
                </option>
              ))}
            </select>
          </label>
        </div>
        {character ? (
          <RelationshipCompatibilityPanel
            key={character.i}
            character={character}
            characters={characters}
            cultures={getWorldContext().pack.cultures}
            onOpenCharacter={id => {
              openCharacterDetails(id);
              openDialog("characterDetails");
            }}
          />
        ) : (
          <p>{t("characters.compatibility.empty")}</p>
        )}
      </div>
    </Dialog>
  );
}
