import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import type { Point } from "../../city-editor/types/document";
import * as trees from "../landscape/trees";
import { models } from "../medieval/33-friariesModels";
import { type ModelPartRange, modelParts } from "../modelParts";
import { FRIARY_VARIANTS, MONASTERY_VARIANTS } from "../siteVariants";
import { createFriary, friaryPreviewPlan, monasteryPartFactories, monasteryPreviewPlan } from "./friary";

it("registers a real High edition with a bounded assembly and independent Low site props", () => {
  const definition = models[0],
    high = definition.variants!.find(variant => variant.level === "high")!;
  const spy = vi.spyOn(trees, "createLandscapeTree");
  const model = high.create();
  try {
    expect(high.author).toBe("Codex GPT-6.1 Sol");
    const metrics = collectModelMetrics(model.group);
    expect(metrics.triangles).toBeGreaterThan(10000);
    expect(metrics.triangles).toBeLessThan(75000);
    expect(metrics.meshes).toBeLessThanOrEqual(20);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(spy).toHaveBeenCalledTimes(friaryPreviewPlan().trees.length);
    expect(spy.mock.calls.every(call => call[1] === "low")).toBe(true);
    const parts = modelParts(model.group);
    expect(
      parts
        .filter(part =>
          ["church", "apse", "range", "gatehouse", "crossing-tower", "cloister", "precinct-wall"].includes(part.role)
        )
        .every(part => part.quality === "high")
    ).toBe(true);
    expect(parts.filter(part => ["vegetation", "well"].includes(part.role)).every(part => part.quality === "low")).toBe(
      true
    );
    expect(parts.reduce((sum, part) => sum + part.triangles, 0)).toBe(metrics.triangles);
    const counts = new Map<string, number>();
    for (const mesh of model.pickables) {
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
    }
    for (const part of parts) expect(counts.get(part.id)).toBe(part.triangles);
  } finally {
    model.dispose();
    spy.mockRestore();
  }
});

it("keeps registered default and Low factories Low even if callers pass a different architecture option", () => {
  for (const variant of FRIARY_VARIANTS) {
    const model = variant.create(undefined, 0, 0, { architectureQuality: variant.level === "high" ? "low" : "high" });
    try {
      const triangles = collectModelMetrics(model.group).triangles;
      if (variant.level === "high") expect(triangles).toBeGreaterThan(10000);
      else expect(triangles).toBeLessThan(6000);
    } finally {
      model.dispose();
    }
  }
});

it("details the abbey programme with its own hollow stone crossing tower and fixed registered tiers", () => {
  const plan = monasteryPreviewPlan("abbey");
  const saved = JSON.stringify(plan);
  const factories = monasteryPartFactories(plan, 3, -1, { architectureQuality: "high" });
  const tower = factories.find(part => part.role === "crossing-tower")!.create();
  try {
    expect(tower.pickables.some(mesh => mesh.name === "abbey-belfry-louver")).toBe(true);
    expect(tower.pickables.some(mesh => mesh.name.includes("bellcote"))).toBe(false);
    tower.group.updateMatrixWorld(true);
    const building = plan.buildings.find(part => part.role === "crossing-tower")!;
    const center = building.polygon.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const ray = new THREE.Raycaster(new THREE.Vector3(center[0], 4, -center[1]), new THREE.Vector3(0, 1, 0), 0, 9);
    expect(ray.intersectObjects(tower.pickables)).toHaveLength(0);
  } finally {
    tower.dispose();
  }
  for (const variant of MONASTERY_VARIANTS.filter(variant => variant.family === "monastery.abbey")) {
    const model = variant.create(plan, 3, -1, { architectureQuality: variant.level === "high" ? "low" : "high" });
    try {
      const metrics = collectModelMetrics(model.group);
      if (variant.level === "high") {
        expect(metrics.triangles).toBeGreaterThan(10000);
        expect(metrics.triangles).toBeLessThan(100000);
        expect(metrics.meshes).toBeLessThanOrEqual(20);
      } else expect(metrics.triangles).toBeLessThan(10000);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.min.y).toBeCloseTo(-1);
      expect(bounds.max.y).toBeLessThan(25);
      for (const mesh of model.pickables)
        expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      expect(
        modelParts(model.group)
          .filter(part => ["vegetation", "well"].includes(part.role))
          .every(part => part.quality === "low")
      ).toBe(true);
    } finally {
      model.dispose();
    }
  }
  expect(JSON.stringify(plan)).toBe(saved);
});

it("keeps the church entrance, nave-to-choir connection and recessed windows physically open", () => {
  const factory = monasteryPartFactories(undefined, 0, 0, { architectureQuality: "high" }).find(part =>
    part.id.endsWith("building:0")
  )!;
  const model = factory.create();
  try {
    model.group.updateMatrixWorld(true);
    const entry = new THREE.Raycaster(new THREE.Vector3(25.2, 1.4, 23.6), new THREE.Vector3(-1, 0, 0), 0, 1.3);
    expect(entry.intersectObjects(model.pickables)).toHaveLength(0);
    const glass = model.pickables.find(mesh => mesh.name === "recessed-lancet-glazing")!;
    const center = new THREE.Box3().setFromObject(glass).getCenter(new THREE.Vector3());
    const window = new THREE.Raycaster(
      new THREE.Vector3(center.x + 0.18, center.y, center.z + 0.52),
      new THREE.Vector3(0, 0, -1),
      0,
      0.4
    );
    expect(window.intersectObjects(model.pickables)).toHaveLength(0);
    window.ray.origin.x += 1.2;
    expect(window.intersectObjects(model.pickables).length).toBeGreaterThan(0);
    const connected = new THREE.Raycaster(new THREE.Vector3(-7.4, 1.4, 23.6), new THREE.Vector3(-1, 0, 0), 0, 1.3);
    expect(connected.intersectObjects(model.pickables)).toHaveLength(0);
  } finally {
    model.dispose();
  }
});

