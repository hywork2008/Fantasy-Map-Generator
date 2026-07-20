import { describe, expect, it } from "vitest";
import { createTransactionWriter } from "./transactionWriter";

describe("TransactionWriter", () => {
  it("records only declared topics in mark order", () => {
    const writer = createTransactionWriter(["simulation.clock", "simulation.states", "map.politics"]);
    writer.markChanged("simulation.states");
    writer.markChanged("simulation.clock", "simulation.states");
    expect(writer.changedTopics).toEqual(["simulation.states", "simulation.clock"]);
  });

  it("rejects undeclared topics before any host commit can observe them", () => {
    const writer = createTransactionWriter(["simulation.clock"]);
    expect(() => writer.markChanged("map.politics")).toThrow("not in the system's declared writes");
    expect(writer.changedTopics).toEqual([]);
  });
});
