import { describe, expect, it } from "vitest";
import { createPresentationData } from "../runtime/presentationData";
import { projectPresentationToSvg } from "./presentationProjection";

describe("projectPresentationToSvg", () => {
  it("projects saved styles to the SVG adapter and removes null attributes", () => {
    const attributes = new Map<string, string>();
    const element = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name)
    } as unknown as Element;
    const root = {
      querySelectorAll: (selector: string) =>
        (selector === "#rivers" ? [element] : []) as unknown as NodeListOf<Element>
    } as unknown as ParentNode;
    const presentation = createPresentationData();
    presentation.styles["#rivers"] = { fill: "#123456", opacity: 0.5, filter: null };
    attributes.set("filter", "url(#old)");

    projectPresentationToSvg(root, presentation);

    expect(attributes).toEqual(
      new Map([
        ["fill", "#123456"],
        ["opacity", "0.5"]
      ])
    );
  });

  it("projects semantic overlay layouts onto the matching SVG selectors", () => {
    const attributes = new Map<string, string>();
    const element = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name)
    } as unknown as Element;
    const root = {
      querySelectorAll: (selector: string) =>
        (selector === "#scaleBar" ? [element] : []) as unknown as NodeListOf<Element>
    } as unknown as ParentNode;
    const presentation = createPresentationData();
    presentation.overlays.scaleBar = { "data-x": 12, "data-y": 34 };

    projectPresentationToSvg(root, presentation);

    expect(attributes).toEqual(
      new Map([
        ["data-x", "12"],
        ["data-y", "34"]
      ])
    );
  });
});
