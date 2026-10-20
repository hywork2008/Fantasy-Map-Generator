import { describe, expect, it } from "vitest";
import { renderFortSiteGround, renderFortSiteObjects } from "../renderers/fortSiteSvg";
import { collectCityStructures } from "../renderers/structureMassing";
import { parseDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { createCastleBuildingOnFace, deleteCastle, setCastleLocked } from "./castles";
import { createGridDocument } from "./document";
import { removeFortComponent } from "./fortSiteEditing";
import { fortHeight } from "./fortSiteGeometry";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { facePoints, validate } from "./mesh";
import { cityTerrain } from "./terrainElevation";

const settings = { ...defaultGenerationSettings(), mode: "fort" as const };
const source = () => createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 20, seed: "fort-grid" });

describe("motte-and-bailey generation", () => {
  it("preserves every grid cell and edge and places the keep on one elevated cell", () => {
    const input = source();
    Object.values(input.mesh.vertices)[0].point[0] += 0.25;
    const before = JSON.stringify(input);
    const fort = generateCityOnDocument(input, settings, "fort")!;
    expect(fort).not.toBeNull();
    expect(validate(fort)).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
    expect(fort.gridKind).toBe("hex");
    const castle = fort.castles![0],
      motte = fort.mesh.faces[castle.motteFaceId!];
    expect(castle.circuitId).toBeUndefined();
    expect(castle.castleStyle).toBe("motte-bailey");
    expect(fort.mesh.vertices).toEqual(input.mesh.vertices);
    expect(fort.mesh.edges).toEqual(input.mesh.edges);
    expect(Object.keys(fort.mesh.faces)).toEqual(Object.keys(input.mesh.faces));
    for (const face of Object.values(input.mesh.faces))
      expect(fort.mesh.faces[face.id].boundary).toEqual(face.boundary);
    expect(facePoints(fort.mesh, motte)).toHaveLength(6);
    expect(fortHeight(fort.fortSite!, fort.fortSite!.motte.center)).toBeCloseTo(25.24);
    const terrain = cityTerrain(fort);
    expect(terrain.relief).toBe(true);
    expect(terrain.foundationAt(castle.parts[0].footprint)).toBeGreaterThan(10);
    expect(renderFortSiteGround(fort).querySelector(".ce-motte-mound-slope")).not.toBeNull();
    expect(collectCityStructures(fort).some(part => part.id.includes("fort:keep"))).toBe(true);
  });

  it("retains buildings when walls are removed, and retains walls when buildings are deleted", () => {
    const fort = generateCityOnDocument(source(), settings, "fort")!;
    const removed = deleteCastle(fort, fort.castles![0].id)!;
    expect(removed.castles).toHaveLength(0);
    expect(removed.featureGroups).toEqual(fort.featureGroups);
    expect(removed.defenseCircuits).toEqual(fort.defenseCircuits);
    const withoutWalls = removeFortComponent(fort, "fort:bailey-palisade")!;
    expect(validate(withoutWalls)).toEqual([]);
    expect(renderFortSiteObjects(withoutWalls).querySelector(".ce-castle-precinct")).not.toBeNull();
    expect(parseDocument(JSON.stringify(withoutWalls))).not.toBeNull();
    const locked = setCastleLocked(fort, fort.castles![0].id, true)!;
    expect(locked.castles![0].locked).toBe(true);
    expect(
      removeFortComponent(locked, "fort:bailey-palisade")!.fortSite!.defenses.some(
        group => group.id === "fort:bailey-palisade"
      )
    ).toBe(false);
  });

  it("places a cell castle without adding walls or gates", () => {
    const input = source();
    const face = Object.values(input.mesh.faces).find(face => face.site?.every(value => Math.abs(value) < 1))!;
    const placed = createCastleBuildingOnFace(input, face.id)!;
    expect(placed).not.toBeNull();
    expect(validate(placed)).toEqual([]);
    expect(placed.castles![0].siteFaceIds).toEqual([face.id]);
    expect(placed.featureGroups).toEqual(input.featureGroups);
    expect(placed.gates).toEqual(input.gates);
    expect(placed.defenseCircuits).toEqual(input.defenseCircuits);
  });

  it("round-trips the mode, editable hill and generation recipe", () => {
    const fort = generateCityOnDocument(source(), settings, "fort")!;
    expect(parseDocument(JSON.stringify(fort))).toEqual(fort);
    const recipe = fort.fabric!.generation!;
    expect(generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)).toEqual(fort);
    const share = buildShare({ seed: "fort", grid: "hex", size: "micro", hexSizeMeters: 20, settings });
    expect(decodeShare(encodeShare(share))!.settings.mode).toBe("fort");
  });
});
