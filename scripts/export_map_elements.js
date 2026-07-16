#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

function usage() {
  console.error('Usage: node scripts/fmg/export_map_elements.mjs <mapfile> [--out-dir=out/parts] [--pretty]');
  process.exit(2);
}

function tryParseJSON(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

function decodeIfNeeded(content) {
  // if content is base64 encoded string without '|' delimiter, try decode
  const head = content.substring(0, 10);
  const isDelimited = head.includes('|');
  if (isDelimited) return content;
  try {
    return decodeURIComponent(Buffer.from(content, 'base64').toString('utf8'));
  } catch (e) {
    return content;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return usage();
  const infile = argv[0];
  const opts = { outDir: null, pretty: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--out-dir=')) opts.outDir = a.split('=')[1];
    else if (a === '--pretty') opts.pretty = true;
  }

  const outDir = opts.outDir || path.join(path.dirname(infile), 'map_parts');
  const raw = await fs.readFile(infile, 'utf8');

  // Try to decode if needed (mimic load.js behavior)
  let content = decodeIfNeeded(raw);

  // Fix CRLF inside SVG to ensure SVG stays in one element after split
  const svgMatch = content.match(/<svg[^>]*id="map"[\s\S]*?<\/svg>/);
  if (svgMatch && svgMatch[0].includes('\r\n')) {
    const corrected = svgMatch[0].replace(/\r\n/g, '\n');
    content = content.replace(svgMatch[0], corrected);
  }

  // split by CRLF as in save/load
  const sep = content.includes('\r\n') ? '\r\n' : '\n';
  const mapData = content.split('\r\n');

  // mapping indices to friendly names (based on save.js / load.js ordering)
  const mapping = {
    0: 'params.txt',
    1: 'settings.txt',
    2: 'coords.json',
    3: 'biomes.txt',
    4: 'notes.json',
    5: 'map.svg',
    6: 'grid.json',
    7: 'grid.cells.h.csv',
    8: 'grid.cells.prec.csv',
    9: 'grid.cells.f.csv',
    10: 'grid.cells.t.csv',
    11: 'grid.cells.temp.csv',
    12: 'features.json',
    13: 'cultures.json',
    14: 'states.json',
    15: 'burgs.json',
    16: 'cells.biome.csv',
    17: 'cells.burg.csv',
    18: 'cells.conf.csv',
    19: 'cells.culture.csv',
    20: 'cells.fl.csv',
    21: 'cells.pop.csv',
    22: 'cells.r.csv',
    23: 'deprecated.23.txt',
    24: 'cells.s.csv',
    25: 'cells.state.csv',
    26: 'cells.religion.csv',
    27: 'cells.province.csv',
    28: 'deprecated.28.txt',
    29: 'religions.json',
    30: 'provinces.json',
    31: 'names.raw.txt',
    32: 'rivers.json',
    33: 'rulers.txt',
    34: 'fonts.json',
    35: 'markers.json',
    36: 'cells.routes.json',
    37: 'routes.json',
    38: 'zones.json',
    39: 'ice.json'
  };

  await fs.mkdir(outDir, { recursive: true });
  const written = [];

  for (let i = 0; i < mapData.length; i++) {
    const rawEntry = mapData[i];
    const name = mapping[i] || `index_${i}.txt`;
    const filename = path.join(outDir, `${String(i).padStart(2,'0')}_${name}`);

    // Decide how to write the entry
    if (i === 5) {
      // SVG content: write as-is
      await fs.writeFile(filename, rawEntry, 'utf8');
    } else if ([2,4,6,12,13,14,15,29,30,32,34,35,36,37,38,39].includes(i)) {
      // JSON blobs: try to parse and pretty-print
      const parsed = tryParseJSON(rawEntry);
      if (parsed !== null) {
        await fs.writeFile(filename.replace(/\.[a-z]+$/,'') + '.json', JSON.stringify(parsed, null, opts.pretty ? 2 : 0), 'utf8');
      } else {
        await fs.writeFile(filename, rawEntry, 'utf8');
      }
    } else if ([7,8,9,10,11,16,17,18,19,20,21,22,24,25,26,27].includes(i)) {
      // numeric arrays stored as comma-separated lists - convert to JSON array for convenience
      const arr = rawEntry.split(',').map(s => {
        const n = Number(s);
        return Number.isNaN(n) ? s : n;
      });
      await fs.writeFile(filename.replace(/\.[a-z]+$/,'') + '.json', JSON.stringify(arr, null, opts.pretty ? 2 : 0), 'utf8');
    } else {
      // default: write raw
      await fs.writeFile(filename, rawEntry, 'utf8');
    }
    written.push(filename);
  }

  console.log(`Wrote ${written.length} entries to ${outDir}`);
  for (const w of written) console.log(' -', w);
}

main().catch(e => { console.error(e); process.exit(1); });
