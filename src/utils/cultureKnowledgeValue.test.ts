import { describe, expect, it } from "vitest";
import { getCultureKnowledgeValue, KNOWLEDGE_VALUE_PRIOR, rollCultureKnowledgeValue } from "./cultureKnowledgeValue";

describe("KNOWLEDGE_VALUE_PRIOR", () => {
  it("matches docs/plan/great-library.md KD-2's prior table", () => {
    expect(KNOWLEDGE_VALUE_PRIOR).toEqual({
      Generic: 0.45,
      River: 0.5,
      Lake: 0.5,
      Naval: 0.48,
      Highland: 0.4,
      Hunting: 0.28,
      Nomadic: 0.22
    });
  });
});

describe("rollCultureKnowledgeValue", () => {
  it("returns a value clamped to 0..1", () => {
    // Extreme rng inputs push the gaussian sample far outside 0..1 before clamping.
    expect(rollCultureKnowledgeValue("Naval", () => 0.999999)).toBeGreaterThanOrEqual(0);
    expect(rollCultureKnowledgeValue("Naval", () => 0.999999)).toBeLessThanOrEqual(1);
    expect(rollCultureKnowledgeValue("Nomadic", () => 0.000001)).toBeGreaterThanOrEqual(0);
    expect(rollCultureKnowledgeValue("Nomadic", () => 0.000001)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for a fixed rng", () => {
    const rng = () => 0.5;
    const first = rollCultureKnowledgeValue("Generic", rng);
    const second = rollCultureKnowledgeValue("Generic", rng);
    expect(first).toBe(second);
  });

  it("falls back to the Generic prior for an undefined type", () => {
    // u1=0.5, u2=0.5 -> cos(pi) = -1 -> mean - deviation
    const rng = () => 0.5;
    expect(rollCultureKnowledgeValue(undefined, rng)).toBeCloseTo(rollCultureKnowledgeValue("Generic", rng), 10);
  });
});

describe("getCultureKnowledgeValue", () => {
  it("returns the stored knowledgeValue when finite", () => {
    expect(getCultureKnowledgeValue({ type: "Naval", knowledgeValue: 0.73 })).toBe(0.73);
  });

  it("falls back to the type's prior when knowledgeValue is missing (legacy save)", () => {
    expect(getCultureKnowledgeValue({ type: "Nomadic", knowledgeValue: undefined })).toBe(
      KNOWLEDGE_VALUE_PRIOR.Nomadic
    );
  });

  it("falls back to the Generic prior when both fields are missing", () => {
    expect(getCultureKnowledgeValue({ type: undefined, knowledgeValue: undefined })).toBe(
      KNOWLEDGE_VALUE_PRIOR.Generic
    );
  });

  it("ignores a non-finite stored value", () => {
    expect(getCultureKnowledgeValue({ type: "Highland", knowledgeValue: Number.NaN })).toBe(
      KNOWLEDGE_VALUE_PRIOR.Highland
    );
  });
});
