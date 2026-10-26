import type * as THREE from "three";

/** Counts attached SVG complexity, including definitions and hidden layers. */
export function collectSvgMetrics(svg: SVGSVGElement) {
  const tags: Record<string, number> = {};
  let pathCommands = 0;
  let pathCharacters = 0;
  let points = 0;
  const elements = svg.querySelectorAll("*");
  for (const element of elements) {
    const tag = element.localName;
    tags[tag] = (tags[tag] ?? 0) + 1;
    if (tag === "path") {
      const path = element.getAttribute("d") ?? "";
      // Command letters are a lower bound: SVG permits implicit repeated commands.
      pathCommands += path.match(/[MmLlHhVvCcSsQqTtAaZz]/g)?.length ?? 0;
      pathCharacters += path.length;
    } else if (tag === "polygon" || tag === "polyline") {
      points += Math.floor(
        (element.getAttribute("points")?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.length ?? 0) / 2
      );
    }
  }
  return {
    redrawCpuMs: svg.hasAttribute("data-redraw-cpu-ms") ? Number(svg.getAttribute("data-redraw-cpu-ms")) : null,
    elements: elements.length + 1,
    tags,
    pathCommands,
    pathCharacters,
    points,
    buildings:
      Number(svg.getAttribute("data-core-buildings") ?? 0) + Number(svg.getAttribute("data-outskirts-buildings") ?? 0),
    quality: svg.getAttribute("data-render-quality")
  };
}

/** Resident scene counts differ from the camera-culled work in renderer.info. */
export function collectSceneMetrics(scene: THREE.Scene) {
  let objects = 0;
  let meshes = 0;
  let instances = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse(object => {
    objects++;
    const drawable = object as THREE.Mesh;
    if (drawable.isMesh) meshes++;
    const instanced = object as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) instances += instanced.count;
    if (drawable.geometry) geometries.add(drawable.geometry);
    if (drawable.material) {
      for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material])
        materials.add(material);
    }
  });
  let vertices = 0;
  for (const geometry of geometries) vertices += geometry.getAttribute("position")?.count ?? 0;
  return { objects, meshes, instances, geometries: geometries.size, materials: materials.size, vertices };
}

export interface City3dRenderMetrics {
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  width: number;
  height: number;
  cpuMs: number;
  sampledAt: number;
}

export interface City3dPerformanceSnapshot {
  camera: { position: number[]; target: number[]; zoom: number; fov: number } | null;
  frame: City3dRenderMetrics | null;
  scene: ReturnType<typeof collectSceneMetrics>;
  buildings: number;
  quality: string | null;
}
