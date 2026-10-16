/**
 * Display-time formatting of stored character flavor hooks (moved out of flavorHooks.ts so the
 * simulation core does not import i18n; docs/plan/simulation-core-separation.md S1).
 */
import type { TFunction } from "i18next";
import type { Character, CharacterFlavorHook, CharacterRoleClass } from "../characterTypes";
import { formatEpithetLabel } from "./characterLabels";

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
  const key = role?.length ? role : "ordinary";
  return t(`characters.flavorLines.role.${key}`, {
    defaultValue: t("characters.flavorLines.role.ordinary")
  });
}

/**
 * Resolve a stored hook (structured or legacy English string) for the current locale.
 */
export function formatFlavorHook(
  hook: CharacterFlavorHook | string,
  t: TFunction,
  character?: Pick<Character, "titles">
): string {
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
  if (id === "bonds.favorite") return t("characters.flavorLines.bonds.favorite");
  if (id === "bonds.sycophant") return t("characters.flavorLines.bonds.sycophant");

  if (id === "house.tongue") {
    return t("characters.flavorLines.house.tongue", { house: params.house ?? "" });
  }

  if (id.startsWith("epithet.")) {
    const epithetId = id.slice("epithet.".length);
    const epithet = formatEpithetLabel(epithetId, character ?? { titles: [] });
    return t(`characters.flavorLines.${id}`, {
      epithet,
      defaultValue: t("characters.flavorLines.epithet.default", { epithet })
    });
  }

  return t(`characters.flavorLines.${id}`, { ...params, defaultValue: id });
}
