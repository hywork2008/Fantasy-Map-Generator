import { afterEach, describe, expect, it } from "vitest";
import { parsePickInfo } from "../render/svg";
import { mountCityGenerator } from "./CityGeneratorPage";

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("City Generator Inspector", () => {
  it("shows the clicked SVG feature's details in the inspector panel", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountCityGenerator(root);

    const target = root.querySelector<SVGElement>('.cg-step[data-step="4"] path[data-pick]');
    expect(target).not.toBeNull();
    const expected = parsePickInfo(target?.getAttribute("data-pick") ?? null);
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const inspector = root.querySelector<HTMLElement>(".cg-panel--inspector");
    expect(inspector?.hidden).toBe(false);
    expect(root.querySelector(".cg-inspector-kind")?.textContent).toBe(expected?.label);
    expect(root.querySelector(".cg-inspector-content")?.textContent).toContain(`"kind": "${expected?.kind}"`);
  });
});
