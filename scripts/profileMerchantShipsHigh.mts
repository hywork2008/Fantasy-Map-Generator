import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { createCaravel } from "../src/buildings/ships/caravel";
import { createCarrack } from "../src/buildings/ships/carrack";
import { createMerchantShipHigh, merchantShipParts } from "../src/buildings/ships/merchantShipHigh";
import { landmarkFingerprint } from "./lib/landmarkFingerprint.mts";

const rows=[];
for(const kind of ["caravel","carrack"] as const)for(const quality of ["low","high"] as const)for(const sails of ["set","furled"] as const){
  const model=quality==="high"?createMerchantShipHigh(kind,{sails}):kind==="caravel"?createCaravel({sails}):createCarrack({sails});
  try{
    const buffers=new Set<ArrayBufferLike>();let lineSegments=0;
    model.group.traverse(object=>{
      const draw=object as THREE.Mesh;if(!draw.isMesh&&!(object as THREE.LineSegments).isLineSegments)return;
      for(const attribute of [...Object.values(draw.geometry.attributes),draw.geometry.index])
        if(attribute)buffers.add(("array" in attribute?attribute.array:attribute.data.array).buffer);
      if((object as THREE.LineSegments).isLineSegments)lineSegments+=draw.geometry.getAttribute("position").count/2;
    });
    const parts=quality==="high"?merchantShipParts(kind,{sails}).map(factory=>{
      const part=factory.create();try{return{id:factory.id,fingerprint:landmarkFingerprint(part.group)};}finally{part.dispose();}
    }):[];
    rows.push({kind,quality,sails,author:"Codex GPT-6.1 Sol",metrics:collectModelMetrics(model.group),lineSegments,
      attributeBytes:[...buffers].reduce((sum,b)=>sum+b.byteLength,0),dimensionsXYZ:new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).toArray(),
      fingerprint:landmarkFingerprint(model.group),sourceParts:modelParts(model.group),parts});
  }finally{model.dispose();}
}
await writeFile("docs/analytics/bv-merchant-ships-high-20261103.json",JSON.stringify({
  method:"One BV ship without ground. CPU attribute/index buffers include lines and count shared buffers once; exclude JS objects, transient allocations, GPU memory and FPS. Fingerprints cover world-space mesh triangles, normals and materials, not lines. No raster previews stored.",rows
},null,2)+"\n");
console.log(rows.map(({kind,quality,sails,metrics,lineSegments,attributeBytes})=>({kind,quality,sails,...metrics,lineSegments,attributeBytes})));
