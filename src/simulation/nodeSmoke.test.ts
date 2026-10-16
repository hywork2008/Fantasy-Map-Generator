// @vitest-environment node
/**
 * DOM-free Node smoke test for the simulation core (docs/plan/simulation-core-separation.md §4.3).
 *
 * Removes every browser global the shared test setup stubs, then tries the three stages a headless
 * run needs: import the core, load the golden fixture, advance 30 days. The test pins the stage
 * that currently fails, so progress is visible: when a refactor step makes a stage pass, this test
 * fails and the expectation moves forward. Since S2 every stage passes for the core systems;
 * extensions are not registered yet — that needs the SimulationExtension entries from S5.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Stage = "import" | "load" | "advance" | "passed";

const BROWSER_GLOBALS = ["window", "document", "Node", "localStorage", "sessionStorage", "requestAnimationFrame"];

/** Message plus the innermost project frame, so the report names the module that needs a port. */
function describeError(error: unknown): string {
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const frame = stack.split("\n").find(line => line.includes("/src/") && !line.includes("nodeSmoke.test"));
  return `${String(error)}${frame ? ` (${frame.trim().replace(/^at /, "")})` : ""}`;
}

async function runStages(): Promise<{ stage: Stage; error?: string }> {
  const scope = globalThis as Record<string, unknown>;
  for (const name of BROWSER_GLOBALS) delete scope[name];

  let core: typeof import("./core");
  try {
    core = await import("./core");
  } catch (error) {
    return { stage: "import", error: describeError(error) };
  }

  try {
    const { decodeAndValidateWorldArchive } = await import("../runtime/worldArchive");
    const bytes = readFileSync(resolve(__dirname, "../../tests/fixtures/sim-golden.fmg"));
    const validated = await decodeAndValidateWorldArchive({
      blob: new Blob([bytes]),
      header: new Uint8Array(bytes.buffer, bytes.byteOffset, 4)
    });
    const commit = await core.worldRuntime.dispatch({ type: "world.replace", payload: validated });
    if (!commit) throw new Error("world.replace produced no commit");
  } catch (error) {
    return { stage: "load", error: describeError(error) };
  }

  try {
    const ticksBefore = core.simulationContext.tickCount;
    const result = core.runDaily(30, { notify: true });
    if (result.daysCompleted !== 30) throw new Error(`completed ${result.daysCompleted}/30 days`);
    if (core.simulationContext.tickCount - ticksBefore !== 30) throw new Error("the clock did not advance 30 ticks");
  } catch (error) {
    return { stage: "advance", error: describeError(error) };
  }
  return { stage: "passed" };
}

describe("simulation core without DOM", () => {
  it("imports the core, loads the fixture and advances 30 days (core systems only)", async () => {
    const result = await runStages();
    if (result.error) process.stderr.write(`[node smoke] fails at ${result.stage}: ${result.error}\n`);
    expect(result.stage).toBe("passed");
  });
});
