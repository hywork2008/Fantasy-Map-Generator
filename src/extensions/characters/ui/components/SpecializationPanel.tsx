import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getRaceById } from "../../../../data/races";
import { getApi, getWorldContext } from "../../charactersContext";
import type { Character } from "../../characterTypes";
import { SPECIALIZATION_DEFINITIONS, SPECIALIZATION_SKILLS, SPECIALIZATIONS } from "../../specializationCatalog";
import { profileForEditing, readEconomyPractice } from "../../specializationRuntime";
import {
  EXPERTISE_TASKS,
  evaluateExpertise,
  readSpecializationAxis,
  setSpecializationDomain
} from "../../specializations";
import type {
  CharacterSpecializationProfile,
  SpecializationAxis,
  SpecializationDomain
} from "../../specializationTypes";
import { FAMILIARITY_KINDS } from "../../specializationValidation";
import { SpecializationLearningPanel } from "./SpecializationLearningPanel";
import { WorldLanguageEditor } from "./WorldLanguageEditor";

export function SpecializationPanel({ character }: { character: Character }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(SPECIALIZATION_DEFINITIONS[0].id);
  const [task, setTask] = useState("command");
  const [worldOpen, setWorldOpen] = useState(false);
  const [languageId, setLanguageId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [targetKind, setTargetKind] = useState<(typeof FAMILIARITY_KINDS)[number]>("terrain");
  const [targetScore, setTargetScore] = useState(50);
  const profile = character.specializations;
  const world = getWorldContext().pack.languageWorld;
  const pack = getWorldContext().pack;
  const raceKey = getRaceById(pack.races, character.race ?? pack.cultures?.[character.culture]?.race)?.key;
  const visibleDefinitions = (skill?: string) =>
    SPECIALIZATION_DEFINITIONS.filter(
      definition =>
        (!skill || definition.skill === skill) &&
        (!definition.raceKeys?.length || (raceKey && definition.raceKeys.includes(raceKey)))
    );
  const targetOptions: { id: string; name: string }[] =
    targetKind === "culture"
      ? pack.cultures
          .filter(entry => entry.i > 0 && !entry.removed)
          .map(entry => ({ id: String(entry.i), name: entry.name }))
      : targetKind === "region"
        ? pack.states
            .filter(entry => entry.i > 0 && !entry.removed)
            .map(entry => ({ id: String(entry.i), name: entry.name }))
        : targetKind === "troop"
          ? (getWorldContext().options.military ?? []).map(entry => ({ id: entry.name, name: entry.name }))
          : (targetKind === "terrain"
              ? ["plain", "forest", "hill", "mountain", "desert", "wetland", "urban", "river", "coast", "ocean"]
              : targetKind === "climate"
                ? ["cold", "hot", "rainy"]
                : targetKind === "commandScale"
                  ? ["regiment", "army", "fleet"]
                  : []
            ).map(id => ({ id, name: t(`characters.expertise.subjects.${id}`) }));
  const text = (key: string) => t(`characters.expertise.${key}`);
  const label = (id: string) => SPECIALIZATIONS.get(id)?.label[i18n.language.startsWith("ja") ? "ja" : "en"] ?? id;
  const number = (value?: number) => (value === undefined ? text("unknown") : value.toFixed(1));
  const save = (mutate: (profile: CharacterSpecializationProfile) => void) => {
    const next = profileForEditing(character);
    mutate(next);
    try {
      getApi().dispatchExtensionCommand({
        extensionId: "characters",
        name: "setSpecializations",
        payload: { characterId: character.i, profile: next }
      });
      setError("");
    } catch (error) {
      setError(String(error));
    }
  };
  const updateDomain = (domain: SpecializationDomain, axis: SpecializationAxis, value: string) =>
    save(next => {
      const updated = { ...domain };
      if (value === "") delete updated[axis];
      else updated[axis] = Number(value);
      setSpecializationDomain(next, updated);
    });
  const evaluation = evaluateExpertise(
    character,
    EXPERTISE_TASKS[task],
    targetId ? [{ kind: targetKind, id: targetId }] : [],
    readEconomyPractice
  );
  const rows = SPECIALIZATION_DEFINITIONS.filter(
    definition =>
      profile?.domains.some(domain => domain.domainId === definition.id) ||
      (definition.economyDomain && readEconomyPractice(character.i, definition.economyDomain) !== undefined)
  );

  return (
    <section style={{ overflowX: "auto" }}>
      <h4>{text("title")}</h4>
      {!profile && <p>{text("legacy")}</p>}
      <p>{text("editHint")}</p>
      {error && <p role="alert">{error}</p>}
      <label>
        {text("task")}{" "}
        <select value={task} onChange={event => setTask(event.target.value)}>
          {Object.keys(EXPERTISE_TASKS).map(id => (
            <option key={id} value={id}>
              {text(`tasks.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <p>
        {evaluation.score.toFixed(1)} / 100 — {text(evaluation.approximate ? "approximate" : "detailed")}
      </p>
      {evaluation.missing.length > 0 && (
        <small>
          {text("missing")}: {evaluation.missing.map(id => label(id.substring(0, id.lastIndexOf(".")))).join(", ")}
        </small>
      )}
      <table className="fmg-table">
        <thead>
          <tr>
            <th>{text("domain")}</th>
            <th>{text("knowledge")}</th>
            <th>{text("practice")}</th>
            <th>{text("appraisal")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(definition => {
            const domain = profile?.domains.find(domain => domain.domainId === definition.id) ?? {
              domainId: definition.id
            };
            return (
              <tr key={definition.id}>
                <th>
                  {t(`characters.${definition.skill}`)} / {label(definition.id)}
                </th>
                {(["knowledge", "practice", "appraisal"] as const).map(axis => (
                  <td key={axis}>
                    {axis === "appraisal" && !definition.appraisal ? (
                      "—"
                    ) : axis === "practice" && definition.economyDomain ? (
                      <span title={text("sharedPractice")}>
                        {number(readSpecializationAxis(character, definition.id, axis, readEconomyPractice))}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        style={{ width: 65 }}
                        aria-label={`${label(definition.id)} ${text(axis)}`}
                        key={`${character.i}:${domain[axis]}`}
                        defaultValue={domain[axis] ?? ""}
                        placeholder="—"
                        onBlur={event => {
                          if (event.target.value !== String(domain[axis] ?? ""))
                            updateDomain(domain, axis, event.target.value);
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label>
        {text("domain")}{" "}
        <select value={selected} onChange={event => setSelected(event.target.value)}>
          {SPECIALIZATION_SKILLS.map(skill => (
            <optgroup key={skill} label={t(`characters.${skill}`)}>
              {visibleDefinitions(skill).map(definition => (
                <option key={definition.id} value={definition.id}>
                  {label(definition.id)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() =>
          save(next => {
            if (!next.domains.some(domain => domain.domainId === selected)) {
              const definition = SPECIALIZATIONS.get(selected)!;
              next.domains.push({
                domainId: selected,
                knowledge: 0,
                ...(definition.economyDomain
                  ? { practiceRef: { owner: "economy", domain: definition.economyDomain } }
                  : { practice: 0 }),
                ...(definition.appraisal ? { appraisal: 0 } : {})
              });
            }
          })
        }
      >
        {text("add")}
      </button>
      <SpecializationLearningPanel
        character={character}
        domainId={selected}
        onSave={plan =>
          save(next => {
            if (plan) next.learningPlan = plan;
            else delete next.learningPlan;
          })
        }
      />
      <details>
        <summary>{text("familiarities")}</summary>
        <table className="fmg-table">
          <thead>
            <tr>
              <th>{text("domain")}</th>
              <th>{text("target")}</th>
              <th>{text("knowledge")}</th>
              <th>{text("practice")}</th>
            </tr>
          </thead>
          <tbody>
            {profile?.familiarities.map(entry => (
              <tr key={`${entry.domainId}:${entry.kind}:${entry.id}`}>
                <td>{label(entry.domainId)}</td>
                <td>
                  {text(`targets.${entry.kind}`)} / {entry.id}
                </td>
                <td>{number(entry.knowledge)}</td>
                <td>{number(entry.practice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {text("selectedDomain")}: {label(selected)}
        </p>
        <select
          aria-label={text("target")}
          value={targetKind}
          onChange={event => {
            setTargetKind(event.target.value as typeof targetKind);
            setTargetId("");
          }}
        >
          {FAMILIARITY_KINDS.map(kind => (
            <option key={kind} value={kind}>
              {text(`targets.${kind}`)}
            </option>
          ))}
        </select>
        {targetOptions.length > 0 ? (
          <select aria-label={text("targetId")} value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="">{text("target")}</option>
            {targetOptions.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={text("targetId")}
            value={targetId}
            onChange={event => setTargetId(event.target.value)}
            placeholder={text("targetId")}
          />
        )}
        <input
          type="number"
          min={0}
          max={100}
          aria-label={text("practice")}
          value={targetScore}
          onChange={event => setTargetScore(Number(event.target.value))}
          style={{ width: 65 }}
        />
        <button
          type="button"
          disabled={!targetId.trim()}
          onClick={() =>
            save(next => {
              const existing = next.familiarities.find(
                entry => entry.domainId === selected && entry.kind === targetKind && entry.id === targetId.trim()
              );
              if (existing) existing.practice = targetScore;
              else
                next.familiarities.push({
                  domainId: selected,
                  kind: targetKind,
                  id: targetId.trim(),
                  practice: targetScore
                });
            })
          }
        >
          {text("save")}
        </button>
      </details>
      <h4>{text("languages")}</h4>
      <table className="fmg-table">
        <thead>
          <tr>
            <th>{text("language")}</th>
            <th>{text("listening")}</th>
            <th>{text("speaking")}</th>
            <th>{text("literacy")}</th>
          </tr>
        </thead>
        <tbody>
          {profile?.languages.map(language => (
            <tr key={language.languageId}>
              <th>
                {world?.languages.find(entry => entry.id === language.languageId)?.name ?? language.languageId}
                <br />
                <select
                  aria-label={text("acquisition")}
                  value={language.acquisition}
                  onChange={event =>
                    save(next => {
                      next.languages.find(entry => entry.languageId === language.languageId)!.acquisition = event.target
                        .value as typeof language.acquisition;
                    })
                  }
                >
                  {["native", "learned", "heritage"].map(id => (
                    <option key={id} value={id}>
                      {text(id)}
                    </option>
                  ))}
                </select>
              </th>
              {(["listening", "speaking"] as const).map(axis => (
                <td key={axis}>
                  <input
                    key={`${character.i}:${language.languageId}:${axis}:${language[axis]}`}
                    aria-label={`${language.languageId} ${text(axis)}`}
                    type="number"
                    min={0}
                    max={100}
                    style={{ width: 60 }}
                    defaultValue={language[axis]}
                    onBlur={event =>
                      save(next => {
                        next.languages.find(entry => entry.languageId === language.languageId)![axis] = Number(
                          event.target.value
                        );
                      })
                    }
                  />
                </td>
              ))}
              <td>
                {world?.languages
                  .find(entry => entry.id === language.languageId)
                  ?.scriptIds.map(scriptId => {
                    const literacy = language.literacy.find(entry => entry.scriptId === scriptId);
                    return (
                      <div key={scriptId}>
                        {world.scripts.find(entry => entry.id === scriptId)?.name}{" "}
                        {(["reading", "writing"] as const).map(axis => (
                          <label key={axis}>
                            {text(axis)}{" "}
                            <input
                              key={`${character.i}:${language.languageId}:${scriptId}:${axis}:${literacy?.[axis]}`}
                              aria-label={`${language.languageId} ${scriptId} ${text(axis)}`}
                              type="number"
                              min={0}
                              max={100}
                              style={{ width: 60 }}
                              defaultValue={literacy?.[axis] ?? 0}
                              onBlur={event =>
                                save(next => {
                                  const record = next.languages.find(
                                    entry => entry.languageId === language.languageId
                                  )!;
                                  let script = record.literacy.find(entry => entry.scriptId === scriptId);
                                  if (!script) {
                                    script = { scriptId, reading: 0, writing: 0 };
                                    record.literacy.push(script);
                                  }
                                  script[axis] = Number(event.target.value);
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    );
                  }) ?? text("unknown")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <select aria-label={text("language")} value={languageId} onChange={event => setLanguageId(event.target.value)}>
        <option value="">{text("chooseLanguage")}</option>
        {world?.languages
          .filter(language => !profile?.languages.some(entry => entry.languageId === language.id))
          .map(language => (
            <option key={language.id} value={language.id}>
              {language.name}
            </option>
          ))}
      </select>
      <button
        type="button"
        disabled={!languageId}
        onClick={() => {
          save(next => {
            if (!next.languages.some(language => language.languageId === languageId))
              next.languages.push({ languageId, listening: 0, speaking: 0, literacy: [], acquisition: "learned" });
          });
          setLanguageId("");
        }}
      >
        {text("add")}
      </button>
      <button type="button" onClick={() => setWorldOpen(!worldOpen)}>
        {text("worldSettings")}
      </button>
      {worldOpen && <WorldLanguageEditor />}
      <details>
        <summary>{text("experience")}</summary>
        <p>{text("experienceHint")}</p>
        <table className="fmg-table">
          <thead>
            <tr>
              <th>{text("year")}</th>
              <th>{text("domain")}</th>
              <th>{text("mode")}</th>
              <th>{text("duration")}</th>
              <th>{text("outcome")}</th>
            </tr>
          </thead>
          <tbody>
            {profile?.experience.map(entry => (
              <tr key={entry.id}>
                <td>{entry.year}</td>
                <td>{label(entry.domainId)}</td>
                <td>{text(`modes.${entry.mode}`)}</td>
                <td>{entry.coverage.toFixed(3)}</td>
                <td>{text(`outcomes.${entry.outcome}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
