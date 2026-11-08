import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, vi } from "vitest";
import { detachFabricHouse } from "../../generators/vector/editing/fabricHouses";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { parseVectorDocument } from "../../services/io/vector/documentCodec";
import { EditorLanguageLifetime } from "../languagePanel";
import { mountVectorCityEditor } from "./VectorEditorPage";

const output = process.env.CE_MESHLESS_REFRESH_OUT;
const input = process.env.CE_MESHLESS_REFRESH_DIR ?? "docs/analytics/raw/scaling-v9-20261109";

/** Opt-in S4c: the whole vector editor page on a saved fabric document; time and document copies of one undo/redo. */
describe.runIf(!!output)("meshless page refresh observation", () => {
  it("records mount, undo and redo time and whole-document copies by call site", () => {
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({})
    });
    const out: Record<string, unknown> = {};
    for (const n of [5000, 50000]) {
      const doc = parseVectorDocument(readFileSync(`${input}/scaling-${n}.json`, "utf8"))!;
      const cell = Object.values(doc.fabric!.cells).find(c => c.houses.offsets.length)!;
      const history = new VectorDocumentHistory(doc);
      history.commit(detachFabricHouse(doc, `${cell.id}#0`).document, "detach");
      const root = document.createElement("div");
      document.body.append(root);
      const real = globalThis.structuredClone;
      let clones = 0;
      const sites: Record<string, number> = {};
      globalThis.structuredClone = ((v: unknown, o?: StructuredSerializeOptions) => {
        clones++;
        if (v && typeof v === "object" && "paths" in (v as object)) {
          const st = (new Error().stack ?? "")
            .split("\n")
            .slice(2, 5)
            .map(l =>
              l
                .trim()
                .replace(/\(.*\/src\/city-editor\//, "(")
                .replace(/\?v=\w+/, "")
            )
            .join(" < ");
          sites[st] = (sites[st] ?? 0) + 1;
        }
        return real(v, o);
      }) as typeof structuredClone;
      let t = performance.now();
      const dispose = mountVectorCityEditor(
        root,
        { history },
        { lifetime: new EditorLanguageLifetime(), returnToMesh() {}, openMeshDocument() {} }
      );
      const mount = { ms: Math.round(performance.now() - t), clones };
      const press = (label: string) => {
        clones = 0;
        for (const k of Object.keys(sites)) delete sites[k];
        const b = [...root.querySelectorAll("button")].find(b => b.textContent === label)!;
        t = performance.now();
        b.click();
        return { ms: Math.round(performance.now() - t), clones, sites: { ...sites } };
      };
      const buttons = [...root.querySelectorAll("button")].map(b => b.textContent);
      const undoLabel = buttons.find(l => /undo|元に戻す/i.test(l ?? ""))!,
        redoLabel = buttons.find(l => /redo|やり直/i.test(l ?? ""))!;
      out[n] = { mount, undo: press(undoLabel), redo: press(redoLabel), undoLabel, redoLabel };
      globalThis.structuredClone = real;
      dispose();
      root.remove();
    }
    writeFileSync(
      output!,
      `${JSON.stringify({ format: "ce-meshless-refresh-observation", version: 1, measuredAtUtc: new Date().toISOString(), input, scope: "jsdom, whole VectorEditorPage, one detach committed, then one undo and one redo; clones counts structuredClone calls; sites lists copies of whole documents by call site.", rows: out }, null, 2)}\n`
    );
  }, 600000);
});
