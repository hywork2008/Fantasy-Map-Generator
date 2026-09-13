import { describe, expect, it } from "vitest";
import { isReligiousFormName, isReligiousStateForm } from "./religiousForms";

describe("religious state forms", () => {
  it("recognizes clerical form names", () => {
    expect(isReligiousFormName("Theocracy")).toBe(true);
    expect(isReligiousFormName("Holy State")).toBe(true);
    expect(isReligiousFormName("Bishopric")).toBe(true);
    expect(isReligiousFormName("Kingdom")).toBe(false);
    expect(isReligiousFormName(undefined)).toBe(false);
  });

  it("treats form === Theocracy as religious even without a clerical formName", () => {
    expect(isReligiousStateForm({ form: "Theocracy" })).toBe(true);
    expect(isReligiousStateForm({ form: "Monarchy", formName: "Holy State" })).toBe(true);
    expect(isReligiousStateForm({ form: "Monarchy", formName: "Kingdom" })).toBe(false);
  });
});
