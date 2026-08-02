/**
 * Auto-assign sparse CharacterBond labels from solidarity / favor / context (Phase E).
 */

import { P, rand } from "../hostUtils";
import { getFavor, getSolidarity, inferRoleClass } from "./backstoryProfile";
import type { Character, CharacterBond, CharacterBondKind } from "./characterTypes";

function pushBond(character: Character, bond: CharacterBond): void {
  if (!character.backstory) return;
  character.backstory.bonds ??= [];
  // Avoid duplicate kind+target
  if (
    character.backstory.bonds.some(
      b => b.kind === bond.kind && b.targetType === bond.targetType && b.targetId === bond.targetId
    )
  ) {
    return;
  }
  // Cap bonds per character
  if (character.backstory.bonds.length >= 6) return;
  character.backstory.bonds.push(bond);
}

function isMilitary(character: Character): boolean {
  const cls = inferRoleClass(character);
  return (
    cls === "commander" || cls === "ruler" || character.titles.some(t => /Marshal|War|Commander|Admiral/i.test(t.title))
  );
}

/**
 * Seed bonds for all living characters after solidarity/favor are populated.
 * Bonds are labels; solidarity remains the numeric source of truth.
 */
export function seedCharacterBonds(characters: Character[], currentYear?: number): void {
  const living = characters.filter(c => !c.dead && c.backstory);
  const byId = new Map(living.map(c => [c.i, c]));

  for (const a of living) {
    // Clear prior auto bonds when re-seeding full generation
    if (a.backstory) a.backstory.bonds = [];

    const peers = Object.keys(a.solidarity ?? {}).map(Number);
    // Also consider favor targets and same-state titled peers without solidarity keys
    for (const id of Object.keys(a.favor ?? {}).map(Number)) {
      if (!peers.includes(id)) peers.push(id);
    }

    for (const otherId of peers) {
      const b = byId.get(otherId);
      if (!b) continue;

      const sol = getSolidarity(a, b.i);
      const fav = getFavor(a, b.i);
      const ao = a.backstory!.origin;
      const bo = b.backstory!.origin;

      // Hometown
      if (ao.birthBurgId && ao.birthBurgId === bo.birthBurgId && sol >= -10) {
        pushBond(a, {
          kind: "hometown_kin",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, 40 + Math.max(0, sol)),
          sinceYear: currentYear,
          note: "Shared birthplace"
        });
      }

      // Military comrades
      if (isMilitary(a) && isMilitary(b) && a.state === b.state && sol >= 15) {
        pushBond(a, {
          kind: "comrade",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, 35 + sol),
          sinceYear: currentYear,
          note: "Fellow arms"
        });
      }

      // Rivals / nemeses from solidarity
      if (sol <= -55) {
        const kind: CharacterBondKind = sol <= -80 || a.personality.vengefulness >= 75 ? "nemesis" : "rival";
        pushBond(a, {
          kind,
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, Math.abs(sol)),
          sinceYear: currentYear
        });
      } else if (sol <= -35 && P(0.45)) {
        pushBond(a, {
          kind: "rival",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, Math.abs(sol)),
          sinceYear: currentYear
        });
      }

      // Romantic
      if (fav >= 40) {
        pushBond(a, {
          kind: "lover",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, fav),
          sinceYear: currentYear
        });
      }

      // Liege / client toward ruler
      const aRuler = inferRoleClass(a) === "ruler";
      const bRuler = inferRoleClass(b) === "ruler";
      if (!aRuler && bRuler && a.state === b.state && sol >= 20) {
        pushBond(a, {
          kind: "benefactor",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, 30 + sol / 2),
          sinceYear: currentYear,
          note: "Sovereign"
        });
      }
      if (aRuler && !bRuler && a.state === b.state && sol >= 25 && P(0.4)) {
        pushBond(a, {
          kind: "client",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, 25 + sol / 2),
          sinceYear: currentYear
        });
      }

      // Friends: high solidarity without being military-only comrade
      if (sol >= 50 && !isMilitary(a) && P(0.5)) {
        pushBond(a, {
          kind: "friend",
          targetType: "character",
          targetId: b.i,
          strength: Math.min(100, sol),
          sinceYear: currentYear
        });
      }
    }

    // Market rivals by role even without solidarity entry
    if (a.roles?.some(r => r.kind === "marketRivalMerchant")) {
      for (const b of living) {
        if (b.i === a.i) continue;
        if (!b.roles?.some(r => r.kind === "marketRivalMerchant")) continue;
        // same market entity if possible
        const aMarket = a.roles.find(r => r.kind === "marketRivalMerchant")?.entityId;
        const bMarket = b.roles.find(r => r.kind === "marketRivalMerchant")?.entityId;
        if (aMarket !== undefined && aMarket === bMarket) {
          pushBond(a, {
            kind: "rival",
            targetType: "character",
            targetId: b.i,
            strength: rand(50, 90),
            sinceYear: currentYear,
            note: "Market rival"
          });
        }
      }
    }
  }
}

/** Recompute bonds for one character against peers (after peer seed). */
export function seedBondsForCharacter(character: Character, all: Character[], currentYear?: number): void {
  if (character.dead || !character.backstory) return;
  // Lightweight: run full seed then... actually full seed clears all. Instead only update this one:
  character.backstory.bonds = [];
  const living = all.filter(c => !c.dead && c.backstory);
  const peers = new Set<number>([
    ...Object.keys(character.solidarity ?? {}).map(Number),
    ...Object.keys(character.favor ?? {}).map(Number),
    ...living.filter(c => c.state === character.state && c.i !== character.i).map(c => c.i)
  ]);

  for (const otherId of peers) {
    const b = living.find(c => c.i === otherId);
    if (!b) continue;
    // Temporarily use a single-pass mini seed by calling shared helpers via fake array
    // Easiest: seed only this character's outbound bonds
    const sol = getSolidarity(character, b.i);
    const fav = getFavor(character, b.i);
    const ao = character.backstory.origin;
    const bo = b.backstory!.origin;

    if (ao.birthBurgId && ao.birthBurgId === bo.birthBurgId && sol >= -10) {
      pushBond(character, {
        kind: "hometown_kin",
        targetType: "character",
        targetId: b.i,
        strength: Math.min(100, 40 + Math.max(0, sol)),
        sinceYear: currentYear
      });
    }
    if (isMilitary(character) && isMilitary(b) && character.state === b.state && sol >= 15) {
      pushBond(character, {
        kind: "comrade",
        targetType: "character",
        targetId: b.i,
        strength: Math.min(100, 35 + sol),
        sinceYear: currentYear
      });
    }
    if (sol <= -55) {
      pushBond(character, {
        kind: sol <= -80 ? "nemesis" : "rival",
        targetType: "character",
        targetId: b.i,
        strength: Math.min(100, Math.abs(sol)),
        sinceYear: currentYear
      });
    }
    if (fav >= 40) {
      pushBond(character, {
        kind: "lover",
        targetType: "character",
        targetId: b.i,
        strength: Math.min(100, fav),
        sinceYear: currentYear
      });
    }
  }
}
