// Run from repository root, sequentially after tests: node scripts/city-editor/phase0/capture.mjs
// Fresh Vite/jsdom runner per case; artifacts are unnormalised JSON and SVG.
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {JSDOM} from 'jsdom';
import {createRunnableDevEnvironment,resolveConfig} from 'vite';
const dir=`${process.env.CE_PHASE0_OUTPUT??'artifacts/city-editor/phase0-current'}/baseline`;
fs.mkdirSync(dir,{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const cases=process.argv.slice(2);
if(!cases.length)throw Error('Pass fixture basenames, e.g. gothengsfeld-20261012');
for(const name of cases){
  if(fs.existsSync(`${dir}/${name}.result.json`))throw Error(`Baseline exists: ${name}; set CE_PHASE0_OUTPUT to a new directory`);
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
  for(const key of ['window','document','Node','Element','HTMLElement','SVGElement','DOMParser','XMLSerializer','MutationObserver','localStorage','navigator','getComputedStyle'])Object.defineProperty(globalThis,key,{value:dom.window[key],writable:true,configurable:true});
  const env=createRunnableDevEnvironment('inline',await resolveConfig({root:process.cwd(),configFile:false,envDir:false,cacheDir:process.cwd(),environments:{inline:{consumer:'server',dev:{moduleRunnerTransform:true},resolve:{external:true,mainFields:[],conditions:['node','module-sync']}}}},'serve'),{runnerOptions:{hmr:{logger:false}},hot:false});
  await env.init();
  try{
    const load=p=>env.runner.import(resolve(p));
    const {parseIncomingPayload,shareFromDescriptor}=await load('src/city-editor/services/io/incomingCity.ts');
    const {cityEditorDocument,cityEditorSettings}=await load('src/city-editor/services/analysis/housingReport.ts');
    const {generateCityOnDocument}=await load('src/city-editor/generators/generation/generateCity.ts');
    const {defaultGenerationSettings}=await load('src/city-editor/generators/generation/settings.ts');
    const {parseDocument}=await load('src/city-editor/services/io/documentCodec.ts');
    const {createGridDocument}=await load('src/city-editor/generators/document.ts');
    const {renderStandaloneCitySvg}=await load('src/city-editor/renderers/standaloneSvg.ts');
    let inputText,input,source,settings;
    if(name.startsWith('synthetic-')) {
      const variant=name.slice('synthetic-'.length);
      input={seed:'ce-phase0-20261013'};
      source=createGridDocument({size:'small',grid:'voronoi',seed:'ce-phase0-grid'});
      settings=defaultGenerationSettings();
      settings.config={...settings.config,coast:'none',rivers:[],features:{walls:true,citadel:false,plaza:true,temple:true,port:false,shanty:false}};
      if(variant==='circulade'||variant==='bram')settings.layout=variant;
      else if(variant==='double-inner'||variant==='double-outer'){settings.townWallRings='double';settings.townWallBuildOrder=variant==='double-inner'?'inner-first':'outer-first';}
      else throw Error(`Unknown synthetic case: ${variant}`);
      inputText=JSON.stringify({document:source,settings,seed:input.seed});
    } else {
      inputText=fs.readFileSync(`src/city-editor/data/fixtures/${name}.json`,'utf8');
      const raw=JSON.parse(inputText);
      if(raw.document&&raw.settings){input=raw;source=structuredClone(raw.document);settings=raw.settings;}
      else {input=raw.burg?shareFromDescriptor(raw):parseIncomingPayload(inputText);if(!input)throw Error(`Invalid share: ${name}`);source=cityEditorDocument(input);settings=cityEditorSettings(input);}
    }
    const before=JSON.stringify(source),samples=[];
    fs.writeFileSync(`${dir}/${name}.request.json.gz`,gzipSync(JSON.stringify({document:source,settings,seed:input.seed})+'\n'));
    const started=performance.now();
    const city=generateCityOnDocument(source,settings,input.seed,s=>samples.push(s));
    const generationMs=performance.now()-started;
    const json=JSON.stringify(city);let svg=null,renderMs=null,readOnly=null,roundtrip=null;
    if(city){const renderStarted=performance.now();svg=renderStandaloneCitySvg(city).outerHTML;renderMs=performance.now()-renderStarted;readOnly=JSON.stringify(city)===json;roundtrip=JSON.stringify(parseDocument(json))===json;}
    fs.writeFileSync(`${dir}/${name}.document.json.gz`,gzipSync(json+'\n'));
    if(svg)fs.writeFileSync(`${dir}/${name}.svg.gz`,gzipSync(svg));
    const repeated=generateCityOnDocument(source,settings,input.seed,()=>{});
    const result={name,seed:input.seed,inputSha256:hash(inputText),sourceSha256:hash(before),settingsSha256:hash(JSON.stringify(settings)),documentSha256:hash(json),svgSha256:svg?hash(svg):null,status:city?'generated':'rejected',generationMs,renderMs,inputUnchanged:before===JSON.stringify(source),renderReadOnly:readOnly,exactParseRoundtrip:roundtrip,repeatDocumentIdentical:JSON.stringify(repeated)===json,repeatSvgIdentical:repeated?renderStandaloneCitySvg(repeated).outerHTML===svg:null,faces:city?Object.keys(city.mesh.faces).length:null,samples,node:process.version,cpu:os.cpus()[0].model,platform:os.platform(),arch:os.arch()};
    fs.writeFileSync(`${dir}/${name}.result.json`,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({...result,samples: samples.length}));
  }catch(error){const result={name,status:'error',error:error?.stack??String(error)};fs.writeFileSync(`${dir}/${name}.result.json`,JSON.stringify(result,null,2)+'\n');console.error(JSON.stringify(result));process.exitCode=1;
  }finally{await env.close();dom.window.close();}
}
