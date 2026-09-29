import { afterEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {};
let root: HTMLElement | undefined;
afterEach(() => {
  root?.remove();
  sessionStorage.removeItem("fmg.citySite");
});

describe("building pattern controls", () => {
  it("offers both generators and restores the current-map choice through history", () => {
    root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
    const current = root.querySelector<HTMLSelectElement>(".ce-document-building-pattern")!;
    const future = root.querySelector<HTMLSelectElement>(".ce-generate-building-pattern")!;
    expect([...future.options].map(o => o.value)).toEqual(["legacy", "medieval"]);
    expect(current.value).toBe("legacy");
    expect(future.value).toBe("medieval");
    current.value = "medieval";
    current.dispatchEvent(new Event("change", { bubbles: true }));
    expect(current.value).toBe("medieval");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(current.value).toBe("legacy");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(current.value).toBe("medieval");
  });
});
