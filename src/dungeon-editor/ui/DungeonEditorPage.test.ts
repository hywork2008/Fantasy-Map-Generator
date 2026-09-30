import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountDungeonEditor } from "./DungeonEditorPage";

let root: HTMLDivElement;
let editor: ReturnType<typeof mountDungeonEditor>;
const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
const click = (action: string) => query<HTMLButtonElement>(`[data-action="${action}"]`).click();
const submit = () =>
  query<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  editor = mountDungeonEditor(root);
});
afterEach(() => {
  editor.dispose();
  root.remove();
});
describe("Dungeon Editor page", () => {
  it("switches strategies, generates exact room count and supports undo/redo of regeneration", () => {
    const original = editor.getDocument();
    const select = query<HTMLSelectElement>('[name="strategy"]');
    select.value = "room-corridor";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(query<HTMLElement>('[data-preset="caravanserai"]').hidden).toBe(true);
    query<HTMLInputElement>('[name="roomCount"]').value = "12";
    submit();
    expect(editor.getDocument().generation.strategy).toBe("room-corridor");
    expect(Object.values(editor.getDocument().levels[0].spaces).filter(space => space.kind === "room")).toHaveLength(
      12
    );
    expect(query(".de-valid")).not.toBeNull();
    click("undo");
    expect(editor.getDocument()).toEqual(original);
    click("redo");
    expect(editor.getDocument().generation.strategy).toBe("room-corridor");
  });
  it("edits selected room labels, blocks regeneration while locked and preserves the map on failure", () => {
    query<SVGElement>('[data-space-id="s-1"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    query<HTMLInputElement>('[name="edit-label"]').value = "市場の中庭";
    click("space-apply");
    expect(editor.getDocument().levels[0].spaces["s-1"].label).toBe("市場の中庭");
    click("space-lock");
    const locked = editor.getDocument();
    submit();
    expect(editor.getDocument()).toBe(locked);
    expect(query(".de-status").textContent).toContain("ロック");
    click("space-lock");
    const unlocked = editor.getDocument();
    query<HTMLInputElement>('[name="courtyardWidthMeters"]').value = "58";
    submit();
    expect(editor.getDocument()).toBe(unlocked);
    expect(root.querySelectorAll(".de-diagnostic").length).toBeGreaterThan(0);
  });
  it("deleting an entrance shows warnings, undo restores it, and display options do not edit the map", () => {
    const original = editor.getDocument();
    const main = original.levels[0].entrances[0].openingId;
    query<SVGElement>(`[data-opening-id="${main}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click("opening-remove");
    expect(editor.getDocument().levels[0].entrances).toHaveLength(0);
    expect(query(".de-diagnostics").textContent).toContain("主入口がありません");
    click("undo");
    expect(editor.getDocument()).toEqual(original);
    query<HTMLInputElement>('[data-view="grid"]').checked = true;
    query('[data-view="grid"]').dispatchEvent(new Event("change", { bubbles: true }));
    expect(editor.getDocument()).toBe(original);
    expect(root.querySelector('rect[fill="url(#de-grid)"]')).not.toBeNull();
  });
});
