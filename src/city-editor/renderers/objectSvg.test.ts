import { afterEach, expect, it } from "vitest";
import html from "../index.html?raw";
import { renderObjectSvg } from "./objectSvg";

afterEach(() => document.body.replaceChildren());

it("highlights only the object envelope when selection is patched or fully rendered", () => {
  const style = document.createElement("style");
  style.textContent = html.match(/<style>([\s\S]*?)<\/style>/)![1];
  document.body.append(style);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  for (const selected of [false, true]) {
    const node = renderObjectSvg(
      { id: "trebuchet", kind: "object", objectType: "trebuchet", point: [0, 0], faceIds: [], locked: false },
      selected
    );
    svg.replaceChildren(node);
    const frame = node.querySelector(".ce-object-selection")!;
    const path = node.querySelector("path")!;
    const originalFilter = getComputedStyle(path).filter;
    // Selection also changes without redrawing the object in patchSelectionRender().
    node.classList.add("ce-is-selected", "cg-is-selected");
    expect(getComputedStyle(node).filter).not.toContain("drop-shadow");
    expect(getComputedStyle(path).filter).toBe(originalFilter);
    expect(getComputedStyle(path).filter).not.toContain("drop-shadow");
    expect(getComputedStyle(path).stroke).not.toBe("rgb(241, 207, 85)");
    expect(getComputedStyle(frame).stroke).toBe("rgb(241, 207, 85)");
    expect(frame.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    node.classList.remove("ce-is-selected", "cg-is-selected");
    expect(getComputedStyle(frame).stroke).not.toBe("rgb(241, 207, 85)");
  }
});
