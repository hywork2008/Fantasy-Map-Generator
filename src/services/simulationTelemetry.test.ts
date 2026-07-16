import { afterEach, describe, expect, it } from "vitest";
import { setSimulationTelemetry, telemetry } from "./simulationTelemetry";

afterEach(() => {
  setSimulationTelemetry(null);
});

describe("simulationTelemetry", () => {
  it("returns null when nothing has been registered", () => {
    expect(telemetry()).toBeNull();
  });

  it("returns the last-registered telemetry object", () => {
    const t = { onDeath: () => {} };
    setSimulationTelemetry(t);
    expect(telemetry()).toBe(t);
  });

  it("returns null again after being cleared", () => {
    setSimulationTelemetry({ onDeath: () => {} });
    setSimulationTelemetry(null);
    expect(telemetry()).toBeNull();
  });
});
