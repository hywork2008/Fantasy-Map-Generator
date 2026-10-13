import { describe, expect, it } from "vitest";
import { createDocument } from "../generators/document";
import { SCENARIOS } from "../generators/generateTestScenarios";
import { generateCityOnDocument } from "../generators/generation/generateCity";
import { clearRenderDerivedCaches } from "./derivedCaches";
import { renderEditorSvg } from "./editorSvg";
import { serializeCitySvg } from "./standaloneSvg";

const NONE = { faceId: null, edgeId: null, vertexId: null, groupId: null };
const SEED = "ce-gen-b";

function city() {
  const generated = generateCityOnDocument(createDocument(SEED, 1200), SCENARIOS["coast + harbour + walls"], SEED);
  expect(generated).not.toBeNull();
  return generated!;
}

function render(document: ReturnType<typeof city>, tool: "select" | "vertex" = "select") {
  return renderEditorSvg(document, tool, NONE, "0 0 100 100", 1);
}

function sceneClasses(svg: SVGSVGElement): string[] {
  const scene = svg.querySelector(".ce-map-scene");
  return Array.from(scene?.children ?? []).map(child => child.getAttribute("class") ?? child.localName);
}

describe("render contract", () => {
  it("does not change the document it draws", () => {
    const document = city();
    const before = JSON.stringify(document);
    render(document);
    render(document, "vertex");
    serializeCitySvg(document);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("repeats identically without accumulating elements, with or without derived caches", () => {
    const document = city();
    const first = render(document);
    const second = render(document);
    expect(second.outerHTML).toBe(first.outerHTML);
    expect(second.querySelectorAll("*").length).toBe(first.querySelectorAll("*").length);
    clearRenderDerivedCaches();
    expect(render(document).outerHTML).toBe(first.outerHTML);
  });

  it("keeps the layer order of the map scene", () => {
    const classes = sceneClasses(render(city()));
    const at = (name: string) => classes.findIndex(value => value.split(" ").includes(name));
    for (const name of ["ce-background", "ce-cells", "ce-edges", "ce-features", "ce-elements", "ce-hover-layer"])
      expect(at(name), name).toBeGreaterThanOrEqual(0);
    expect(at("ce-background")).toBe(0);
    expect(at("ce-cells")).toBeLessThan(at("ce-edges"));
    expect(at("ce-edges")).toBeLessThan(at("ce-features"));
    expect(at("ce-features")).toBeLessThan(at("ce-elements"));
    expect(at("ce-elements")).toBeLessThan(at("ce-hover-layer"));
    expect(at("ce-hover-layer")).toBeLessThan(at("ce-measure-layer"));
  });

  it("keeps pick metadata on drawn features and standalone output self-contained", () => {
    const document = city();
    const svg = render(document);
    expect(svg.querySelectorAll("[data-pick]").length).toBeGreaterThan(0);
    const text = serializeCitySvg(document);
    expect(text.startsWith("<?xml")).toBe(true);
    expect(text).not.toContain("<script");
  });
});
