import { renderVectorDocument } from "../../../renderers/vector/documentSvg";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorStage } from "../../../types/vector/urban";
export function serializeVectorSvg(doc: VectorCityDocument, stage?: VectorStage): string {
  const svg = renderVectorDocument(doc, undefined, undefined, stage);
  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "1600");
  svg.setAttribute("height", "1600");
  svg.querySelectorAll("[data-vector-node],[data-vector-path],[data-vector-gate]").forEach(e => {
    e.remove();
  });
  const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata");
  metadata.textContent = JSON.stringify({
    format: doc.format,
    version: doc.version,
    revision: doc.revision,
    stage: stage ?? (doc.urban ? "housing" : "regions"),
    units: "meters"
  });
  svg.prepend(metadata);
  return new XMLSerializer().serializeToString(svg);
}
export async function vectorPng(doc: VectorCityDocument, stage?: VectorStage): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([serializeVectorSvg(doc, stage)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("vector-png"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1600;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("vector-png");
    ctx.drawImage(image, 0, 0, 1600, 1600);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("vector-png"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function vectorGlb(doc: VectorCityDocument, stage?: VectorStage): Promise<Blob> {
  const [{ GLTFExporter }, { createVectorScene }] = await Promise.all([
    import("three/examples/jsm/exporters/GLTFExporter.js"),
    import("../../../renderers/vector/scene3d")
  ]);
  const scene = createVectorScene(vectorRenderData(doc, stage));
  const THREE = await import("three"),
    converted = new Map<string, import("three").MeshStandardMaterial>();
  scene.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const standard = (original: import("three").Material) => {
      if (original instanceof THREE.MeshStandardMaterial || original instanceof THREE.MeshBasicMaterial)
        return original;
      let material = converted.get(original.uuid);
      if (!material) {
        const source = original as import("three").MeshStandardMaterial;
        material = new THREE.MeshStandardMaterial({
          color: source.color ?? new THREE.Color("#99816b"),
          map: source.map ?? null,
          transparent: original.transparent,
          opacity: original.opacity,
          side: original.side,
          vertexColors: source.vertexColors,
          roughness: 0.85
        });
        converted.set(original.uuid, material);
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(standard) : standard(object.material);
  });
  scene.group.userData.materialPolicy = "BV custom shaders approximated as standard glTF materials";
  scene.group.userData.materialConversions = converted.size;

  try {
    const result = await new GLTFExporter().parseAsync(scene.group, { binary: true });
    if (!(result instanceof ArrayBuffer) || result.byteLength > 64 * 1024 * 1024) throw new Error("vector-glb-budget");
    return new Blob([result], { type: "model/gltf-binary" });
  } finally {
    scene.dispose();
    for (const material of converted.values()) material.dispose();
  }
}
export function downloadVectorBlob(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `ce-vector-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
