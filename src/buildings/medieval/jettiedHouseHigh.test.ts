import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { medievalDefinition } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./45-jettied-housesModels";
import {
  type JettiedHouseKind,
  jettiedHousePartFactories,
  jettiedStairHole,
  jettiedStorey,
  jettiedStoreys
} from "./jettiedHouseParts";

it("preserves all three Low shapes and CE default identities while registering explicit High", () => {
  const hashes = [
    "5a98e9e9ea0ddd5caecf9ce0d0192f17014996590d1d6267e1454038ebf1d88d",
    "0996bfa41082f19c206dc8d324ff154a82f7c4d3d715f8bbcdd243e7d90582ea",
    "69313ad48434fc3605667eb2e5e1c0b62c46a2f4298873d8f69d8fb754f8e127"
  ];
  for (const [i, d] of models.entries()) {
    expect(d.variants!.map(v => v.level)).toEqual(["low", "high"]);
    expect(medievalDefinition(d).variant).toBe(`medieval.${d.id}@default#codex-gpt-6.1-sol`);
    const low = d.variants![0].create();
    try {
      expect(landmarkFingerprint(low.group)).toBe(hashes[i]);
    } finally {
      low.dispose();
    }
  }
});

it.each(models)("$id supports the jetty brackets and wall braces on actual frame members", d => {
  const kind = d.id as JettiedHouseKind,
    parts = jettiedHousePartFactories(kind);
  for (let f = 1; f < jettiedStoreys(kind); f++) {
    const lower = parts.find(p => p.role === `storey-${f - 1}`)!.create(),
      supports = parts.find(p => p.role === `jetty-${f}`)!.create();
    try {
      lower.group.updateMatrixWorld(true);
      supports.group.updateMatrixWorld(true);
      const posts = lower.pickables
        .filter(m => m.name === "oak-wall-stud")
        .map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.01));
      const beams = supports.pickables
        .filter(m => m.name.includes("bressummer"))
        .map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.01));
      for (const bracket of supports.pickables.filter(m => m.name.endsWith("jetty-bracket"))) {
        expect(
          posts.some(b => b.containsPoint(new THREE.Vector3(0, -0.5, 0).applyMatrix4(bracket.matrixWorld))),
          bracket.name
        ).toBe(true);
        expect(
          beams.some(b => b.containsPoint(new THREE.Vector3(0, 0.5, 0).applyMatrix4(bracket.matrixWorld))),
          bracket.name
        ).toBe(true);
      }
      for (const brace of lower.pickables.filter(m => m.name === "storey-diagonal-brace"))
        for (const end of [-0.5, 0.5])
          expect(posts.some(b => b.containsPoint(new THREE.Vector3(0, end, 0).applyMatrix4(brace.matrixWorld)))).toBe(
            true
          );
    } finally {
      lower.dispose();
      supports.dispose();
    }
  }
});

it.each(models)("$id keeps its stairwell clear of decks and jetty beams and joins level landings", d => {
  const kind = d.id as JettiedHouseKind,
    parts = jettiedHousePartFactories(kind),
    stairs = parts.find(p => p.role === "stairs")!.create();
  try {
    stairs.group.updateMatrixWorld(true);
    for (let f = 1; f < jettiedStoreys(kind); f++) {
      const floor = parts.find(p => p.role === `storey-${f}`)!.create(),
        structure = parts.find(p => p.role === `jetty-${f}`)!.create(),
        s = jettiedStorey(kind, f),
        hole = jettiedStairHole(f);
      try {
        floor.group.updateMatrixWorld(true);
        structure.group.updateMatrixWorld(true);
        for (const z of [-0.7, 0.2, 1.3]) {
          const origin = new THREE.Vector3(hole.x, s.base + 0.1, z),
            ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.5);
          expect(ray.intersectObjects(floor.pickables)).toHaveLength(0);
          expect(ray.intersectObjects(structure.pickables)).toHaveLength(0);
        }
        const landing = stairs.pickables.filter(
          m => m.name.includes("shared-exterior-stair") || m.name === "upper-stair-landing"
        );
        const hit = new THREE.Raycaster(
          new THREE.Vector3(hole.x, s.base + 0.1, -1.9),
          new THREE.Vector3(0, -1, 0),
          0,
          0.2
        ).intersectObjects(landing.length ? landing : stairs.pickables)[0];
        expect(hit?.point.y).toBeCloseTo(s.base);
      } finally {
        floor.dispose();
        structure.dispose();
      }
    }
  } finally {
    stairs.dispose();
  }
});

it.each(models)("$id has real entry and glazing apertures and an open chimney penetration", d => {
  const kind = d.id as JettiedHouseKind,
    parts = jettiedHousePartFactories(kind),
    ground = parts.find(p => p.role === "storey-0")!.create(),
    roof = parts.find(p => p.role === "roof")!.create(),
    chimney = parts.find(p => p.role === "chimney")!.create();
  try {
    for (const m of [ground, roof, chimney]) m.group.updateMatrixWorld(true);
    expect(
      new THREE.Raycaster(new THREE.Vector3(1.55, 1.4, 4), new THREE.Vector3(0, 0, -1), 0, 1.5).intersectObjects(
        ground.pickables
      )
    ).toHaveLength(0);
    const shell = ground.pickables.filter(m => m.name === "jettied-infill-with-openings");
    const x = kind === "jettied-town-house" ? -1.1 : -1;
    expect(
      new THREE.Raycaster(new THREE.Vector3(x, 1.8, 4), new THREE.Vector3(0, 0, -1), 0, 1.5).intersectObjects(shell)
    ).toHaveLength(0);
    const top = jettiedStorey(kind, jettiedStoreys(kind) - 1).base + 2.65;
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, top + 3, -2.3), new THREE.Vector3(0, -1, 0), 0, 4).intersectObjects(
        roof.pickables
      )
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, top + 1.9, -2.3), new THREE.Vector3(0, -1, 0), 0, 0.65).intersectObjects(
        chimney.pickables
      )
    ).toHaveLength(0);
  } finally {
    ground.dispose();
    roof.dispose();
    chimney.dispose();
  }
});

it("keeps compact bounded finite geometry, full part ranges and independently disposable resources", () => {
  for (const d of models) {
    const high = d.variants![1],
      first = high.create(),
      second = high.create(),
      parts = d.parts!(high.id);
    try {
      const size = new THREE.Box3().setFromObject(first.group).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(d.size[0]);
      expect(size.z).toBeLessThan(d.size[1]);
      expect(size.y).toBeLessThan(d.size[2]);
      expect(collectModelMetrics(first.group).triangles).toBeLessThan(30000);
      expect(collectModelMetrics(first.group).meshes).toBeLessThanOrEqual(10);
      const counts = new Map<string, number>();
      for (const mesh of first.pickables) {
        for (const name of ["position", "normal"])
          expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        let offset = 0;
        for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
          expect(range.start).toBe(offset);
          offset += range.count;
          counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
        }
        expect(offset).toBe(mesh.geometry.getAttribute("position").count);
        expect(second.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
      }
      const ledger = modelParts(first.group);
      expect(ledger).toHaveLength(parts.length);
      for (const p of ledger) expect(counts.get(p.id)).toBe(p.triangles);
      const spies = parts.map(p => vi.spyOn(p, "create")),
        solo = d.assembleParts!([parts[2]]);
      try {
        for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 2 ? 1 : 0);
      } finally {
        solo.dispose();
      }
      const owned = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
        disposal = [...owned].map(r => vi.spyOn(r, "dispose"));
      first.dispose();
      for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      second.dispose();
    }
  }
});
