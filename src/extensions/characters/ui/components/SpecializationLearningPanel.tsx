import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getCharacters, getWorldContext } from "../../charactersContext";
import type { Character } from "../../characterTypes";
import { SPECIALIZATIONS } from "../../specializationCatalog";
import { learningAvailable } from "../../specializationLearning";
import type { SpecializationLearningPlan } from "../../specializationTypes";

export function SpecializationLearningPanel({
  character,
  domainId,
  onSave
}: {
  character: Character;
  domainId: string;
  onSave: (plan?: SpecializationLearningPlan) => void;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`characters.expertise.${key}`);
  const [teacherId, setTeacherId] = useState(0);
  const [kind, setKind] = useState<"domain" | "language">("domain");
  const [axis, setAxis] = useState("knowledge");
  const [languageId, setLanguageId] = useState("");
  const [scriptId, setScriptId] = useState("");
  const world = getWorldContext().pack.languageWorld;
  const teachers = getCharacters().filter(
    teacher =>
      teacher.i !== character.i &&
      !teacher.dead &&
      character.location !== undefined &&
      teacher.location === character.location
  );
  const teacher = teachers.find(teacher => teacher.i === teacherId);
  const plan: SpecializationLearningPlan =
    kind === "domain"
      ? { kind, domainId, teacherId, axis: axis as "knowledge" | "practice" | "appraisal" }
      : {
          kind,
          languageId,
          teacherId,
          axis: axis as "listening" | "speaking" | "reading" | "writing",
          ...(scriptId ? { scriptId } : {})
        };
  const possible = learningAvailable(character, teacher, plan, world);
  const current = character.specializations?.learningPlan;
  const activeTeacher = getCharacters().find(teacher => teacher.i === current?.teacherId);
  return (
    <details>
      <summary>{text("learning")}</summary>
      <p>{text("learningHint")}</p>
      {current && (
        <p>
          {text("teacher")}: {activeTeacher?.name ?? text("unknown")} —{" "}
          {text(learningAvailable(character, activeTeacher, current, world) ? "learningActive" : "learningPaused")}{" "}
          <button type="button" onClick={() => onSave()}>
            {text("stopLearning")}
          </button>
        </p>
      )}
      <label>
        {text("teacher")}{" "}
        <select value={teacherId} onChange={event => setTeacherId(Number(event.target.value))}>
          <option value={0}>{text("chooseTeacher")}</option>
          {teachers.map(teacher => (
            <option key={teacher.i} value={teacher.i}>
              {teacher.name}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label={text("learning")}
        value={kind}
        onChange={event => {
          const next = event.target.value as typeof kind;
          setKind(next);
          setAxis(next === "domain" ? "knowledge" : "listening");
        }}
      >
        <option value="domain">{text("selectedDomain")}</option>
        <option value="language">{text("language")}</option>
      </select>
      {kind === "language" && (
        <>
          <select
            aria-label={text("language")}
            value={languageId}
            onChange={event => {
              setLanguageId(event.target.value);
              setScriptId("");
            }}
          >
            <option value="">{text("chooseLanguage")}</option>
            {world?.languages.map(language => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
          {(axis === "reading" || axis === "writing") && (
            <select aria-label={text("script")} value={scriptId} onChange={event => setScriptId(event.target.value)}>
              <option value="">{text("script")}</option>
              {world?.languages
                .find(language => language.id === languageId)
                ?.scriptIds.map(id => (
                  <option key={id} value={id}>
                    {world.scripts.find(script => script.id === id)?.name ?? id}
                  </option>
                ))}
            </select>
          )}
        </>
      )}
      <select aria-label={text("mode")} value={axis} onChange={event => setAxis(event.target.value)}>
        {(kind === "domain"
          ? [
              "knowledge",
              ...(!SPECIALIZATIONS.get(domainId)?.economyDomain ? ["practice"] : []),
              ...(SPECIALIZATIONS.get(domainId)?.appraisal ? ["appraisal"] : [])
            ]
          : ["listening", "speaking", "reading", "writing"]
        ).map(axis => (
          <option key={axis} value={axis}>
            {text(axis)}
          </option>
        ))}
      </select>
      <button type="button" disabled={!possible} onClick={() => onSave(plan)}>
        {text("startLearning")}
      </button>
      {!possible && <p>{text("learningUnavailable")}</p>}
    </details>
  );
}
