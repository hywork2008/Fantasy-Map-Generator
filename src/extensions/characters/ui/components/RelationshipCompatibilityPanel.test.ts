import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "../../characterTypes";
import { RelationshipCompatibilityPanel } from "./RelationshipCompatibilityPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../backstoryProfile", () => ({ canHaveDirectSolidarity: () => false }));
const character = (i: number, overrides: Partial<Character> = {}): Character => ({
  i,
  name: `Person ${i}`,
  age: 35,
  gender: "male",
  culture: 1,
  appearance: 50,
  titles: [],
  affinities: {},
  marriages: [],
  state: 1,
  personality: {
    boldness: 50,
    compassion: 50,
    greed: 50,
    honor: 50,
    rationality: 80,
    sociability: 50,
    vengefulness: 50,
    zeal: 50,
    energy: 50,
    piety: 50,
    guile: 50,
    confidence: 50
  },
  skills: {
    artistry: 50,
    diplomacy: 50,
    engineering: 50,
    geography: 50,
    intrigue: 50,
    learning: 50,
    martial: 50,
    prowess: 50,
    stewardship: 50
  },
  family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
  ...overrides
});
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const open = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  open.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (people: Character[]) =>
  act(() =>
    root.render(
      createElement(RelationshipCompatibilityPanel, {
        character: people[0],
        characters: people,
        cultures: [],
        onOpenCharacter: open
      })
    )
  );
const rows = () => [...container.querySelectorAll("tbody tr")];
const changeSelect = (index: number, value: string) =>
  act(() => {
    const select = container.querySelectorAll("select")[index];
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

describe("relationship compatibility panel", () => {
  it("starts with living contacts, supports all people and opens linked characters", () => {
    render([
      character(1, { location: 9 }),
      character(2, { location: 9 }),
      character(3),
      character(4, { dead: true, location: 9 }),
      character(5, { favor: { 1: 20 } })
    ]);
    expect(rows()).toHaveLength(2);
    expect(container.textContent).not.toContain("Person 4");
    expect(container.textContent).not.toContain("Person 3");
    act(() => rows()[0].querySelector("button")!.click());
    expect(open).toHaveBeenCalledWith(2);
    changeSelect(0, "all");
    expect(rows()).toHaveLength(3);
    expect(container.textContent).toContain("Person 3");
    expect(container.querySelector("details")?.textContent).toContain("sharedReasoning");
  });

  it("sorts romance separately from friendship and filters by name", () => {
    const lead = character(1);
    lead.personality = { ...lead.personality, boldness: 80, energy: 80, zeal: 80, rationality: 50 };
    render([lead, character(2), character(3, { name: "Ardent", gender: "female", personality: lead.personality })]);
    changeSelect(0, "all");
    changeSelect(1, "romance");
    expect(rows()[0].textContent).toContain("Ardent");
    act(() => {
      const input = container.querySelector("input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Person 2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Person 2");
  });

  it("limits rows and expands on request", () => {
    render(Array.from({ length: 36 }, (_, i) => character(i + 1, { location: 9 })));
    expect(rows()).toHaveLength(30);
    const more = [...container.querySelectorAll("button")].find(
      button => button.textContent === "characters.compatibility.more"
    )!;
    act(() => more.click());
    expect(rows()).toHaveLength(35);
  });
});
