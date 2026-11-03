import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { createBarge } from "../src/buildings/ships/barge";
import { createCaravel } from "../src/buildings/ships/caravel";
import { createCarrack } from "../src/buildings/ships/carrack";
import { createGalleon } from "../src/buildings/ships/galleon";
import { createOpusGalleon } from "../src/buildings/ships/opusGalleon";
import { createSloop } from "../src/buildings/ships/sloop";
import { landmarkFingerprint } from "./lib/landmarkFingerprint.mts";

const definitions = [
  { id: "sloop", author: "Codex GPT-6.1 Sol", quality: "single/default; assumed Low", bv: true, create: createSloop },
  { id: "caravel", author: "Codex GPT-6.1 Sol", quality: "single/default; assumed Low", bv: false, create: createCaravel },
  { id: "carrack", author: "Codex GPT-6.1 Sol", quality: "single/default; assumed Low", bv: true, create: createCarrack },
  { id: "galleon", author: "Codex GPT-6.1 Sol", quality: "single/default; assumed Low", bv: true, create: createGalleon },
  { id: "barge", author: "Codex GPT-6.1 Sol", quality: "single/default; assumed Low", bv: true, create: createBarge },
  ...(["low", "high"] as const).map(quality => ({
    id: `opus-galleon-${quality}`, author: "Claude Opus 5.5", quality, bv: true,
    create: () => createOpusGalleon(quality)
  }))
];

const rows = definitions.map(({ create, ...definition }) => {
  const model = create();
  try {
    const buffers = new Set<ArrayBufferLike>();
    const named = new Map<string, { meshes: number; triangles: number }>();
    let lineSegments = 0;
    model.group.traverse(object => {
      const drawable = object as THREE.Mesh | THREE.LineSegments;
      if (!("isMesh" in drawable || "isLineSegments" in drawable)) return;
      for (const attribute of [...Object.values(drawable.geometry.attributes), drawable.geometry.index])
        if (attribute) buffers.add(("array" in attribute ? attribute.array : attribute.data.array).buffer);
      const count = drawable.geometry.index?.count ?? drawable.geometry.getAttribute("position").count;
      const drawn = Math.max(0, Math.min(count - drawable.geometry.drawRange.start, drawable.geometry.drawRange.count));
      if ("isLineSegments" in drawable) lineSegments += Math.floor(drawn / 2);
      else {
        const item = named.get(object.name) ?? { meshes: 0, triangles: 0 };
        item.meshes++;
        item.triangles += Math.floor(drawn / 3);
        named.set(object.name, item);
      }
    });
    return {
      ...definition,
      metrics: collectModelMetrics(model.group),
      attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
      lineSegments,
      dimensionsXYZ: new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).toArray(),
      fingerprint: landmarkFingerprint(model.group),
      meshNames: [...named].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.triangles - a.triangles)
    };
  } finally {
    model.dispose();
  }
});
await writeFile("docs/analytics/bv-ships-audit-20261103.json", JSON.stringify({
  method: "Current unmodified factories with default options. Unique CPU attribute/index buffers include line geometry, exclude JS objects, transient allocations and GPU memory; not an FPS benchmark. Fingerprint covers world-space mesh triangles, normals and materials, not line geometry. bv means directly selectable in the current Ships section. No raster previews are stored.",
  rows
}, null, 2) + "\n");
console.log(rows.map(({ id, metrics, lineSegments, attributeBytes }) => ({ id, ...metrics, lineSegments, attributeBytes })));
