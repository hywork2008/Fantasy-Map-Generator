import { afterEach, describe, expect, it } from "vitest";
import {
  clearBirthFloorProvider,
  getBirthFloorProvider,
  registerBirthFloorProvider,
  unregisterBirthFloorProvider
} from "./birthModifiers";

describe("birthModifiers registry", () => {
  afterEach(() => clearBirthFloorProvider());

  it("registers and clears a provider", () => {
    const provider = () => 1.5;
    registerBirthFloorProvider(provider);
    expect(getBirthFloorProvider()).toBe(provider);
    clearBirthFloorProvider();
    expect(getBirthFloorProvider()).toBeNull();
  });

  it("unregister only clears when the same provider is passed", () => {
    const a = () => 1;
    const b = () => 2;
    registerBirthFloorProvider(a);
    unregisterBirthFloorProvider(b);
    expect(getBirthFloorProvider()).toBe(a);
    unregisterBirthFloorProvider(a);
    expect(getBirthFloorProvider()).toBeNull();
  });
});
