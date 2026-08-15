import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOptionsState } from "../../../hostCore";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { createPlayerCharacter } from "../../characterPopulation";
import {
  filterAllowedCharacterRaces,
  getCharacters,
  getSelectedAbilityPreset,
  getWorldContext
} from "../../charactersContext";
import type { Gender } from "../../characterTypes";
import { setInitialPlayerCharacter } from "../../controllers/playerCharacter";
import { resolvePersonGender } from "../../personFactory";
import { rollDefaultAdultAge } from "../../raceAge";
import { usePlayerCharacterState } from "../../store/playerCharacterState";
import { useCharactersUiState } from "../charactersUiState";

function randomItem<T>(items: readonly T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function rollAbilityValues(current: Record<string, number> | undefined): Record<string, number> {
  const preset = getSelectedAbilityPreset();
  const rolled = preset.generate();
  if (!current || preset.stats.some(stat => rolled[stat.key] !== current[stat.key])) return rolled;

  // A reroll should visibly change the sheet even in the unlikely event of an identical roll.
  const firstStat = preset.stats[0];
  if (!firstStat) return rolled;
  return {
    ...rolled,
    [firstStat.key]: rolled[firstStat.key] === firstStat.max ? firstStat.min : rolled[firstStat.key] + 1
  };
}

function normalizedSkill(value: number): number {
  return Math.max(1, Math.min(100, Number.isFinite(value) ? Math.round(value) : 50));
}

/** Characters-owned setup dialog for a custom player character. */
export const PlayerCharacterDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("playerCharacter"));
  const culturesSet = useOptionsState(state => state.culturesSet);
  const openCharacterDetails = useCharactersUiState(state => state.openCharacterDetails);
  const playerCharacterId = usePlayerCharacterState(state => state.playerCharacterId);
  const [name, setName] = useState("");
  const [burgId, setBurgId] = useState<number>(0);
  const [cultureId, setCultureId] = useState<number>(0);
  const [raceId, setRaceId] = useState<number>(1);
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<Gender>("female");
  const [abilityValues, setAbilityValues] = useState<Record<string, number>>(() => rollAbilityValues(undefined));
  const [error, setError] = useState<string | null>(null);

  const world = getWorldContext();
  const burgs = useMemo(
    () =>
      (world.pack.burgs ?? [])
        .filter(burg => burg.i && !burg.removed)
        .toSorted((left, right) => (left.name ?? "").localeCompare(right.name ?? "")),
    [world.pack.burgs]
  );
  const cultures = useMemo(() => (world.pack.cultures ?? []).filter(culture => culture.i > 0), [world.pack.cultures]);
  const abilityPreset = getSelectedAbilityPreset();
  const races = useMemo(() => filterAllowedCharacterRaces(world.pack.races ?? []), [world.pack.races]);

  const getRaceForCulture = useCallback(
    (nextCultureId: number): number => {
      const cultureRaceId = world.pack.cultures?.[nextCultureId]?.race;
      return races.find(race => race.i === cultureRaceId)?.i ?? races[0]?.i ?? 0;
    },
    [races, world.pack.cultures]
  );

  const rerollDraft = useCallback((): void => {
    const burg = randomItem(burgs);
    const nextCultureId = randomItem(cultures)?.i ?? 0;
    const preferredRaceId = getRaceForCulture(nextCultureId);
    const nextRaceId = randomItem(races)?.i ?? preferredRaceId;

    setBurgId(burg?.i ?? 0);
    setCultureId(nextCultureId);
    setRaceId(nextRaceId);
    setName("");
    setAge(rollDefaultAdultAge(nextRaceId));
    setGender(resolvePersonGender(nextCultureId, undefined, nextRaceId));
    setAbilityValues(current => rollAbilityValues(current));
    setError(null);
  }, [burgs, cultures, getRaceForCulture, races]);

  useEffect(() => {
    if (isOpen) rerollDraft();
  }, [isOpen, rerollDraft]);

  const handleBurgChange = (nextBurgId: number): void => {
    setBurgId(nextBurgId);
    const burg = world.pack.burgs?.[nextBurgId];
    const stateCulture = burg?.state !== undefined ? world.pack.states?.[burg.state]?.culture : undefined;
    const nextCultureId = burg?.culture ?? stateCulture;
    if (nextCultureId === undefined) return;
    setCultureId(nextCultureId);
    setRaceId(getRaceForCulture(nextCultureId));
  };

  const handleCreate = (): void => {
    if (!burgId || !cultureId || !raceId) {
      setError(t("extensions.playerCharacter.errorMissing"));
      return;
    }
    const isInitialPlayerCharacter = playerCharacterId === null;
    const character = createPlayerCharacter({
      name,
      burgId,
      cultureId,
      raceId,
      age,
      gender,
      abilityValues,
      isPlayerCharacter: isInitialPlayerCharacter
    });
    if (!character || (isInitialPlayerCharacter && !setInitialPlayerCharacter(character.i))) {
      setError(t("extensions.playerCharacter.errorCreate"));
      return;
    }
    useCharactersUiState.getState().bumpRefreshToken();
    openCharacterDetails(character.i);
    closeDialog("playerCharacter");
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "viewCharacters" } }));
  };

  const livePlayer = getCharacters().find(character => character.i === playerCharacterId);
  const isFantasy = culturesSet.toLowerCase().includes("fantasy");

  return (
    <Dialog
      isOpen={isOpen}
      title={isFantasy ? t("extensions.playerCharacter.titleFantasy") : t("extensions.playerCharacter.titleCharacter")}
      onClose={() => closeDialog("playerCharacter")}
      buttons={[
        {
          label: t("extensions.playerCharacter.reroll"),
          onClick: rerollDraft,
          disabled: !burgs.length || !cultures.length || !races.length
        },
        {
          label:
            playerCharacterId === null
              ? t("extensions.playerCharacter.createPlayer")
              : t("extensions.playerCharacter.createCharacter"),
          onClick: handleCreate,
          disabled: !burgs.length || !cultures.length || !races.length
        }
      ]}
      className="player-character-setup"
    >
      <div id="playerCharacterSetup" style={{ display: "grid", gap: 10, minWidth: 460, padding: 10 }}>
        <p style={{ margin: 0 }}>
          {playerCharacterId === null
            ? t("extensions.playerCharacter.introFirst")
            : t("extensions.playerCharacter.introAdditional")}
        </p>
        {livePlayer && (
          <p style={{ margin: 0 }}>{t("extensions.playerCharacter.currentSheet", { name: livePlayer.name })}</p>
        )}
        <label htmlFor="playerCharacterName">
          {t("extensions.playerCharacter.name")}
          <input
            id="playerCharacterName"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={t("extensions.playerCharacter.namePlaceholder")}
          />
        </label>
        <label htmlFor="playerCharacterBurg">
          {t("extensions.playerCharacter.homeBurg")}
          <select
            id="playerCharacterBurg"
            value={burgId}
            onChange={event => handleBurgChange(Number(event.target.value))}
          >
            {burgs.map(burg => (
              <option key={burg.i} value={burg.i}>
                {burg.name ?? `Burg ${burg.i}`}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label htmlFor="playerCharacterCulture">
            {t("extensions.playerCharacter.culture")}
            <select
              id="playerCharacterCulture"
              value={cultureId}
              onChange={event => setCultureId(Number(event.target.value))}
            >
              {cultures.map(culture => (
                <option key={culture.i} value={culture.i}>
                  {culture.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="playerCharacterRace">
            {t("extensions.playerCharacter.race")}
            <select id="playerCharacterRace" value={raceId} onChange={event => setRaceId(Number(event.target.value))}>
              {races.map(race => (
                <option key={race.i} value={race.i}>
                  {race.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="playerCharacterAge">
            {t("extensions.playerCharacter.age")}
            <input
              id="playerCharacterAge"
              type="number"
              min="1"
              max="10000"
              value={age}
              onChange={event => setAge(Number(event.target.value))}
            />
          </label>
          <label htmlFor="playerCharacterGender">
            {t("extensions.playerCharacter.gender")}
            <select
              id="playerCharacterGender"
              value={gender}
              onChange={event => setGender(event.target.value as Gender)}
            >
              <option value="female">{t("extensions.playerCharacter.female")}</option>
              <option value="male">{t("extensions.playerCharacter.male")}</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{abilityPreset.label}</legend>
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {abilityPreset.stats.map(stat => (
              <label key={stat.key} htmlFor={`playerCharacterAbility-${stat.key}`}>
                {stat.label}
                <input
                  id={`playerCharacterAbility-${stat.key}`}
                  type="number"
                  min={stat.min}
                  max={stat.max}
                  value={abilityValues[stat.key] ?? stat.default}
                  onChange={event =>
                    setAbilityValues(current => ({
                      ...current,
                      [stat.key]: Math.max(stat.min, Math.min(stat.max, normalizedSkill(Number(event.target.value))))
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" style={{ color: "#c92a2a", margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};
