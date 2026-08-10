import { describe, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import type { GuildKnowledgeStock } from "./guildKnowledgeTypes";
import {
  GUILD_MASTER_STARTING_ASSET_MAX,
  seedGuildMasterStartingAssets,
  settleGuildMasterEstate
} from "./guildMasterAssets";

function character(wealth: number, dead = false): Character {
  return { i: 1, dead, wealth } as Character;
}

function guild(treasury: number): GuildKnowledgeStock {
  return { burgId: 1, domain: "metallurgy", stock: 0.5, treasury };
}

describe("guild master assets", () => {
  it("reserves most of a deceased master's private estate for heirs and passes only a working share to a successor", () => {
    const deceased = character(20, true);
    const successor = character(0);
    const stock = guild(50);

    const settlement = settleGuildMasterEstate(deceased, successor, stock);

    expect(deceased.wealth).toBe(0);
    expect(successor.wealth).toBe(5);
    expect(stock.treasury).toBe(50);
    expect(settlement).toEqual({ inheritedBySuccessor: 5, revertedToGuild: 0, dispersedToPrivateHeirs: 15 });
  });

  it("returns a portion of an unclaimed estate to the guild and removes the deceased purse", () => {
    const deceased = character(20, true);
    const stock = guild(50);

    const settlement = settleGuildMasterEstate(deceased, undefined, stock);

    expect(deceased.wealth).toBe(0);
    expect(stock.treasury).toBe(56);
    expect(settlement).toEqual({ inheritedBySuccessor: 0, revertedToGuild: 6, dispersedToPrivateHeirs: 14 });
  });

  it("funds a new master's initial purse from existing guild capital and never exceeds the cap", () => {
    const master = character(0);
    const stock = guild(100);

    expect(seedGuildMasterStartingAssets(master, stock)).toBe(GUILD_MASTER_STARTING_ASSET_MAX);
    expect(master.wealth).toBe(GUILD_MASTER_STARTING_ASSET_MAX);
    expect(stock.treasury).toBe(100 - GUILD_MASTER_STARTING_ASSET_MAX);
  });
});
