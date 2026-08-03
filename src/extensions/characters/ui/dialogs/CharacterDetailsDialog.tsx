import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { setPlayerCharacter } from "../../../nobility/controllers/playerCharacter";
import { hasNobilityContext } from "../../../nobility/nobilityContext";
import { usePlayerCharacterState } from "../../../nobility/store/playerCharacterState";
import { getFavorBand, getSolidarityBand, inferRoleClass } from "../../backstoryProfile";
import { getApi, getCharacters, getWorldContext } from "../../charactersContext";
import type { Character, CharacterRole, TitleHolding } from "../../characterTypes";
import { formatFlavorHook } from "../../flavorHooks";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../../utils/characterLabels";
import { useCharactersUiState } from "../charactersUiState";
import { RadarChart } from "../components/charts/RadarChart";

/** Primary office label for overview/relation tables (first title, else first role). */
function getOfficeLabel(character: Character): string {
  const holding = character.titles[0];
  if (holding) return getCharacterTitleLabel(holding.title);
  const role = character.roles?.[0];
  return role ? getCharacterRoleLabel(role) : "";
}

/** State used for “same country” checks: nationality when known, else affiliation. */
function getCountryStateId(character: Character): number {
  return character.nationalityStateId ?? character.state;
}

// Economy's `markets` no longer augments PackedGraph's type (see
// src/extensions/economy/types.ts); read it structurally instead of importing Economy.
type EconomyMarketSnapshot = Readonly<{ i: number; centerBurgId: number; name?: string }>;
type EconomyGoodSnapshot = Readonly<{ i: number; name: string; icon: string; unit: string }>;
type EconomyInventoryCostBasisSnapshot = Readonly<{
  characterId: number;
  goodId: number;
  units: number;
  averageUnitCost: number;
}>;
type CharacterInventoryRow = Readonly<{
  goodId: number;
  goodName: string;
  goodIcon: string;
  unit: string;
  units: number;
  averageUnitCost: number | null;
}>;
type CharacterDetailsTab = "skills" | "personality" | "inventory" | "backstory" | "relationships" | "stateAffinities";

function getEconomyMarkets(pack: unknown): readonly EconomyMarketSnapshot[] {
  const markets = (pack as Record<string, unknown>).markets;
  return Array.isArray(markets) ? (markets as EconomyMarketSnapshot[]) : [];
}

function isEconomyGood(value: unknown): value is EconomyGoodSnapshot {
  if (!value || typeof value !== "object") return false;
  const good = value as Record<string, unknown>;
  return (
    typeof good.i === "number" &&
    typeof good.name === "string" &&
    typeof good.icon === "string" &&
    typeof good.unit === "string"
  );
}

function isInventoryCostBasis(value: unknown): value is EconomyInventoryCostBasisSnapshot {
  if (!value || typeof value !== "object") return false;
  const basis = value as Record<string, unknown>;
  return (
    typeof basis.characterId === "number" &&
    typeof basis.goodId === "number" &&
    typeof basis.units === "number" &&
    typeof basis.averageUnitCost === "number"
  );
}

function getEconomyInventoryRows(character: Character): CharacterInventoryRow[] {
  const economy = getApi().simulationContext?.extensions?.economy;
  if (!economy || typeof economy !== "object" || !character.inventory) return [];
  const slice = economy as Record<string, unknown>;
  const goods = Array.isArray(slice.goods) ? slice.goods.filter(isEconomyGood) : [];
  const costs = Array.isArray(slice.characterInventoryCostBases)
    ? slice.characterInventoryCostBases.filter(isInventoryCostBasis)
    : [];
  const goodById = new Map(goods.map(good => [good.i, good]));
  const costByGoodId = new Map(costs.filter(cost => cost.characterId === character.i).map(cost => [cost.goodId, cost]));

  return Object.entries(character.inventory)
    .map(([goodIdString, units]) => {
      const goodId = Number(goodIdString);
      const good = goodById.get(goodId);
      const cost = costByGoodId.get(goodId);
      return {
        goodId,
        goodName: good?.name ?? `Good ${goodId}`,
        goodIcon: good?.icon ?? "good-unknown",
        unit: good?.unit ?? "",
        units,
        averageUnitCost: cost && cost.units + 1e-7 >= units ? cost.averageUnitCost : null
      };
    })
    .filter(row => row.units > 0)
    .sort((left, right) => left.goodName.localeCompare(right.goodName));
}

