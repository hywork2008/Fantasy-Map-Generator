import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { setPlayerCharacter } from "../../../nobility/controllers/playerCharacter";
import { hasNobilityContext } from "../../../nobility/nobilityContext";
import { usePlayerCharacterState } from "../../../nobility/store/playerCharacterState";
import { getApi, getCharacters, getWorldContext } from "../../charactersContext";
import type { CharacterRole, TitleHolding } from "../../characterTypes";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../../utils/characterLabels";
import { useCharactersUiState } from "../charactersUiState";
import { RadarChart } from "../components/charts/RadarChart";

// Economy's `markets` no longer augments PackedGraph's type (see
// src/extensions/economy/types.ts); read it structurally instead of importing Economy.
type EconomyMarketSnapshot = Readonly<{ i: number; centerBurgId: number; name?: string }>;

function getEconomyMarkets(pack: unknown): readonly EconomyMarketSnapshot[] {
  const markets = (pack as Record<string, unknown>).markets;
  return Array.isArray(markets) ? (markets as EconomyMarketSnapshot[]) : [];
}

export const CharacterDetailsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("characterDetails"));
  const selectedCharacterId = useCharactersUiState(state => state.selectedCharacterId);
  useCharactersUiState(state => state.refreshToken);
  const playerCharacterId = usePlayerCharacterState(state => state.playerCharacterId);
  const [activeTab, setActiveTab] = useState<"skills" | "personality">("skills");

  const worldContext = getWorldContext();
  const characters = getCharacters();
  const states = worldContext.pack.states;
  const provinces = worldContext.pack.provinces;
  const cultures = worldContext.pack.cultures;
  const burgs = worldContext.pack.burgs;
  const markets = getEconomyMarkets(worldContext.pack);

  const character = characters.find(c => c.i === selectedCharacterId);

  if (!isOpen || !character) {
    return null;
  }

  const nobilityAvailable = hasNobilityContext();
  const isCurrentPlayer = playerCharacterId === character.i;
  const canSetAsPlayer = nobilityAvailable && !character.dead && !isCurrentPlayer;

  const handleSetAsPlayerCharacter = () => {
    if (!canSetAsPlayer) return;
    setPlayerCharacter(character.i);
  };

  // "state" titles (rulers, central offices, field/fleet officers) point at pack.states;
  // "province" titles (frontier lords) point at pack.provinces — same entityId space, different table.
  const getTitleEntityName = (titleHolding: TitleHolding) =>
    titleHolding.entityType === "province"
      ? (provinces?.[titleHolding.entityId]?.name ?? t("characters.unknown"))
      : (states[titleHolding.entityId]?.name ?? t("characters.unknown"));

  const getRoleEntityName = (role: CharacterRole) => {
    if (role.entityType === "burg") {
      const burg = burgs[role.entityId];
      if (!burg) return t("characters.burg", { id: role.entityId });
      const market = markets.find(m => m.i === burg.market);
      const marketCenter = market ? burgs[market.centerBurgId] : undefined;
      const marketName =
        market?.name ||
        marketCenter?.name ||
        (market ? t("characters.market", { id: market.i }) : t("characters.noMarket"));
      return t("characters.marketAtBurg", {
        burg: burg.name ?? t("characters.burg", { id: role.entityId }),
        market: marketName
      });
    }

    if (role.entityType !== "market") return t("characters.entity", { type: role.entityType, id: role.entityId });

    const market = markets.find(m => m.i === role.entityId);
    if (!market) return t("characters.market", { id: role.entityId });

    const center = burgs[market.centerBurgId];
    const marketName = market.name || center?.name || t("characters.market", { id: market.i });
    return center ? `${marketName} (${center.name})` : marketName;
  };

  const cultureName = cultures[character.culture]?.name ?? t("characters.unknown");

  const getAffinityText = (score: number) => {
    if (score >= 50) return t("characters.friendly");
    if (score >= 20) return t("characters.positive");
    if (score <= -50) return t("characters.hostile");
    if (score <= -20) return t("characters.negative");
    return t("characters.neutral");
  };

  let locationStr = t("characters.unknown");
  if (character.location !== undefined) {
    const burg = burgs[character.location];
    if (burg) {
      const stateId = burg.state;
      const stateName =
        stateId !== undefined ? (states[stateId]?.name ?? t("characters.unknownState")) : t("characters.unknownState");
      locationStr = `${burg.name} (${stateName})`;
    }
  }

  const statusText = character.dead
    ? character.deathYear
      ? t("characters.deceasedWithYear", { age: character.age, year: character.deathYear })
      : t("characters.deceased", { age: character.age })
    : t("characters.alive");

  const downloadCSV = () => {
    if (!character) return;

    const rows: string[] = [];

    // Basic Info
    rows.push(t("characters.personalInformation"));
    rows.push(`${t("characters.name")}, ${character.name}`);
    rows.push(`${t("characters.age")}, ${character.age}`);
    rows.push(`${t("characters.gender")}, ${t(`characters.${character.gender}`)}`);
    rows.push(`${t("characters.status")}, ${statusText}`);
    rows.push(`${t("characters.culture")}, ${cultureName}`);
    rows.push(`${t("characters.location")}, ${locationStr}`);
    rows.push(`${t("characters.appearance")}, ${character.appearance ?? t("characters.notAvailable")}`);
    rows.push(`${t("characters.prestige")}, ${character.prestige ?? t("characters.notAvailable")}`);
    rows.push(`${t("characters.wealth")}, ${character.wealth ?? 0}`);

    // Family
    if (character.family) {
      rows.push(t("characters.family"));
      rows.push(`${t("characters.spouses")}, ${character.family.spouses}`);
      rows.push(`${t("characters.children")}, ${character.family.children}`);
      rows.push(`${t("characters.grandchildren")}, ${character.family.grandchildren}`);
      if (character.family.greatGrandchildren > 0) {
        rows.push(`${t("characters.greatGrandchildrenLabel")}, ${character.family.greatGrandchildren}`);
      }
    }

    // Skills
    if (character.skills) {
      rows.push(t("characters.skills"));
      rows.push(`${t("characters.artistry")}, ${character.skills.artistry}`);
      rows.push(`${t("characters.diplomacy")}, ${character.skills.diplomacy}`);
      rows.push(`${t("characters.engineering")}, ${character.skills.engineering}`);
      rows.push(`${t("characters.geography")}, ${character.skills.geography}`);
      rows.push(`${t("characters.intrigue")}, ${character.skills.intrigue}`);
      rows.push(`${t("characters.learning")}, ${character.skills.learning}`);
      rows.push(`${t("characters.martial")}, ${character.skills.martial}`);
      rows.push(`${t("characters.prowess")}, ${character.skills.prowess}`);
      rows.push(`${t("characters.stewardship")}, ${character.skills.stewardship}`);
    }

    // Personality
    if (character.personality) {
      rows.push(t("characters.personality"));
      rows.push(`${t("characters.boldness")}, ${character.personality.boldness}`);
      rows.push(`${t("characters.compassion")}, ${character.personality.compassion}`);
      rows.push(`${t("characters.confidence")}, ${character.personality.confidence ?? t("characters.notAvailable")}`);
      rows.push(`${t("characters.energy")}, ${character.personality.energy}`);
      rows.push(`${t("characters.greed")}, ${character.personality.greed}`);
      rows.push(`${t("characters.guile")}, ${character.personality.guile}`);
      rows.push(`${t("characters.honor")}, ${character.personality.honor}`);
      rows.push(`${t("characters.piety")}, ${character.personality.piety}`);
      rows.push(`${t("characters.rationality")}, ${character.personality.rationality}`);
      rows.push(`${t("characters.sociability")}, ${character.personality.sociability}`);
      rows.push(`${t("characters.vengefulness")}, ${character.personality.vengefulness}`);
      rows.push(`${t("characters.zeal")}, ${character.personality.zeal}`);
    }

    // Titles
    if (character.titles && character.titles.length > 0) {
      rows.push(t("characters.titles"));
      character.titles.forEach(titleHolding => {
        const entityName = getTitleEntityName(titleHolding);
        rows.push(
          `${t("characters.titleOf", { title: getCharacterTitleLabel(titleHolding.title), entity: entityName })}, ${titleHolding.landed ? t("characters.landed") : ""} ${titleHolding.startYear ? t("characters.since", { year: titleHolding.startYear }) : ""}`
        );
      });
    }

    if (character.roles && character.roles.length > 0) {
      rows.push(t("characters.roles"));
      character.roles.forEach(role => {
        rows.push(`${getCharacterRoleLabel(role)}, ${getRoleEntityName(role)}`);
      });
    }

    if (character.pastTitles && character.pastTitles.length > 0) {
      rows.push(t("characters.pastTitles"));
      character.pastTitles.forEach(titleHolding => {
        const entityName = getTitleEntityName(titleHolding);
        let titleStr = `${t("characters.titleOf", { title: getCharacterTitleLabel(titleHolding.title), entity: entityName })}, ${titleHolding.startYear ?? "?"} - ${titleHolding.endYear ?? "?"}`;
        if (titleHolding.reason) titleStr += ` (${titleHolding.reason})`;
        rows.push(titleStr);
      });
    }

    // Dynastic Ties
    if (character.marriages && character.marriages.length > 0) {
      rows.push(t("characters.dynasticTies"));
      character.marriages.forEach(stateId => {
        const stateName = states[stateId]?.name ?? t("characters.unknown");
        rows.push(t("characters.marriedInto", { state: stateName }));
      });
    }

    // Affinities
    if (character.affinities && Object.keys(character.affinities).length > 0) {
      rows.push(t("characters.stateAffinities"));
      Object.entries(character.affinities).forEach(([stateIdStr, score]) => {
        const stateId = Number(stateIdStr);
        const state = states[stateId];
        if (state && !state.removed) {
          const text = getAffinityText(score);
          rows.push(`${state.name}, ${t("characters.affinity", { score, affinity: text })}`);
        }
      });
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name.replace(/\s+/g, "_")}_details.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const dialogButtons = [{ label: t("characters.downloadCsv"), onClick: downloadCSV }];
  if (canSetAsPlayer) {
    dialogButtons.unshift({
      label: t("characters.setAsPlayer"),
      onClick: handleSetAsPlayerCharacter
    });
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={t("characters.dialogTitle", { name: character.name })}
      onClose={() => closeDialog("characterDetails")}
      buttons={dialogButtons}
    >
      <div id="characterDetailsContainer" style={{ padding: "10px" }}>
        <h3>{t("characters.personalInformation")}</h3>
        <table className="fmg-table fmg-property-table character-details__table">
          <tbody>
            <tr>
              <th style={{ width: "120px", padding: "4px 0" }}>{t("characters.name")}</th>
              <td>{character.name}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.age")}</th>
              <td>{character.age}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.gender")}</th>
              <td>{t(`characters.${character.gender}`)}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.status")}</th>
              <td>
                {character.dead ? (
                  <span style={{ color: "#ff6b6b", fontWeight: "bold" }}>{statusText}</span>
                ) : (
                  <span style={{ color: "#51cf66", fontWeight: "bold" }}>{statusText}</span>
                )}
              </td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.culture")}</th>
              <td>{cultureName}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.appearance")}</th>
              <td>{character.appearance ?? t("characters.notAvailable")}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.prestige")}</th>
              <td>{character.prestige ?? t("characters.notAvailable")}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }} data-tip={t("characters.wealthTip")}>
                {t("characters.wealth")}
              </th>
              <td>{formatPrice(character.wealth ?? 0)}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>{t("characters.location")}</th>
              <td style={{ display: "flex", alignItems: "center" }}>
                {character.location !== undefined && burgs[character.location] && (
                  <span
                    data-tip={t("characters.zoomToLocation")}
                    className="icon-dot-circled pointer"
                    style={{ marginRight: "6px" }}
                    onClick={() => {
                      const b = burgs[character.location!];
                      getApi().zoomTo(b.x, b.y, 20, 2000);
                    }}
                  />
                )}
                {locationStr}
              </td>
            </tr>
            {character.family && (
              <tr>
                <th style={{ padding: "4px 0" }}>{t("characters.family")}</th>
                <td>
                  {t("characters.familySummary", {
                    maritalStatus: character.family.spouses > 0 ? t("characters.married") : t("characters.unmarried"),
                    spouses: character.family.spouses,
                    children: character.family.children,
                    grandchildren: character.family.grandchildren,
                    greatGrandchildren:
                      character.family.greatGrandchildren > 0
                        ? t("characters.greatGrandchildren", { count: character.family.greatGrandchildren })
                        : ""
                  })}
                </td>
              </tr>
            )}
            {character.titles && character.titles.length > 0 && (
              <tr>
                <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.titles")}</th>
                <td>
                  <ul style={{ margin: 0, listStyleType: "none", padding: 0 }}>
                    {character.titles.map(titleHolding => (
                      <li key={`${titleHolding.entityType}-${titleHolding.entityId}-${titleHolding.title}`}>
                        {t("characters.titleOf", {
                          title: getCharacterTitleLabel(titleHolding.title),
                          entity: getTitleEntityName(titleHolding)
                        })}{" "}
                        {titleHolding.landed ? t("characters.landed") : ""}{" "}
                        {titleHolding.startYear ? t("characters.since", { year: titleHolding.startYear }) : ""}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
            {character.roles && character.roles.length > 0 && (
              <tr>
                <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.roles")}</th>
                <td>
                  <ul style={{ margin: 0, listStyleType: "none", padding: 0 }}>
                    {character.roles.map(role => (
                      <li key={`${role.source}-${role.kind}-${role.entityType}-${role.entityId}`}>
                        {getCharacterRoleLabel(role)}: {getRoleEntityName(role)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
            {character.pastTitles && character.pastTitles.length > 0 && (
              <tr>
                <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.pastTitles")}</th>
                <td>
                  <ul style={{ margin: 0, listStyleType: "none", padding: 0 }}>
                    {character.pastTitles.map((titleHolding, idx) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Past titles can be identical
                      <li key={`past-${idx}`}>
                        {t("characters.titleOf", {
                          title: getCharacterTitleLabel(titleHolding.title),
                          entity: getTitleEntityName(titleHolding)
                        })}{" "}
                        ({titleHolding.startYear ?? "?"} - {titleHolding.endYear ?? "?"})
                        {titleHolding.reason ? (
                          <span style={{ color: "#adb5bd", fontStyle: "italic" }}> - {titleHolding.reason}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="tab" style={{ display: "flex", flexShrink: 0, marginTop: "10px" }}>
          <button
            type="button"
            className={`options ${activeTab === "skills" ? "active" : ""}`}
            onClick={() => setActiveTab("skills")}
          >
            {t("characters.skills")}
          </button>
          <button
            type="button"
            className={`options ${activeTab === "personality" ? "active" : ""}`}
            onClick={() => setActiveTab("personality")}
          >
            {t("characters.personality")}
          </button>
        </div>

        {activeTab === "skills" && (
          <div>
            {character.skills ? (
              <RadarChart
                data={[
                  { axis: t("characters.artistry"), value: character.skills.artistry },
                  { axis: t("characters.diplomacy"), value: character.skills.diplomacy },
                  { axis: t("characters.engineering"), value: character.skills.engineering },
                  { axis: t("characters.geography"), value: character.skills.geography },
                  { axis: t("characters.intrigue"), value: character.skills.intrigue },
                  { axis: t("characters.learning"), value: character.skills.learning },
                  { axis: t("characters.martial"), value: character.skills.martial },
                  { axis: t("characters.prowess"), value: character.skills.prowess },
                  { axis: t("characters.stewardship"), value: character.skills.stewardship }
                ]}
              />
            ) : (
              <p>{t("characters.noSkills")}</p>
            )}
          </div>
        )}

        {activeTab === "personality" && (
          <div>
            {character.personality ? (
              <RadarChart
                data={[
                  { axis: t("characters.boldness"), value: character.personality.boldness },
                  { axis: t("characters.compassion"), value: character.personality.compassion },
                  { axis: t("characters.confidence"), value: character.personality.confidence ?? 0 },
                  { axis: t("characters.energy"), value: character.personality.energy },
                  { axis: t("characters.greed"), value: character.personality.greed },
                  { axis: t("characters.guile"), value: character.personality.guile },
                  { axis: t("characters.honor"), value: character.personality.honor },
                  { axis: t("characters.piety"), value: character.personality.piety },
                  { axis: t("characters.rationality"), value: character.personality.rationality },
                  { axis: t("characters.sociability"), value: character.personality.sociability },
                  { axis: t("characters.vengefulness"), value: character.personality.vengefulness },
                  { axis: t("characters.zeal"), value: character.personality.zeal }
                ]}
              />
            ) : (
              <p>{t("characters.noPersonality")}</p>
            )}
          </div>
        )}

        {character.marriages && character.marriages.length > 0 && (
          <>
            <h3>{t("characters.dynasticTies")}</h3>
            <ul>
              {character.marriages.map(stateId => (
                <li key={`m-${stateId}`}>
                  {t("characters.marriedInto", { state: states[stateId]?.name ?? t("characters.unknown") })}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>{t("characters.stateAffinities")}</h3>
        {character.affinities && Object.keys(character.affinities).length > 0 ? (
          <ul>
            {Object.entries(character.affinities).map(([stateIdStr, score]) => {
              const stateId = Number(stateIdStr);
              const state = states[stateId];
              if (!state || state.removed) return null;

              const text = getAffinityText(score);
              return (
                <li key={`aff-${stateId}`}>
                  <strong>{state.name}:</strong> {t("characters.affinity", { score, affinity: text })}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t("characters.noAffinities")}</p>
        )}
      </div>
    </Dialog>
  );
};
