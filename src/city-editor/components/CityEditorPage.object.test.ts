import { afterEach, expect, it } from "vitest";
import { OBJECT_CATEGORIES, PLACEABLE_OBJECTS } from "../../buildings/placeableObjects";
import { editorText } from "../../i18n/editorMessages";
import { mountCityEditor } from "./CityEditorPage";

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  document.body.replaceChildren();
});
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

it("offers all requested BV categories, places a scaled model and supports editing, deletion and undo", () => {
  const root = document.createElement("div");
  document.body.append(root);
  cleanup = mountCityEditor(root);
  const button = (title: string) =>
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.title === title || b.textContent === title)!;
  const controls = root.querySelector<HTMLDivElement>(".ce-object-controls")!;
  expect(controls.hidden).toBe(true);
  button(editorText("cityEditor.messages.placeObjects")).click();
  expect(controls.hidden).toBe(false);
  const [category, model] = controls.querySelectorAll("select");
  expect([...category.options].map(o => o.value)).toEqual(OBJECT_CATEGORIES);
  for (const name of OBJECT_CATEGORIES) {
    category.value = name;
    category.dispatchEvent(new Event("change"));
    expect([...model.options].map(o => o.value)).toEqual(
      PLACEABLE_OBJECTS.filter(o => o.category === name).map(o => o.id)
    );
  }
  const scale = controls.querySelector<HTMLInputElement>("input")!;
  scale.value = "1.5";
  scale.dispatchEvent(new Event("input"));
  const map = root.querySelector<HTMLDivElement>(".ce-map")!;
  map.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 200, bubbles: true }));
  const placed = root.querySelector(".ce-object")!;
  expect(placed).not.toBeNull();
  expect(placed.getAttribute("data-object-type")).toBe("medievalWell");
  expect(placed.getAttribute("data-object-scale")).toBe("1.5");
  expect(placed.querySelector("path")).not.toBeNull();
  button(editorText("cityEditor.messages.selectAndMove")).click();
  root.querySelector(".ce-object")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const update = button(editorText("cityEditor.messages.updateObject"));
  expect(update).toBeDefined();
  const inputs = update.parentElement!.querySelectorAll<HTMLInputElement>("input");
  const scaleEdit = [...inputs].find(input => input.max === "10")!;
  scaleEdit.value = "2";
  update.click();
  expect(root.querySelector(".ce-object")?.getAttribute("data-object-scale")).toBe("2");
  button(editorText("cityEditor.messages.deleteObject")).click();
  expect(root.querySelector(".ce-object")).toBeNull();
  button(editorText("cityEditor.messages.undo")).click();
  expect(root.querySelector(".ce-object")?.getAttribute("data-object-scale")).toBe("2");
  const beforeMove = root.querySelector(".ce-object")!.getAttribute("transform");
  root
    .querySelector(".ce-object")!
    .dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, button: 0, bubbles: true }));
  map.dispatchEvent(new PointerEvent("pointermove", { clientX: 240, clientY: 240, bubbles: true }));
  map.dispatchEvent(new PointerEvent("pointerup", { clientX: 240, clientY: 240, bubbles: true }));
  expect(root.querySelector(".ce-object")!.getAttribute("transform")).not.toBe(beforeMove);
  button(editorText("cityEditor.messages.undo")).click();
  expect(root.querySelector(".ce-object")!.getAttribute("transform")).toBe(beforeMove);
});

it("rotates a trebuchet from the inspector and by dragging its handle, with undo and redo", () => {
  const root = document.createElement("div");
  document.body.append(root);
  cleanup = mountCityEditor(root);
  const button = (title: string) =>
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.title === title || b.textContent === title)!;
  button(editorText("cityEditor.messages.placeObjects")).click();
  const map = root.querySelector<HTMLDivElement>(".ce-map")!;
  map.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 200, bubbles: true }));
  button(editorText("cityEditor.messages.selectAndMove")).click();
  root.querySelector(".ce-object")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const angleInput = () =>
    root.querySelector<HTMLInputElement>(
      `.ce-inspector input[aria-label='${editorText("cityEditor.messages.rotation")}']`
    )!;
  expect(root.querySelector(".ce-object-rotate-knob")).not.toBeNull();
  const angle = angleInput();
  angle.value = "45";
  angle.dispatchEvent(new Event("change"));
  expect(Number(angleInput().value)).toBeCloseTo(45);
  angleInput().value = "90";
  angleInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(root.querySelector(".ce-object")!.getAttribute("transform")).toContain("rotate(-90)");
  expect(Number(angleInput().value)).toBeCloseTo(90);
  // Reselect to ensure the numeric edit was stored in the document.
  root.querySelector(".ce-object")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(Number(angleInput().value)).toBeCloseTo(90);
  const knob = root.querySelector(".ce-object-rotate-knob")!;
  const startX = Number(knob.getAttribute("cx")),
    startY = Number(knob.getAttribute("cy"));
  const reach = 200 - startY;
  knob.dispatchEvent(new PointerEvent("pointerdown", { clientX: startX, clientY: startY, button: 0, bubbles: true }));
  map.dispatchEvent(new PointerEvent("pointermove", { clientX: 200 - reach, clientY: 200, bubbles: true }));
  map.dispatchEvent(new PointerEvent("pointerup", { clientX: 200 - reach, clientY: 200, bubbles: true }));
  expect(Number(angleInput().value)).toBeCloseTo(180);
  expect(root.querySelector(".ce-object")!.getAttribute("transform")).toContain("rotate(-180)");
  button(editorText("cityEditor.messages.undo")).click();
  root.querySelector(".ce-object")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(Number(angleInput().value)).toBeCloseTo(90);
  button(editorText("cityEditor.messages.redo")).click();
  root.querySelector(".ce-object")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(Number(angleInput().value)).toBeCloseTo(180);
  button(editorText("cityEditor.messages.placeObjects")).click();
  expect(root.querySelector(".ce-object-handle-group")).toBeNull();
  map.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 300, bubbles: true }));
  expect([...root.querySelectorAll(".ce-object")].at(-1)!.getAttribute("transform")).toContain("rotate(0)");
});
