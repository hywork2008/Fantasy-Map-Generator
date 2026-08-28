import { describe, expect, it, vi } from "vitest";
import { generateCity } from "../core/pipeline";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { bindCityInspector, parsePickInfo, renderCity } from "./svg";

function testResult() {
  const site = synthSite(
    "smallCity",
    { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["through"], relief: false },
    "svg-inspector"
  );
  return generateCity(siteToParams(site), siteToGeography(site));
}

describe("City SVG inspector", () => {
  it("attaches metadata, selects a clicked object, and clears on the SVG background", () => {
    const svg = renderCity(testResult(), {
      family: "step",
      gridIndex: 0,
      stepIndex: 3,
      showSites: true,
      showRadius: true
    });
    const onPick = vi.fn();
    bindCityInspector(svg, onPick);

    const target = svg.querySelector<SVGElement>("path[data-pick]");
    expect(target).not.toBeNull();
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(target?.classList.contains("cg-is-selected")).toBe(true);
    const payload = parsePickInfo(target?.getAttribute("data-pick") ?? null);
    expect(payload).toMatchObject({ layer: "grid", kind: "cell" });
    expect(onPick).toHaveBeenLastCalledWith(payload, target);

    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(svg.querySelector(".cg-is-selected")).toBeNull();
    expect(onPick).toHaveBeenLastCalledWith(null, null);
  });
});
