/** P6 catalog audit against saved single-tree GPU observations; does not re-render trees. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { models } from "../src/buildings/medieval/43-landscape-treesModels";
import { TREE_QUALITIES } from "../src/buildings/landscape/treeQuality";
import { TREE_SPECIES, treeLodProfile, type TreeSpecies } from "../src/buildings/landscape/trees";
import { adoptedTree } from "../src/city3d/adoption";

const additions = [
  ["F01", "domestic_apple", "apple", "domesticApple"],
  ["F02", "european_pear", "pear", "europeanPear"],
  ["F03", "european_plum", "plum", "europeanPlum"],
  ["F04", "common_fig", "fig", "commonFig"],
  ["F05", "lemon", "lemon", "lemon"],
  ["F06", "sweet_chestnut", "chestnut", "sweetChestnut"],
  ["F07", "cacao", "cacao", "cacao"],
  ["F08", "arabica_coffee", "coffee", "arabicaCoffee"]
] as const;
const triangleLimits = { low: 500, medium: 3000, high: 25000, ultra: 120000 };
function entry(task: string, species: TreeSpecies, observation: string, factory: string, added: boolean) {
  const source = `docs/analytics/bv-${observation}-20261030.json`;
  const raw = readFileSync(source, "utf8");
  const saved = JSON.parse(raw);
  const definition = models.find(model => model.id === species.replaceAll("_", "-"))!;
  assert.ok(definition, `Missing BV definition: ${species}`);
  assert.deepEqual(saved.models.map((model: { quality: string }) => model.quality), TREE_QUALITIES);
  assert.deepEqual(saved.bvChecks.choices, TREE_QUALITIES);
  assert.deepEqual(saved.errors, []);
  assert.equal(saved.memory.afterDispose.geometries, 0);
  assert.equal(saved.memory.afterDispose.textures, 0);
  assert.equal(new Set(saved.memory.counts).size, 1);
  const lod = treeLodProfile(species)!;
  if (added) {
    assert.equal(definition.biomes, undefined);
    assert.equal(lod.selection, "pixels");
    assert.equal(lod.budget, "bounded");
  }
  const tiers = TREE_QUALITIES.map(quality => {
    const variant = adoptedTree(species, quality);
    const recorded = saved.models.find((model: { quality: string }) => model.quality === quality)!;
    assert.equal(variant.id, recorded.variant);
    assert.equal(variant.author, recorded.author);
    assert.equal(saved.bvChecks.adoption[quality], true);
    assert.equal(definition.variants!.filter(candidate => candidate.level === quality).length, 1);
    const { min, max } = recorded.bounds;
    assert.ok(Math.abs(min[1] + 0.35) < 1e-5);
    assert.ok(Math.max(Math.abs(min[0]), Math.abs(max[0])) * 2 <= definition.size[0] + 1e-5);
    assert.ok(Math.max(Math.abs(min[2]), Math.abs(max[2])) * 2 <= definition.size[1] + 1e-5);
    assert.ok(max[1] <= definition.size[2] + 1e-5);
    assert.ok(recorded.meshes <= 3 && recorded.materials <= 3);
    if (added) {
      assert.ok(recorded.triangles <= triangleLimits[quality]);
      if (quality === "high") assert.ok(recorded.bufferBytes <= 3 * 1024 * 1024);
      if (quality === "ultra") assert.ok(recorded.bufferBytes <= 13 * 1024 * 1024);
      assert.equal(variant.author, "Codex GPT-6.1 Sol");
      if (quality !== "ultra") assert.deepEqual(variant.basedOn, [adoptedTree(species, "ultra").id]);
    }
    return { ...recorded, basedOn: variant.basedOn ?? [] };
  });
  return {
    task, species, name: definition.name, added,
    factory: `src/buildings/landscape/${factory}.ts`,
    size: definition.size,
    lod: { selection: lod.selection, budget: lod.budget, heightMeters: lod.heightMeters },
    source, sourceSha256: createHash("sha256").update(raw).digest("hex"),
    tiers,
    gpu: saved.gpu,
    memory: saved.memory,
    ...(saved.nodeMediumMeasurement ? { nodeMediumMeasurement: saved.nodeMediumMeasurement } : {})
  };
}
const catalog = additions.map(([task, species, tag, factory]) => entry(task, species, `${tag}-tree-lod`, factory, true));
const reuse = [
  entry("E01", "olive", "olive-orchard-reuse", "mediterraneanMontaneTrees", false),
  entry("E02", "date_palm", "date-palm-orchard-reuse", "aridTrees", false)
];
assert.equal(catalog.length, 8);
assert.equal(catalog.reduce((n, model) => n + model.tiers.length, 0), 32);
assert.equal(TREE_SPECIES.length, 32);
const result = {
  date: "2026-10-30", addedSpecies: 8, addedTiers: 32,
  evaluatedExistingSpecies: 2, evaluatedExistingTiers: 8,
  registeredSpecies: TREE_SPECIES.length, registeredTiers: TREE_SPECIES.length * TREE_QUALITIES.length,
  scope: "Current BV registrations and adoption versus saved single-tree GPU measurements. Geometry is not regenerated; no combined scene, orchard placement, historical suitability, phenology or yield is validated.",
  catalog, reuse
};
writeFileSync("docs/analytics/bv-fruit-tree-catalog-20261030.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ addedSpecies: result.addedSpecies, addedTiers: result.addedTiers, evaluatedExistingSpecies: result.evaluatedExistingSpecies, registeredSpecies: result.registeredSpecies, registeredTiers: result.registeredTiers, checks: "passed" }));
