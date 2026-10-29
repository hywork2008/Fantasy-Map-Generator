/** F5-5: actual CE controls, editable JSON, history, 2D/3D and local display state. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve("docs/analytics/ce-tree-persistence-20261029");
const raw = resolve("docs/analytics/raw/ce-tree-persistence-20261029");
mkdirSync(output,{ recursive: true }); mkdirSync(raw,{ recursive: true });
const inputPath = "docs/analytics/raw/ce-forest-f0/small-flat.json";
const inputBytes = readFileSync(inputPath);
const input = JSON.parse(inputBytes.toString());
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5218, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen(); browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.goto("http://127.0.0.1:5218/src/city-editor/index.html");
  await page.locator(".ce-map svg").waitFor();
  const setup = await page.evaluate(async original => {
    // @ts-expect-error Browser-only Vite module URL.
    const { editorText } = await import("/src/i18n/editorMessages.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { withForestSettings } = await import("/src/city-editor/generators/forestLandCover.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { landscapeTreeSpecies } = await import("/src/city-editor/renderers/landscapeTreeSpecies.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree } = await import("/src/city3d/adoption.ts");
    const city = withForestSettings(original,{ version: 1, mode: "surroundings", density: "standard" });
    const next = () => new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)))),b=>b.toString(16).padStart(2,"0")).join("");
    const click = (key: string) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.getAttribute("aria-label") === editorText(key));
      if (!button || button.disabled) throw new Error(`Unavailable action: ${key}`); button.click();
    };
    let lastBlob: Blob | undefined;
    URL.createObjectURL = blob => { lastBlob = blob as Blob; return "blob:persistence-check"; };
    URL.revokeObjectURL = () => {}; HTMLAnchorElement.prototype.click = () => {};
    const save = async () => { click("cityEditor.messages.exportEditableCityMapJSON"); return await lastBlob!.text(); };
    const drop = async (saved: unknown) => {
      const transfer = new DataTransfer(); transfer.items.add(new File([typeof saved === "string" ? saved : JSON.stringify(saved)],"tree-state.json",{ type: "application/json" }));
      document.querySelector(".ce-map")!.dispatchEvent(new DragEvent("drop",{ dataTransfer: transfer,bubbles: true,cancelable: true }));
      await new Promise(resolve=>setTimeout(resolve,500)); await next();
    };
    const select = async (selector: string,value: string) => {
      const control = document.querySelector<HTMLSelectElement>(selector)!;
      if (!control || control.disabled) throw new Error(`Unavailable control ${selector}`);
      control.value = value; control.dispatchEvent(new Event("change",{ bubbles: true })); await next();
    };
    const performance = async () => {
      await next(); const panel = document.querySelector<HTMLDetailsElement>(".ce-performance")!;
      panel.open = true; panel.dispatchEvent(new Event("toggle")); panel.querySelector<HTMLButtonElement>("button")!.click();
      return JSON.parse(await lastBlob!.text());
    };
    const initialMesh = await digest(city.mesh),initialElements = await digest(city.elements);
    const snapshots: any[] = [], savedFiles: Record<string,string> = {};
    const capture = async (label: string) => {
      const text = await save(), saved = JSON.parse(text), metric = await performance();
      const authors = document.querySelector<HTMLDetailsElement>(".ce-model-authors")!;
      authors.open = true; authors.dispatchEvent(new Event("toggle"));
      const treeAuthors = [...authors.querySelectorAll("h3")].flatMap(heading=>
        [...heading.nextElementSibling!.querySelectorAll("li")].filter(item=>item.textContent?.startsWith("tree.")).map(item=>({ author: heading.textContent, model: item.textContent })));
      const forest = metric.three?.forest ?? null;
      const species = [...new Set(Array.from({ length:64 },(_,i)=>landscapeTreeSpecies("garden_parkland",saved,[17*i,23*i])))].filter(Boolean).sort();
      const meshPreserved = await digest(saved.mesh) === initialMesh, elementsPreserved = await digest(saved.elements) === initialElements;
      if (!meshPreserved || !elementsPreserved) throw new Error(`Changed layout at ${label}`);
      if (saved.fabric?.generation && saved.fabric.generation.input.biome?.key !== saved.biome?.key) throw new Error(`Stale recipe biome at ${label}`);
      if (saved.forestSettings.mode !== "surroundings" || saved.forestSettings.density !== "standard") throw new Error(`Lost forest settings at ${label}`);
      if (/#(?:codex|claude)-|CE_ADOPTION|modelVariants|forestQuality|treeQuality/.test(text)) throw new Error(`Leaked display metadata at ${label}`);
      for (const entry of treeAuthors) {
        const [family,tier] = entry.model!.split(" · ");
        const species = family.slice(5).replaceAll("-","_");
        if (!entry.author!.startsWith(adoptedTree(species,tier).author)) throw new Error(`Wrong author ${entry.model}`);
      }
      const svgArea = Number(document.querySelector(".ce-forest-layer")?.getAttribute("data-forest-area-m2") ?? 0);
      const result = { label, biome: saved.biome?.key ?? null, qualityPreference: document.querySelector<HTMLSelectElement>(".ce-forest-quality")!.value, representation: document.querySelector<HTMLSelectElement>(".ce-forest-representation")!.value, forest, svgArea, species, treeAuthors, meshPreserved, elementsPreserved, documentSha256: await digest(text), generationSettingsSha256: await digest(saved.fabric?.generation?.settings ?? null), version: saved.version };
      snapshots.push(result); if (["taiga","glacier","final"].includes(label)) savedFiles[label] = text;
      return result;
    };
    await drop(city);
    await select(".ce-forest-quality","light");
    document.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click(); await next();
    const canvas = document.querySelector<HTMLCanvasElement>(".ce-3d-canvas")!,gl = canvas.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    (window as any).treePersistence = { next,click,save,drop,select,capture,snapshots,savedFiles,performance };
    return { gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), inputMeshSha256: initialMesh,inputElementsSha256: initialElements };
  },input);
  assert.ok(!/swiftshader|llvmpipe/i.test(setup.gpu));
  const states: any[] = [];
  const capture = async (label: string) => {
    const r = await page.evaluate(label=>(window as any).treePersistence.capture(label),label); states.push(r); return r;
  };
  await capture("initial");
  for (const key of ["taiga","temperateRainforest","temperateConiferousForest","hotDesert","taiga","glacier"]) {
    await page.evaluate(key=>(window as any).treePersistence.select(".ce-biome",key),key);
    const r = await capture(key); assert.equal(r.biome,key); assert.equal(r.qualityPreference,"light");
    if (key === "glacier") { assert.equal(r.forest,null); assert.equal(r.svgArea,0); assert.deepEqual(r.species,[]); assert.deepEqual(r.treeAuthors,[]); }
    else { assert.ok(r.forest?.detailedTrees > 0); for (const species of r.forest.detailedSpecies) assert.ok(r.species.includes(species)); }
  }
  await page.evaluate(async()=>{ const p=(window as any).treePersistence;p.click("cityEditor.messages.undo");await p.next(); });
  const undo = await capture("undo-glacier"); assert.equal(undo.biome,"taiga"); assert.ok(undo.forest?.detailedTrees > 0);
  await page.evaluate(async()=>{ const p=(window as any).treePersistence;p.click("cityEditor.messages.redo");await p.next(); });
  const redo = await capture("redo-glacier"); assert.equal(redo.biome,"glacier"); assert.equal(redo.forest,null);
  await page.evaluate(async()=>{ const p=(window as any).treePersistence;await p.drop(p.savedFiles.glacier); });
  assert.equal((await capture("reload-glacier")).forest,null);
  await page.evaluate(async()=>{ const p=(window as any).treePersistence;await p.drop(p.savedFiles.taiga); });
  const restored = await capture("reload-taiga"); assert.equal(restored.biome,"taiga"); assert.ok(restored.forest?.detailedTrees > 0);
  const localDisplay = await page.evaluate(async()=>{
    const p=(window as any).treePersistence,before=await p.save();
    for (const quality of ["high","auto","standard","light"]) await p.select(".ce-forest-quality",quality);
    await p.select(".ce-forest-representation","all-trees");
    document.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click(); await p.next();
    document.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click(); await p.next();
    const after=await p.save(); return { documentUnchanged: before === after };
  });
  assert.equal(localDisplay.documentUnchanged,true);
  await capture("final");
  await page.screenshot({ path: resolve(output,"taiga-restored.png") });
  const savedFiles = await page.evaluate(()=>(window as any).treePersistence.savedFiles);
  const savedRecords = Object.entries(savedFiles).map(([name,text])=>{
    const path=resolve(raw,`${name}.json`);writeFileSync(path,text as string);
    return { path: path.replace(process.cwd()+"/",""),bytes: Buffer.byteLength(text as string),sha256:createHash("sha256").update(text as string).digest("hex") };
  });
  await page.reload();await page.locator(".ce-forest-quality").waitFor({ state:"attached" });
  assert.equal(await page.locator(".ce-forest-quality").inputValue(),"light");
  assert.equal(await page.locator(".ce-forest-representation").inputValue(),"all-trees");
  assert.deepEqual(errors,[]);
  assert.equal(new Set(states.map(state=>state.generationSettingsSha256)).size,1);
  for (const state of states) {
    assert.equal(state.version,6);
    if (state.forest) {
      assert.equal(state.forest.quality,state.qualityPreference);
      assert.equal(state.forest.areaM2,state.svgArea);
      assert.equal(state.forest.detailedTiers.low,state.forest.trees);
    }
  }
  const taigaHash=states.find(state=>state.label === "taiga").documentSha256;
  const glacierHash=states.find(state=>state.label === "glacier").documentSha256;
  for (const label of ["undo-glacier","reload-taiga","final"]) assert.equal(states.find(state=>state.label === label).documentSha256,taigaHash);
  for (const label of ["redo-glacier","reload-glacier"]) assert.equal(states.find(state=>state.label === label).documentSha256,glacierHash);
  const sources=["scripts/verifyCeTreePersistence.mts","src/city-editor/components/biomeControls.ts","src/city-editor/generators/cityBiome.ts","src/city-editor/generators/history.ts","src/city-editor/services/io/documentCodec.ts","src/city-editor/renderers/cityView.ts","src/city3d/three/forestTreeDetails.ts","src/city3d/adoption.ts"];
  writeFileSync(resolve(output,"results.json"),`${JSON.stringify({ conditions:"Actual CE UI: fixed small city, biome changes, undo/redo, editable JSON, 3D reopening and page-local display preferences. No performance claim.",...setup,input:{ path:inputPath,bytes:inputBytes.length,sha256:createHash("sha256").update(inputBytes).digest("hex") },sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),states,localDisplay,savedRecords,reloadPreferences:{ quality:"light",representation:"all-trees" },errors },null,2)}\n`);
  console.log(`Verified ${states.length} CE persistence states; ${setup.gpu}`);
} finally { await browser?.close();await server.close(); }
