/**
 * Structured flavor hooks from backstory (Phase E) — i18n at display time.
 * See docs/plan/characters/flavor-text.md.
 */
import type { TFunction } from "i18next";
import { inferRoleClass } from "./backstoryProfile";
import type {
  Character,
  CharacterFlavorHook,
  CharacterRoleClass,
  CharacterTaste,
  CommitmentKind,
  SocialStratum
} from "./characterTypes";

function topTastes(tastes: CharacterTaste[], polarity: "like" | "dislike", n = 2): CharacterTaste[] {
  return tastes
    .filter(t => t.polarity === polarity)
    .slice()
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, n);
}

function joinTasteIds(tastes: CharacterTaste[]): string {
  return tastes.map(t => t.id).join(",");
}

const LOW_BIRTH: ReadonlySet<SocialStratum | "unknown"> = new Set([
  "commoner",
  "freedman",
  "slave_born",
  "foreigner",
  "unknown",
  "clergy_orphan"
]);

const HIGH_BIRTH: ReadonlySet<SocialStratum | "unknown"> = new Set(["royal", "high_noble"]);

const HIGH_OFFICE: ReadonlySet<CharacterRoleClass> = new Set(["ruler", "central_officer", "province_lord"]);

/**
 * True when pairing birth stratum with role class creates useful tension
 * (e.g. commoner chancellor). Expected pairs (high noble + court office) return false.
 */
export function hasStratumRoleContrast(stratum: SocialStratum | "unknown", role: CharacterRoleClass): boolean {
  // Low birth in high office — classic surprise
  if (LOW_BIRTH.has(stratum) && HIGH_OFFICE.has(role)) return true;
  if (stratum === "commoner" && (role === "commander" || role === "religious")) return true;

  // High birth in commercial / unremarkable life
  if (HIGH_BIRTH.has(stratum) && (role === "merchant" || role === "ordinary")) return true;
  // Royal blood in field command (not the crown itself)
  if (stratum === "royal" && role === "commander") return true;

  // Merchant stock in court, faith, or war
  if (
    stratum === "merchant_born" &&
    (role === "central_officer" || role === "religious" || role === "commander" || role === "ruler")
  ) {
    return true;
  }

  // Temple-raised into commerce or arms
  if (stratum === "clergy_orphan" && (role === "merchant" || role === "commander" || role === "ruler")) {
    return true;
  }

  // Minor noble turned merchant
  if (stratum === "minor_noble" && role === "merchant") return true;

  // Unknown birth always reads as a question mark
  if (stratum === "unknown" && role !== "ordinary") return true;

  return false;
}

/**
 * Build 1–3 structured hooks (ids + params). Text is resolved via i18n in the UI.
 */
export function generateCharacterHooks(character: Character): CharacterFlavorHook[] {
  const hooks: CharacterFlavorHook[] = [];
  const origin = character.backstory?.origin;
  const tastes = character.backstory?.tastes ?? [];
  const role = inferRoleClass(character);
  const stratum: SocialStratum | "unknown" = origin?.socialStratum ?? "unknown";

  // Pair stratum + role only when the combination is interesting; otherwise role alone.
  if (hasStratumRoleContrast(stratum, role)) {
    hooks.push({ id: "identity.contrast", params: { stratum, role } });
  } else {
    hooks.push({ id: "identity.roleOnly", params: { role } });
  }

  const primary = character.backstory?.commitment.primary.kind as CommitmentKind | undefined;
  if (primary) {
    hooks.push({ id: `commitment.${primary}` });
  }

  const likes = topTastes(tastes, "like", 2);
  const dislikes = topTastes(tastes, "dislike", 1);
  if (likes.length && dislikes.length) {
    hooks.push({
      id: "tastes.both",
      params: { likes: joinTasteIds(likes), dislikes: joinTasteIds(dislikes) }
    });
  } else if (likes.length) {
    hooks.push({ id: "tastes.likesOnly", params: { likes: joinTasteIds(likes) } });
  } else if (dislikes.length) {
    hooks.push({ id: "tastes.dislikesOnly", params: { dislikes: joinTasteIds(dislikes) } });
  }

  const bonds = character.backstory?.bonds ?? [];
  const nemesis = bonds.find(b => b.kind === "nemesis");
  const rival = bonds.find(b => b.kind === "rival");
  if (nemesis) hooks.push({ id: "bonds.nemesis" });
  else if (rival) hooks.push({ id: "bonds.rival" });

  const house = origin?.lineageName;
  if (house && (origin?.socialStratum === "royal" || origin?.socialStratum === "high_noble")) {
    hooks.push({ id: "house.tongue", params: { house } });
  }

  return hooks.slice(0, 3);
}

