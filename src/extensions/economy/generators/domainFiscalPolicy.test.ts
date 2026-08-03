import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  applyDomainPolicyToBurg,
  cycleDomainFiscalPolicy,
  DOMAIN_EXTRACT_PERSONAL_RATE,
  DOMAIN_EXTRACT_REMIT_RATE,
  DOMAIN_FORTIFY_SPEND_RATE
} from "./domainFiscalPolicy";

describe("domainFiscalPolicy (PR-7)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
  });

  it("cycles balanced → extract → fortify → balanced", () => {
    expect(cycleDomainFiscalPolicy(undefined)).toBe("extract");
    expect(cycleDomainFiscalPolicy("balanced")).toBe("extract");
    expect(cycleDomainFiscalPolicy("extract")).toBe("fortify");
    expect(cycleDomainFiscalPolicy("fortify")).toBe("balanced");
  });

  it("extract remits to state L2 and skims personal for the lord", () => {
    const burg = { i: 5, treasury: 100, domainFiscalPolicy: "extract" } as unknown as Burg;
    const state = { i: 1, treasury: 10 } as unknown as State;
    const lord = { wealth: 1 } as Character;

    const result = applyDomainPolicyToBurg(burg, state, lord);

    expect(result.remittedToState).toBe(100 * DOMAIN_EXTRACT_REMIT_RATE);
    expect(result.toLordPersonal).toBe(100 * DOMAIN_EXTRACT_PERSONAL_RATE);
    expect(burg.treasury).toBe(100 - result.remittedToState - result.toLordPersonal);
    expect(state.treasury).toBe(10 + result.remittedToState);
    expect(lord.wealth).toBe(1 + result.toLordPersonal);
  });

  it("fortify spends domain cash, raises security, and advances works progress", () => {
    const burg = {
      i: 5,
      treasury: 100,
      security: 50,
      domainFiscalPolicy: "fortify",
      domainWorksProgress: 0
    } as unknown as Burg;

    const result = applyDomainPolicyToBurg(burg, undefined, undefined);

    expect(result.fortifySpent).toBe(100 * DOMAIN_FORTIFY_SPEND_RATE);
    expect(burg.treasury).toBe(100 - result.fortifySpent);
    expect(result.securityGain).toBe(1);
    expect(burg.security).toBe(51);
    expect(result.worksProgressGain).toBeGreaterThan(0);
    expect(burg.domainWorksProgress).toBeGreaterThan(0);
  });

  it("completes domain works and sets walls/citadel at 100 progress", () => {
    const burg = {
      i: 5,
      treasury: 100,
      security: 50,
      domainFiscalPolicy: "fortify",
      domainWorksProgress: 95,
      walls: 0,
      citadel: 0
    } as unknown as Burg;

    const result = applyDomainPolicyToBurg(burg, undefined, undefined);
    expect(result.worksCompleted).toBe(true);
    expect(burg.walls).toBe(1);
    expect(burg.citadel).toBe(1);
    expect(burg.domainWorksProgress).toBe(0);
  });

  it("scales extract by domain levy rate", () => {
    const burg = {
      i: 5,
      treasury: 100,
      domainFiscalPolicy: "extract",
      domainLevyRate: 1.5
    } as unknown as Burg;
    const state = { i: 1, treasury: 0 } as unknown as State;
    const result = applyDomainPolicyToBurg(burg, state, { wealth: 0 });
    expect(result.remittedToState).toBe(100 * DOMAIN_EXTRACT_REMIT_RATE * 1.5);
  });

  it("balanced is a no-op", () => {
    const burg = { i: 5, treasury: 100, domainFiscalPolicy: "balanced" } as unknown as Burg;
    const result = applyDomainPolicyToBurg(burg, { i: 1, treasury: 0 } as State, { wealth: 0 });
    expect(result.remittedToState).toBe(0);
    expect(burg.treasury).toBe(100);
  });
});
