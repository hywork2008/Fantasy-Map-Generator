import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("meshless houses with the mesh editor's housing LOD and façade details (feature parity P2d-7)", () => {
  it("gives the houses near the camera their detailed regional model and façades, picked by the house", () => {
    const seed = "p7c-d",
      input = vectorInputFromEditor({
        settings: {
          ...defaultGenerationSettings(),
          population: defaultPopulationSettings(3000),
          historicalPeriod: "lateMedieval" as const,
          buildingPattern: "medieval" as const
        },
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
      ),
      data = vectorRenderData(doc, "housing"),
      scene = createVectorScene(data);
    try {
      const houses = data.surfaces.find(s => s.houses?.massing)!,
        ring = houses.polygons[0].outer,
        [x, y] = [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length],
        camera = new THREE.PerspectiveCamera(40, 1.5, 1, 20000);
      camera.position.set(x + 25, 30, -y + 25);
      camera.lookAt(x, 0, -y);
      camera.updateMatrixWorld(true);
      let lod = scene.updateCamera(camera, 900);
      for (let i = 0; i < 40 && lod.pending; i++) lod = scene.updateCamera(camera, 900);
      expect(lod.changed || !lod.pending).toBe(true);
      scene.group.updateMatrixWorld(true);
      const regional = scene.group.getObjectByName("ce-regional-houses")!,
        details = scene.group.getObjectByName("ce-building-details")!;
      const detailed: THREE.Mesh[] = [];
      regional.traverse(o => {
        if (o instanceof THREE.Mesh && o.visible && o.parent?.visible && !o.userData.fabricHouses) detailed.push(o);
      });
      expect(detailed.length).toBeGreaterThan(0);
      // Façade details go to near massing houses; those already detailed are excluded, as in the mesh editor.
      expect(details).toBeDefined();
      // Further out, past the detailed-model budget, the massing houses take the façade details.
      const far = camera.clone();
      far.position.set(x + 160, 140, -y + 160);
      far.lookAt(x, 0, -y);
      far.updateMatrixWorld(true);
      scene.updateCamera(far, 900);
      expect(details.children.length).toBeGreaterThan(0);
      // A ray down onto the detailed house resolves to the saved house id.
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 200, -y), new THREE.Vector3(0, -1, 0)),
        hit = ray.intersectObjects(detailed, false)[0];
      const any = new THREE.Box3().setFromObject(detailed[0]).getCenter(new THREE.Vector3()),
        down = new THREE.Raycaster(new THREE.Vector3(any.x, 500, any.z), new THREE.Vector3(0, -1, 0)).intersectObject(
          detailed[0],
          false
        )[0];
      expect(houses.houses!.ids).toContain(scene.pickHouse(hit ?? down));
    } finally {
      scene.dispose();
    }
  });
});
