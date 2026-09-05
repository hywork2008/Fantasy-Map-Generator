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

function iconButton(title: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!button) throw new Error(`icon button "${title}" not found`);
  return button;
}

const nPatchesInput = (): HTMLInputElement =>
  root.querySelector<HTMLInputElement>('.ce-generate input[type="number"]') as HTMLInputElement;
const stepStatusText = (): string => root.querySelector(".ce-generate-step-status")?.textContent ?? "";
/** The panel starts landlocked (DEFAULT_SITE_CONFIG.coast === "none") — the ①
 * coastline tests need an actual coast, found by the option only Coast has. */
function setCoastal(): void {
  const select = [...root.querySelectorAll<HTMLSelectElement>(".ce-generate select")].find(s =>
    [...s.options].some(o => o.value === "straight")
  );
  if (!select) throw new Error("coast select not found");
  select.value = "straight";
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
const setInputValue = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
};
const prevStep = (): void => iconButton("Previous step").click();
const nextStep = (): void => iconButton("Next step").click();

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
    // No seed / size field — but the ③ urban-core "nPatches" debug override
    // (towngen-comparison.md §2.1) is a deliberate, sole exception.
    const typedInputs = [...root.querySelectorAll<HTMLInputElement>(".ce-generate input")].filter(
      i => i.type === "text" || i.type === "number"
    );
    expect(typedInputs).toHaveLength(1);
    expect(typedInputs[0].placeholder).toBe("auto");
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

describe("③ urban-core patch tuning (towngen-comparison.md §2.1)", () => {
  it("③ tints its buildable cells; any other stage clears the tint", () => {
    // A few small towns can have zero eligible land inside the roll budget; retry.
    let tinted = 0;
    for (let i = 0; i < 12 && tinted === 0; i++) {
      if (i > 0) panelButton("新しい都市").click();
      stageButton("③").click();
      tinted = count(".ce-face--urban-step");
    }
    expect(tinted).toBeGreaterThan(0);

    stageButton("④").click();
    expect(count(".ce-face--urban-step")).toBe(0);
  });

  it("nPatches caps ③'s tinted core to fewer cells than the radius cutoff", () => {
    let uncapped = 0;
    for (let i = 0; i < 12 && uncapped < 8; i++) {
      if (i > 0) panelButton("新しい都市").click();
      stageButton("③").click();
      uncapped = count(".ce-face--urban-step");
    }
    expect(uncapped).toBeGreaterThanOrEqual(8);

    setInputValue(nPatchesInput(), "5");
    stageButton("③").click();
    expect(count(".ce-face--urban-step")).toBeLessThan(uncapped);
    expect(count(".ce-face--urban-step")).toBeGreaterThan(0);

    // Clearing the field falls back to the (larger) radius-based core.
    setInputValue(nPatchesInput(), "");
    stageButton("③").click();
    expect(count(".ce-face--urban-step")).toBe(uncapped);
  });
});

