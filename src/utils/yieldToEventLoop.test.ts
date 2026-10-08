import { describe, expect, it } from "vitest";
import { yieldToEventLoop } from "./yieldToEventLoop";

describe("yieldToEventLoop", () => {
  it("lets a pending timer run during a long series of yields", async () => {
    let timerRan = false;
    setTimeout(() => {
      timerRan = true;
    }, 0);
    const started = performance.now();
    while (!timerRan && performance.now() - started < 500) await yieldToEventLoop();
    expect(timerRan).toBe(true);
  });
});
