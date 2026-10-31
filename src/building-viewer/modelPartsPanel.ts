import type * as THREE from "three";
import { modelParts } from "../buildings/modelParts";

/** Expose construction-time semantic parts without changing the rendered assembly. */
export function modelPartsPanel(root: THREE.Object3D): HTMLDetailsElement | null {
  const parts = modelParts(root);
  if (!parts.length) return null;
  const details = document.createElement("details");
  details.className = "bv-model-parts";
  const summary = document.createElement("summary");
  summary.textContent = `Assembly parts · ${parts.length}`;
  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  for (const label of ["Part", "Quality", "Meshes", "Triangles"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.append(th);
  }
  const body = table.createTBody();
  for (const part of parts) {
    const row = body.insertRow();
    row.dataset.partId = part.id;
    row.title = `${part.id}\n${part.author}${part.basedOn?.length ? `\n${part.basedOn.join("\n")}` : ""}`;
    for (const value of [part.role, part.quality, part.meshes.toLocaleString(), part.triangles.toLocaleString()])
      row.insertCell().textContent = value;
  }
  details.append(summary, table);
  return details;
}
