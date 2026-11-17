import { describe, expect, it } from "vitest";
import {
  applyHillshade,
  buildCampaignMesh,
  CAMPAIGN_LINE_LIFT,
  CAMPAIGN_MARKER_LIFT,
  CAMPAIGN_MAX_SAMPLES_PER_SIDE,
  type CampaignBuildInput,
  type CampaignCellInput,
  campaignAxis,
  campaignContactCamera,
  campaignGridSpacingPx,
  campaignRegimentPlacements,
  campaignSampleCount,
  campaignSampleStepPx
} from "./campaignMesh";

function build(overrides: Partial<CampaignBuildInput> = {}) {
  const input: CampaignBuildInput = {
    centerX: 50,
    centerY: 40,
    focusCellId: 1,
    graphWidth: 100,
    graphHeight: 80,
    kmPerPx: 10,
    gridSpacingPx: 8,
    packSpacingPx: 8,
    footDays: 1,
    footKmPerDay: 10,
    heightAt: () => 7,
    waterColor: "#0000ff",
    stateColors: new Map([[1, "#ff0000"]]),
    cells: [],
    rivers: [],
    routes: [],
    regiments: [],
    burgs: [],
    ...overrides
  };
  return buildCampaignMesh(input);
}

function cell(partial: CampaignCellInput): CampaignCellInput {
  return partial;
}

