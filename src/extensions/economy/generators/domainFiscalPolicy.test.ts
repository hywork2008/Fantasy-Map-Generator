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

  it("fortify spends domain cash and raises security", () => {
    const burg = {
      i: 5,
      treasury: 100,
      security: 50,
      domainFiscalPolicy: "fortify"
    } as unknown as Burg;

    const result = applyDomainPolicyToBurg(burg, undefined, undefined);

    expect(result.fortifySpent).toBe(100 * DOMAIN_FORTIFY_SPEND_RATE);
    expect(burg.treasury).toBe(100 - result.fortifySpent);
    expect(result.securityGain).toBe(1);
    expect(burg.security).toBe(51);
  });

  it("balanced is a no-op", () => {
    const burg = { i: 5, treasury: 100, domainFiscalPolicy: "balanced" } as unknown as Burg;
    const result = applyDomainPolicyToBurg(burg, { i: 1, treasury: 0 } as State, { wealth: 0 });
    expect(result.remittedToState).toBe(0);
    expect(burg.treasury).toBe(100);
  });
});
