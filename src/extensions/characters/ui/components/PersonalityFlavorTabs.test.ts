import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterPersonality } from "../../characterTypes";
import { PersonalityFlavorTabs } from "./PersonalityFlavorTabs";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const personality: CharacterPersonality = {
  boldness: 50,
  compassion: 50,
  greed: 50,
  honor: 80,
  rationality: 50,
  sociability: 50,
  vengefulness: 50,
  zeal: 50,
  energy: 50,
  piety: 50,
  guile: 50,
  confidence: 50
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (key = "1", marriage: "monogamous" | "plural" = "monogamous") =>
  act(() =>
    root.render(
      createElement(PersonalityFlavorTabs, {
        key,
        character: { personality, appearance: 50 },
        norms: { marriage }
      })
    )
  );
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const panel = () => container.querySelector('[role="tabpanel"]')!;

describe("personality flavor tabs", () => {
  it("defaults to general and switches only the four flavor paragraphs", () => {
    render();
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(panel().textContent).toContain("characters.personalityDescription.");
    act(() => tabs()[1].click());
    expect(panel().textContent).toContain("characters.romanceDescription.faithfulMonogamy");
    expect(panel().textContent).not.toContain("characters.personalityDescription.");
    expect(panel().querySelectorAll("p")).toHaveLength(4);
    render("1", "plural");
    expect(panel().textContent).toContain("characters.romanceDescription.honorablePlurality");
    act(() => tabs()[0].click());
    expect(panel().textContent).toContain("characters.personalityDescription.");
  });

  it("supports arrow, Home and End navigation with focus and accessible labels", () => {
    render();
    for (const [key, index] of [
      ["ArrowRight", 1],
      ["ArrowRight", 0],
      ["End", 1],
      ["Home", 0],
      ["ArrowLeft", 1]
    ] as const) {
      act(() =>
        container
          .querySelector('[aria-selected="true"]')!
          .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
      );
      expect(document.activeElement).toBe(tabs()[index]);
      expect(tabs()[index].getAttribute("aria-selected")).toBe("true");
      expect(panel().getAttribute("aria-labelledby")).toBe(tabs()[index].id);
    }
  });

  it("resets to general when browsing to another character", () => {
    render();
    act(() => tabs()[1].click());
    render("2");
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  });
});