export function applyCharacterHooks(character: Character): void {
  if (!character.backstory) return;
  character.backstory.hooks = generateCharacterHooks(character);
}

function formatTasteList(idsCsv: string | undefined, t: TFunction): string {
  if (!idsCsv) return "";
  const ids = idsCsv.split(",").filter(Boolean);
  const labels = ids.map(id => t(`characters.tasteNames.${id}`, { defaultValue: id.replace(/_/g, " ") }));
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) {
    return t("characters.flavorLines.joinTwo", {
      a: labels[0],
      b: labels[1],
      defaultValue: `${labels[0]} and ${labels[1]}`
    });
  }
  return labels.join(", ");
}

function stratumLabel(stratum: string | undefined, t: TFunction): string {
  if (!stratum || stratum === "unknown") {
    return t("characters.flavorLines.stratumUnknown", { defaultValue: "person of unknown birth" });
  }
  return t(`characters.socialStratumNames.${stratum}`, { defaultValue: stratum.replace(/_/g, " ") });
}

function roleClause(role: string | undefined, t: TFunction): string {
  const key = role && role.length ? role : "ordinary";
  return t(`characters.flavorLines.role.${key}`, {
    defaultValue: t("characters.flavorLines.role.ordinary")
  });
}

/**
 * Resolve a stored hook (structured or legacy English string) for the current locale.
 */
export function formatFlavorHook(hook: CharacterFlavorHook | string, t: TFunction): string {
  if (typeof hook === "string") return hook;

  const id = hook.id;
  const params = { ...(hook.params ?? {}) };

  // identity / identity.contrast: stratum + role (only when contrast is interesting)
  if (id === "identity" || id === "identity.contrast") {
    return t("characters.flavorLines.identity.contrast", {
      defaultValue: t("characters.flavorLines.identity", {
        stratum: stratumLabel(params.stratum, t),
        role: roleClause(params.role as CharacterRoleClass | undefined, t)
      }),
      stratum: stratumLabel(params.stratum, t),
      role: roleClause(params.role as CharacterRoleClass | undefined, t)
    });
  }
  if (id === "identity.roleOnly") {
    return t("characters.flavorLines.identity.roleOnly", {
      role: roleClause(params.role as CharacterRoleClass | undefined, t)
    });
  }

  if (id.startsWith("commitment.")) {
    return t(`characters.flavorLines.${id}`, {
      defaultValue: t("characters.flavorLines.commitment.default")
    });
  }

  if (id === "tastes.both") {
    return t("characters.flavorLines.tastes.both", {
      likes: formatTasteList(params.likes, t),
      dislikes: formatTasteList(params.dislikes, t)
    });
  }
  if (id === "tastes.likesOnly") {
    return t("characters.flavorLines.tastes.likesOnly", {
      likes: formatTasteList(params.likes, t)
    });
  }
  if (id === "tastes.dislikesOnly") {
    return t("characters.flavorLines.tastes.dislikesOnly", {
      dislikes: formatTasteList(params.dislikes, t)
    });
  }

  if (id === "bonds.nemesis") return t("characters.flavorLines.bonds.nemesis");
  if (id === "bonds.rival") return t("characters.flavorLines.bonds.rival");

  if (id === "house.tongue") {
    return t("characters.flavorLines.house.tongue", { house: params.house ?? "" });
  }

  return t(`characters.flavorLines.${id}`, { ...params, defaultValue: id });
}
