// Phase 4 entry switch wrapper.
// Keep this file side-effect-only so rollback is a single HTML script tag change.
const waitForLegacyGlobal = async (name: string, check: () => boolean) => {
  const timeoutMs = 10_000;
  const startedAt = performance.now();

  while (!check()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error(`Legacy global "${name}" is not ready after ${timeoutMs}ms`);
    }

    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
  }
};

await waitForLegacyGlobal("aleaPRNG", () => {
  const globals = window as unknown as Record<string, unknown>;
  return typeof globals.aleaPRNG === "function" || typeof aleaPRNG === "function";
});

const globals = window as unknown as Record<string, unknown>;
if (typeof globals.aleaPRNG !== "function" && typeof aleaPRNG === "function") {
  globals.aleaPRNG = aleaPRNG;
}

// Load core providers first so window.fmg APIs are available
// before legacy runtime modules that call requireFmgApi at import time.
await import("./modules/core-api-bootstrap");

await import("@legacy-ui-runtime/main");
