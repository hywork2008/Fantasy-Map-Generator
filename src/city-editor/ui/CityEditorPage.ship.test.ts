import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}

describe("City Editor Ship Tool", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("provides a ship brush in the toolbar and shows ship controls when active", () => {
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.title === "Place ships" || b.textContent?.includes("⛵")
    );
    expect(shipBtn).toBeDefined();

    const shipControls = root.querySelector<HTMLDivElement>(".ce-ship-controls");
    expect(shipControls).toBeDefined();
    expect(shipControls?.hidden).toBe(true);

    shipBtn?.click();
    expect(shipControls?.hidden).toBe(false);

    // Ship type select lists every SHIP_SPECS entry (small, medium, large, barge)
    const select = shipControls?.querySelector("select");
    expect(select).toBeDefined();
    expect([...(select?.options ?? [])].map(o => o.value)).toEqual(["small", "medium", "large", "barge"]);
    expect(select?.value).toBe("small");

    // Length input exists
    const lengthInput = shipControls?.querySelector<HTMLInputElement>("input[type='number']");
    expect(lengthInput).toBeDefined();
    expect(lengthInput?.value).toBe("16");
  });

  it("places a small ship on click and reflects it in the SVG canvas", () => {
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("⛵")
    );
    shipBtn?.click();

    const map = root.querySelector<HTMLDivElement>(".ce-map");
    expect(map).toBeDefined();

    // Click to place a ship
    const clickEvent = new MouseEvent("click", {
      clientX: 200,
      clientY: 200,
      bubbles: true
    });
    map?.dispatchEvent(clickEvent);

    const shipNode = root.querySelector(".ce-ship--small");
    expect(shipNode).not.toBeNull();
    expect(shipNode?.getAttribute("data-ship-type")).toBe("small");
    expect(shipNode?.getAttribute("data-ship-length")).toBe("16");
  });

  it("places a medium ship with custom size (e.g. 28m instead of default 25m)", () => {
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("⛵")
    );
    shipBtn?.click();

    const shipControls = root.querySelector<HTMLDivElement>(".ce-ship-controls")!;
    const select = shipControls.querySelector<HTMLSelectElement>("select")!;
    select.value = "medium";
    select.dispatchEvent(new Event("change"));

    const lengthInput = shipControls.querySelector<HTMLInputElement>("input[type='number']")!;
    expect(lengthInput.value).toBe("25");

    // Adjust length by 3 metres -> 28m
    lengthInput.value = "28";
    lengthInput.dispatchEvent(new Event("input"));

    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    map.dispatchEvent(
      new MouseEvent("click", {
        clientX: 250,
        clientY: 250,
        bubbles: true
      })
    );

    const shipNode = root.querySelector(".ce-ship--medium");
    expect(shipNode).not.toBeNull();
    expect(shipNode?.getAttribute("data-ship-length")).toBe("28");
    // scale for caravel with base 25m: 28 / 25 = 1.1200
    expect(shipNode?.getAttribute("transform")).toContain("scale(1.1200 1.1200)");
  });

  it("inspects and deletes a placed ship in select mode", () => {
    // 1. Place a ship
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("⛵")
    );
    shipBtn?.click();

    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    map.dispatchEvent(
      new MouseEvent("click", {
        clientX: 300,
        clientY: 300,
        bubbles: true
      })
    );

    const shipNode = root.querySelector<SVGElement>(".ce-ship");
    expect(shipNode).not.toBeNull();

    // 2. Switch to select mode
    const selectBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.title === "Select and move" || b.textContent?.includes("↖")
    );
    selectBtn?.click();

    // 3. Click the ship to inspect
    const child = root.querySelector(".ce-ship")!;
    child.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true
      })
    );

    const kind = root.querySelector<HTMLElement>(".cg-inspector-kind");
    expect(kind).not.toBeNull();
    expect(kind?.textContent).toContain("ship");

    const deleteBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.textContent === "Delete ship"
    );
    expect(deleteBtn).toBeDefined();
    deleteBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Ship should be removed
    expect(root.querySelector(".ce-ship")).toBeNull();
  });

  it("drags and drops a ship to move it on the map", () => {
    // 1. Place a ship
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("⛵")
    );
    shipBtn?.click();

    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    map.dispatchEvent(
      new MouseEvent("click", {
        clientX: 200,
        clientY: 200,
        bubbles: true
      })
    );

    const shipBefore = root.querySelector(".ce-ship")!;
    const transformBefore = shipBefore.getAttribute("transform");

    // 2. Switch to select mode
    const selectBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.title === "Select and move" || b.textContent?.includes("↖")
    );
    selectBtn?.click();

    // 3. Pointerdown on ship to start drag
    const shipEl = root.querySelector(".ce-ship")!;
    shipEl.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 200,
        clientY: 200,
        button: 0,
        bubbles: true
      })
    );

    // 4. Pointermove to drag by 50px
    map.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 260,
        clientY: 280,
        bubbles: true
      })
    );

    // 5. Pointerup to drop
    map.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 260,
        clientY: 280,
        bubbles: true
      })
    );

    const shipAfter = root.querySelector(".ce-ship")!;
    const transformAfter = shipAfter.getAttribute("transform");
    expect(transformAfter).not.toBe(transformBefore);
  });

  it("shows rotation handle when ship is selected and rotates ship on dragging handle", () => {
    // 1. Place a ship
    const shipBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("⛵")
    );
    shipBtn?.click();

    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    map.dispatchEvent(
      new MouseEvent("click", {
        clientX: 200,
        clientY: 200,
        bubbles: true
      })
    );

    // 2. Switch to select mode
    const selectBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.title === "Select and move" || b.textContent?.includes("↖")
    );
    selectBtn?.click();

    // 3. Click ship to select it
    const shipEl = root.querySelector(".ce-ship")!;
    shipEl.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true
      })
    );

    // Rotation handle must be visible at the tip of the ship
    const handle = root.querySelector<SVGElement>("[data-ship-handle='rotate']");
    expect(handle).not.toBeNull();
    const knob = root.querySelector<SVGElement>(".ce-ship-rotate-knob");
    expect(knob).not.toBeNull();

    // 4. Drag the rotation handle
    knob?.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 200,
        clientY: 180,
        button: 0,
        bubbles: true
      })
    );

    // Drag pointer to the right (+90 degrees or -90 degrees)
    map.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 280,
        clientY: 200,
        bubbles: true
      })
    );

    // Drop
    map.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 280,
        clientY: 200,
        bubbles: true
      })
    );

    const shipAfter = root.querySelector(".ce-ship")!;
    const transform = shipAfter.getAttribute("transform");
    // Should have a non-zero rotation angle
    expect(transform).not.toContain("rotate(0)");
  });
});
