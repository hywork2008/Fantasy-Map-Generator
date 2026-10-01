import { expect, it } from "vitest";
import { createGridDocument } from "../core/document";
import { captureGenerationDebugPreview } from "../core/generationDebug";
import { renderGenerationDebugSvg, serializeGenerationDebugSvg } from "./generationDebugSvg";

it("renders a rejected mesh with missing edges safely, and marks the reported vertex", () => {
  const city = createGridDocument({ size: "micro", grid: "hex", seed: "debug-render" });
  const vertexId = Object.keys(city.mesh.vertices)[0];
  const removed = Object.keys(city.mesh.edges)[0];
  delete city.mesh.edges[removed];
  const preview = captureGenerationDebugPreview(
    city,
    {
      phase: "apply-validation",
      elapsedMs: 0,
      attempt: 8,
      failure: { reason: "invalid-mesh", message: "broken mesh", details: [`Gate gc:gate-0: ${vertexId}`] }
    },
    "debug:junction-retry:7"
  );
  const svg = renderGenerationDebugSvg(preview, "-150 -150 300 300");
  expect(svg.querySelector(`[data-location="${vertexId}"]`)).not.toBeNull();
  expect(svg.getAttribute("data-attempt")).toBe("8");
  expect(svg.outerHTML).not.toContain("NaN");
  expect(svg.querySelector("[data-pick]")).toBeNull();
});

it("exports a standalone full-frame SVG with highlights and failure diagnostics", () => {
  const city = createGridDocument({ size: "micro", grid: "hex", seed: "export-debug" });
  const id = Object.keys(city.mesh.vertices)[0];
  delete city.mesh.edges[Object.keys(city.mesh.edges)[0]];
  const preview = captureGenerationDebugPreview(
    city,
    {
      phase: "apply-validation",
      elapsedMs: 0,
      attempt: 1,
      failure: { reason: "invalid-mesh", message: "broken <mesh>", details: [id] }
    },
    "export<&seed"
  );
  const text = serializeGenerationDebugSvg(preview);
  const xml = new DOMParser().parseFromString(text, "image/svg+xml");
  expect(xml.querySelector("parsererror")).toBeNull();
  expect(xml.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
  const extent = city.frame.extentMeters;
  expect(xml.documentElement.getAttribute("viewBox")).toBe(`${-extent / 2} ${-extent / 2} ${extent} ${extent}`);
  expect(xml.documentElement.getAttribute("width")).toBe("1200");
  expect(xml.querySelector(`[data-location="${id}"]`)?.getAttribute("stroke")).toBe("#dc2638");
  expect(JSON.parse(xml.querySelector("metadata")!.textContent!)).toEqual({
    seed: preview.seed,
    sample: preview.sample,
    highlights: preview.highlights
  });
  expect(xml.querySelector("desc")!.textContent).toContain("赤");
  expect(text).not.toContain("NaN");
});