describe("campaignMesh", () => {
  it("steps at a quarter of the height grid, and no finer than 2 km", () => {
    expect(campaignGridSpacingPx(960, 540, 130, 75)).toBeCloseTo(540 / 74, 5);
    expect(campaignSampleStepPx(7.2, 5.385)).toBeCloseTo(1.8, 5);
    expect(campaignSampleStepPx(7.2, 0.96)).toBeCloseTo(2 / 0.96, 5);

    const mesh = build({
      graphWidth: 960,
      graphHeight: 540,
      centerX: 480,
      centerY: 270,
      kmPerPx: 5.385,
      gridSpacingPx: 7.2,
      packSpacingPx: 7.2,
      footDays: 7,
      footKmPerDay: 28,
      heightAt: () => 0
    });
    expect(mesh.samplesX).toBeGreaterThan(30);
    expect(mesh.samplesX).toBeLessThan(50);
    expect(mesh.ground.vertexCount).toBe(mesh.samplesX * mesh.samplesY);
  });

  it("caps each side at 200 samples and keeps a single ground mesh", () => {
    expect(campaignSampleCount(100000, 1)).toBe(CAMPAIGN_MAX_SAMPLES_PER_SIDE);

    const mesh = build({
      graphWidth: 10000,
      graphHeight: 10000,
      centerX: 5000,
      centerY: 5000,
      kmPerPx: 10,
      gridSpacingPx: 4,
      packSpacingPx: 4,
      footDays: 1000,
      footKmPerDay: 28,
      heightAt: () => 0
    });

    expect(mesh.samplesX).toBe(CAMPAIGN_MAX_SAMPLES_PER_SIDE);
    expect(mesh.samplesY).toBe(CAMPAIGN_MAX_SAMPLES_PER_SIDE);
    expect(mesh.ground.vertexCount).toBe(CAMPAIGN_MAX_SAMPLES_PER_SIDE * CAMPAIGN_MAX_SAMPLES_PER_SIDE);
    expect(mesh.ground.positions.length).toBe(mesh.ground.vertexCount * 3);
    expect(mesh.ground.indices.length).toBe((mesh.samplesX - 1) * (mesh.samplesY - 1) * 6);
  });

  it("places a known height field in the overlay frame and faces the ground upward", () => {
    const mesh = build({ heightAt: (x, y) => x + y });
    const { positions, indices } = mesh.ground;

    expect(mesh.samplesX).toBe(2);
    expect(mesh.samplesY).toBe(2);
    expect(Array.from(indices)).toEqual([0, 2, 3, 0, 3, 1]);
    // Map (49, 39) → world (-1, height, -1). Map +y increases world +z.
    expect(positions[0]).toBeCloseTo(-1, 5);
    expect(positions[1]).toBeCloseTo(49 + 39, 5);
    expect(positions[2]).toBeCloseTo(-1, 5);
    expect(positions[3]).toBeCloseTo(1, 5);
    expect(positions[6]).toBeCloseTo(-1, 5);
    expect(positions[8]).toBeCloseTo(1, 5);
    expect(positions[9]).toBeCloseTo(1, 5);
    expect(positions[10]).toBeCloseTo(51 + 41, 5);
    expect(positions[11]).toBeCloseTo(1, 5);

    const acz = positions[8] - positions[2];
    const adx = positions[9] - positions[0];
    const acx = positions[6] - positions[0];
    const adz = positions[11] - positions[2];
    expect(acz * adx - acx * adz).toBeGreaterThan(0);

    expect(mesh.camera.target).toEqual([0, 50 + 40, 0]);
    expect(mesh.camera.position[0]).toBe(0);
    expect(mesh.camera.position[1]).toBeGreaterThan(mesh.camera.target[1]);
    expect(mesh.camera.position[2]).toBeGreaterThan(mesh.camera.target[2]);
    expect(mesh.camera.minDistance).toBeLessThan(mesh.camera.maxDistance);
  });

  it("frames the contact from the south and keeps the week window inside the orbit", () => {
    const frame = campaignContactCamera({
      focusX: 50,
      focusY: 40,
      graphWidth: 100,
      graphHeight: 80,
      height: 7,
      spacingPx: 8,
      spanPx: 40
    });

    expect(frame.target).toEqual([0, 7, 0]);
    expect(frame.position[2]).toBeGreaterThan(0);
    expect(frame.minDistance).toBeCloseTo(8 * 0.15, 5);
    expect(frame.maxDistance).toBeCloseTo(40 * 1.5, 5);
    const orbit = Math.hypot(frame.position[1] - 7, frame.position[2]);
    expect(orbit).toBeGreaterThan(frame.minDistance);
    expect(orbit).toBeLessThan(frame.maxDistance);
  });

  it("colours water from the water colour, owned land from the state, and the rest from the biome", () => {
    const left = cell({
      id: 1,
      x: 49,
      y: 40,
      height: 40,
      state: 1,
      ring: [
        [48, 38],
        [50, 38],
        [50, 42],
        [48, 42]
      ]
    });
    const right = cell({
      id: 2,
      x: 51,
      y: 40,
      height: 5,
      state: 1,
      biomeColor: "#00ff00",
      ring: [
        [50, 38],
        [52, 38],
        [52, 42],
        [50, 42]
      ]
    });
    const mesh = build({ cells: [left, right] });
    const colors = mesh.ground.colors;

    expect(colors[0]).toBeCloseTo(1, 5);
    expect(colors[1]).toBeCloseTo(0, 5);
    expect(colors[3]).toBeCloseTo(0, 5);
    expect(colors[5]).toBeCloseTo(1, 5);

    const unowned = build({
      cells: [{ ...left, state: 0, biomeColor: "#00ff00" }],
      stateColors: new Map()
    });
    expect(unowned.ground.colors[1]).toBeCloseTo(1, 5);
    expect(unowned.ground.colors[0]).toBeCloseTo(0, 5);
  });

  it("drops paths outside the window and keeps the part that crosses it", () => {
    const mesh = build({
      rivers: [
        {
          points: [
            [1, 1],
            [2, 2]
          ]
        },
        {
          points: [
            [50, 40],
            [50.5, 40.4]
          ]
        }
      ],
      routes: [
        {
          points: [
            [0, 0],
            [3, 1]
          ]
        },
        {
          points: [
            [0, 0],
            [100, 80]
          ]
        }
      ]
    });

    const river = mesh.polylines.find(line => line.kind === "river");
    const route = mesh.polylines.find(line => line.kind === "route");
    expect(river).toBeDefined();
    expect(route).toBeDefined();
    expect(river!.positions.length).toBe(6);
    for (const line of [river!, route!]) {
      for (let index = 0; index < line.positions.length; index += 3) {
        const mapX = line.positions[index] + 50;
        const mapY = line.positions[index + 2] + 40;
        expect(mapX).toBeGreaterThanOrEqual(49);
        expect(mapX).toBeLessThanOrEqual(51);
        expect(mapY).toBeGreaterThanOrEqual(39);
        expect(mapY).toBeLessThanOrEqual(41);
      }
    }
    const routeXs = [route!.positions[0], route!.positions[3]].map(x => x + 50);
    expect(Math.min(...routeXs)).toBeGreaterThan(0);
    expect(Math.max(...routeXs)).toBeLessThan(100);
  });

  it("draws the focus ring and skips a cell outside the window", () => {
    const mesh = build({
      focusCellId: 7,
      cells: [
        cell({
          id: 7,
          x: 50,
          y: 40,
          height: 30,
          state: 1,
          ring: [
            [48, 39.5],
            [52, 39.5],
            [52, 40.5],
            [48, 40.5]
          ]
        }),
        cell({
          id: 8,
          x: 10,
          y: 10,
          height: 30,
          state: 1,
          ring: [
            [9, 9],
            [11, 9],
            [11, 11],
            [9, 11]
          ]
        })
      ]
    });

    const focus = mesh.polylines.find(line => line.kind === "focus");
    const border = mesh.polylines.find(line => line.kind === "border");
    expect(focus).toBeDefined();
    expect(border).toBeUndefined();
    expect(focus!.positions[0]).toBeCloseTo(48 - 50, 5);
    expect(focus!.positions[2]).toBeCloseTo(39.5 - 40, 5);
    expect(focus!.color[0]).toBeGreaterThan(0.7);
  });

  it("puts a regiment on its continuous position and clips the march at the window", () => {
    const placed = campaignRegimentPlacements(
      [{ x: 50.2, y: 40.2, cell: 3, naval: false, path: [3], color: "#112233" }],
      () => [90, 70]
    );
    expect(placed[0].x).toBe(50.2);
    expect(placed[0].cellX).toBe(90);

    const mesh = build({ regiments: placed });
    const marker = mesh.markers.find(item => item.kind === "regiment");
    expect(marker).toBeDefined();
    expect(marker!.mapX).toBe(50.2);
    expect(marker!.mapY).toBe(40.2);
    expect(marker!.position[0]).toBeCloseTo(0.2, 5);
    expect(marker!.position[1]).toBeCloseTo(7 + CAMPAIGN_MARKER_LIFT, 5);
    expect(marker!.position[2]).toBeCloseTo(0.2, 5);

    const march = mesh.polylines.find(line => line.kind === "march");
    expect(march).toBeDefined();
    const mapXs = [];
    for (let index = 0; index < march!.positions.length; index += 3) mapXs.push(march!.positions[index] + 50);
    expect(Math.min(...mapXs)).toBeCloseTo(50.2, 4);
    expect(Math.max(...mapXs)).toBeLessThan(90);
    expect(mapXs.every(x => x >= 49 - 1e-4 && x <= 51 + 1e-4)).toBe(true);
  });

  it("marks a fleet and a named burg inside the window", () => {
    const mesh = build({
      regiments: [{ x: 50, y: 40, cellX: 80, cellY: 80, naval: true }],
      burgs: [
        { x: 50.4, y: 40.1, name: "Avon" },
        { x: 2, y: 2, name: "Far" }
      ]
    });

    expect(mesh.markers.map(marker => marker.kind).sort()).toEqual(["burg", "fleet"]);
    expect(mesh.markers.find(marker => marker.kind === "burg")?.name).toBe("Avon");
  });
});