it("leaves the High cloister garth open and models an open arcade below a solid arch crown", () => {
  const plan = friaryPreviewPlan(),
    walk = plan.walk!;
  const part = monasteryPartFactories(plan, 0, 0, { architectureQuality: "high" }).find(
    part => part.role === "cloister"
  )!;
  const model = part.create();
  try {
    model.group.updateMatrixWorld(true);
    const center = walk.garth.reduce<Point>((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const top = new THREE.Raycaster(new THREE.Vector3(center[0], 15, -center[1]), new THREE.Vector3(0, -1, 0));
    expect(top.intersectObjects(model.pickables)).toHaveLength(0);
    const a = walk.garth[0],
      b = walk.garth[1],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = 0.5 / Math.ceil(length / 2.8),
      x = a[0] + (b[0] - a[0]) * t,
      z = -a[1];
    const through = new THREE.Raycaster(new THREE.Vector3(x, 1.4, z - 0.6), new THREE.Vector3(0, 0, 1), 0, 1.2);
    expect(through.intersectObjects(model.pickables)).toHaveLength(0);
    through.ray.origin.y = 2.7;
    expect(through.intersectObjects(model.pickables).length).toBeGreaterThan(0);
  } finally {
    model.dispose();
  }
});

it("preserves gate access, fitted rotation and elevation without mutating the saved plan", () => {
  const source = friaryPreviewPlan(),
    angle = 0.43,
    scale = 0.7;
  const point = ([x, y]: Point): Point => [
    80 + scale * (x * Math.cos(angle) - y * Math.sin(angle)),
    -40 + scale * (x * Math.sin(angle) + y * Math.cos(angle))
  ];
  const plan = {
    ...source,
    precinct: source.precinct.map(point),
    wall: source.wall.map(point),
    gate: point(source.gate),
    buildings: source.buildings.map(building => ({
      ...building,
      polygon: building.polygon.map(point),
      ridge: building.ridge?.map(point) as [Point, Point] | undefined
    })),
    courts: source.courts.map(court => ({ ...court, polygon: court.polygon.map(point) })),
    beds: source.beds.map(bed => bed.map(point)),
    walk: { outer: source.walk!.outer.map(point), garth: source.walk!.garth.map(point) },
    trees: [],
    well: undefined
  };
  const saved = JSON.stringify(plan),
    model = createFriary(plan, 3, -1, { architectureQuality: "high" });
  try {
    model.group.updateMatrixWorld(true);
    const gate = plan.buildings.find(building => building.role === "gatehouse")!;
    const center = gate.polygon.reduce<Point>((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const a = gate.polygon[0],
      b = gate.polygon[1];
    const normal = new THREE.Vector3(-(b[1] - a[1]), 0, -(b[0] - a[0])).normalize();
    const ray = new THREE.Raycaster(
      new THREE.Vector3(center[0], 4.4, -center[1]).addScaledVector(normal, 3),
      normal.clone().negate(),
      0,
      6
    );
    expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.y).toBeCloseTo(-1);
    expect(bounds.max.y).toBeLessThan(14);
    expect(JSON.stringify(plan)).toBe(saved);
  } finally {
    model.dispose();
  }
});

it("owns the High buffers independently and disposes each final resource once", () => {
  const first = createFriary(undefined, 0, 0, { architectureQuality: "high" }),
    second = createFriary(undefined, 0, 0, { architectureQuality: "high" });
  const resources = new Set(first.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  const other = vi.spyOn(second.pickables[0].geometry, "dispose");
  first.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  second.dispose();
});

it("does not duplicate domestic floors or retain a lower roof where two fitted ranges overlap", () => {
  const factories = monasteryPartFactories(undefined, 0, 0, { architectureQuality: "high" }).filter(
    part => part.role === "range"
  );
  const models = factories.map(factory => factory.create());
  try {
    let floorsAtCorner = 0;
    for (const model of models) {
      model.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(21.35, 1, -4.25), new THREE.Vector3(0, -1, 0));
      if (ray.intersectObjects(model.pickables.filter(mesh => mesh.name === "friary-floor")).length) floorsAtCorner++;
    }
    expect(floorsAtCorner).toBe(1);
    const roofHeights: number[] = [];
    for (const model of models) {
      const ray = new THREE.Raycaster(new THREE.Vector3(20.5, 20, -3.5), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(model.pickables.filter(mesh => mesh.name === "friary-detailed-roof"));
      if (hits.length) roofHeights.push(hits[0].point.y);
    }
    expect(roofHeights).toHaveLength(1);
    expect(roofHeights[0]).toBeCloseTo(5.4 + 2.5 * Math.tan((32 * Math.PI) / 180), 4);
  } finally {
    for (const model of models) model.dispose();
  }
});
