/** Records the pinned, unmodified master oracle in a temporary source tree. Never rewrites fixtures implicitly. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commit = "8622cd2449a0ce93ec6d8409a7437ef54864802b";
const outputArg = process.argv.indexOf("--output");
if (outputArg < 0 || !process.argv[outputArg + 1]) throw Error("Usage: node --import tsx scripts/recordMasterCharacterFixture.mts --output /tmp/master-character-oracle.json");
const output = resolve(process.argv[outputArg + 1]);
if (output === join(root,"tests/fixtures/master-character-opening.json")) throw Error("Record separately and review before replacing the checked-in expectation");
const temp = await mkdtemp(join(tmpdir(), "fmg-master-character-oracle-"));
try {
  const archive = execFileSync("git", ["archive",commit,"src","package.json","tsconfig.json"], {cwd:root,maxBuffer:64*1024*1024});
  const unpack = spawnSync("tar",["-x","-C",temp],{input:archive});
  if (unpack.status !== 0) throw Error(String(unpack.stderr));
  await symlink(join(root,"node_modules"),join(temp,"node_modules"),"dir");
  const program = `
import {readFileSync,writeFileSync} from "node:fs";
import {createNodeSimulationHost} from "./src/simulation/adapters/node.ts";
import {worldRuntime} from "./src/runtime/worldRuntime.ts";
import {ChunkedWorldCodecAdapter} from "./src/runtime/worldArchive.ts";
import {optionsStore} from "./src/state/optionsStore.ts";
import {uiPreferencesStore} from "./src/state/uiPreferencesStore.ts";
const [metaPath,inputPath,output,fantasy]=process.argv.slice(2);
const meta=JSON.parse(readFileSync(metaPath,"utf8"));
if(fantasy==="true")meta.options.culturesSet="highFantasy";
const host=createNodeSimulationHost({extensions:meta.extensions,settings:meta.settings});
try{
const bytes=readFileSync(inputPath);
const decoded=await new ChunkedWorldCodecAdapter().decode({blob:new Blob([bytes]),header:bytes.subarray(0,4)});
worldRuntime.restoreRollbackDocument(decoded.document);
optionsStore.setState(meta.options);uiPreferencesStore.setState(meta.preferences);
await host.prepare({all:true});
const summary=host.api.simulationContext.extensions.characters.characters.map(c=>({i:c.i,name:c.name,age:c.age,gender:c.gender,race:c.race,wealth:c.wealth,family:c.family,titles:c.titles,roles:c.roles}));
writeFileSync(output,JSON.stringify(summary));
}finally{host.dispose();}
`;
  await writeFile(join(temp,"oracle.mts"),program);
  const recorded: Record<string,unknown> = {masterCommit:commit};
  for (const [key,fantasy] of [["expected",false],["expectedFantasy",true]] as const) {
    const result = join(temp,`${key}.json`);
    const child = spawnSync(process.execPath,["--import","tsx",join(temp,"oracle.mts"),join(root,"tests/fixtures/master-character-opening.json"),join(root,"tests/fixtures/master-character-opening.fmg"),result,String(fantasy)],{cwd:root,stdio:["ignore","inherit","inherit"]});
    if(child.status!==0)throw Error(`Master oracle failed (${key})`);
    recorded[key]=JSON.parse(await readFile(result,"utf8"));
  }
  await writeFile(output,JSON.stringify(recorded,null,2)+"\n");
  console.log(`Recorded ${commit} to ${output}`);
}finally{await rm(temp,{recursive:true,force:true});}