describe("applyHillshade", () => {
  const grid = (heightAt: (col: number, row: number) => number) => {
    const positions = new Float32Array(9 * 3);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) positions.set([col, heightAt(col, row), row], (row * 3 + col) * 3);
    return { positions, colors: new Float32Array(27).fill(0.5) };
  };

  it("keeps flat ground and darkens a slope facing away from the north-west light", () => {
    const flat = grid(() => 0);
    applyHillshade(flat.positions, flat.colors, 3, 3);
    expect(flat.colors[12]).toBeCloseTo(0.5, 5);
    // Ground rising to the east faces west, toward the light.
    const towardLight = grid(col => col);
    const awayFromLight = grid(col => -col);
    applyHillshade(towardLight.positions, towardLight.colors, 3, 3);
    applyHillshade(awayFromLight.positions, awayFromLight.colors, 3, 3);
    expect(towardLight.colors[12]).toBeGreaterThan(0.5);
    expect(awayFromLight.colors[12]).toBeLessThan(0.5);
  });
});

describe("campaignAxis", () => {
  it("is fine inside a ring, coarse outside, and hits the ring edges exactly", () => {
    const axis = campaignAxis(0, 100, 50, 10, [{ halfPx: 10, stepPx: 1 }]);
    expect(axis[0]).toBe(0);
    expect(axis.at(-1)).toBe(100);
    expect(axis).toContain(40);
    expect(axis).toContain(60);
    const gaps = axis.slice(1).map((x, i) => x - axis[i]);
    expect(Math.max(...gaps.filter((_, i) => axis[i] >= 40 && axis[i] < 60))).toBeCloseTo(1, 9);
    expect(Math.max(...gaps)).toBeCloseTo(10, 9);
    expect(axis.length).toBe(4 + 20 + 4 + 1);
  });
});

describe("draped lines", () => {
  it("bends a river over a ridge and keeps it a scaled lift above the ground", () => {
    // A 10-unit ridge at x = 50; the river crosses it from x = 49 to 51.
    const heightAt = (x: number) => (Math.abs(x - 50) < 0.5 ? 10 : 0);
    const mesh = build({
      heightAt,
      liftScale: 0.1,
      drapeStepPx: 0.25,
      rivers: [
        {
          points: [
            [49, 40],
            [51, 40]
          ]
        }
      ]
    });
    const river = mesh.polylines.find(line => line.kind === "river")!;
    const ys = Array.from(river.positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10 + CAMPAIGN_LINE_LIFT * 0.1, 6);
    expect(Math.min(...ys)).toBeCloseTo(CAMPAIGN_LINE_LIFT * 0.1, 6);
    expect(river.positions.length / 6).toBe(8);
  });
});
