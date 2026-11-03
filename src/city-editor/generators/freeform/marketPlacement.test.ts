import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MARKET_FOOD_IDS } from "../../../buildings/medieval/marketFoodDetails";
import { rotationFromFacing } from "../../../buildings/placementContract";
import {
  placementCatalog,
  placementDefinition,
  placementFootprint,
  placementPalette
} from "../../../buildings/placementModels";
import { sceneVariants } from "../../../city3d/adoption";
import { createTownObjects } from "../../../city3d/three/objectMeshes";
import { renderObjectSvg } from "../../renderers/objectSvg";
import { parseDocument, serializeDocument } from "../../services/io/documentCodec";
import { createGridDocument } from "../document";
import { commitPlacement } from "./commitPlacement";
import { createFreeformCity, materializeFreeform, parseFreeformCity, serializeFreeform } from "./freeformCity";

function flatDocument(freeform = false) {
  const document = freeform
    ? materializeFreeform(createFreeformCity(96, 1, 16))
    : createGridDocument({ size: "micro", seed: "market-placement", grid: "hex" });
  document.terrain = {
    version: 1,
    features: [],
    field: {
      version: 1,
      template: "noise",
      seed: 1,
      sampleMeters: 8,
      parts: [{ kind: "offset", meters: 4 }]
    }
  };
  return document;
}

describe("market stall placement", () => {
  it.each(["market-produce-stall", "market-goods-booth", ...MARKET_FOOD_IDS])(
    "keeps %s quality, position and front through both file formats and renders the adopted tier",
    modelId => {
      expect(placementCatalog().some(item => item.id === modelId)).toBe(true);
      for (const freeform of [false, true]) {
        for (const quality of ["low", "high"] as const) {
          const footprint = placementFootprint(modelId, quality)!;
          const palette = placementPalette(modelId, "woad");
          const placed = commitPlacement(flatDocument(freeform), {
            id: "stall",
            modelId,
            quality,
            palette,
            position: [12, -8],
            facingDegrees: 90,
            footprint
          });
          expect(placed.preview.ok).toBe(true);
          const restored = freeform
            ? materializeFreeform(parseFreeformCity(serializeFreeform(placed.document))!)
            : parseDocument(serializeDocument(placed.document))!;
          expect(restored).not.toBeNull();
          const stall = restored.elements.find(item => item.id === "stall")!;
          expect(stall).toMatchObject({
            objectType: modelId,
            objectQuality: quality,
            point: [12, -8],
            rotation: rotationFromFacing("+z", 90)
          });
          expect(stall.objectPalette).toBe(palette);
          expect(renderObjectSvg(stall).querySelector("path.ce-object-selection")).not.toBeNull();
          const layer = createTownObjects([stall], () => 7);
          try {
            expect(layer.accepted).toHaveLength(1);
            expect(sceneVariants(layer.group)).toEqual([placementDefinition(modelId, quality, palette)!.variant]);
            const bounds = new THREE.Box3().setFromObject(layer.group);
            expect(bounds.min.y).toBeCloseTo(7, 4);
            expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(12, 4);
            expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(8, 4);
            expect(bounds.max.x - bounds.min.x).toBeCloseTo(footprint.halfZ * 2, 4);
            expect(bounds.max.z - bounds.min.z).toBeCloseTo(footprint.halfX * 2, 4);
          } finally {
            layer.dispose();
          }
        }
      }
    }
  );

  it("uses the larger High footprint when changing quality and preserves the previous tier on rejection", () => {
    const modelId = "market-produce-stall";
    const draft = {
      id: "first",
      modelId,
      quality: "low" as const,
      position: [0, 0] as [number, number],
      facingDegrees: 180,
      footprint: placementFootprint(modelId, "low")!
    };
    const first = commitPlacement(flatDocument(), draft).document;
    const beside = commitPlacement(first, { ...draft, id: "second", position: [6.12, 0] });
    expect(beside.preview.ok).toBe(true);
    const changed = commitPlacement(beside.document, {
      ...draft,
      quality: "high",
      footprint: placementFootprint(modelId, "high")!
    });
    expect(changed.preview.reason).toBe("overlap");
    expect(changed.document).toBe(beside.document);
    expect(changed.document.elements.find(item => item.id === "first")?.objectQuality).toBe("low");
  });

  it("saves an edited tier over the old Freeform ledger and accepts old objects with no quality", () => {
    const modelId = "market-produce-stall";
    const placed = commitPlacement(flatDocument(true), {
      id: "stall",
      modelId,
      quality: "low",
      position: [0, 0],
      facingDegrees: 0,
      footprint: placementFootprint(modelId, "low")!
    }).document;
    const loaded = materializeFreeform(parseFreeformCity(serializeFreeform(placed))!);
    loaded.elements[0].objectQuality = "high";
    expect(parseFreeformCity(serializeFreeform(loaded))?.placements[0].quality).toBe("high");
    const old = flatDocument();
    old.elements.push({ id: "legacy", kind: "object", faceIds: [], locked: false, objectType: modelId, point: [0, 0] });
    expect(parseDocument(serializeDocument(old))).not.toBeNull();
    expect(placementDefinition(modelId)?.variant).toContain("@high#");
    old.elements[0].objectQuality = "invalid" as "high";
    expect(parseDocument(JSON.stringify(old))).toBeNull();
  });

  it("saves edited palettes in both formats, rejects unknown palettes, and keeps harbor ownership during edits", () => {
    for (const freeform of [false, true]) {
      const draft = {
        id: "food-stall",
        modelId: "market-bread-stall",
        quality: "high" as const,
        palette: "madder" as const,
        position: [0, 0] as [number, number],
        facingDegrees: 0,
        footprint: placementFootprint("market-bread-stall", "high")!
      };
      const placed = commitPlacement(flatDocument(freeform), draft).document;
      const loaded = freeform
        ? materializeFreeform(parseFreeformCity(serializeFreeform(placed))!)
        : parseDocument(serializeDocument(placed))!;
      loaded.elements[0].harborFaceId = "port-land";
      const edited = commitPlacement(loaded, { ...draft, palette: "woad", facingDegrees: 90 }).document;
      expect(edited.elements[0].harborFaceId).toBe("port-land");
      if (freeform) {
        const ledger = parseFreeformCity(serializeFreeform(edited))!;
        expect(ledger.placements[0].palette).toBe("woad");
        ledger.placements[0].palette = "invalid" as "woad";
        expect(parseFreeformCity(JSON.stringify(ledger))).toBeNull();
      } else {
        expect(parseDocument(serializeDocument(edited))!.elements[0].objectPalette).toBe("woad");
        edited.elements[0].objectPalette = "invalid" as "woad";
        expect(parseDocument(JSON.stringify(edited))).toBeNull();
      }
    }
  });
});
