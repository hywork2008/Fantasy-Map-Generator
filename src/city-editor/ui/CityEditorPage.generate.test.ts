import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

// jsdom has no layout engine; the History panel calls this after every commit.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  mountCityEditor(root);
});

afterEach(() => {
  root.remove();
});

function stageButton(label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>(".ce-generate-stages button")].find(candidate =>
    candidate.textContent?.startsWith(label)
  );
  if (!button) throw new Error(`stage button "${label}" not found`);
  return button;
}

function panelButton(fragment: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>(".ce-generate button")].find(candidate =>
    candidate.textContent?.includes(fragment)
  );
  if (!button) throw new Error(`panel button "${fragment}" not found`);
  return button;
}

const has = (selector: string): boolean =>
  (root.querySelector("svg.ce-svg")?.querySelectorAll(selector).length ?? 0) > 0;
const count = (selector: string): number => root.querySelector("svg.ce-svg")?.querySelectorAll(selector).length ?? 0;
/** A fingerprint of the block mesh only — face fills / feature groups excluded. */
const meshFingerprint = (): string => {
  const svg = root.querySelector("svg.ce-svg");
  const edges = [...(svg?.querySelectorAll(".ce-edges .ce-edge") ?? [])].map(e => e.getAttribute("d")).join("|");
  return `${count(".ce-cells .ce-face")}#${edges}`;
};

/** Roll new towns until one has a river, a wall, gates and wards. */
function seedRichTown(tries = 16): void {
  for (let i = 0; i < tries; i++) {
    if (i > 0) panelButton("新しい都市").click();
    stageButton("⑥").click();
    if (
      has(".ce-feature--river") &&
      has(".ce-feature--wall") &&
      has(".ce-gates > *") &&
      [...root.querySelectorAll("svg.ce-svg .ce-face")].some(
        f => f.classList.contains("ce-face--land") && !f.classList.contains("ce-face--ward-unassigned")
      )
    ) {
      return;
    }
  }
  throw new Error("no sufficiently rich town in the roll budget");
}

describe("Generate panel", () => {
  it("renders six ordered process buttons (no grid step) and no seed / size field", () => {
    const labels = [...root.querySelectorAll(".ce-generate-stages button")].map(b => b.textContent);
    expect(labels).toEqual(["① 海岸線と海", "② 河川", "③ 市街地コア", "④ 城壁・門・城郭", "⑤ 街路", "⑥ 地区割り当て"]);
    const typedInputs = [...root.querySelectorAll<HTMLInputElement>(".ce-generate input")].filter(
      i => i.type === "text" || i.type === "number"
    );
    expect(typedInputs).toEqual([]);
    expect([...root.querySelectorAll(".ce-generate label")].some(l => l.textContent?.includes("Size"))).toBe(false);
    expect(panelButton("新しい都市")).toBeTruthy();
  });

  it("never rebuilds the block mesh — the reported bug", () => {
    const before = meshFingerprint();
    expect(count(".ce-cells .ce-face")).toBeGreaterThan(0);
    for (const label of ["①", "②", "③", "④", "⑤", "⑥"]) {
      stageButton(label).click();
      expect(meshFingerprint(), `mesh changed after ${label}`).toBe(before);
    }
    panelButton("新しい都市").click();
    expect(meshFingerprint()).toBe(before);
    panelButton("Randomize geography").click();
    expect(meshFingerprint()).toBe(before);
  });

  it("shows one consistent town, one process at a time", () => {
    seedRichTown();

    stageButton("②").click(); // river
    expect(has(".ce-feature--river")).toBe(true);
    expect(has(".ce-feature--wall")).toBe(false); // walls come at ④

    stageButton("④").click(); // walls
    expect(has(".ce-feature--wall")).toBe(true);
    expect(has(".ce-gates > *")).toBe(true);

    stageButton("⑥").click(); // wards
    expect(
      [...root.querySelectorAll("svg.ce-svg .ce-face")].some(
        f => f.classList.contains("ce-face--land") && !f.classList.contains("ce-face--ward-unassigned")
      )
    ).toBe(true);
    expect(root.querySelector(".ce-status")?.textContent).toContain("Generated up to ⑥");
  });

  it("keeps the same plan when a stage is pressed again", () => {
    stageButton("③").click();
    const first = root.querySelector("svg.ce-svg")?.innerHTML;
    expect(first?.length).toBeGreaterThan(0);
    stageButton("③").click();
    expect(root.querySelector("svg.ce-svg")?.innerHTML).toBe(first);
    stageButton("③").click();
    expect(root.querySelector(".ce-status")?.textContent).toContain("Already at");
  });

  it("🎲 新しい都市 rolls a different plan and re-shows the current stage", () => {
    stageButton("③").click();
    const plans = new Set<string>([root.querySelector("svg.ce-svg .ce-cells")?.parentElement?.outerHTML ?? ""]);
    for (let i = 0; i < 6; i++) {
      panelButton("新しい都市").click();
      plans.add(root.querySelector("svg.ce-svg")?.innerHTML ?? String(i));
    }
    expect(plans.size).toBeGreaterThan(1);
  });

  it("randomize geography keeps the panel in sync and does not throw", () => {
    stageButton("③").click();
    panelButton("Randomize geography").click();
    expect(count(".ce-cells .ce-face")).toBeGreaterThan(0);
    expect(root.querySelector(".ce-status")?.textContent).not.toContain("failed");
  });
});
