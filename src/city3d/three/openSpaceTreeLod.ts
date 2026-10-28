import * as THREE from "three";
import { type TreeSpecies, treeLodProfile } from "../../buildings/landscape/trees";
import type { OpenSpaceSite } from "../../city-editor/renderers/openSpaceSites";
import type { CityTerrain } from "../../city-editor/types/terrain";
import { createForestTreeDetails, type ForestTreeSite } from "./forestTreeDetails";

/** Park/churchyard trees use the same BV tiers and camera selection as woodland trees. */
export function createOpenSpaceTreeLod(
  species: TreeSpecies,
  sites: readonly OpenSpaceSite[],
  heightAt: CityTerrain["heightAt"]
) {
  const group = new THREE.Group();
  group.name = `open-space-lod-${species}`;
  // A non-rendered transform buffer supplies stable placements to the shared LOD selector.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const placements = new THREE.InstancedMesh(geometry, material, sites.length);
  const details = createForestTreeDetails(group, sites.length);
  const candidates: ForestTreeSite[] = sites.map((site, index) => {
    const height = site.height ?? treeLodProfile(species)?.heightMeters ?? 10;
    const radius = site.radius ?? (site.width ? site.width / 2 : 4);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(site.point[0], heightAt(site.point) + 0.05, -site.point[1]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.angle),
      new THREE.Vector3(site.width ? site.width / 2 : radius, height / 10, site.depth ? site.depth / 2 : radius)
    );
    placements.setMatrixAt(index, matrix);
    return {
      id: `park:${species}:${index}`,
      point: site.point,
      radius,
      size: height / 10,
      species,
      mesh: placements,
      index
    };
  });
  const bounds = new THREE.Box3();
  for (const site of candidates) {
    const base = heightAt(site.point) + 0.05;
    bounds.expandByPoint(new THREE.Vector3(site.point[0] - site.radius, base, -site.point[1] - site.radius));
    bounds.expandByPoint(
      new THREE.Vector3(site.point[0] + site.radius, base + 10 * site.size, -site.point[1] + site.radius)
    );
  }
  let signature = "";
  let shadowKey = "";
  let disposed = false;
  const pickables: THREE.Mesh[] = [];
  return {
    group,
    pickables,
    bounds,
    update(camera: THREE.PerspectiveCamera, viewportHeight: number) {
      if (disposed || viewportHeight <= 0) return false;
      camera.updateMatrixWorld(true);
      const next = `${viewportHeight}:${camera.matrixWorld.elements}:${camera.projectionMatrix.elements}`;
      if (signature === next) return false;
      signature = next;
      details.reset();
      const result = details.update(camera, viewportHeight, candidates, {
        triangles: Infinity,
        calls: Infinity,
        shadowTriangles: 60000
      });
      pickables.length = 0;
      group.traverseVisible(object => {
        if (object instanceof THREE.Mesh) pickables.push(object);
      });
      const changed = result.shadowKey !== shadowKey;
      shadowKey = result.shadowKey;
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      details.dispose();
      placements.dispose();
      geometry.dispose();
      material.dispose();
      pickables.length = 0;
    }
  };
}
