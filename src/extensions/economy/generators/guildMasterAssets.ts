import type { Character } from "../../characters/characterTypes";
import { rn } from "../../hostUtils";
import type { GuildKnowledgeStock } from "./guildKnowledgeTypes";

/**
 * A successor receives only the portable working kit needed to continue the trade. The bulk of a
 * deceased master's private estate belongs to their family; family members are aggregate data at
 * present, so that share leaves the named-character ledger as private-heir distribution.
 */
export const GUILD_MASTER_SUCCESSOR_ESTATE_SHARE = 0.25;
/** With no trained successor, the guild reclaims some workshop tools and working capital. */
export const GUILD_MASTER_GUILD_REVERSION_SHARE = 0.3;
/** A newly appointed master can draw a small, one-time cash float from an already funded guild. */
export const GUILD_MASTER_STARTING_ASSET_SHARE = 0.12;
export const GUILD_MASTER_STARTING_ASSET_MAX = 3.15;
export const GUILD_MASTER_STARTING_ASSET_MIN = 1.05;

export interface GuildMasterEstateSettlement {
  inheritedBySuccessor: number;
  revertedToGuild: number;
  dispersedToPrivateHeirs: number;
}

/**
 * Settles a deceased master's personal estate exactly once during succession. Guild treasury is
 * institutional capital and is never inherited directly. A trained successor receives a small
 * working-estate share; the remainder is reserved for the deceased's private heirs.
 */
export function settleGuildMasterEstate(
  deceasedMaster: Character,
  successor: Character | undefined,
  guild: GuildKnowledgeStock | undefined
): GuildMasterEstateSettlement {
  const estate = Math.max(0, deceasedMaster.wealth || 0);
  deceasedMaster.wealth = 0;
  if (!(estate > 0)) return { inheritedBySuccessor: 0, revertedToGuild: 0, dispersedToPrivateHeirs: 0 };

  if (successor && !successor.dead) {
    const inheritedBySuccessor = rn(estate * GUILD_MASTER_SUCCESSOR_ESTATE_SHARE, 2);
    successor.wealth = rn((successor.wealth || 0) + inheritedBySuccessor, 2);
    return {
      inheritedBySuccessor,
      revertedToGuild: 0,
      dispersedToPrivateHeirs: rn(estate - inheritedBySuccessor, 2)
    };
  }

  const revertedToGuild = guild ? rn(estate * GUILD_MASTER_GUILD_REVERSION_SHARE, 2) : 0;
  if (guild && revertedToGuild > 0) guild.treasury = rn((guild.treasury || 0) + revertedToGuild, 2);
  return {
    inheritedBySuccessor: 0,
    revertedToGuild,
    dispersedToPrivateHeirs: rn(estate - revertedToGuild, 2)
  };
}

/**
 * Gives a newly created master enough personal liquidity for the first living-cost cycle without
 * minting money. It is a capped draw from the guild's already seeded working capital.
 */
export function seedGuildMasterStartingAssets(master: Character, guild: GuildKnowledgeStock): number {
  if (master.dead || (master.wealth || 0) > 0 || !(guild.treasury > 0)) return 0;

  const desired = Math.min(
    GUILD_MASTER_STARTING_ASSET_MAX,
    Math.max(GUILD_MASTER_STARTING_ASSET_MIN, guild.treasury * GUILD_MASTER_STARTING_ASSET_SHARE)
  );
  const amount = rn(Math.min(guild.treasury, desired), 2);
  if (!(amount > 0)) return 0;

  guild.treasury = rn(guild.treasury - amount, 2);
  master.wealth = rn((master.wealth || 0) + amount, 2);
  return amount;
}
