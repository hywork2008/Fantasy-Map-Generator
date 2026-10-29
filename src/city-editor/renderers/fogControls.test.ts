import { afterEach, expect, it } from "vitest";
import { readFogSettings } from "./fogControls";

const key = "fmg-city-editor:distance-fog";
afterEach(() => localStorage.removeItem(key));

it.each([
  ["null", { strength: 80, startPercent: 105 }],
  ['{"strength":25}', { strength: 25, startPercent: 105 }],
  ['{"strength":80,"startPercent":50}', { strength: 80, startPercent: 50 }],
  ['{"strength":0,"startPercent":0}', { strength: 0, startPercent: 0 }],
  ['{"strength":110,"startPercent":300}', { strength: 100, startPercent: 200 }],
  ['{"strength":-5,"startPercent":-20}', { strength: 0, startPercent: 0 }],
  ['{"startPercent":"50"}', { strength: 80, startPercent: 105 }],
  ["invalid", { strength: 80, startPercent: 105 }]
])("loads saved fog controls safely: %s", (saved, expected) => {
  localStorage.setItem(key, saved as string);
  expect(readFogSettings()).toEqual(expected);
});
