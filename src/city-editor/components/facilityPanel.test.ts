import { afterEach, describe, expect, it } from "vitest";
import { createGridDocument } from "../generators/document";
import { DocumentHistory } from "../generators/history";
import { EditorLifetime } from "../services/editorLifetime";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildFacilityPanel } from "./facilityPanel";

let scope: EditorLifetime;
afterEach(() => {
  scope?.dispose();
  document.body.replaceChildren();
});
describe("facility controls", () => {
  it("adds and removes a requested facility, restores automatic placement, and supports undo and saving", () => {
    const host = document.createElement("div");
    document.body.append(host);
    scope = new EditorLifetime(host);
    let city = createGridDocument({ size: "small", grid: "hex", seed: "facilities" });
    // The panel only needs the generation marker; closed panels do not build a preview.
    city.fabric = { generation: {} } as typeof city.fabric;
    const history = new DocumentHistory(city, "initial");
    const panel = buildFacilityPanel({
      scope,
      getDocument: () => city,
      commit: (next, label) => {
        city = history.commit(next, label);
      }
    });
    host.append(panel.root);
    const select = panel.root.querySelector("select")!;
    select.value = "warehouse";
    select.dispatchEvent(new Event("change"));
    const input = panel.root.querySelector("input")!;
    const buttons = panel.root.querySelectorAll("button");
    input.value = "2";
    buttons[0].click();
    expect(city.facilityCounts?.warehouse).toBe(2);
    buttons[1].click();
    expect(city.facilityCounts?.warehouse).toBe(0);
    city = history.undo()!;
    panel.sync();
    expect(input.value).toBe("2");
    const { fabric: _fabric, ...saveable } = city;
    expect(parseDocument(serializeDocument(saveable))?.facilityCounts?.warehouse).toBe(2);
    buttons[2].click();
    expect(city.facilityCounts?.warehouse).toBeUndefined();
  });
});
