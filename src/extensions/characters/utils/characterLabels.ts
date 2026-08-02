import i18n from "../../../i18n";
import type { CharacterRole, CharacterRoleClass } from "../characterTypes";

/** Stable filter options for the Characters Overview title/role dropdown. */
export const CHARACTER_ROLE_CLASS_FILTERS: readonly CharacterRoleClass[] = [
  "ruler",
  "province_lord",
  "central_officer",
  "commander",
  "religious",
  "merchant",
  "ordinary"
] as const;

const TITLE_KEY_BY_ENGLISH: Readonly<Record<string, string>> = {
  King: "king",
  Queen: "queen",
  Emperor: "emperor",
  Empress: "empress",
  Khan: "khan",
  Khatun: "khatun",
  Bey: "bey",
  Begum: "begum",
  Tsar: "tsar",
  Tsarina: "tsarina",
  Caliph: "caliph",
  Emir: "emir",
  Emira: "emira",
  Shogun: "shogun",
  Despot: "despot",
  Despotissa: "despotissa",
  Satrap: "satrap",
  "Grand Duke": "grandDuke",
  "Grand Duchess": "grandDuchess",
  Duke: "duke",
  Duchess: "duchess",
  Prince: "prince",
  Princess: "princess",
  Margrave: "margrave",
  Margravine: "margravine",
  "Lord Protector": "lordProtector",
  "Lady Protector": "ladyProtector",
  President: "president",
  Chairman: "chairman",
  Chairwoman: "chairwoman",
  "High Priest": "highPriest",
  "High Priestess": "highPriestess",
  Warlord: "warlord",
  Count: "count",
  Countess: "countess",
  Earl: "earl",
  Sheriff: "sheriff",
  Landgrave: "landgrave",
  Landgravine: "landgravine",
  Baron: "baron",
  Baroness: "baroness",
  Captain: "captain",
  Seneschal: "seneschal",
  Vicar: "vicar",
  Dean: "dean",
  Governor: "governor",
  Prefect: "prefect",
  Magistrate: "magistrate",
  Councilor: "councilor",
  Chief: "chief",
  Elder: "elder",
  Chieftain: "chieftain",
  Lord: "lord",
  Lady: "lady",
  Warden: "warden",
  "Clan Chief": "clanChief",
  Steward: "steward",
  Chancellor: "chancellor",
  Marshal: "marshal",
  Spymaster: "spymaster",
  "Court Chaplain": "courtChaplain",
  "Prime Minister": "primeMinister",
  "Minister of Foreign Affairs": "ministerOfForeignAffairs",
  "Minister of War": "ministerOfWar",
  "Minister of Finance": "ministerOfFinance",
  "Director of Intelligence": "directorOfIntelligence",
  Commander: "commander",
  Admiral: "admiral",
  Regent: "regent",
  Patrician: "patrician"
};

const ROLE_KEY_BY_KIND: Readonly<Record<string, string>> = {
  marketManager: "marketManager",
  marketRivalMerchant: "marketRivalMerchant",
  burgMarketMerchant: "marketMerchant",
  guildMaster: "guildMaster",
  guildApprentice: "guildApprentice",
  merchantOrganizationHead: "merchantCompanyHead",
  merchantOrganizationSecretary: "merchantCompanySecretary",
  merchantOrganizationBodyguard: "merchantCompanyBodyguard",
  merchantOrganizationExecutive: "merchantCompanyExecutive",
  merchantOrganizationAgent: "merchantCompanyAgent"
};

const ROLE_KEY_BY_LABEL: Readonly<Record<string, string>> = {
  "Market Manager": "marketManager",
  "Market Rival Merchant": "marketRivalMerchant",
  "Market Merchant": "marketMerchant",
  "Guild Master": "guildMaster",
  "Guild Apprentice": "guildApprentice",
  "Merchant Company Head": "merchantCompanyHead",
  "Merchant Company Secretary": "merchantCompanySecretary",
  "Merchant Company Bodyguard": "merchantCompanyBodyguard",
  "Merchant Company Executive": "merchantCompanyExecutive",
  "Merchant Company Agent": "merchantCompanyAgent"
};

const UNDER_REGENCY_SUFFIX = " (Under Regency)";

/** Resolves the English title saved in world data without changing that persisted data. */
export function getCharacterTitleLabel(title: string): string {
  const isUnderRegency = title.endsWith(UNDER_REGENCY_SUFFIX);
  const baseTitle = isUnderRegency ? title.slice(0, -UNDER_REGENCY_SUFFIX.length) : title;
  const titleKey = TITLE_KEY_BY_ENGLISH[baseTitle];
  const label = titleKey ? i18n.t(`characters.titleNames.${titleKey}`) : baseTitle;

  return isUnderRegency ? i18n.t("characters.titleUnderRegency", { title: label }) : label;
}

/** Resolves stable role kinds first, preserving custom extension labels as a fallback. */
export function getCharacterRoleLabel(role: Pick<CharacterRole, "kind" | "label">): string {
  const roleKey = ROLE_KEY_BY_KIND[role.kind] ?? ROLE_KEY_BY_LABEL[role.label];
  return roleKey ? i18n.t(`characters.roleNames.${roleKey}`) : role.label;
}

/**
 * Localized label for a semantic role class used by overview filters.
 * Groups display titles that differ only by culture (King / Emperor / Khan → Ruler).
 */
export function getCharacterRoleClassLabel(roleClass: CharacterRoleClass): string {
  return i18n.t(`characters.roleClassNames.${roleClass}`);
}
