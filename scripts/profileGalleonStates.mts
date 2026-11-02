import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { createGalleon } from "../src/buildings/ships/galleon";
import { createMerchantShipHigh } from "../src/buildings/ships/merchantShipHigh";
import { createOpusGalleon } from "../src/buildings/ships/opusGalleon";
import { landmarkFingerprint } from "./lib/landmarkFingerprint.mts";

const rows=[];
for(const author of ["codex","opus"] as const)for(const quality of ["low","high"] as const)
for(const sails of ["set","furled"] as const)for(const gunports of ["open","closed"] as const){
  const state={sails,gunports},model=author==="opus"?createOpusGalleon(quality,state):quality==="high"?createMerchantShipHigh("galleon",state):createGalleon(state);
  try{
    const buffers=new Set<ArrayBufferLike>();let lineSegments=0;
    model.group.traverse(object=>{
      const draw=object as THREE.Mesh;if(!draw.isMesh&&!(object as THREE.LineSegments).isLineSegments)return;
      for(const attribute of [...Object.values(draw.geometry.attributes),draw.geometry.index])
        if(attribute)buffers.add(("array" in attribute?attribute.array:attribute.data.array).buffer);
      if((object as THREE.LineSegments).isLineSegments)lineSegments+=draw.geometry.getAttribute("position").count/2;
    });
    rows.push({author:author==="codex"?"Codex GPT-6.1 Sol":"Claude Opus 5.5",quality,sails,gunports,
      metrics:collectModelMetrics(model.group),lineSegments,attributeBytes:[...buffers].reduce((sum,b)=>sum+b.byteLength,0),
      dimensionsXYZ:new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).toArray(),
      fingerprint:landmarkFingerprint(model.group),parts:modelParts(model.group)});
  }finally{model.dispose();}
}
await writeFile("docs/analytics/bv-galleon-states-20261103.json",JSON.stringify({
  method:"One BV ship; no ground, optional stern ensign off. Unique CPU attribute/index buffers include lines, exclude objects, transient allocations and GPU memory; no FPS benchmark. Fingerprints cover world-space mesh triangles, normals and materials, not vertex colors or line geometry. No raster previews are stored.",rows
},null,2)+"\n");
console.log(rows.map(({author,quality,sails,gunports,metrics,lineSegments,attributeBytes})=>({author,quality,sails,gunports,triangles:metrics.triangles,meshes:metrics.meshes,lineSegments,attributeBytes})));
