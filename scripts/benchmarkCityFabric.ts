/** node --import tsx scripts/benchmarkCityFabric.ts --out=/tmp/ce-fabric-cache.json */
import { writeFileSync } from "node:fs";
import { createGridDocument } from "../src/city-editor/core/document";
import { defaultGenerationSettings, generateCityOnDocument } from "../src/city-editor/core/generate";
import { buildBlockFabric, FabricCache } from "../src/city-editor/core/gen/blockInfill";
import { setDistrictParameters } from "../src/city-editor/core/gen/fabricDistricts";
import type { CityDocument } from "../src/city-editor/core/types";

const seed = "phase2-reference";
const samples = [];
for (const size of ["small", "large"] as const) {
  const input = createGridDocument({size,grid:"evolution",seed});
  const settings = defaultGenerationSettings();
  settings.config.rivers=[];
  const document = generateCityOnDocument(input,settings,seed);
  if (!document?.fabric) throw new Error(`Failed to generate ${size}`);
  const cache=new FabricCache();
  const measure = (source: CityDocument) => {
    const start=performance.now(), beforeHits=cache.hits, beforeMisses=cache.misses;
    const fabric=buildBlockFabric(source,cache);
    return {ms:performance.now()-start,hits:cache.hits-beforeHits,misses:cache.misses-beforeMisses,
      buildings:fabric.buildings.length,lanes:fabric.lanes.length,farms:fabric.farms.length};
  };
  const cold=measure(document),warm=measure(document);
  const district=document.fabric.districts.find(d=>document.mesh.faces[d.faceIds[0]].properties.ward==="craftsmen")!;
  const edited=setDistrictParameters(document,district.faceIds[0],{lotArea:district.parameters.lotArea*1.2})!;
  const edit=measure(edited);
  samples.push({size,seed,faces:Object.keys(document.mesh.faces).length,districts:document.fabric.districts.length,cold,warm,edit});
}
const report=JSON.stringify(samples,null,2);
const out=process.argv.find(arg=>arg.startsWith("--out="))?.slice(6);
if (out) writeFileSync(out,report);
console.log(report);
