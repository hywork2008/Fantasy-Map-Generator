import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./svgSanitize";

describe("svg sanitize", () => {
  it("drops scripts, foreign objects, and event handlers", () => {
    const svg = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0 L1 1" onclick="alert(1)"/><script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)">go</a></svg>`
    );
    expect(svg).not.toBeNull();
    expect(svg!.querySelector("script")).toBeNull();
    expect(svg!.querySelector("foreignObject")).toBeNull();
    expect(svg!.querySelector("path")?.getAttribute("onclick")).toBeNull();
    expect(svg!.querySelector("path")?.getAttribute("d")).toBe("M0 0 L1 1");
    expect(svg!.querySelector("a")?.getAttribute("href")).toBeNull();
  });
});
