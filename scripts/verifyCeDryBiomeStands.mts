/** F2-3 dry-biome coverage, planting and stand-density check. Optional previews must be outside the repository. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createServer } from "vite";

const output=resolve("docs/analytics/ce-tree-dry-biomes-20261029.json");
const preview=process.env.CE_TREE_PREVIEW_DIR;
if (preview) {
  assert.ok(isAbsolute(preview));
  assert.ok(relative(process.cwd(),resolve(preview)).startsWith(".."),"Previews must be outside the repository");
  assert.ok(!relative(resolve(tmpdir()),resolve(preview)).startsWith(".."),"Previews must be in the OS temporary directory");
  mkdirSync(preview,{ recursive:true });
}
const keys=["hotDesert","coldDesert","savanna","grassland","tropicalSeasonalForest","mediterraneanWoodlandScrub","xericShrubland","coldSteppe","tropicalDryForest"];
const server=await createServer({ configFile:false,root:process.cwd(),server:{ host:"127.0.0.1",port:5221,strictPort:true } });
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
  await server.listen();browser=await chromium.launch({ headless:true,args:["--use-angle=metal"] });
  const page=await browser.newPage({ viewport:{ width:1200,height:1200 },deviceScaleFactor:1 });
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{ if (m.type()==="error") errors.push(m.text()); });
  await page.addInitScript({ content:"globalThis.__name = fn => fn;" });
  await page.route("**/dry-biomes.html",route=>route.fulfill({ contentType:"text/html",body:"<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas id='render'></canvas><canvas id='warm' style='display:none'></canvas><canvas id='cold' style='display:none'></canvas>" }));
  await page.goto("http://127.0.0.1:5221/dry-biomes.html");
  const setup=await page.evaluate(async ({ keys,previews })=>{
    // @ts-expect-error Browser-only Vite module URL.
    const THREE=await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { createDocument }=await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { forestRegions,forestContains }=await import("/src/city-editor/generators/forestGeometry.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownForest }=await import("/src/city3d/three/forestMeshes.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { landscapeTreeSpecies }=await import("/src/city-editor/renderers/landscapeTreeSpecies.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { forestLandCover,withForestSettings }=await import("/src/city-editor/generators/forestLandCover.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { collectOpenSpacePlan }=await import("/src/city-editor/renderers/openSpaceSites.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { BURIAL_CULTURE_PRESETS }=await import("/src/data/burialCultures.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree }=await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { DEFAULT_SUN,updateSun }=await import("/src/city-editor/renderers/sunLighting.ts");
    const renderer=new THREE.WebGLRenderer({ canvas:document.querySelector("#render"),antialias:true,preserveDrawingBuffer:true });
    renderer.setSize(400,400);renderer.setClearColor(0xc5c5bf);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xf4f0e6,0x6d7a62,0.9));
    const sun=new THREE.DirectionalLight();scene.add(sun,sun.target);
    const camera=new THREE.PerspectiveCamera(45,1,0.1,3000);
    const region=forestRegions([{ faceId:"f0",polygon:[[-48,-48],[48,-48],[48,48],[-48,48]] }])[0];
    region.holes=[[[-12,-8],[-12,8],[12,8],[12,-8]]];region.areaM2-=24*16;
    const plan={ regions:[region],areaM2:region.areaM2,forestFaceIds:["f0"],protectedFarmAreaM2:0,protectedFarmCount:0 };
    const heightAt=([x,y]:number[])=>5+x*0.05+y*0.02;
    if (previews) for (const id of ["warm","cold"]) { const c=document.querySelector<HTMLCanvasElement>(`#${id}`)!;c.width=1200;c.height=1200;c.getContext("2d")!.fillStyle="#c5c5bf";c.getContext("2d")!.fillRect(0,0,1200,1200); }
    const policyAudit=(key:string)=>{
      const doc=createDocument("ce-dry-policy-v1",400);
      doc.generationSeed="ce-dry-biomes-v1";doc.biome={ id:1,key,name:key,color:"green" };
      const faces=Object.values(doc.mesh.faces) as any[];
      if (faces.length<9) throw new Error("Insufficient policy fixture faces");
      faces.forEach((f,i)=>Object.assign(f.properties,{ water:"land",ward:i%2?"empty":"farm",settlement:"outskirts",locked:false }));
      faces[0].properties.locked=true;faces[1].properties.water="lake";faces[2].properties.water="sea";
      faces[3].properties.landCoverOverride="open";faces[4].properties.ward="park";
      Object.assign(faces[5].properties,{ ward:"empty",settlement:"core" });
      const protectedIds=faces.slice(0,6).map(f=>f.id),before=JSON.stringify(doc);
      const modes=Object.fromEntries(["legacy","farmland","surroundings"].map(mode=>{
        const changed=withForestSettings(doc,{ version:1,mode,density:"sparse" });
        const selected=[...forestLandCover(changed)];
        if (selected.some(id=>protectedIds.includes(id))) throw new Error(`Protected face forested in ${key}/${mode}`);
        return [mode,selected.length];
      }));
      const forced=withForestSettings(doc,{ version:1,mode:"legacy",density:"sparse" },{ [faces[6].id]:"forest" });
      const manual=[...forestLandCover(forced)];
      const points=Array.from({ length:64 },(_,i)=>[17*i,23*i]);
      const park={ faceId:"park",lawnPolygons:[],paths:[],grassTufts:[],trees:points.map(center=>({ center,radius:3,subCircles:[] })) };
      const profile=Object.values(BURIAL_CULTURE_PRESETS).find((p:any)=>p.vegetation==="mediterranean_cypress");
      if (!profile) throw new Error("Missing cypress planting profile");
      const cemetery={ id:"cemetery",version:1,seed:"planting",faceId:"cemetery",form:"churchyard",boundary:[],courtyards:[],parts:[],accesses:[],trees:points,provenance:"generated",locked:false,burialProfile:profile };
      const savedPlanting=JSON.stringify([park,cemetery]);
      const parkSpecies=collectOpenSpacePlan([park],[],doc).sites.map((s:any)=>s.model);
      const cemeterySpecies=collectOpenSpacePlan([],[cemetery],doc).sites.map((s:any)=>s.model);
      if (JSON.stringify([park,cemetery])!==savedPlanting || JSON.stringify(doc)!==before) throw new Error("Mutated policy input or saved planting");
      const counts=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]));
      return { defaultForestFaces:forestLandCover(doc).size,modes,manualForestFaces:manual.length,manualIsRequestedFace:manual[0]===faces[6].id,protectedFaces:protectedIds.length,parkSpecies:counts(parkSpecies),cemeterySpecies:counts(cemeterySpecies),cemeteryPreferred:"mediterranean_cypress",savedPlantingPreserved:true };
    };
    let forest:any,city:any;
    const start=(key:string,density:string)=>{
      city=createDocument("ce-dry-biomes-v1",120);
      city.generationSeed="ce-dry-biomes-v1";
      city.biome={ id:1,key,name:key,color:"green" };
      city.buildingAppearanceContext={ period:"medieval",forest:false,arid:true,wetland:false };
      city.forestSettings={ version:1,mode:"surroundings",density };
      forest=createTownForest(city,plan,{ heightAt,relief:true },"standard");scene.add(forest.group);updateSun(sun,forest.bounds,DEFAULT_SUN);
      return { species:Array.from({ length:64 },(_,i)=>landscapeTreeSpecies("garden_parkland",city,[17*i,23*i])),policy:policyAudit(key) };
    };
    const draw=(view:string)=>{
      camera.position.set(...(view==="overview"?[85,160,160]:view==="edge"?[60,35,100]:[25,14,45]));camera.lookAt(0,10,0);
      forest.update(camera,400);renderer.render(scene,camera);
      const points=new Set<string>(),variants=new Set<string>(),placements:any[]=[],candidates=new Map<string,any>();
      let rootError=0,duplicates=0,minCrownClearance=Infinity;
      forest.group.traverse((o:any)=>{
        for (const site of o.userData.forestSites ?? []) candidates.set(site.id,[site.point,site.radius]);
        for (const site of o.userData.forestSites ?? []) for (const ring of [region.outer,...region.holes]) for (let i=0;i<ring.length;i++) {
          const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1];
          const t=Math.max(0,Math.min(1,((site.point[0]-a[0])*dx+(site.point[1]-a[1])*dy)/(dx*dx+dy*dy)));
          minCrownClearance=Math.min(minCrownClearance,Math.hypot(site.point[0]-a[0]-t*dx,site.point[1]-a[1]-t*dy)-site.radius);
        }
      });
      forest.group.traverseVisible((o:any)=>{
        if (!o.isInstancedMesh) return;
        const ids=o.userData.modelVariants ?? [];
        if (!ids.includes(adoptedTree(o.userData.forestSpecies,o.userData.treeQuality).id)) throw new Error("Unexpected adopted model");
        ids.forEach((id:string)=>variants.add(id));
        for (let i=0;i<o.count;i++) {
          const m=new THREE.Matrix4();o.getMatrixAt(i,m);
          if (new THREE.Vector3().setFromMatrixScale(m).length()===0) continue;
          const x=m.elements[12],z=m.elements[14],key=`${x.toFixed(3)},${z.toFixed(3)}`;
          if (points.has(key)) duplicates++;points.add(key);placements.push([key,[...m.elements]]);
          if (!forestContains(region,[x,-z])) throw new Error("Tree in an opening or outside forest");
          rootError=Math.max(rootError,Math.abs(m.elements[13]-heightAt([x,-z])));
        }
      });
      if (previews && view==="edge") {
        const id=city.forestSettings.density==="sparse"?"cold":"warm",c=document.querySelector<HTMLCanvasElement>(`#${id}`)!,ctx=c.getContext("2d")!;
        const i=keys.indexOf(city.biome.key),x=(i%3)*400,y=Math.floor(i/3)*400;
        ctx.drawImage(renderer.domElement,x,y);ctx.fillStyle="#111";ctx.font="12px system-ui";ctx.fillText(`${city.biome.key} / ${city.forestSettings.density}`,x+6,y+16);
      }
      const gl=renderer.getContext();if (gl.getError()!==gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error");
      return { view,...structuredClone(forest.stats),rootError,minCrownClearance,duplicates,candidates:[...candidates].sort((a,b)=>a[0].localeCompare(b[0])),placements:placements.sort((a,b)=>a[0].localeCompare(b[0])),visibleInstances:points.size,variants:[...variants].sort(),renderedTriangles:renderer.info.render.triangles };
    };
    const release=()=>{ scene.remove(forest.group);forest.dispose();renderer.render(scene,camera);return renderer.info.memory.geometries; };
    (window as any).dryProbe={ start,draw,release,finish(){ renderer.dispose(); } };
    const gl=renderer.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");
    return { gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),seed:"ce-dry-biomes-v1",areaM2:plan.areaM2,terrain:"heightAt(x,y)=5+0.05*x+0.02*y",outerSideMeters:96,holeMeters:[24,16],viewport:[400,400],dpr:1 };
  },{ keys,previews:Boolean(preview) });
  assert.ok(!/swiftshader|llvmpipe/i.test(setup.gpu));
  const results=[],candidateHashes=new Map<string,string>();
  const expectedSpecies:Record<string,string[]>={ hotDesert:["date_palm"],coldDesert:["saxaul"],savanna:["umbrella_thorn","date_palm"],grassland:["garden_parkland"],tropicalSeasonalForest:["umbrella_thorn","date_palm"],mediterraneanWoodlandScrub:["olive"],xericShrubland:["tamarisk","date_palm"],coldSteppe:["saxaul"],tropicalDryForest:["umbrella_thorn","date_palm"] };
  for (const key of keys) for (const density of ["sparse","standard"]) {
    const sampled=await page.evaluate(({ key,density })=>(window as any).dryProbe.start(key,density),{ key,density });
    const expected=expectedSpecies[key];
    assert.deepEqual([...new Set(sampled.species)].sort(),[...expected].sort());
    const policy=sampled.policy;
    assert.equal(policy.defaultForestFaces,0);assert.equal(policy.modes.legacy,0);
    assert.ok(policy.modes.surroundings>policy.modes.farmland && policy.modes.farmland>0);
    assert.equal(policy.manualForestFaces,1);assert.equal(policy.manualIsRequestedFace,true);
    assert.deepEqual(Object.keys(policy.parkSpecies).sort(),[...expected].sort());
    const funerary=key==="grassland" || key==="mediterraneanWoodlandScrub"?"mediterranean_cypress":key==="xericShrubland"?"tamarisk":["savanna","tropicalSeasonalForest","tropicalDryForest"].includes(key)?"umbrella_thorn":expected[0];
    assert.deepEqual(Object.keys(policy.cemeterySpecies),[funerary]);
    const frames=[];
    for (const view of ["overview","edge","low"]) {
      const frame=await page.evaluate(view=>(window as any).dryProbe.draw(view),view);
      assert.ok(frame.trees>0);assert.equal(frame.trees,frame.detailedTrees);assert.equal(frame.visibleInstances,frame.trees);assert.equal(frame.duplicates,0);assert.ok(frame.rootError<0.001);assert.ok(frame.minCrownClearance>=0.099);assert.equal(frame.areaM2,setup.areaM2);
      assert.ok(frame.detailedSpecies.every((s:string)=>expected.includes(s)));
      const candidateSha256=createHash("sha256").update(JSON.stringify(frame.candidates)).digest("hex");
      if (candidateHashes.has(density)) assert.equal(candidateSha256,candidateHashes.get(density));else candidateHashes.set(density,candidateSha256);
      const placementSha256=createHash("sha256").update(JSON.stringify(frame.placements)).digest("hex");
      delete frame.placements;delete frame.candidates;frames.push({ ...frame,candidateSha256,placementSha256 });
    }
    const geometriesAfterDispose=await page.evaluate(()=>(window as any).dryProbe.release());assert.equal(geometriesAfterDispose,0);
    const speciesCounts=Object.fromEntries([...new Set(sampled.species)].sort().map(s=>[s,sampled.species.filter(v=>v===s).length]));
    results.push({ key,density,expected,speciesCounts,policy,frames,geometriesAfterDispose });
  }
  if (preview) for (const id of ["warm","cold"]) {
    await page.evaluate(id=>{ document.querySelector<HTMLCanvasElement>("#render")!.style.display="none";for (const name of ["warm","cold"]) document.querySelector<HTMLCanvasElement>(`#${name}`)!.style.display=name===id?"block":"none"; },id);
    await page.screenshot({ path:resolve(preview,`${id}.png`) });
  }
  await page.evaluate(()=>(window as any).dryProbe.finish());assert.deepEqual(errors,[]);
  const sources=["scripts/verifyCeDryBiomeStands.mts","src/city-editor/generators/landscapeVegetation.ts","src/city-editor/generators/forestLandCover.ts","src/city-editor/renderers/openSpaceSites.ts","src/city-editor/renderers/landscapeTreeSpecies.ts","src/city3d/three/forestMeshes.ts","src/city3d/three/forestTreeDetails.ts","src/city3d/adoption.ts","src/buildings/landscape/trees.ts"];
  mkdirSync(resolve("docs/analytics"),{ recursive:true });writeFileSync(output,`${JSON.stringify({ ...setup,conditions:"9 dry biomes x 2 densities x 3 views, standard forest quality; explicit forest land-cover and saved park/cemetery selection audits. Fixed sloping terrain and clearing. No full-city/GPU timing claim. No persistent images.",sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),results,errors },null,2)}\n`);
  console.log(`Verified 54 dry biome frames and explicit land-cover/planting policies; ${setup.gpu}`);
} finally { await browser?.close();await server.close(); }
