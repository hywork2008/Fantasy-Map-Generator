import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorldLanguages } from "../../../../types/worldLanguages";
import { generateWorldLanguages } from "../../../../utils/worldLanguages";
import { getApi, getWorldContext } from "../../charactersContext";

/** Explicit editor: opening it never activates language rules or changes existing speakers. */
export function WorldLanguageEditor() {
  const { t } = useTranslation();
  const pack = getWorldContext().pack;
  const [draft, setDraft] = useState<WorldLanguages>(() =>
    structuredClone(pack.languageWorld ?? generateWorldLanguages(pack.cultures, pack.states))
  );
  const [error, setError] = useState("");
  const [cultureId, setCultureId] = useState(pack.cultures.find(culture => culture.i > 0 && !culture.removed)?.i ?? 0);
  const [stateId, setStateId] = useState(pack.states.find(state => state.i > 0 && !state.removed)?.i ?? 0);
  const text = (key: string) => t(`characters.expertise.${key}`);
  const update = (fn: (draft: WorldLanguages) => void) =>
    setDraft(previous => {
      const next = structuredClone(previous);
      fn(next);
      return next;
    });
  const newId = (prefix: string, ids: string[]) => {
    let index = 1;
    while (ids.includes(`${prefix}-${index}`)) index++;
    return `${prefix}-${index}`;
  };
  const checkList = (selected: string[], set: (next: string[]) => void) =>
    draft.languages.map(language => (
      <label key={language.id} style={{ display: "inline-block", marginRight: 8 }}>
        <input
          type="checkbox"
          checked={selected.includes(language.id)}
          onChange={event =>
            set(event.target.checked ? [...selected, language.id] : selected.filter(id => id !== language.id))
          }
        />{" "}
        {language.name}
      </label>
    ));
  return (
    <fieldset>
      <legend>{text("worldSettings")}</legend>
      <p>{text("worldHint")}</p>
      {error && <p role="alert">{error}</p>}
      <h5>{text("scripts")}</h5>
      {draft.scripts.map(script => (
        <label key={script.id}>
          {text("script")}{" "}
          <input
            aria-label={text("script")}
            value={script.name}
            onChange={event =>
              update(next => {
                next.scripts.find(entry => entry.id === script.id)!.name = event.target.value;
              })
            }
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() =>
          update(next =>
            next.scripts.push({
              id: newId(
                "script",
                next.scripts.map(script => script.id)
              ),
              name: text("newScript")
            })
          )
        }
      >
        {text("addScript")}
      </button>
      <h5>{text("languages")}</h5>
      {draft.languages.map(language => (
        <div key={language.id}>
          <input
            aria-label={text("language")}
            value={language.name}
            onChange={event =>
              update(next => {
                next.languages.find(entry => entry.id === language.id)!.name = event.target.value;
              })
            }
          />{" "}
          {draft.scripts.map(script => (
            <label key={script.id} style={{ marginRight: 6 }}>
              <input
                type="checkbox"
                checked={language.scriptIds.includes(script.id)}
                onChange={event =>
                  update(next => {
                    const record = next.languages.find(entry => entry.id === language.id)!;
                    record.scriptIds = event.target.checked
                      ? [...record.scriptIds, script.id]
                      : record.scriptIds.filter(id => id !== script.id);
                  })
                }
              />{" "}
              {script.name}
            </label>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update(next =>
            next.languages.push({
              id: newId(
                "language",
                next.languages.map(language => language.id)
              ),
              name: text("newLanguage"),
              scriptIds: []
            })
          )
        }
      >
        {text("addLanguage")}
      </button>
      <h5>{text("culture")}</h5>
      <select
        aria-label={text("culture")}
        value={cultureId}
        onChange={event => setCultureId(Number(event.target.value))}
      >
        {pack.cultures
          .filter(culture => culture.i > 0 && !culture.removed)
          .map(culture => (
            <option key={culture.i} value={culture.i}>
              {culture.name}
            </option>
          ))}
      </select>
      <p>{text("sharesHint")}</p>
      {draft.languages.map(language => (
        <label key={language.id} style={{ display: "inline-block", marginRight: 8 }}>
          {language.name}{" "}
          <input
            aria-label={`${language.name} ${text("share")}`}
            type="number"
            min={0}
            max={1}
            step="0.05"
            style={{ width: 65 }}
            value={
              draft.cultures
                .find(culture => culture.cultureId === cultureId)
                ?.languages.find(entry => entry.languageId === language.id)?.share ?? 0
            }
            onChange={event =>
              update(next => {
                let profile = next.cultures.find(entry => entry.cultureId === cultureId);
                if (!profile) {
                  profile = { cultureId, languages: [], literaryLanguageIds: [], liturgicalLanguageIds: [] };
                  next.cultures.push(profile);
                }
                profile.languages = profile.languages.filter(entry => entry.languageId !== language.id);
                const share = Number(event.target.value);
                if (share > 0) profile.languages.push({ languageId: language.id, share });
              })
            }
          />
        </label>
      ))}
      {(["literaryLanguageIds", "liturgicalLanguageIds"] as const).map(field => (
        <div key={field}>
          <strong>{text(field)}</strong>{" "}
          {checkList(draft.cultures.find(culture => culture.cultureId === cultureId)?.[field] ?? [], selected =>
            update(next => {
              const profile = next.cultures.find(culture => culture.cultureId === cultureId);
              if (profile) profile[field] = selected;
            })
          )}
        </div>
      ))}
      <h5>{text("statePolicy")}</h5>
      <select
        aria-label={text("statePolicy")}
        value={stateId}
        onChange={event => setStateId(Number(event.target.value))}
      >
        {pack.states
          .filter(state => state.i > 0 && !state.removed)
          .map(state => (
            <option key={state.i} value={state.i}>
              {state.name}
            </option>
          ))}
      </select>
      {(
        ["administrativeLanguageIds", "courtLanguageIds", "diplomaticLanguageIds", "recognizedLanguageIds"] as const
      ).map(field => (
        <div key={field}>
          <strong>{text(field)}</strong>{" "}
          {checkList(draft.states.find(state => state.stateId === stateId)?.[field] ?? [], selected =>
            update(next => {
              let policy = next.states.find(state => state.stateId === stateId);
              if (!policy) {
                policy = {
                  stateId,
                  administrativeLanguageIds: [],
                  courtLanguageIds: [],
                  diplomaticLanguageIds: [],
                  recognizedLanguageIds: []
                };
                next.states.push(policy);
              }
              policy[field] = selected;
            })
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          try {
            getApi().dispatchExtensionCommand({ extensionId: "characters", name: "setWorldLanguages", payload: draft });
            setError("");
          } catch (error) {
            setError(String(error));
          }
        }}
      >
        {text("saveWorld")}
      </button>
    </fieldset>
  );
}
