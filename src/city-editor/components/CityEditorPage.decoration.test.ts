import { afterEach, expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import { createDocument } from "../generators/document";
import * as cityFiles from "../services/io/cityEditorFile";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
let root: HTMLElement;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  root?.remove();
  vi.restoreAllMocks();
});

it("decorates an imported finished city independently of stages, restores visibility, and undoes regeneration", async () => {
  const doc = createDocument("decoration-ui", 400);
  doc.appearance = "town";
  for (const face of Object.values(doc.mesh.faces)) {
    face.properties.ward = "empty";
    face.properties.settlement = "core";
  }
  vi.spyOn(cityFiles, "pickCityMap").mockResolvedValue({ document: doc, source: "city-editor" });
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
  const controls = root.querySelector<HTMLElement>(".ce-city-decoration")!;
  const generate = controls.querySelector<HTMLButtonElement>("button")!;
  const visible = controls.querySelector<HTMLInputElement>("input")!;
  expect(generate.disabled).toBe(true);
  expect(visible.disabled).toBe(true);
  root
    .querySelector<HTMLButtonElement>(
      `button[title="${editorText("cityEditor.messages.importCityMapOrSVGReference")}"]`
    )!
    .click();
  await vi.waitFor(() => expect(generate.disabled).toBe(false));
  const stage = root.querySelector<HTMLInputElement>(".ce-generate-stage-slider")!;
  const stageValue = stage.value;
  const mesh = root.querySelector(".ce-faces")?.outerHTML;
  generate.click();
  const treeMarkup = () => root.querySelector(".ce-map .ce-vacant-lot-trees")?.outerHTML;
  const initial = treeMarkup();
  expect(initial).toBeTruthy();
  expect(visible.checked).toBe(true);
  visible.click();
  expect(treeMarkup()).toBeUndefined();
  visible.click();
  expect(treeMarkup()).toBe(initial);
  generate.click();
  expect(treeMarkup()).not.toBe(initial);
  const undo = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.title === editorText("cityEditor.messages.undo")
  )!;
  undo.click();
  expect(treeMarkup()).toBe(initial);
  expect(visible.checked).toBe(true);
  expect(stage.value).toBe(stageValue);
  expect(root.querySelector(".ce-faces")?.outerHTML).toBe(mesh);
});
