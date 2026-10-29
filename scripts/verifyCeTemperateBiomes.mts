/** F1-4 fixed biome/temperature/terrain check. Optional previews must be outside the repository. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createServer } from "vite";

const output=resolve("docs/analytics/ce-tree-temperate-biomes-20261029.json");
const preview=process.env.CE_TREE_PREVIEW_DIR;
if (preview) {
  assert.ok(isAbsolute(preview));
  assert.ok(relative(process.cwd(),resolve(preview)).startsWith(".."),"Previews must be outside the repository");
  assert.ok(!relative(resolve(tmpdir()),resolve(preview)).startsWith(".."),"Previews must be in the OS temporary directory");
  mkdirSync(preview,{ recursive:true });
}
const keys=["temperateDeciduousForest","temperateRainforest","taiga","centralEuropeanGreatForest","temperateConiferousForest","montaneForest"];
const server=await createServer({ configFile:false,root:process.cwd(),server:{ host:"127.0.0.1",port:5220,strictPort:true } });
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
  await server.listen();browser=await chromium.launch({ headless:true,args:["--use-angle=metal"] });
  const page=await browser.newPage({ viewport:{ width:1200,height:800 },deviceScaleFactor:1 });
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{ if (m.type()==="error") errors.push(m.text()); });
  await page.addInitScript({ content:"globalThis.__name = fn => fn;" });
  await page.route("**/temperate-biomes.html",route=>route.fulfill({ contentType:"text/html",body:"<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas id='render'></canvas><canvas id='warm' style='display:none'></canvas><canvas id='cold' style='display:none'></canvas>" }));
  await page.goto("http://127.0.0.1:5220/temperate-biomes.html");
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
    if (previews) for (const id of ["warm","cold"]) { const c=document.querySelector<HTMLCanvasElement>(`#${id}`)!;c.width=1200;c.height=800;c.getContext("2d")!.fillStyle="#c5c5bf";c.getContext("2d")!.fillRect(0,0,1200,800); }
    let forest:any,city:any;
    const start=(key:string,temperatureC:number|null)=>{
      city=createDocument("ce-temperate-biomes-v1",120);
      city.generationSeed="ce-temperate-biomes-v1";
      city.biome={ id:1,key,name:key,color:"green" };
      city.buildingAppearanceContext={ period:"medieval",forest:true,arid:false,wetland:false,...(temperatureC===null?{}:{ temperatureC }) };
      city.forestSettings={ version:1,mode:"surroundings",density:"standard" };
      forest=createTownForest(city,plan,{ heightAt,relief:true },"standard");scene.add(forest.group);updateSun(sun,forest.bounds,DEFAULT_SUN);
      return Array.from({ length:64 },(_,i)=>landscapeTreeSpecies("garden_parkland",city,[17*i,23*i]));
    };
    const draw=(view:string)=>{
      camera.position.set(...(view==="overview"?[85,160,160]:view==="edge"?[60,35,100]:[25,14,45]));camera.lookAt(0,10,0);
      forest.update(camera,400);renderer.render(scene,camera);
      const points=new Set<string>(),variants=new Set<string>(),placements:any[]=[];
      let rootError=0,duplicates=0,minCrownClearance=Infinity;
      forest.group.traverse((o:any)=>{
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
      if (previews && view==="edge" && [3,3.01].includes(city.buildingAppearanceContext.temperatureC)) {
        const id=city.buildingAppearanceContext.temperatureC===3?"cold":"warm",c=document.querySelector<HTMLCanvasElement>(`#${id}`)!,ctx=c.getContext("2d")!;
        const i=keys.indexOf(city.biome.key),x=(i%3)*400,y=Math.floor(i/3)*400;
        ctx.drawImage(renderer.domElement,x,y);ctx.fillStyle="#111";ctx.font="12px system-ui";ctx.fillText(`${city.biome.key} / ${city.buildingAppearanceContext.temperatureC} C`,x+6,y+16);
      }
      const gl=renderer.getContext();if (gl.getError()!==gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error");
      return { view,...structuredClone(forest.stats),rootError,minCrownClearance,duplicates,placements:placements.sort((a,b)=>a[0].localeCompare(b[0])),visibleInstances:points.size,variants:[...variants].sort(),renderedTriangles:renderer.info.render.triangles };
    };
    const release=()=>{ scene.remove(forest.group);forest.dispose();renderer.render(scene,camera);return renderer.info.memory.geometries; };
    (window as any).temperateProbe={ start,draw,release,finish(){ renderer.dispose(); } };
    const gl=renderer.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");
    return { gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),seed:"ce-temperate-biomes-v1",areaM2:plan.areaM2,terrain:"heightAt(x,y)=5+0.05*x+0.02*y",outerSideMeters:96,holeMeters:[24,16],viewport:[400,400],dpr:1 };
  },{ keys,previews:Boolean(preview) });
  assert.ok(!/swiftshader|llvmpipe/i.test(setup.gpu));
  const results=[],placementHashes=new Map<string,string>();
  for (const key of keys) for (const temperatureC of [null,3,3.01]) {
    const species=await page.evaluate(({ key,temperatureC })=>(window as any).temperateProbe.start(key,temperatureC),{ key,temperatureC });
    const cold=temperatureC!==null && temperatureC<=3;
    const expected=key==="taiga" || (cold && ["temperateDeciduousForest","centralEuropeanGreatForest","temperateConiferousForest"].includes(key))?["norway_spruce","silver_birch"]:key==="montaneForest"?["silver_fir"]:["temperateRainforest","temperateConiferousForest"].includes(key)?["western_red_cedar"]:["garden_parkland"];
    assert.deepEqual([...new Set(species)].sort(),[...expected].sort());
    const frames=[];
    for (const view of ["overview","edge","low"]) {
      const frame=await page.evaluate(view=>(window as any).temperateProbe.draw(view),view);
      assert.ok(frame.trees>0);assert.equal(frame.trees,frame.detailedTrees);assert.equal(frame.visibleInstances,frame.trees);assert.equal(frame.duplicates,0);assert.ok(frame.rootError<0.001);assert.ok(frame.minCrownClearance>=0.099);assert.equal(frame.areaM2,setup.areaM2);
      assert.deepEqual([...frame.detailedSpecies].sort(),[...expected].sort());
      const placementSha256=createHash("sha256").update(JSON.stringify(frame.placements)).digest("hex");
      if (placementHashes.has(view)) assert.equal(placementSha256,placementHashes.get(view)); else placementHashes.set(view,placementSha256);
      delete frame.placements;frames.push({ ...frame,placementSha256 });
    }
    const geometriesAfterDispose=await page.evaluate(()=>(window as any).temperateProbe.release());assert.equal(geometriesAfterDispose,0);
    results.push({ key,temperatureC,expected,frames,geometriesAfterDispose });
  }
  if (preview) for (const id of ["warm","cold"]) {
    await page.evaluate(id=>{ document.querySelector<HTMLCanvasElement>("#render")!.style.display="none";for (const name of ["warm","cold"]) document.querySelector<HTMLCanvasElement>(`#${name}`)!.style.display=name===id?"block":"none"; },id);
    await page.screenshot({ path:resolve(preview,`${id}.png`) });
  }
  await page.evaluate(()=>(window as any).temperateProbe.finish());assert.deepEqual(errors,[]);
  const sources=["scripts/verifyCeTemperateBiomes.mts","src/city-editor/generators/landscapeVegetation.ts","src/city-editor/renderers/landscapeTreeSpecies.ts","src/city3d/three/forestMeshes.ts","src/city3d/three/forestTreeDetails.ts","src/city3d/adoption.ts","src/buildings/landscape/trees.ts"];
  mkdirSync(resolve("docs/analytics"),{ recursive:true });writeFileSync(output,`${JSON.stringify({ ...setup,conditions:"6 biomes x 3 temperature conditions x 3 views, standard forest quality. Fixed sloping terrain and clearing. No full-city/GPU timing claim. No persistent images.",sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),results,errors },null,2)}\n`);
  console.log(`Verified 54 temperate biome frames; ${setup.gpu}`);
} finally { await browser?.close();await server.close(); }
