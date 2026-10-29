/** F3-3 tropical/wet/upland ground-datum and water-exclusion check. Optional previews must be outside the repository. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createServer } from "vite";

const output=resolve("docs/analytics/ce-tree-wet-upland-biomes-20261029.json");
const preview=process.env.CE_TREE_PREVIEW_DIR;
if (preview) {
  assert.ok(isAbsolute(preview));
  assert.ok(relative(process.cwd(),resolve(preview)).startsWith(".."),"Previews must be outside the repository");
  assert.ok(!relative(resolve(tmpdir()),resolve(preview)).startsWith(".."),"Previews must be in the OS temporary directory");
  mkdirSync(preview,{ recursive:true });
}
const keys=["tropicalRainforest","wetland","alpineTundra","mangrove","cloudForest","heathMoorland","floodedForest","borealPeatland","volcanicBarrens","volcanicSoil"];
const server=await createServer({ configFile:false,root:process.cwd(),server:{ host:"127.0.0.1",port:5222,strictPort:true } });
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
  await server.listen();browser=await chromium.launch({ headless:true,args:["--use-angle=metal"] });
  const page=await browser.newPage({ viewport:{ width:1200,height:1600 },deviceScaleFactor:1 });
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{ if (m.type()==="error") errors.push(m.text()); });
  await page.addInitScript({ content:"globalThis.__name = fn => fn;" });
  await page.route("**/wet-biomes.html",route=>route.fulfill({ contentType:"text/html",body:"<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas id='render'></canvas><canvas id='warm' style='display:none'></canvas><canvas id='cold' style='display:none'></canvas>" }));
  await page.goto("http://127.0.0.1:5222/wet-biomes.html");
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
    const { meshFromCells }=await import("/src/city-editor/generators/mesh.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { buildForestPlan }=await import("/src/city-editor/generators/forestPlan.ts");
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
    let terrainKind="flat";
    const heightAt=([x,y]:number[])=>terrainKind==="flat"?5:5+x*0.05+y*0.02;
    if (previews) for (const id of ["warm","cold"]) { const c=document.querySelector<HTMLCanvasElement>(`#${id}`)!;c.width=1200;c.height=1600;c.getContext("2d")!.fillStyle="#c5c5bf";c.getContext("2d")!.fillRect(0,0,1200,1600); }
    const policyAudit=(key:string)=>{
      const doc=createDocument("ce-wet-policy-v1",100);
      doc.generationSeed="ce-wet-upland-biomes-v1";doc.biome={ id:1,key,name:key,color:"green" };
      const cells=Array.from({ length:9 },(_,id)=>{
        const x=(id%3)*20-30,y=Math.floor(id/3)*20-30;
        return { id,polygon:[[x,y],[x+20,y],[x+20,y+20],[x,y+20]],site:[x+10,y+10],centroid:[x+10,y+10],neighbors:[],onBorder:false };
      });
      doc.mesh=meshFromCells(cells);doc.featureGroups=[];doc.gates=[];doc.elements=[];
      const faces=Object.values(doc.mesh.faces) as any[];
      faces.forEach((f,i)=>Object.assign(f.properties,{ water:"land",ward:i%2?"empty":"farm",settlement:"outskirts",locked:false,elevation:1 }));
      faces[0].properties.locked=true;faces[1].properties.landCoverOverride="open";
      faces[2].properties.water="lake";faces[3].properties.water="sea";faces[4].properties.ward="park";
      Object.assign(faces[5].properties,{ ward:"empty",settlement:"core" });
      doc.waterAreas=[{ kind:"river",polygon:[[-26,14],[-14,14],[-14,26],[-26,26]] }];
      const before=JSON.stringify(doc),protectedIds=faces.slice(0,6).map(f=>f.id);
      const modes=Object.fromEntries(["legacy","farmland","surroundings"].map(mode=>{
        const changed=withForestSettings(doc,{ version:1,mode,density:"standard" }),selected=[...forestLandCover(changed)];
        if (selected.some(id=>protectedIds.includes(id))) throw new Error("Protected wet/upland face forested");
        return [mode,selected.length];
      }));
      const explicit=withForestSettings(doc,{ version:1,mode:"surroundings",density:"standard" });
      const actualPlan=buildForestPlan(explicit,{ buildings:[],farms:[],lanes:[],entrances:new Map() },{ polygons:[],discs:[] });
      const contains=(point:number[])=>actualPlan.regions.some((region:any)=>forestContains(region,point));
      const waterExcluded=!contains([-20,20]),eligibleLandRetained=contains([20,20]);
      if (!waterExcluded || !eligibleLandRetained || JSON.stringify(doc)!==before) throw new Error("Water exclusion or immutable input violated");
      const forced=withForestSettings(doc,{ version:1,mode:"legacy",density:"standard" },{ [faces[6].id]:"forest" });
      const lava={ ...forced,biome:{ ...doc.biome,key:"lavaField" } };
      return { defaultForestFaces:forestLandCover(doc).size,modes,protectedFaces:protectedIds.length,waterExcluded,eligibleLandRetained,derivedAreaM2:actualPlan.areaM2,manualForestFaces:forestLandCover(forced).size,lavaFieldForestFaces:forestLandCover(lava).size,inputPreserved:true };
    };
    let forest:any,city:any;
    const start=(key:string,temperatureC:number|null,terrain:string)=>{
      city=createDocument("ce-wet-upland-biomes-v1",120);
      city.generationSeed="ce-wet-upland-biomes-v1";
      city.biome={ id:1,key,name:key,color:"green" };
      city.buildingAppearanceContext={ period:"medieval",forest:true,arid:false,wetland:true,...(temperatureC===null?{}:{ temperatureC }) };
      terrainKind=terrain;
      city.forestSettings={ version:1,mode:"surroundings",density:"standard" };
      forest=createTownForest(city,plan,{ heightAt,relief:true },"standard");scene.add(forest.group);updateSun(sun,forest.bounds,DEFAULT_SUN);
      return { species:Array.from({ length:64 },(_,i)=>landscapeTreeSpecies("garden_parkland",city,[17*i,23*i])),policy:policyAudit(key) };
    };
    const referenceBounds=new Map<string,{ minY:number;maxY:number }>();
    const draw=(view:string)=>{
      camera.position.set(...(view==="overview"?[85,160,160]:view==="edge"?[60,35,100]:[25,14,45]));camera.lookAt(0,10,0);
      forest.update(camera,400);renderer.render(scene,camera);
      const points=new Set<string>(),variants=new Set<string>(),placements:any[]=[],candidates=new Map<string,any>();
      let rootError=0,duplicates=0,minCrownClearance=Infinity,groundDatumError=0,minBuriedY=0;
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
        const variant=adoptedTree(o.userData.forestSpecies,o.userData.treeQuality);
        if (!referenceBounds.has(variant.id)) {
          const source=variant.create(),box=new THREE.Box3().setFromObject(source.group);
          referenceBounds.set(variant.id,{ minY:box.min.y*10/box.max.y,maxY:10 });source.dispose();
        }
        o.geometry.computeBoundingBox();
        const expected=referenceBounds.get(variant.id)!;
        groundDatumError=Math.max(groundDatumError,Math.abs(o.geometry.boundingBox.min.y-expected.minY),Math.abs(o.geometry.boundingBox.max.y-expected.maxY));
        minBuriedY=Math.min(minBuriedY,o.geometry.boundingBox.min.y);
        for (let i=0;i<o.count;i++) {
          const m=new THREE.Matrix4();o.getMatrixAt(i,m);
          if (new THREE.Vector3().setFromMatrixScale(m).length()===0) continue;
          const x=m.elements[12],z=m.elements[14],key=`${x.toFixed(3)},${z.toFixed(3)}`;
          if (points.has(key)) duplicates++;points.add(key);placements.push([key,[...m.elements]]);
          if (!forestContains(region,[x,-z])) throw new Error("Tree in an opening or outside forest");
          rootError=Math.max(rootError,Math.abs(m.elements[13]-heightAt([x,-z])));
        }
      });
      if (previews && view==="edge" && city.buildingAppearanceContext.temperatureC===undefined) {
        const id=terrainKind==="flat"?"cold":"warm",c=document.querySelector<HTMLCanvasElement>(`#${id}`)!,ctx=c.getContext("2d")!;
        const i=keys.indexOf(city.biome.key),x=(i%3)*400,y=Math.floor(i/3)*400;
        ctx.drawImage(renderer.domElement,x,y);ctx.fillStyle="#111";ctx.font="12px system-ui";ctx.fillText(`${city.biome.key} / ${terrainKind}`,x+6,y+16);
      }
      const gl=renderer.getContext();if (gl.getError()!==gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error");
      return { view,...structuredClone(forest.stats),rootError,groundDatumError,minBuriedY,minCrownClearance,duplicates,candidates:[...candidates].sort((a,b)=>a[0].localeCompare(b[0])),placements:placements.sort((a,b)=>a[0].localeCompare(b[0])),visibleInstances:points.size,variants:[...variants].sort(),renderedTriangles:renderer.info.render.triangles };
    };
    const release=()=>{ scene.remove(forest.group);forest.dispose();renderer.render(scene,camera);return renderer.info.memory.geometries; };
    (window as any).wetProbe={ start,draw,release,finish(){ renderer.dispose(); } };
    const gl=renderer.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");
    return { gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),seed:"ce-wet-upland-biomes-v1",areaM2:plan.areaM2,terrain:"flat height=5; slope heightAt(x,y)=5+0.05*x+0.02*y",outerSideMeters:96,holeMeters:[24,16],viewport:[400,400],dpr:1 };
  },{ keys,previews:Boolean(preview) });
  assert.ok(!/swiftshader|llvmpipe/i.test(setup.gpu));
  const results=[],candidateHashes=new Map<string,string>();
  const expectedSpecies:Record<string,string[]>={ tropicalRainforest:["kapok"],wetland:["black_alder"],alpineTundra:["rowan"],mangrove:["red_mangrove"],cloudForest:["kapok"],heathMoorland:["rowan"],floodedForest:["black_alder"],borealPeatland:["norway_spruce","silver_birch"],volcanicBarrens:["canary_pine"],volcanicSoil:["canary_pine"] };
  for (const key of keys) for (const temperatureC of key==="floodedForest"?[null,19.99,20]:[null]) for (const terrain of ["flat","slope"]) {
    const sampled=await page.evaluate(({ key,temperatureC,terrain })=>(window as any).wetProbe.start(key,temperatureC,terrain),{ key,temperatureC,terrain });
    const expected=key==="floodedForest" && temperatureC!==null && temperatureC>=20?["kapok"]:expectedSpecies[key];
    assert.deepEqual([...new Set(sampled.species)].sort(),[...expected].sort());
    const policy=sampled.policy;
    assert.equal(policy.defaultForestFaces,0);assert.deepEqual(policy.modes,{ legacy:0,farmland:2,surroundings:3 });
    assert.equal(policy.manualForestFaces,1);assert.equal(policy.lavaFieldForestFaces,0);assert.ok(policy.waterExcluded && policy.eligibleLandRetained);
    const frames=[];
    for (const view of ["overview","edge","low"]) {
      const frame=await page.evaluate(view=>(window as any).wetProbe.draw(view),view);
      assert.ok(frame.trees>0);assert.equal(frame.trees,frame.detailedTrees);assert.equal(frame.visibleInstances,frame.trees);assert.equal(frame.duplicates,0);
      assert.ok(frame.rootError<0.001);assert.ok(frame.groundDatumError<0.00001);assert.ok(frame.minBuriedY<0);assert.ok(frame.minCrownClearance>=0.099);assert.equal(frame.areaM2,setup.areaM2);
      assert.ok(frame.detailedSpecies.every((s:string)=>expected.includes(s)));
      const candidateSha256=createHash("sha256").update(JSON.stringify(frame.candidates)).digest("hex");
      if (candidateHashes.has(terrain)) assert.equal(candidateSha256,candidateHashes.get(terrain));else candidateHashes.set(terrain,candidateSha256);
      const placementSha256=createHash("sha256").update(JSON.stringify(frame.placements)).digest("hex");
      delete frame.placements;delete frame.candidates;frames.push({ ...frame,candidateSha256,placementSha256 });
    }
    const geometriesAfterDispose=await page.evaluate(()=>(window as any).wetProbe.release());assert.equal(geometriesAfterDispose,0);
    results.push({ key,temperatureC,terrain,expected,policy,frames,geometriesAfterDispose });
  }
  if (preview) for (const id of ["warm","cold"]) {
    await page.evaluate(id=>{ document.querySelector<HTMLCanvasElement>("#render")!.style.display="none";for (const name of ["warm","cold"]) document.querySelector<HTMLCanvasElement>(`#${name}`)!.style.display=name===id?"block":"none"; },id);
    await page.screenshot({ path:resolve(preview,`${id}.png`) });
  }
  await page.evaluate(()=>(window as any).wetProbe.finish());assert.deepEqual(errors,[]);
  const sources=["scripts/verifyCeWetUplandBiomes.mts","src/city-editor/generators/landscapeVegetation.ts","src/city-editor/generators/forestLandCover.ts","src/city-editor/generators/forestPlan.ts","src/city-editor/renderers/openSpaceSites.ts","src/city-editor/renderers/landscapeTreeSpecies.ts","src/city3d/three/forestMeshes.ts","src/city3d/three/forestTreeDetails.ts","src/city3d/adoption.ts","src/buildings/landscape/trees.ts"];
  mkdirSync(resolve("docs/analytics"),{ recursive:true });writeFileSync(output,`${JSON.stringify({ ...setup,conditions:"10 wet/upland biomes; flooded-forest temperature boundary; flat and sloping terrain x3 views =72 frames. Ground datum and below-ground roots preserved; real plan water exclusion. Fixed sloping terrain and clearing. No full-city/GPU timing claim. No persistent images.",sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),results,errors },null,2)}\n`);
  console.log(`Verified 72 wet/upland biome frames, ground datums and water exclusion; ${setup.gpu}`);
} finally { await browser?.close();await server.close(); }
