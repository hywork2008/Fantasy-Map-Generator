import { describe, expect, it } from "vitest";
import { normalizeShipType, renderShipSvg, SHIP_SPECS } from "./shipSvg";

describe("shipSvg", () => {
  it("normalizes ship types correctly", () => {
    expect(normalizeShipType("small")).toBe("small");
    expect(normalizeShipType("sloop")).toBe("small");
    expect(normalizeShipType("medium")).toBe("medium");
    expect(normalizeShipType("caravel")).toBe("medium");
    expect(normalizeShipType("large")).toBe("large");
    expect(normalizeShipType("galleon")).toBe("large");
    expect(normalizeShipType("barge")).toBe("barge");
    expect(normalizeShipType("river-barge")).toBe("barge");
    expect(normalizeShipType("川荷船")).toBe("barge");
    expect(normalizeShipType(undefined)).toBe("small");
  });

  it("renders a small ship (sloop) with correct attributes and transform", () => {
    const node = renderShipSvg({
      type: "small",
      point: [100, 200],
      sizeMeters: 16,
      rotation: 0
    });
    expect(node.getAttribute("class")).toContain("ce-ship--small");
    expect(node.getAttribute("transform")).toBe("translate(100 -200) rotate(0) scale(1.0000 1.0000)");
    expect(node.querySelector(".ce-ship-hull-outer")).not.toBeNull();
    expect(node.querySelector(".ce-ship-mast")).not.toBeNull();
    expect(node.querySelector(".ce-ship-shadow")).not.toBeNull();
  });

  it("scales ship when sizeMeters is changed by a few meters", () => {
    // Sloop base is 16m. When sizeMeters = 20m, scale factor should be 20/16 = 1.25
    const node = renderShipSvg({
      type: "small",
      point: [0, 0],
      sizeMeters: 20
    });
    expect(node.getAttribute("transform")).toBe("translate(0 0) rotate(0) scale(1.2500 1.2500)");

    // When sizeMeters = 12m, scale factor should be 12/16 = 0.75
    const smallerNode = renderShipSvg({
      type: "small",
      point: [0, 0],
      sizeMeters: 12
    });
    expect(smallerNode.getAttribute("transform")).toBe("translate(0 0) rotate(0) scale(0.7500 0.7500)");
  });

  it("renders medium ship (caravel) with 3 masts, tender boat, and grating", () => {
    const node = renderShipSvg({
      type: "medium",
      point: [50, -50],
      sizeMeters: 25,
      rotation: Math.PI / 2
    });
    expect(node.getAttribute("class")).toContain("ce-ship--medium");
    expect(node.getAttribute("transform")).toBe("translate(50 50) rotate(-90) scale(1.0000 1.0000)");
    expect(node.querySelectorAll(".ce-ship-mast").length).toBe(3);
    expect(node.querySelector(".ce-ship-boat")).not.toBeNull();
  });

  it("renders large ship (galleon) with multi-deck, 4 masts, and stern lanterns", () => {
    const node = renderShipSvg({
      type: "large",
      point: [30, 40],
      sizeMeters: 45 // 45m instead of base 42m
    });
    expect(node.getAttribute("class")).toContain("ce-ship--large");
    const scale = (45 / SHIP_SPECS.large.baseLengthMeters).toFixed(4);
    expect(node.getAttribute("transform")).toBe(`translate(30 -40) rotate(0) scale(${scale} ${scale})`);
    expect(node.querySelectorAll(".ce-ship-mast").length).toBe(4);
    expect(node.querySelectorAll(".ce-ship-lantern").length).toBe(3);
    expect(node.querySelector(".ce-ship-boat")).not.toBeNull();
  });

  it("supports independent width scaling if specified", () => {
    const node = renderShipSvg({
      type: "small",
      point: [0, 0],
      sizeMeters: 16,
      widthMeters: 6 // base is 5m -> scaleX = 1.2
    });
    expect(node.getAttribute("transform")).toBe("translate(0 0) rotate(0) scale(1.2000 1.0000)");
  });

  it("renders a river cargo barge with flat hull, cargo tarpaulin, cabin, and giant sweep oar", () => {
    const node = renderShipSvg({
      type: "barge",
      point: [120, -80],
      sizeMeters: 18,
      rotation: Math.PI / 4
    });
    expect(node.getAttribute("class")).toContain("ce-ship--barge");
    expect(node.getAttribute("transform")).toContain("translate(120 80)");
    expect(node.querySelector(".ce-ship-hull-outer")).not.toBeNull();
    expect(node.querySelector(".ce-ship-deck")).not.toBeNull();
    expect(node.querySelector(".ce-ship-tarpaulin")).not.toBeNull();
    expect(node.querySelector(".ce-ship-lashing")).not.toBeNull();
    expect(node.querySelector(".ce-ship-cabin")).not.toBeNull();
    expect(node.querySelector(".ce-ship-cabin-roof")).not.toBeNull();
    expect(node.querySelector(".ce-ship-tiller")).not.toBeNull();
    expect(node.querySelector(".ce-ship-sweep-blade")).not.toBeNull();
    expect(node.querySelector(".ce-ship-gangplank")).not.toBeNull();
    expect(node.querySelectorAll(".ce-ship-cargo").length).toBeGreaterThan(0);
    expect(node.querySelectorAll(".ce-ship-pole").length).toBe(2);
  });
});
