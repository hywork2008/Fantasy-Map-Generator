import { describe, expect, it } from "vitest";
import { cityEditorArchitectureViolations } from "../../scripts/city-editor/architecture";

const ce = "src/city-editor/";
const inspect = (entries: Record<string, string>) => cityEditorArchitectureViolations(new Map(Object.entries(entries)));

describe("CE architecture boundaries", () => {
  it("checks type-only imports, import types, reexports and lazy imports", () => {
    const results = inspect({
      [`${ce}generators/example.ts`]: `
        import type { View } from "../components/view";
        type View2 = import("../components/view").View;
        export { view } from "../components/view";
        const load = () => import("../components/view");`,
      [`${ce}components/view.ts`]: "export interface View {} export const view = {};"
    });
    expect(results.filter(result => result.includes("must not depend on components"))).toHaveLength(4);
  });
  it("checks lower-layer DOM globals and types without rejecting document data", () => {
    const results = inspect({
      [`${ce}generators/example.ts`]: `
        function valid(document: { mesh: unknown }) { return document.mesh; }
        function invalid() { return window.document.createElement("div"); }
        type Invalid = SVGSVGElement;`
    });
    expect(results.some(result => result.includes("browser/DOM"))).toBe(true);
    expect(results.some(result => result.includes("DOM type SVGSVGElement"))).toBe(true);
    expect(results.some(result => result.includes("document.mesh"))).toBe(false);
  });
  it("checks state and shared types against implementation imports", () => {
    expect(
      inspect({
        [`${ce}state/example.ts`]: 'import type { Algorithm } from "../generators/example";',
        [`${ce}types/example.ts`]: 'import type { Algorithm } from "../generators/example";',
        [`${ce}generators/example.ts`]: "export interface Algorithm {}"
      }).filter(result => result.includes("must not depend on generators"))
    ).toHaveLength(2);
  });
  it("rejects retired paths even in external callers and tests", () => {
    expect(inspect({ "src/services/caller.test.ts": 'import("../city-editor/core/document");' })).toEqual([
      expect.stringContaining("retired CE path")
    ]);
  });
  it("checks Worker entry URLs as dependencies", () => {
    expect(
      inspect({
        [`${ce}services/job.ts`]: 'new Worker(new URL("../components/job.ts", import.meta.url));',
        [`${ce}components/job.ts`]: "export {};"
      })
    ).toEqual([expect.stringContaining("services must not depend on components")]);
  });
  it("detects runtime cycles, including reexports and dynamic imports", () => {
    expect(
      inspect({
        [`${ce}generators/a.ts`]: 'export { b } from "./b";',
        [`${ce}generators/b.ts`]: 'export const b = () => import("./a");'
      })
    ).toEqual([expect.stringContaining("CE runtime import cycle")]);
  });
  it("allows recursive data contracts and the intended downward layers", () => {
    expect(
      inspect({
        [`${ce}types/a.ts`]: 'import type { B } from "./b"; export interface A { b: B }',
        [`${ce}types/b.ts`]: 'import type { A } from "./a"; export interface B { a: A }',
        [`${ce}generators/a.ts`]: 'import type { A } from "../types/a";',
        [`${ce}services/a.ts`]: 'import "../generators/a";',
        [`${ce}components/a.ts`]: 'import "../services/a";'
      })
    ).toEqual([]);
  });
  it("rejects computed module imports that hide dependencies", () => {
    expect(
      inspect({ [`${ce}services/example.ts`]: "const load = (modulePath: string) => import(modulePath);" })
    ).toEqual([expect.stringContaining("statically inspectable module paths")]);
  });
  it("keeps the legacy document exception limited to reexports", () => {
    const sources = {
      [`${ce}core/document.ts`]:
        'export * from "../generators/document"; export { parseDocument } from "../services/io/documentCodec";',
      [`${ce}generators/document.ts`]: "export const createDocument = () => ({});",
      [`${ce}services/io/documentCodec.ts`]: "export const parseDocument = () => null;"
    };
    expect(inspect(sources)).toEqual([]);
    expect(
      inspect({ ...sources, [`${ce}core/document.ts`]: `${sources[`${ce}core/document.ts`]}const shared = new Map();` })
    ).toEqual([expect.stringContaining("compatibility facade may only reexport")]);
  });
  it("rejects unresolved CE modules and ambiguous runtime placement", () => {
    expect(inspect({ [`${ce}misc/example.ts`]: 'import "../generators/missing";' })).toEqual([
      expect.stringContaining("role directory"),
      expect.stringContaining("unresolved CE module")
    ]);
  });
});
