import { describe, expect, it } from "vitest";
import type { Character, CharacterTaste } from "./characterTypes";
import { assessTasteRelationship, projectTasteRelationshipDelta } from "./tasteRelationship";

type RelationshipCharacter = Pick<Character, "personality" | "family" | "backstory">;

function person(tastes: CharacterTaste[], overrides: Partial<RelationshipCharacter> = {}): RelationshipCharacter {
  return {
    personality: {
      boldness: 50,
      compassion: 50,
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
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    backstory: {
      origin: {
        socialStratum: "commoner",
        estateStatus: "freeman",
        birthStateId: 1,
        raisedIn: "street"
      },
      commitment: { primary: { kind: "self" }, intensity: 50, conflictPolicy: "negotiate" },
      tastes
    },
    ...overrides
  };
}

describe("assessTasteRelationship", () => {
  it("only reacts to tastes exposed by the interaction", () => {
    const likesDebate = person([{ id: "debate", polarity: "like", intensity: 100 }]);
    const dislikesDebate = person([{ id: "debate", polarity: "dislike", intensity: 100 }]);

    const exposed = assessTasteRelationship(likesDebate, dislikesDebate, {
      situation: "mentorship",
      exposedTasteIds: ["debate"],
      exposure: 1
    });
    const hidden = assessTasteRelationship(likesDebate, dislikesDebate, {
      situation: "mentorship",
      exposedTasteIds: [],
      exposure: 1
    });

    expect(exposed.compatibility).toBeLessThan(0);
    expect(hidden.compatibility).toBe(0);
  });

  it("values a shared dislike less than a shared like", () => {
    const likeA = person([{ id: "debate", polarity: "like", intensity: 100 }]);
    const likeB = person([{ id: "debate", polarity: "like", intensity: 100 }]);
    const dislikeA = person([{ id: "debate", polarity: "dislike", intensity: 100 }]);
    const dislikeB = person([{ id: "debate", polarity: "dislike", intensity: 100 }]);
    const context = { situation: "socialVisit" as const, exposedTasteIds: ["debate"], exposure: 1 };

    const sharedLike = assessTasteRelationship(likeA, likeB, context);
    const sharedDislike = assessTasteRelationship(dislikeA, dislikeB, context);

    expect(sharedLike.compatibility).toBeGreaterThan(sharedDislike.compatibility);
    expect(sharedDislike.compatibility).toBeGreaterThan(0);
  });

  it("remains directional when the observer cares more strongly", () => {
    const intenseLike = person([{ id: "debate", polarity: "like", intensity: 100 }]);
    const mildDislike = person([{ id: "debate", polarity: "dislike", intensity: 10 }]);
    const context = { situation: "mentorship" as const, exposedTasteIds: ["debate"], exposure: 1 };

    expect(assessTasteRelationship(intenseLike, mildDislike, context).compatibility).toBeLessThan(
      assessTasteRelationship(mildDislike, intenseLike, context).compatibility
    );
  });

  it("applies a category dislike only when the counterpart exposes that trait", () => {
    const observer = person([{ id: "soldiers", polarity: "dislike", intensity: 100 }]);
    const counterpart = person([]);
    const context = { situation: "firstContact" as const, exposedTasteIds: [], exposure: 1 };

    expect(
      assessTasteRelationship(observer, counterpart, { ...context, counterpartTraits: ["soldiers"] }).compatibility
    ).toBeLessThan(0);
    expect(assessTasteRelationship(observer, counterpart, context).compatibility).toBe(0);
  });

  it("lets a compassionate parent mentor tolerate an opposed debate taste", () => {
    const apprentice = person([{ id: "debate", polarity: "like", intensity: 100 }]);
    const impatientMentor = person([{ id: "debate", polarity: "dislike", intensity: 100 }]);
    const patientMentor = person([{ id: "debate", polarity: "dislike", intensity: 100 }], {
      personality: { ...impatientMentor.personality, compassion: 90 },
      family: { spouses: 1, children: 2, grandchildren: 0, greatGrandchildren: 0 }
    });
    const context = {
      situation: "mentorship" as const,
      exposedTasteIds: ["debate"],
      exposure: 1,
      observerRole: "mentor" as const
    };

    const impatient = assessTasteRelationship(impatientMentor, apprentice, context);
    const patient = assessTasteRelationship(patientMentor, apprentice, context);

    expect(patient.compatibility).toBeGreaterThan(impatient.compatibility);
    expect(patient.evidence[0]?.modifier).toBe("mentorTolerance");
  });
});

describe("projectTasteRelationshipDelta", () => {
  it("respects event caps and slows near a same-direction score extreme", () => {
    const assessment = { compatibility: -100, exposure: 1, evidence: [] };

    expect(projectTasteRelationshipDelta(assessment, { maxPositive: 3, maxNegative: 5, currentScore: 0 })).toBe(-5);
    expect(
      projectTasteRelationshipDelta(assessment, { maxPositive: 3, maxNegative: 5, currentScore: -90 })
    ).toBeGreaterThan(-5);
  });
});
