// @vitest-environment node
/**
 * Golden parity with a DOM present (S6): `document`, `localStorage` and `requestAnimationFrame`
 * come from jsdom, so the ports resolve the browser globals and the events are bridged to
 * `document` — as in the browser app — yet the result is the Node golden bit for bit (jsdom runs
 * on Node's V8; Chromium's differs in libm, see simulation-core-separation.md §20.3).
 *
 * jsdom is installed by hand instead of `environment: "jsdom"`: that environment also replaces
 * the JS builtins (ArrayBuffer, typed arrays) with jsdom-realm ones while `structuredClone` stays
 * Node's, which breaks the archive's typed-column checks. A browser has a single realm.
 */
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { expectNodeGoldenParity } from "./goldenParityCase";

it("matches the Node golden for 0, 30 and 365 days with every extension", async () => {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true
  });
  const scope = globalThis as Record<string, unknown>;
  for (const name of ["window", "document", "Node", "localStorage", "sessionStorage", "requestAnimationFrame"])
    delete scope[name];
  scope.window = window;
  scope.document = window.document;
  scope.Node = window.Node;
  scope.localStorage = window.localStorage;
  scope.sessionStorage = window.sessionStorage;
  scope.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  scope.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { connectSimulationEventsToDocument } = await import("./events");
  connectSimulationEventsToDocument(window.document);
  const { BUILTIN_SIMULATION_EXTENSIONS } = await import("../extensions/simulation");
  const { createSimulationHost } = await import("./host");
  const host = createSimulationHost({ extensions: BUILTIN_SIMULATION_EXTENSIONS });
  // The default ports must resolve to the DOM here, not to the in-memory / setImmediate fallbacks.
  const { simulationSettings } = await import("./ports");
  simulationSettings.setItem("fmg-sim-parity-probe", "1");
  expect(window.localStorage.getItem("fmg-sim-parity-probe")).toBe("1");
  simulationSettings.removeItem("fmg-sim-parity-probe");
  let forwarded = 0;
  window.document.addEventListener("fmg:world-loaded", () => forwarded++);

  await expectNodeGoldenParity(host);
  expect(forwarded).toBe(1);
}, 300_000);
