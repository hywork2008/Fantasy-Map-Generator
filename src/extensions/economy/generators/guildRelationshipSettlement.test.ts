import { describe, expect, it } from "vitest";
import { getSolidarity, setSolidarity } from "../../characters/backstoryProfile";
import type { Character, CharacterTaste } from "../../characters/characterTypes";
import {
  seedMasterApprenticeTasteRelationship,
  settleMasterApprenticeTasteRelationships
} from "./guildRelationshipSettlement";

function character(i: number, tastes: CharacterTaste[], compassion = 50, children = 0): Character {
  return {
    i,
    name: `Character ${i}`,
    age: 30,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {
      boldness: 50,
      compassion,
      greed: 50,
      honor: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 50,
      zeal: 50,
      energy: 50,
      piety: 50,
      guile: 50,
      confidence: 50
    },
    family: { spouses: children > 0 ? 1 : 0, children, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 0,
    pastTitles: [],
    backstory: {
      origin: { socialStratum: "commoner", estateStatus: "freeman", birthStateId: 1, raisedIn: "street" },
      commitment: { primary: { kind: "craft" }, intensity: 50, conflictPolicy: "negotiate" },
      tastes
    }
  };
}

describe("guild taste relationship settlement", () => {
  it("seeds directional mentor and apprentice scores from their tastes", () => {
    const master = character(1, [{ id: "debate", polarity: "dislike", intensity: 100 }]);
    const apprentice = character(2, [{ id: "debate", polarity: "like", intensity: 100 }]);

    seedMasterApprenticeTasteRelationship(master, apprentice, "metallurgy");

    expect(getSolidarity(master, apprentice.i)).toBeLessThan(4);
    expect(getSolidarity(apprentice, master.i)).toBeLessThan(4);
  });

  it("does not overwrite an existing hostile master opinion during assignment", () => {
    const master = character(1, [{ id: "debate", polarity: "like", intensity: 100 }]);
    const apprentice = character(2, [{ id: "debate", polarity: "like", intensity: 100 }]);
    setSolidarity(master, apprentice.i, -40);

    seedMasterApprenticeTasteRelationship(master, apprentice, "metallurgy");

    expect(getSolidarity(master, apprentice.i)).toBe(-40);
  });

  it("applies only a bounded drift per annual guild settlement", () => {
    const master = character(1, [{ id: "debate", polarity: "dislike", intensity: 100 }]);
    const apprentice = character(2, [{ id: "debate", polarity: "like", intensity: 100 }]);
    setSolidarity(master, apprentice.i, 0);

    settleMasterApprenticeTasteRelationships(master, [apprentice], "metallurgy");

    expect(getSolidarity(master, apprentice.i)).toBeGreaterThanOrEqual(-5);
    expect(getSolidarity(master, apprentice.i)).toBeLessThanOrEqual(0);
  });
});
