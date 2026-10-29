import { afterEach, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {};
let cleanup: (() => void) | undefined;
let root: HTMLElement | undefined;
afterEach(() => {
  cleanup?.();
  root?.remove();
});

it("enables rotation for slope and valley, keeps fractional angles and restores automatic orientation", () => {
  root = document.createElement("div");
  document.body.append(root);
  cleanup = mountCityEditor(root);
  const preset = root.querySelector<HTMLSelectElement>(".ce-elevation-preset")!;
  const rotation = root.querySelector<HTMLInputElement>(".ce-elevation-rotation")!;
  expect(rotation.disabled).toBe(true);
  expect(rotation.value).toBe("");
  const changePreset = (value: string) => {
    preset.value = value;
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  };
  changePreset("slope");
  expect(rotation.disabled).toBe(false);
  rotation.value = "37.5";
  rotation.dispatchEvent(new Event("change", { bubbles: true }));
  changePreset("valley");
  expect(rotation.disabled).toBe(false);
  expect(rotation.value).toBe("37.5");
  changePreset("dome");
  expect(rotation.disabled).toBe(true);
  changePreset("slope");
  rotation.value = "360";
  rotation.dispatchEvent(new Event("change", { bubbles: true }));
  changePreset("valley");
  expect(rotation.value).toBe("0");
  rotation.value = "";
  rotation.dispatchEvent(new Event("change", { bubbles: true }));
  changePreset("slope");
  expect(rotation.value).toBe("");
});
