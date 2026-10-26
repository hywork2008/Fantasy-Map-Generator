import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { facadeDetails, MAX_FACADE_TRIANGLES } from "../core/facadeDetails";
import { buildingSurfaces } from "../core/massingGeometry";
import { BUILDING_DETAIL_BUDGET, createTownBuildingDetails } from "./buildingDetails";

describe("near facade details", () => {
  it("uses the real floor edges and offsets without changing massing triangles", () => {
    const lot = buildingAppearancePreview("northern-urban")[0];
    const polygon = lot.polygon
      .map(
        ([x, y]) => [x * Math.cos(0.4) - y * Math.sin(0.4), x * Math.sin(0.4) + y * Math.cos(0.4)] as [number, number]
      )
      .reverse();
    const plain = buildingSurfaces(polygon, lot.massing!)!;
    const withPanels = buildingSurfaces(polygon, lot.massing!, { includeWallPanels: true })!;
    expect(withPanels.walls).toEqual(plain.walls);
    expect(withPanels.roofs).toEqual(plain.roofs);
    const colors = {
      wall: [0.7, 0.6, 0.5] as const,
      frame: [0.15, 0.1, 0.05] as const,
      trim: [0.2, 0.1, 0.05] as const,
      window: [0.03, 0.04, 0.05] as const
    };
    const details = facadeDetails(polygon, lot.massing!, colors, 12);
    expect(details.positions.length).toBeGreaterThan(0);
    expect(details.positions.length / 9).toBeLessThanOrEqual(MAX_FACADE_TRIANGLES);
    for (let i = 0; i < details.positions.length; i += 3) {
      const [x, y, z] = details.positions.slice(i, i + 3);
      const onWall = withPanels.wallPanels!.some(panel => {
        const dx = panel.b[0] - panel.a[0],
          dz = -panel.b[1] + panel.a[1],
          len = Math.hypot(dx, dz);
        const px = x - panel.a[0],
          pz = z + panel.a[1];
        const outward = (-dz * px + dx * pz) / len;
        const along = (dx * px + dz * pz) / len;
        return (
          Math.abs(outward - 0.012) < 1e-4 &&
          along >= -1e-4 &&
          along <= len + 1e-4 &&
          y >= 12 + panel.base &&
          y <= 12 + panel.base + panel.height
        );
      });
      expect(onWall).toBe(true);
    }
    const storage = { ...lot.massing!, floors: lot.massing!.floors.map(f => ({ ...f, use: "storage" as const })) };
    expect(facadeDetails(polygon, storage, colors).positions.length).toBeLessThan(details.positions.length);
  });

  it("builds only near visible houses, reuses stationary frames and releases far details", () => {
    const lot = buildingAppearancePreview("northern-urban")[0];
    const lots = Array.from({ length: 100 }, (_, i) => ({
      ...lot,
      id: `detail-${i}`,
      polygon: lot.polygon.map(
        ([x, y]) => [x + (i % 10) * 10 - 40, y + Math.floor(i / 10) * 10 - 40] as [number, number]
      )
    }));
    const details = createTownBuildingDetails(lots);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    camera.position.set(0, 1500, 1500);
    camera.lookAt(0, 0, 0);
    details.update(camera, 720);
    expect(details.group.children).toHaveLength(0);
    expect(details.stats.cached).toBe(0);
    camera.position.set(0, 110, 110);
    camera.lookAt(0, 0, 0);
    details.update(camera, 1500);
    expect(details.group.children).toHaveLength(1);
    expect(details.stats.buildings).toBeGreaterThan(0);
    expect(details.stats.buildings).toBeLessThanOrEqual(BUILDING_DETAIL_BUDGET.buildings);
    expect(details.stats.triangles).toBeLessThanOrEqual(BUILDING_DETAIL_BUDGET.triangles);
    const mesh = details.group.children[0] as THREE.Mesh;
    expect(mesh.receiveShadow).toBe(true);
    const geometry = mesh.geometry;
    const dispose = vi.spyOn(geometry, "dispose");
    const builds = details.stats.builds;
    details.update(camera, 1500);
    expect(details.stats.builds).toBe(builds);
    expect((details.group.children[0] as THREE.Mesh).geometry).toBe(geometry);
    camera.position.set(0, 1500, 1500);
    camera.lookAt(0, 0, 0);
    details.update(camera, 720);
    expect(details.group.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(details.stats.buildings).toBe(0);
    camera.position.set(0, 110, 110);
    camera.lookAt(0, 0, 0);
    details.update(camera, 1500);
    expect(details.group.children).toHaveLength(1);
    const rebuiltMesh = details.group.children[0] as THREE.Mesh;
    expect(rebuiltMesh).not.toBe(mesh);
    expect(rebuiltMesh.receiveShadow).toBe(true);
    details.dispose();
  });

  it("keeps legacy cities untouched and has no detailed meshes outside the frustum", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 10, 25);
    camera.lookAt(0, 3, 0);
    const legacy = createTownBuildingDetails(buildingAppearancePreview("legacy"));
    legacy.update(camera, 720);
    expect(legacy.stats.buildings).toBe(0);
    legacy.dispose();
    const current = createTownBuildingDetails(buildingAppearancePreview("mediterranean"));
    camera.lookAt(0, 10, 100);
    current.update(camera, 720);
    expect(current.stats.buildings).toBe(0);
    current.dispose();
  });

  it("retains details across the hysteresis band without rebuilding", () => {
    const details = createTownBuildingDetails([buildingAppearancePreview("northern-urban")[0]]);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const move = (distance: number) => {
      camera.position.set(-8, 3, distance);
      camera.lookAt(-8, 3, 0);
      details.update(camera, 720);
    };
    move(170);
    expect(details.stats.buildings).toBe(0);
    move(100);
    expect(details.stats.buildings).toBe(1);
    const builds = details.stats.builds;
    move(170);
    expect(details.stats.buildings).toBe(1);
    expect(details.stats.builds).toBe(builds);
    move(240);
    expect(details.stats.buildings).toBe(0);
    details.dispose();
    move(100);
    expect(details.group.children).toHaveLength(0);
  });

  it("bounds the lazy cache while moving across a larger city", () => {
    const lot = buildingAppearancePreview("northern-urban")[0];
    const lots = Array.from({ length: 400 }, (_, i) => ({
      ...lot,
      id: `moving-${i}`,
      polygon: lot.polygon.map(
        ([x, y]) => [x + (i % 20) * 10 - 95, y + Math.floor(i / 20) * 10 - 95] as [number, number]
      )
    }));
    const details = createTownBuildingDetails(lots);
    const camera = new THREE.PerspectiveCamera(45, 1.4, 0.1, 2000);
    for (const [x, z] of [
      [-65, -60],
      [55, -60],
      [55, 60],
      [-65, 60]
    ]) {
      camera.position.set(x, 70, z + 70);
      camera.lookAt(x, 3, z);
      details.update(camera, 1440);
      expect(details.stats.cached).toBeLessThanOrEqual(BUILDING_DETAIL_BUDGET.cache);
    }
    expect(details.stats.cached).toBe(BUILDING_DETAIL_BUDGET.cache);
    details.dispose();
    details.dispose();
    expect(details.group.children).toHaveLength(0);
  });
});