describe("step-by-step process scrub — all six stages (towngen-comparison.md)", () => {
  it("◀ / ▶ do nothing (with a notice) until a stage button has activated one", () => {
    nextStep();
    expect(root.querySelector(".ce-status")?.textContent).toContain("Press a stage button");
    expect(stepStatusText()).toBe("");
  });

  it("③ ▶ / ◀ scrub the flood-fill one admitted cell at a time (needs its stage pressed first)", () => {
    // Some tiny meshes have no eligible land at all for the first roll; retry.
    let total = 0;
    for (let i = 0; i < 12 && total < 2; i++) {
      if (i > 0) panelButton("新しい都市").click();
      stageButton("③").click();
      nextStep();
      total = Number(stepStatusText().match(/(\d+)\/(\d+)/)?.[2] ?? 0);
    }
    expect(total).toBeGreaterThanOrEqual(2);
    expect(count(".ce-face--urban-step")).toBe(1);
    expect(stepStatusText()).toMatch(/^③ 市街地コア: cell #\d+ — 1\/\d+$/);

    nextStep();
    expect(count(".ce-face--urban-step")).toBe(2);
    expect(stepStatusText()).toMatch(/^③ 市街地コア: cell #\d+ — 2\/\d+$/);

    prevStep();
    expect(count(".ce-face--urban-step")).toBe(1);
    expect(stepStatusText()).toMatch(/^③ 市街地コア: cell #\d+ — 1\/\d+$/);
  });

  it("① reveals the coastline walk as a growing dotted trail, not sea cells", () => {
    setCoastal(); // the panel starts landlocked
    let seen = 0;
    for (let i = 0; i < 12 && seen < 2; i++) {
      if (i > 0) panelButton("新しい都市").click();
      stageButton("①").click();
      nextStep();
      seen = count(".ce-step-path-point");
    }
    expect(seen).toBeGreaterThan(0);
    expect(has(".ce-face--sea")).toBe(false); // scrubbing shows the walk, not the classified result
    expect(stepStatusText()).toMatch(/^① 海岸線と海: vertex 1\/\d+$/);

    nextStep();
    expect(count(".ce-step-path-point")).toBe(seen + 1);
  });

  /** Click ▶ exactly enough times to reach the last step, reading the total /
   * current position straight from the status text (no guessed iteration cap). */
  function advanceToLastStep(): number {
    const match = stepStatusText().match(/(\d+)\/(\d+)$/);
    const current = match ? Number(match[1]) : 1;
    const total = match ? Number(match[2]) : 1;
    for (let i = current; i < total; i++) nextStep();
    return total;
  }

  it("② reveals the river walk the same way, and ④/⑤/⑥ scrub the document itself", () => {
    seedRichTown();

    stageButton("②").click();
    nextStep();
    expect(count(".ce-step-path-point")).toBeGreaterThan(0);
    expect(stepStatusText()).toMatch(/^② 河川: .*vertex 1\/\d+$/);

    // ④ gates: scrubbing to the end must match pressing ④ directly (same
    // seed/mesh ⇒ deterministic), and the overlay path is unused for this stage.
    stageButton("④").click();
    nextStep();
    expect(count(".ce-step-path-point")).toBe(0);
    expect(stepStatusText()).toMatch(/^④ 城壁・門・城郭: gate 1\/\d+$/);
    advanceToLastStep();
    const scrubbedGates = root.querySelectorAll(".ce-gates > *").length;
    stageButton("④").click(); // the ordinary button press, for comparison
    expect(scrubbedGates).toBe(root.querySelectorAll(".ce-gates > *").length);
    expect(scrubbedGates).toBeGreaterThan(0);

    // ⑤ roads: same "scrubbed end == direct press" check.
    stageButton("⑤").click();
    nextStep();
    expect(stepStatusText()).toMatch(/^⑤ 街路: road 1\/\d+$/);
    advanceToLastStep();
    const scrubbedRoads = count(".ce-feature--road");
    stageButton("⑤").click();
    expect(scrubbedRoads).toBe(count(".ce-feature--road"));
    expect(scrubbedRoads).toBeGreaterThan(0);

    // ⑥ wards: a "small" town can have hundreds of cells (too slow to scrub to
    // the very end here — that exact-growth property is already covered at the
    // core level, generate.test.ts), so just check a handful of steps grow the
    // coloured-ward count and each reports a sensible status line.
    const wardedCount = (): number =>
      [...root.querySelectorAll("svg.ce-svg .ce-face")].filter(
        f => f.classList.contains("ce-face--land") && !f.classList.contains("ce-face--ward-unassigned")
      ).length;
    // ⑥'s direct press shows the FULL set; pressing ⑥ then ▶ scrubs down to a
    // partial one (step 0's single cell), same "subset while scrubbing" rule
    // as ③ — so growth is tracked from 0, not from the full press's count.
    stageButton("⑥").click();
    let prevWarded = 0;
    for (let i = 0; i < 5; i++) {
      nextStep();
      expect(stepStatusText()).toMatch(new RegExp(`^⑥ 地区割り当て: .* — ${i + 1}/\\d+$`));
      expect(wardedCount()).toBeGreaterThanOrEqual(prevWarded);
      prevWarded = wardedCount();
    }
  });

  it("pressing a stage button resets the scrub to step 0 and re-targets it", () => {
    seedRichTown();
    stageButton("③").click();
    nextStep();
    nextStep();
    expect(stepStatusText()).toContain("2/");

    stageButton("③").click(); // same stage again — still resets to "not stepped"
    expect(stepStatusText()).toBe("");
    nextStep();
    expect(stepStatusText()).toMatch(/^③ 市街地コア: .* — 1\/\d+$/);
  });

  it("🆕 a brand new grid drops any stale tint / overlay and deactivates the scrub", () => {
    let hadTint = false;
    for (let i = 0; i < 12 && !hadTint; i++) {
      if (i > 0) iconButton("Generate a new grid").click();
      stageButton("③").click();
      nextStep();
      hadTint = count(".ce-face--urban-step") > 0;
    }
    expect(hadTint).toBe(true);
    expect(stepStatusText()).not.toBe("");

    iconButton("Generate a new grid").click();
    expect(count(".ce-face--urban-step")).toBe(0);
    expect(stepStatusText()).toBe("");

    // The scrub is deactivated, not just reset to step 0 — ▶ needs a stage press again.
    nextStep();
    expect(root.querySelector(".ce-status")?.textContent).toContain("Press a stage button");
  });
});
