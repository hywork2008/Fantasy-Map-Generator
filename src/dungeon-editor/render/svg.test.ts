import { describe, expect, it } from "vitest";
import { generateDungeon } from "../core/gen/pipeline";
import { DEFAULT_SETTINGS } from "../core/types";
import { renderDungeonSvg } from "./svg";

describe("dungeon SVG export", () => {
  it("exports a standalone map with escaped labels and without edit hit targets", () => {
    const result = generateDungeon(DEFAULT_SETTINGS);
    if (!result.ok) throw new Error("fixture");
    result.document.title = '<script>alert("x")</script>';
    result.document.levels[0].spaces["s-1"].label = "<& 中庭";
    const exported = renderDungeonSvg(result.document);
    const xml = new DOMParser().parseFromString(exported, "image/svg+xml");
    expect(xml.querySelector("parsererror")).toBeNull();
    expect(xml.querySelector("script")).toBeNull();
    expect(xml.documentElement.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(xml.querySelector("title")?.textContent).toBe(result.document.title);
    expect(exported).not.toContain("data-space-id");
    expect(exported).not.toContain("data-opening-id");
    expect(exported).toContain("&lt;&amp; 中庭");
    const live = renderDungeonSvg(result.document, { interactive: true });
    expect(live).toContain("data-space-id");
    expect(live).toContain("data-opening-id");
  });
});
