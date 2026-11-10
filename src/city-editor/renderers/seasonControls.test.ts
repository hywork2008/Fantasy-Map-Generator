import { expect, it, vi } from "vitest";
import { createSeasonControls, type SeasonSettings } from "./seasonControls";

it("offers latitude and month sliders without map climate and restores map controls when climate arrives", () => {
  const settings: SeasonSettings = { month: "descriptor", latitude: 45, standaloneMonth: 7 };
  let climate = false;
  const changed = vi.fn();
  const controls = createSeasonControls(
    settings,
    () => ({ month: 1, climate }),
    (target, type, handler) => target.addEventListener(type, handler),
    changed
  );
  const latitude = controls.panel.querySelector<HTMLInputElement>('input[name="treeSeasonLatitude"]')!;
  const month = controls.panel.querySelector<HTMLInputElement>('input[name="treeSeasonMonth"]')!;
  const select = controls.panel.querySelector("select")!;
  expect([latitude.min, latitude.max, month.min, month.max]).toEqual(["-90", "90", "1", "12"]);
  expect(select.closest("label")!.hidden).toBe(true);
  expect(latitude.closest("label")!.hidden).toBe(false);
  latitude.value = "-45";
  latitude.dispatchEvent(new Event("input"));
  month.value = "1";
  month.dispatchEvent(new Event("input"));
  expect(settings).toEqual({ month: "descriptor", latitude: -45, standaloneMonth: 1 });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(latitude.closest("label")!.querySelector("output")!.value).toBe("-45°");
  climate = true;
  controls.refresh();
  expect(latitude.closest("label")!.hidden).toBe(true);
  expect(month.closest("label")!.hidden).toBe(true);
  expect(select.closest("label")!.hidden).toBe(false);
  select.value = "10";
  select.dispatchEvent(new Event("change"));
  expect(settings.month).toBe(10);
  climate = false;
  controls.refresh();
  expect(month.value).toBe("1");
  expect(latitude.value).toBe("-45");
});
