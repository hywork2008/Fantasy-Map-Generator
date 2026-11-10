import { expect, it } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import { createFreeformCity, materializeFreeform } from "../generators/freeform/freeformCity";
import { buildMarketAreaControls } from "./marketAreaControls";

it("populates a surveyed area and synchronizes imported or undone markets before an activity change", () => {
  const empty = materializeFreeform(createFreeformCity(160, 1, 8));
  empty.terrain!.field = {
    version: 1,
    template: "noise",
    seed: 1,
    sampleMeters: 8,
    parts: [{ kind: "offset", meters: 4 }]
  };
  empty.terrain!.ways = [
    {
      id: "street",
      profile: "slope",
      surface: "dirt",
      widthMeters: 4,
      centerline: [
        [0, -60],
        [0, 60]
      ]
    }
  ];
  let current = empty;
  const map = document.createElement("div");
  map.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><g class="ce-map-scene"></g></svg>';
  const controls = buildMarketAreaControls({
    getDocument: () => current,
    selected: () => null,
    commit: doc => {
      current = doc;
    },
    notice: () => {},
    map
  });
  document.body.append(controls.root, map);
  const action = (key: Parameters<typeof editorText>[0]) =>
    [...controls.root.querySelectorAll("button")].find(b => b.textContent === editorText(key))!.click();
  try {
    controls.sync();
    controls.root.open = true;
    controls.root.dispatchEvent(new Event("toggle"));
    expect(map.querySelector(".ce-market-area-preview")).not.toBeNull();
    action("cityEditor.messages.marketPopulateArea");
    expect(current.markets![0].stallElementIds).toHaveLength(6);
    const populated = current;
    const select = controls.root.querySelector(
      `select[aria-label="${editorText("cityEditor.messages.marketSavedArea")}"]`
    ) as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    current = empty;
    controls.sync();
    expect(select.options).toHaveLength(0);
    current = populated;
    controls.sync();
    expect(select.options).toHaveLength(1);
    action("cityEditor.messages.marketClose");
    expect(current.markets![0].activity).toBe("closed");
    expect(current.elements.every(e => e.objectMarketActivity === "closed")).toBe(true);
    controls.sync();
    action("cityEditor.messages.marketOpen");
    expect(current.elements.every(e => e.objectMarketActivity === "market-day")).toBe(true);
  } finally {
    controls.root.remove();
    map.remove();
  }
});
