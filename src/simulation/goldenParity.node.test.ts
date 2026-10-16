// @vitest-environment node
/**
 * Golden parity without DOM (S6): the Node Adapter, with every browser global the shared test
 * setup stubs removed, reproduces `__golden__/node.json` bit for bit.
 */
import { it } from "vitest";
import { expectNodeGoldenParity } from "./goldenParityCase";

const BROWSER_GLOBALS = ["window", "document", "Node", "localStorage", "sessionStorage", "requestAnimationFrame"];

it("matches the Node golden for 0, 30 and 365 days with every extension", async () => {
  const scope = globalThis as Record<string, unknown>;
  for (const name of BROWSER_GLOBALS) delete scope[name];
  const { createNodeSimulationHost } = await import("./adapters/node");
  await expectNodeGoldenParity(createNodeSimulationHost());
}, 300_000);
