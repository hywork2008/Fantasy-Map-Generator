import { describe, expect, it, vi } from "vitest";
import { generateCity } from "../core/pipeline";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { bindCityInspector, parsePickInfo, renderCity, showFamily, showUrbanStage } from "./svg";

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
      urbanIndex: 0,
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

describe("City SVG urban-core evolution", () => {
  it("renders one <g> per urbanStages entry, showing only the selected one", () => {
    const result = testResult();
    const svg = renderCity(result, {
      family: "urban",
      gridIndex: 0,
      stepIndex: 0,
      urbanIndex: 2,
      showSites: false,
      showRadius: false
    });

    const stages = svg.querySelectorAll<SVGGElement>(".cg-ustage");
    expect(stages).toHaveLength(result.urbanStages.length);
    stages.forEach((g, i) => {
      expect(g.style.display).toBe(i === 2 ? "inline" : "none");
    });
    // Stage 2 (third iteration) has admitted exactly 3 urban cells so far.
    const urbanCells = svg.querySelectorAll('.cg-ustage[data-ustage="2"] path[data-pick]');
    let urbanCount = 0;
    for (const el of urbanCells) {
      const info = parsePickInfo(el.getAttribute("data-pick"));
      if (info?.label?.startsWith("urban")) urbanCount++;
    }
    expect(urbanCount).toBe(3);
  });

  it("showFamily / showUrbanStage toggle the urban family and stage after render", () => {
    const result = testResult();
    const svg = renderCity(result, {
      family: "step",
      gridIndex: 0,
      stepIndex: 0,
      urbanIndex: -1,
      showSites: false,
      showRadius: false
    });

    showFamily(svg, "urban");
    showUrbanStage(svg, 1);
    expect(svg.querySelector(".cg-urbanwrap")?.style.display).toBe("inline");
    expect(svg.querySelector(".cg-stepwrap")?.style.display).toBe("none");
    expect(svg.querySelector('.cg-ustage[data-ustage="1"]')?.style.display).toBe("inline");
    expect(svg.querySelector('.cg-ustage[data-ustage="0"]')?.style.display).toBe("none");
  });
});
