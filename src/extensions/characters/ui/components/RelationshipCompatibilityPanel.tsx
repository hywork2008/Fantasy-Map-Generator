import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Culture } from "../../../../types/models";
import { canHaveDirectSolidarity } from "../../backstoryProfile";
import type { Character } from "../../characterTypes";
import { getCompatibilityProfile, getRelationshipCompatibility } from "../../relationshipCompatibility";

export function RelationshipCompatibilityPanel({
  character,
  characters,
  cultures,
  onOpenCharacter
}: {
  character: Character;
  characters: Character[];
  cultures: Culture[];
  onOpenCharacter: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("contacts");
  const [sort, setSort] = useState<"friendship" | "romance" | "friction">("friendship");
  const [limit, setLimit] = useState(30);
  const cultureById = new Map(cultures.map(culture => [culture.i, culture]));
  const contextFor = (person: Character) => ({
    appearance: person.appearance,
    norms: cultureById.get(person.culture)?.romanceNorms
  });
  const profile = getCompatibilityProfile(character.personality, contextFor(character));
  const profileLabel = (p: typeof profile) =>
    `${t(`characters.compatibility.social.${p.social}`)} / ${t(`characters.compatibility.romantic.${p.romantic}`)}`;
  const candidates = characters.filter(other => {
    if (other.i === character.i || other.dead || !other.personality) return false;
    if (query && !other.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return false;
    return (
      scope === "all" ||
      character.solidarity?.[other.i] !== undefined ||
      character.favor?.[other.i] !== undefined ||
      other.solidarity?.[character.i] !== undefined ||
      other.favor?.[character.i] !== undefined ||
      (character.location !== undefined && character.location > 0 && character.location === other.location) ||
      canHaveDirectSolidarity(character, other)
    );
  });
  const resolvedRace = (person: Character) => person.race ?? cultureById.get(person.culture)?.race;
  const matches = candidates
    .map(other => ({
      other,
      match: getRelationshipCompatibility(
        { ...character, race: resolvedRace(character) },
        { ...other, race: resolvedRace(other) },
        contextFor(character),
        contextFor(other)
      )
    }))
    .sort((a, b) => b.match[sort] - a.match[sort] || a.other.i - b.other.i);
  const strength = (score: number) =>
    t(`characters.compatibility.strength.${score >= 60 ? "high" : score >= 35 ? "moderate" : "low"}`);

  return (
    <section className="relationship-compatibility-panel">
      <h3>{t("characters.compatibility.title")}</h3>
      <p>{t("characters.compatibility.ownType", { type: profileLabel(profile) })}</p>
      <p style={{ fontSize: "0.9em" }}>{t("characters.compatibility.hint")}</p>
      <div className="relationship-compatibility-controls">
        <label>
          {t("characters.compatibility.search")}{" "}
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setLimit(30);
            }}
          />
        </label>
        <label>
          {t("characters.compatibility.scope")}{" "}
          <select
            value={scope}
            onChange={event => {
              setScope(event.target.value);
              setLimit(30);
            }}
          >
            <option value="contacts">{t("characters.compatibility.contacts")}</option>
            <option value="all">{t("characters.compatibility.all")}</option>
          </select>
        </label>
        <label>
          {t("characters.compatibility.sort")}{" "}
          <select
            value={sort}
            onChange={event => {
              setSort(event.target.value as typeof sort);
              setLimit(30);
            }}
          >
            {(["friendship", "romance", "friction"] as const).map(axis => (
              <option key={axis} value={axis}>
                {t(`characters.compatibility.axes.${axis}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>{t("characters.compatibility.count", { shown: Math.min(limit, matches.length), total: matches.length })}</p>
      {matches.length ? (
        <section
          className="relationship-compatibility-results"
          aria-label={t("characters.compatibility.title")}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard scrolling of the table.
          tabIndex={0}
        >
          <table className="fmg-table relationship-compatibility-table">
            <thead>
              <tr>
                <th>{t("characters.name")}</th>
                <th>{t("characters.compatibility.type")}</th>
                <th>{t("characters.compatibility.outlook")}</th>
                {(["friendship", "romance", "friction"] as const).map(axis => (
                  <th key={axis}>{t(`characters.compatibility.axes.${axis}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, limit).map(({ other, match }) => (
                <tr key={other.i}>
                  <td>
                    <button type="button" onClick={() => onOpenCharacter(other.i)}>
                      {other.name}
                    </button>
                  </td>
                  <td>{profileLabel(match.to)}</td>
                  <td>
                    <strong>{t(`characters.compatibility.tendency.${match.tendency}`)}</strong>
                    <details>
                      <summary>{t("characters.compatibility.reasonsLabel")}</summary>
                      <ul>
                        {match.reasons.map(reason => (
                          <li key={reason}>{t(`characters.compatibility.reasons.${reason}`)}</li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  {(["friendship", "romance", "friction"] as const).map(axis => (
                    <td key={axis}>
                      {strength(match[axis])}
                      {axis === "romance" && match.romanceConditional && (
                        <small style={{ display: "block" }}>{t("characters.compatibility.conditional")}</small>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p>{t("characters.compatibility.empty")}</p>
      )}
      {matches.length > limit && (
        <button type="button" onClick={() => setLimit(value => value + 30)}>
          {t("characters.compatibility.more")}
        </button>
      )}
    </section>
  );
}
