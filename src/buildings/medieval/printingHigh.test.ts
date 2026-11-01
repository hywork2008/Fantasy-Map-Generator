import * as THREE from "three";
import { expect, it } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { medievalDefinition } from "../../city3d/adoption";
import { modelParts } from "../modelParts";
import { models } from "./38-printing-modelsModels";
import { guildHallPartFactories } from "./guildHallParts";
import { createHighPrintingPress } from "./printingEquipment";
import { printingWorkshopPartFactories } from "./printingParts";

it("retains original Low geometry and CE defaults while registering explicit High variants", () => {
  const hashes = [
    "19c06e537f4de22dea6241a326b48c7f7e004f9491d71b3edbbffa59a39fc8b3",
    "46c88b41c2ff4693562b93272f64c83ce34a4864bca87d0c785d430304de5cdb"
  ];
  models.forEach((definition, i) => {
    expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
    expect(medievalDefinition(definition).variant).toBe(`medieval.${definition.id}@default#codex-gpt-6.1-sol`);
    const low = definition.variants![0].create();
    try {
      expect(landmarkFingerprint(low.group)).toBe(hashes[i]);
    } finally {
      low.dispose();
    }
  });
});

it("reuses the guild hall body and east stair without geometry changes", () => {
  for (const role of ["architecture", "exterior-stair"]) {
    const a = guildHallPartFactories("printing")
      .find(p => p.role === role)!
      .create();
    const b = guildHallPartFactories("woodworking")
      .find(p => p.role === role)!
      .create();
    try {
      expect(landmarkFingerprint(a.group)).toBe(landmarkFingerprint(b.group));
    } finally {
      a.dispose();
      b.dispose();
    }
  }
});

it("fits one identical printing press in both independently selectable assemblies", () => {
  const prototype = createHighPrintingPress();
  try {
    for (const [parts, x, z] of [
      [printingWorkshopPartFactories(), -1.6, -0.4],
      [guildHallPartFactories("printing"), -3, -0.35]
    ] as const) {
      const press = parts.find(p => p.role === "printing-press")!.create();
      try {
        press.group.position.set(-x, 0, -z);
        expect(landmarkFingerprint(press.group)).toBe(landmarkFingerprint(prototype.group));
      } finally {
        press.dispose();
      }
    }
  } finally {
    prototype.dispose();
  }
});

it("supports the screw, platen, type bed and proof and clears the shared shed tie beams", () => {
  const model = createHighPrintingPress();
  const bounds = (name: string) => new THREE.Box3().setFromObject(model.pickables.find(m => m.name === name)!);
  try {
    const screw = bounds("wooden-press-screw"),
      block = bounds("platen-swivel-block"),
      platen = bounds("press-platen");
    expect(screw.min.y).toBeLessThan(block.max.y);
    expect(block.min.y).toBeLessThan(platen.max.y);
    expect(new THREE.Box3().setFromObject(model.group).max.y).toBeLessThan(2.985);
    const bed = bounds("sliding-type-bed"),
      rail = bounds("bed-bearing-rail"),
      proof = bounds("printed-proof"),
      forme = bounds("type-forme");
    expect(bed.min.y).toBeCloseTo(rail.max.y);
    expect(proof.min.y).toBeCloseTo(bed.max.y);
    expect(forme.min.y).toBeCloseTo(bed.max.y);
    expect(platen.min.y).toBeGreaterThan(forme.max.y);
    expect(new THREE.Box3().setFromObject(model.group).min.y).toBeCloseTo(0);
    expect(collectModelMetrics(model.group).triangles).toBeLessThan(8000);
  } finally {
    model.dispose();
  }
});

it("clips the drying sheets to a supported cord and seats stock on shelves", () => {
  const parts = printingWorkshopPartFactories();
  for (const role of ["drying-rack", "paper-storage"]) {
    const model = parts.find(p => p.role === role)!.create();
    try {
      const boxes = (name: string) =>
        model.pickables.filter(m => m.name === name).map(m => new THREE.Box3().setFromObject(m));
      if (role === "drying-rack") {
        const cord = boxes("drying-cord")[0];
        for (const clip of boxes("sheet-clip")) {
          expect(clip.intersectsBox(cord)).toBe(true);
          expect(boxes("drying-sheet").some(sheet => clip.intersectsBox(sheet))).toBe(true);
        }
        for (const post of boxes("drying-post")) expect(post.intersectsBox(cord)).toBe(true);
      } else {
        for (const shelf of boxes("paper-shelf"))
          expect(boxes("paper-quire").some(paper => Math.abs(paper.min.y - shelf.max.y) < 1e-5)).toBe(true);
      }
    } finally {
      model.dispose();
    }
  }
});

it("keeps compact High assemblies finite, bounded, independently owned and fully selectable", () => {
  for (const definition of models) {
    const variant = definition.variants![1],
      model = variant.create(),
      other = variant.create();
    try {
      const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(definition.size[0]);
      expect(size.z).toBeLessThanOrEqual(definition.size[1]);
      expect(size.y).toBeLessThanOrEqual(definition.size[2]);
      const metrics = collectModelMetrics(model.group);
      expect(metrics.triangles).toBeLessThan(50000);
      expect(metrics.meshes).toBeLessThanOrEqual(15);
      for (const mesh of model.pickables) {
        expect(other.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
        for (const name of ["position", "normal"])
          expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      }
      const parts = definition.parts!(variant.id);
      expect(parts).toHaveLength(definition.id === "early-printing-workshop" ? 5 : 4);
      expect(modelParts(model.group)).toHaveLength(parts.length);
      let triangles = 0;
      for (const part of parts) {
        expect(part.quality).toBe("high");
        const solo = definition.assembleParts!([part]);
        try {
          expect(modelParts(solo.group)).toHaveLength(1);
          triangles += collectModelMetrics(solo.group).triangles;
        } finally {
          solo.dispose();
        }
      }
      expect(triangles).toBe(metrics.triangles);
    } finally {
      model.dispose();
      other.dispose();
    }
  }
});
