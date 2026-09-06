import { describe, expect, it } from "vitest";
import type { Character } from "./characterTypes";
import { combineStateWarlike, officeResignationReason, shouldResignFromMartialEnnui } from "./officeResignation";

const subject = {
  personality: { boldness: 95, compassion: 50, greed: 50 },
  backstory: { commitment: { primary: { kind: "state" } }, tastes: [{ id: "peace", polarity: "like", intensity: 90 }] }
} as Character;

describe("office exit causes", () => {
  it("preserves the actual cause across species and war posture", () => {
    for (const race of [1, 2, 3, 7]) {
      const c = { ...subject, race };
      expect(officeResignationReason(c, { cause: "stress", stateWarlike: 0 })).toBe("Resigned (Stress)");
      expect(officeResignationReason(c, { cause: "boredom", stateWarlike: 100 })).toBe("Resigned (Boredom)");
      expect(officeResignationReason(c, { cause: "mission_complete" })).toBe("Resigned (Mission complete)");
    }
  });

  it("does not make a brave peace-loving marshal bored by peace", () => {
    expect(shouldResignFromMartialEnnui(subject, { title: "Marshal", stateWarlike: 15 })).toBe(false);
    const hawk = {
      ...subject,
      backstory: { ...subject.backstory!, tastes: [{ id: "war", polarity: "like" as const, intensity: 100 }] }
    };
    expect(shouldResignFromMartialEnnui(hawk, { title: "Marshal", stateWarlike: 15 })).toBe(true);
    expect(shouldResignFromMartialEnnui(hawk, { title: "Chancellor", stateWarlike: 15 })).toBe(false);
    expect(shouldResignFromMartialEnnui(hawk, { title: "Marshal", stateWarlike: 90 })).toBe(false);
  });

  it("uses threat as workload without turning defensive pressure into an aggressive policy", () => {
    expect(combineStateWarlike(10, 8)).toBe(80);
    expect(combineStateWarlike(90, 2)).toBe(90);
    expect(combineStateWarlike(undefined, 0)).toBe(50);
  });
});