export const CharacterDetailsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("characterDetails"));
  const selectedCharacterId = useCharactersUiState(state => state.selectedCharacterId);
  const detailsHistory = useCharactersUiState(state => state.detailsHistory);
  const detailsHistoryIndex = useCharactersUiState(state => state.detailsHistoryIndex);
  const pushCharacterDetails = useCharactersUiState(state => state.pushCharacterDetails);
  const goBackCharacterDetails = useCharactersUiState(state => state.goBackCharacterDetails);
  const goForwardCharacterDetails = useCharactersUiState(state => state.goForwardCharacterDetails);
  const clearCharacterDetailsHistory = useCharactersUiState(state => state.clearCharacterDetailsHistory);
  useCharactersUiState(state => state.refreshToken);
  const playerCharacterId = usePlayerCharacterState(state => state.playerCharacterId);
  const [activeTab, setActiveTab] = useState<CharacterDetailsTab>("skills");
  const [, setInventoryRevision] = useState(0);

  useEffect(() => {
    const onInventoryChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!detail || typeof detail !== "object") return;
      if ((detail as { characterId?: unknown }).characterId === selectedCharacterId) {
        setInventoryRevision(revision => revision + 1);
      }
    };
    document.addEventListener("fmg:character-inventory-changed", onInventoryChanged);
    return () => document.removeEventListener("fmg:character-inventory-changed", onInventoryChanged);
  }, [selectedCharacterId]);

  // Clear browsing history whenever the dialog is closed (X, close-all, or programmatic).
  useEffect(() => {
    if (!isOpen) clearCharacterDetailsHistory();
  }, [isOpen, clearCharacterDetailsHistory]);

  const worldContext = getWorldContext();
  const characters = getCharacters();
  const states = worldContext.pack.states;
  const provinces = worldContext.pack.provinces;
  const cultures = worldContext.pack.cultures;
  const races = worldContext.pack.races ?? [];
  const burgs = worldContext.pack.burgs;
  const dynasties = worldContext.pack.dynasties ?? [];
  const markets = getEconomyMarkets(worldContext.pack);

  const character = characters.find(c => c.i === selectedCharacterId);
  const inventoryRows = character ? getEconomyInventoryRows(character) : [];
  const hasStateAffinitiesTab = character ? inferRoleClass(character) === "ruler" : false;

  useEffect(() => {
    if (activeTab === "stateAffinities" && !hasStateAffinitiesTab) {
      setActiveTab("skills");
    }
  }, [activeTab, hasStateAffinitiesTab]);

  if (!isOpen || !character) {
    return null;
  }

  const canGoBack = detailsHistoryIndex > 0;
  const canGoForward = detailsHistoryIndex >= 0 && detailsHistoryIndex < detailsHistory.length - 1;

  const nobilityAvailable = hasNobilityContext();
  const isCurrentPlayer = playerCharacterId === character.i;
  const canSetAsPlayer = nobilityAvailable && !character.dead && !isCurrentPlayer;

  const handleClose = () => {
    closeDialog("characterDetails");
    // History is cleared by the isOpen effect above.
  };

  const handleSetAsPlayerCharacter = () => {
    if (!canSetAsPlayer) return;
    setPlayerCharacter(character.i);
  };

  const handleOpenLinkedCharacter = (id: number) => {
    if (id === character.i) return;
    pushCharacterDetails(id);
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
  const raceId = character.race ?? cultures[character.culture]?.race;
  const raceName =
    (raceId !== undefined ? races[raceId]?.name : undefined) ??
    (raceId !== undefined ? cultures[character.culture]?.name : undefined) ??
    t("characters.unknown");
  const looks = character.looks;

  const getAffinityText = (score: number) => {
    if (score >= 50) return t("characters.friendly");
    if (score >= 20) return t("characters.positive");
    if (score <= -50) return t("characters.hostile");
    if (score <= -20) return t("characters.negative");
    return t("characters.neutral");
  };

  const formatBurgPlace = (burgId: number | undefined) => {
    if (burgId === undefined) return t("characters.notAvailable");
    const burg = burgs[burgId];
    if (!burg) return t("characters.burg", { id: burgId });
    const stateName =
      burg.state !== undefined
        ? (states[burg.state]?.name ?? t("characters.unknownState"))
        : t("characters.unknownState");
    return `${burg.name} (${stateName})`;
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

  const backstory = character.backstory;
  const dynasty =
    backstory?.origin.lineageId !== undefined ? dynasties.find(d => d.i === backstory.origin.lineageId) : undefined;
  const mapRelationEntries = (map: Record<number, number> | undefined) =>
    Object.entries(map ?? {})
      .map(([idStr, score]) => {
        const other = characters.find(c => c.i === Number(idStr));
        return other ? { other, score } : null;
      })
      .filter((entry): entry is { other: (typeof characters)[number]; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score);
  const solidarityEntries = mapRelationEntries(character.solidarity);
  const favorEntries = mapRelationEntries(character.favor);

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
    rows.push(`${t("characters.race")}, ${raceName}`);
    rows.push(`${t("characters.location")}, ${locationStr}`);
    rows.push(
      `${t("characters.appearance")}, ${character.appearance ?? t("characters.notAvailable")} (${t("characters.appearanceSameRaceHint")})`
    );
    if (looks) {
      rows.push(
        `${t("characters.looks")}, stature ${looks.stature}, build ${looks.build}, symmetry ${looks.symmetry}, refinement ${looks.refinement}, vitality ${looks.vitality}, ornament ${looks.ornament}`
      );
    }
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

    if (backstory) {
      rows.push(t("characters.origin"));
      rows.push(
        `${t("characters.socialStratum")}, ${t(`characters.socialStratumNames.${backstory.origin.socialStratum}`)}`
      );
      rows.push(
        `${t("characters.estateStatus")}, ${t(`characters.estateStatusNames.${backstory.origin.estateStatus}`)}`
      );
      rows.push(`${t("characters.birthPlace")}, ${formatBurgPlace(backstory.origin.birthBurgId)}`);
      rows.push(`${t("characters.homePlace")}, ${formatBurgPlace(backstory.origin.homeBurgId)}`);
      rows.push(`${t("characters.raisedIn")}, ${t(`characters.raisedInNames.${backstory.origin.raisedIn}`)}`);
      if (backstory.origin.lineageName) {
        rows.push(`${t("characters.lineage")}, ${backstory.origin.lineageName}`);
      }
      if (dynasty?.motto) {
        rows.push(`${t("characters.houseMotto")}, ${dynasty.motto}`);
      }

      rows.push(t("characters.commitment"));
      rows.push(
        `${t("characters.commitmentPrimary")}, ${t(`characters.commitmentKindNames.${backstory.commitment.primary.kind}`)}`
      );
      if (backstory.commitment.secondary) {
        rows.push(
          `${t("characters.commitmentSecondary")}, ${t(`characters.commitmentKindNames.${backstory.commitment.secondary.kind}`)}`
        );
      }
      rows.push(`${t("characters.commitmentIntensity")}, ${backstory.commitment.intensity}`);
      rows.push(
        `${t("characters.conflictPolicy")}, ${t(`characters.conflictPolicyNames.${backstory.commitment.conflictPolicy}`)}`
      );

      rows.push(t("characters.tastes"));
      const likes = backstory.tastes
        .filter(taste => taste.polarity === "like")
        .slice()
        .sort((a, b) => b.intensity - a.intensity);
      const dislikes = backstory.tastes
        .filter(taste => taste.polarity === "dislike")
        .slice()
        .sort((a, b) => b.intensity - a.intensity);
      const formatTaste = (taste: { id: string; intensity: number }) => {
        const label = t(`characters.tasteNames.${taste.id}`, { defaultValue: taste.id });
        return `${label} (${String(taste.intensity)})`;
      };
      if (likes.length) {
        rows.push(`${t("characters.likes")}, ${likes.map(formatTaste).join("; ")}`);
      }
      if (dislikes.length) {
        rows.push(`${t("characters.dislikes")}, ${dislikes.map(formatTaste).join("; ")}`);
      }

      if (backstory.hooks?.length) {
        rows.push(t("characters.flavorHooks"));
        for (const hook of backstory.hooks) rows.push(formatFlavorHook(hook, t));
      }

      if (backstory.bonds?.length) {
        rows.push(t("characters.bonds"));
        for (const bond of backstory.bonds) {
          const target =
            bond.targetType === "character"
              ? (characters.find(c => c.i === bond.targetId)?.name ?? String(bond.targetId))
              : `${bond.targetType}:${String(bond.targetId)}`;
          const kindLabel = t(`characters.bondKindNames.${bond.kind}`, { defaultValue: bond.kind });
          rows.push(`${kindLabel} -> ${target} (${String(bond.strength)})`);
        }
      }
    }

    if (solidarityEntries.length > 0) {
      rows.push(t("characters.characterSolidarity"));
      rows.push(
        [
          t("characters.name"),
          t("characters.score"),
          t("characters.relation"),
          t("characters.titleOrRole"),
          t("characters.age"),
          t("characters.gender"),
          t("characters.socialStratum"),
          t("characters.sameCountry")
        ].join(", ")
      );
      for (const { other, score } of solidarityEntries) {
        const band = getSolidarityBand(score);
        const sameCountry = getCountryStateId(character) === getCountryStateId(other);
        const stratum = other.backstory?.origin.socialStratum;
        rows.push(
          [
            other.name,
            String(score),
            t(`characters.solidarityBand.${band}`),
            getOfficeLabel(other) || t("characters.notAvailable"),
            String(other.age),
            t(`characters.${other.gender}`),
            stratum ? t(`characters.socialStratumNames.${stratum}`) : t("characters.notAvailable"),
            sameCountry ? t("characters.yes") : t("characters.no")
          ].join(", ")
        );
      }
    }

    if (favorEntries.length > 0) {
      rows.push(t("characters.characterFavor"));
      rows.push(
        [
          t("characters.name"),
          t("characters.score"),
          t("characters.relation"),
          t("characters.titleOrRole"),
          t("characters.age"),
          t("characters.gender"),
          t("characters.socialStratum"),
          t("characters.sameCountry")
        ].join(", ")
      );
      for (const { other, score } of favorEntries) {
        const band = getFavorBand(score);
        const sameCountry = getCountryStateId(character) === getCountryStateId(other);
        const stratum = other.backstory?.origin.socialStratum;
        rows.push(
          [
            other.name,
            String(score),
            t(`characters.favorBand.${band}`),
            getOfficeLabel(other) || t("characters.notAvailable"),
            String(other.age),
            t(`characters.${other.gender}`),
            stratum ? t(`characters.socialStratumNames.${stratum}`) : t("characters.notAvailable"),
            sameCountry ? t("characters.yes") : t("characters.no")
          ].join(", ")
        );
      }
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

  const dialogButtons: Array<{ label: string; onClick: () => void; disabled?: boolean }> = [
    {
      label: t("characters.historyBack"),
      onClick: () => goBackCharacterDetails(),
      disabled: !canGoBack
    },
    {
      label: t("characters.historyForward"),
      onClick: () => goForwardCharacterDetails(),
      disabled: !canGoForward
    }
  ];
  if (canSetAsPlayer) {
    dialogButtons.push({
      label: t("characters.setAsPlayer"),
      onClick: handleSetAsPlayerCharacter
    });
  }
  dialogButtons.push({ label: t("characters.downloadCsv"), onClick: downloadCSV });

  return (
    <Dialog
      isOpen={isOpen}
      title={t("characters.dialogTitle", { name: character.name })}
      onClose={handleClose}
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
              <th style={{ padding: "4px 0" }}>{t("characters.race")}</th>
              <td>{raceName}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }} data-tip={t("characters.appearanceTip")}>
                {t("characters.appearance")}
              </th>
              <td>
                {character.appearance ?? t("characters.notAvailable")}
                <span style={{ color: "#868e96", fontSize: "0.85em", marginLeft: 6 }}>
                  ({t("characters.appearanceSameRaceHint")})
                </span>
              </td>
            </tr>
            {looks && (
              <tr>
                <th style={{ padding: "4px 0", verticalAlign: "top" }} data-tip={t("characters.looksTip")}>
                  {t("characters.looks")}
                </th>
                <td style={{ fontSize: "0.9em", lineHeight: 1.45 }}>
                  {t("characters.looksStature")}: {looks.stature}
                  <br />
                  {t("characters.looksBuild")}: {looks.build}
                  <br />
                  {t("characters.looksSymmetry")}: {looks.symmetry}
                  <br />
                  {t("characters.looksRefinement")}: {looks.refinement}
                  <br />
                  {t("characters.looksVitality")}: {looks.vitality}
                  <br />
                  {t("characters.looksOrnament")}: {looks.ornament}
                </td>
              </tr>
            )}
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
          <button
            type="button"
            className={`options ${activeTab === "inventory" ? "active" : ""}`}
            onClick={() => setActiveTab("inventory")}
          >
            {t("characters.inventory")}
          </button>
          <button
            type="button"
            className={`options ${activeTab === "backstory" ? "active" : ""}`}
            onClick={() => setActiveTab("backstory")}
          >
            {t("characters.backstory")}
          </button>
          <button
            type="button"
            className={`options ${activeTab === "relationships" ? "active" : ""}`}
            onClick={() => setActiveTab("relationships")}
          >
            {t("characters.relationships")}
          </button>
          {hasStateAffinitiesTab && (
            <button
              type="button"
              className={`options ${activeTab === "stateAffinities" ? "active" : ""}`}
              onClick={() => setActiveTab("stateAffinities")}
            >
              {t("characters.stateAffinities")}
            </button>
          )}
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

        {activeTab === "inventory" && (
          <div>
            {inventoryRows.length ? (
              <table className="fmg-table character-details__table">
                <thead>
                  <tr>
                    <th>{t("characters.good")}</th>
                    <th>{t("characters.quantity")}</th>
                    <th data-tip={t("characters.purchasePriceTip")}>{t("characters.purchasePrice")}</th>
                    <th>{t("characters.inventoryValue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map(row => {
                    const goodName = t(`economy.goods.names.${row.goodName}`, { defaultValue: row.goodName });
                    return (
                      <tr key={row.goodId}>
                        <td title={row.unit}>
                          <svg aria-hidden="true" width="1.3em" height="1.3em" className="goodIcon">
                            <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                          </svg>{" "}
                          {goodName}
                        </td>
                        <td>{row.units}</td>
                        <td>
                          {row.averageUnitCost === null
                            ? t("characters.notAvailable")
                            : formatPrice(row.averageUnitCost)}
                        </td>
                        <td>
                          {row.averageUnitCost === null
                            ? t("characters.notAvailable")
                            : formatPrice(row.units * row.averageUnitCost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p>{t("characters.noInventory")}</p>
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

        {hasStateAffinitiesTab && activeTab === "stateAffinities" && (
          <>
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
          </>
        )}

        {activeTab === "backstory" && backstory && (
          <>
            <h3>{t("characters.backstory")}</h3>
            <table className="fmg-table fmg-property-table character-details__table">
              <tbody>
                <tr>
                  <th style={{ width: "120px", padding: "4px 0" }}>{t("characters.socialStratum")}</th>
                  <td>{t(`characters.socialStratumNames.${backstory.origin.socialStratum}`)}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.estateStatus")}</th>
                  <td>{t(`characters.estateStatusNames.${backstory.origin.estateStatus}`)}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.birthPlace")}</th>
                  <td>{formatBurgPlace(backstory.origin.birthBurgId)}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.homePlace")}</th>
                  <td>{formatBurgPlace(backstory.origin.homeBurgId)}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.raisedIn")}</th>
                  <td>{t(`characters.raisedInNames.${backstory.origin.raisedIn}`)}</td>
                </tr>
                {(backstory.origin.lineageName || dynasty) && (
                  <tr>
                    <th style={{ padding: "4px 0" }}>{t("characters.lineage")}</th>
                    <td>
                      {backstory.origin.lineageName ?? dynasty?.name}
                      {dynasty?.motto ? (
                        <span style={{ color: "#868e96", fontStyle: "italic" }}> — {dynasty.motto}</span>
                      ) : null}
                    </td>
                  </tr>
                )}
                {backstory.hooks && backstory.hooks.length > 0 && (
                  <tr>
                    <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.flavorHooks")}</th>
                    <td>
                      <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                        {backstory.hooks.map((hook, index) => {
                          const text = formatFlavorHook(hook, t);
                          return <li key={typeof hook === "string" ? hook : `${hook.id}-${index}`}>{text}</li>;
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
                {backstory.bonds && backstory.bonds.length > 0 && (
                  <tr>
                    <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.bonds")}</th>
                    <td>
                      <ul style={{ margin: 0, listStyleType: "none", padding: 0 }}>
                        {backstory.bonds.map(bond => {
                          const targetChar =
                            bond.targetType === "character" ? characters.find(c => c.i === bond.targetId) : undefined;
                          const kindLabel = t(`characters.bondKindNames.${bond.kind}`, {
                            defaultValue: bond.kind
                          });
                          return (
                            <li key={`${bond.kind}-${bond.targetType}-${bond.targetId}`}>
                              {kindLabel}
                              {": "}
                              {targetChar ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinkedCharacter(targetChar.i)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    color: "inherit",
                                    font: "inherit",
                                    fontWeight: "bold",
                                    textDecoration: "underline",
                                    cursor: "pointer"
                                  }}
                                >
                                  {targetChar.name}
                                </button>
                              ) : (
                                `${bond.targetType} ${bond.targetId}`
                              )}
                              {" ("}
                              {bond.strength}
                              {")"}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.commitmentPrimary")}</th>
                  <td>
                    {t(`characters.commitmentKindNames.${backstory.commitment.primary.kind}`)}
                    {backstory.commitment.secondary
                      ? ` / ${t(`characters.commitmentKindNames.${backstory.commitment.secondary.kind}`)}`
                      : ""}
                  </td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.commitmentIntensity")}</th>
                  <td>{backstory.commitment.intensity}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0" }}>{t("characters.conflictPolicy")}</th>
                  <td>{t(`characters.conflictPolicyNames.${backstory.commitment.conflictPolicy}`)}</td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.likes")}</th>
                  <td>
                    {backstory.tastes
                      .filter(taste => taste.polarity === "like")
                      .slice()
                      .sort((a, b) => b.intensity - a.intensity)
                      .map(taste => {
                        const label = t(`characters.tasteNames.${taste.id}`, { defaultValue: taste.id });
                        return `${label} (${String(taste.intensity)})`;
                      })
                      .join(", ") || t("characters.notAvailable")}
                  </td>
                </tr>
                <tr>
                  <th style={{ padding: "4px 0", verticalAlign: "top" }}>{t("characters.dislikes")}</th>
                  <td>
                    {backstory.tastes
                      .filter(taste => taste.polarity === "dislike")
                      .slice()
                      .sort((a, b) => b.intensity - a.intensity)
                      .map(taste => {
                        const label = t(`characters.tasteNames.${taste.id}`, { defaultValue: taste.id });
                        return `${label} (${String(taste.intensity)})`;
                      })
                      .join(", ") || t("characters.notAvailable")}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {activeTab === "relationships" && (
          <>
            <h3>{t("characters.characterSolidarity")}</h3>
            <p style={{ marginTop: 0, color: "#868e96", fontSize: "0.9em" }}>{t("characters.solidarityHint")}</p>
            {solidarityEntries.length > 0 ? (
              <div style={{ overflow: "auto", maxHeight: "280px", marginBottom: "10px" }}>
                <table className="fmg-table character-details__table character-details__relation-table">
                  <thead>
                    <tr>
                      <th>{t("characters.name")}</th>
                      <th style={{ textAlign: "right" }}>{t("characters.score")}</th>
                      <th>{t("characters.relation")}</th>
                      <th>{t("characters.titleOrRole")}</th>
                      <th style={{ textAlign: "right" }}>{t("characters.age")}</th>
                      <th>{t("characters.gender")}</th>
                      <th>{t("characters.socialStratum")}</th>
                      <th>{t("characters.sameCountry")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solidarityEntries.map(({ other, score }) => {
                      const band = getSolidarityBand(score);
                      const office = getOfficeLabel(other);
                      const sameCountry = getCountryStateId(character) === getCountryStateId(other);
                      const stratum = other.backstory?.origin.socialStratum;
                      return (
                        <tr key={`sol-${other.i}`}>
                          <td>
                            <button
                              type="button"
                              className="pointer"
                              data-tip={t("characters.openCharacterDetails")}
                              onClick={() => handleOpenLinkedCharacter(other.i)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                color: "inherit",
                                font: "inherit",
                                fontWeight: "bold",
                                textDecoration: "underline",
                                cursor: "pointer"
                              }}
                            >
                              {other.name}
                            </button>
                          </td>
                          <td style={{ textAlign: "right" }}>{score}</td>
                          <td>{t(`characters.solidarityBand.${band}`)}</td>
                          <td>{office || t("characters.notAvailable")}</td>
                          <td style={{ textAlign: "right" }}>{other.age}</td>
                          <td>{t(`characters.${other.gender}`)}</td>
                          <td>
                            {stratum ? t(`characters.socialStratumNames.${stratum}`) : t("characters.notAvailable")}
                          </td>
                          <td>{sameCountry ? t("characters.yes") : t("characters.no")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t("characters.noSolidarity")}</p>
            )}

            <h3>{t("characters.characterFavor")}</h3>
            <p style={{ marginTop: 0, color: "#868e96", fontSize: "0.9em" }}>{t("characters.favorHint")}</p>
            {favorEntries.length > 0 ? (
              <div style={{ overflow: "auto", maxHeight: "280px", marginBottom: "10px" }}>
                <table className="fmg-table character-details__table character-details__relation-table">
                  <thead>
                    <tr>
                      <th>{t("characters.name")}</th>
                      <th style={{ textAlign: "right" }}>{t("characters.score")}</th>
                      <th>{t("characters.relation")}</th>
                      <th>{t("characters.titleOrRole")}</th>
                      <th style={{ textAlign: "right" }}>{t("characters.age")}</th>
                      <th>{t("characters.gender")}</th>
                      <th>{t("characters.socialStratum")}</th>
                      <th>{t("characters.sameCountry")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {favorEntries.map(({ other, score }) => {
                      const band = getFavorBand(score);
                      const office = getOfficeLabel(other);
                      const sameCountry = getCountryStateId(character) === getCountryStateId(other);
                      const stratum = other.backstory?.origin.socialStratum;
                      return (
                        <tr key={`favor-${other.i}`}>
                          <td>
                            <button
                              type="button"
                              className="pointer"
                              data-tip={t("characters.openCharacterDetails")}
                              onClick={() => handleOpenLinkedCharacter(other.i)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                color: "inherit",
                                font: "inherit",
                                fontWeight: "bold",
                                textDecoration: "underline",
                                cursor: "pointer"
                              }}
                            >
                              {other.name}
                            </button>
                          </td>
                          <td style={{ textAlign: "right" }}>{score}</td>
                          <td>{t(`characters.favorBand.${band}`)}</td>
                          <td>{office || t("characters.notAvailable")}</td>
                          <td style={{ textAlign: "right" }}>{other.age}</td>
                          <td>{t(`characters.${other.gender}`)}</td>
                          <td>
                            {stratum ? t(`characters.socialStratumNames.${stratum}`) : t("characters.notAvailable")}
                          </td>
                          <td>{sameCountry ? t("characters.yes") : t("characters.no")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t("characters.noFavor")}</p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
};
