import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}

describe("City Editor panel z-index and bring-to-front behavior", () => {
  let root: HTMLElement;

  beforeEach(async () => {
    await i18n.changeLanguage("ja");
    root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("brings panel to front when titlebar is clicked / pointerdown", () => {
    const toolbar = root.querySelector<HTMLDivElement>(".ce-toolbar")!;
    const documentPanel = root.querySelector<HTMLDivElement>(".ce-document")!;
    expect(toolbar).not.toBeNull();
    expect(documentPanel).not.toBeNull();

    const toolbarTitlebar = toolbar.querySelector<HTMLDivElement>(".ce-panel-titlebar")!;
    toolbarTitlebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    const toolbarZ1 = parseInt(toolbar.style.zIndex || "0", 10);
    expect(toolbarZ1).toBeGreaterThanOrEqual(11);

    const docTitlebar = documentPanel.querySelector<HTMLDivElement>(".ce-panel-titlebar")!;
    docTitlebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    const docZ = parseInt(documentPanel.style.zIndex || "0", 10);
    expect(docZ).toBeGreaterThan(toolbarZ1);
  });

  it("brings panel to front when panel content is clicked / pointerdown", () => {
    const toolbar = root.querySelector<HTMLDivElement>(".ce-toolbar")!;
    const inspector = root.querySelector<HTMLDivElement>(".ce-inspector")!;
    expect(toolbar).not.toBeNull();
    expect(inspector).not.toBeNull();

    const inspectorContent = inspector.querySelector<HTMLDivElement>(".ce-panel-content")!;
    inspectorContent.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    const inspectorZ = parseInt(inspector.style.zIndex || "0", 10);
    expect(inspectorZ).toBeGreaterThanOrEqual(11);

    const toolbarContent = toolbar.querySelector<HTMLDivElement>(".ce-panel-content")!;
    toolbarContent.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    const toolbarZ = parseInt(toolbar.style.zIndex || "0", 10);
    expect(toolbarZ).toBeGreaterThan(inspectorZ);
  });

  it("keeps panel in front after drag and drop", () => {
    const toolbar = root.querySelector<HTMLDivElement>(".ce-toolbar")!;
    const documentPanel = root.querySelector<HTMLDivElement>(".ce-document")!;

    // Focus documentPanel first so it has higher z-index
    const docTitlebar = documentPanel.querySelector<HTMLDivElement>(".ce-panel-titlebar")!;
    docTitlebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    const docZ = parseInt(documentPanel.style.zIndex || "0", 10);

    // Now drag toolbar
    const toolbarTitlebar = toolbar.querySelector<HTMLDivElement>(".ce-panel-titlebar")!;
    toolbarTitlebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    // Drag move
    toolbarTitlebar.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50 }));

    // Drop
    toolbarTitlebar.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    // Toolbar should still have higher z-index than documentPanel after drop
    const toolbarZ = parseInt(toolbar.style.zIndex || "0", 10);
    expect(toolbarZ).toBeGreaterThan(docZ);
  });

  it("brings panel to front when collapse button is clicked", () => {
    const inspector = root.querySelector<HTMLDivElement>(".ce-inspector")!;
    const toolbar = root.querySelector<HTMLDivElement>(".ce-toolbar")!;

    // Focus toolbar first
    const toolbarTitlebar = toolbar.querySelector<HTMLDivElement>(".ce-panel-titlebar")!;
    toolbarTitlebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    const toolbarZ = parseInt(toolbar.style.zIndex || "0", 10);

    // Click collapse on inspector
    const collapseBtn = inspector.querySelector<HTMLButtonElement>(".ce-panel-collapse")!;
    collapseBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));

    const inspectorZ = parseInt(inspector.style.zIndex || "0", 10);
    expect(inspectorZ).toBeGreaterThan(toolbarZ);
  });
});
