import { decodeShare } from "../src/city-editor/io/incomingCity";
import { createGridDocument } from "../src/city-editor/core/document";
import { generateCityAttempt } from "../src/city-editor/core/generate";
import { renderCemeteries } from "../src/city-editor/render/svg";

// Setup minimal DOM polyfill for SVG element creation if needed
if (!globalThis.document) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as any;
}

const hash = "eyJraW5kIjoiZm1nLWNpdHktZWRpdG9yLXNoYXJlIiwidmVyc2lvbiI6MSwic2VlZCI6IjFsbTVrN2siLCJncmlkIjoiZXZvbHV0aW9uIiwic2l6ZSI6InRpbnkiLCJzZXR0aW5ncyI6eyJjb25maWciOnsiY29hc3QiOiJub25lIiwicml2ZXJzIjpbInRocm91Z2giXSwicmVsaWVmIjpmYWxzZSwiZmVhdHVyZXMiOnsid2FsbHMiOnRydWUsInBsYXphIjp0cnVlLCJ0ZW1wbGUiOnRydWUsImNpdGFkZWwiOmZhbHNlLCJwb3J0IjpmYWxzZSwic2hhbnR5Ijp0cnVlfSwid2FsbCI6eyJlbnZlbG9wZSI6ImF1dG8iLCJjb2FzdCI6ImF1dG8iLCJsaW5lIjoiYXV0byJ9LCJsYXlvdXQiOiJvcmdhbmljIn0sInN0cmVldHMiOnsiZmFyTm9kZSI6ImRlc2NyaXB0b3JFbmQiLCJhdm9pZFNlYSI6dHJ1ZSwiZm9sZFNtb290aGluZyI6dHJ1ZX0sImJ1aWxkaW5nUGF0dGVybiI6Im1lZGlldmFsIiwiaGlzdG9yaWNhbFBlcmlvZCI6InByZUluZHVzdHJpYWxFcmEiLCJsYXlvdXQiOiJvcmdhbmljIiwid2FsbGVkQXJlYVNoYXJlIjoxfSwiZ3JpZFNlZWQiOiJkbW9ncHkiLCJwYXRjaFBhcmFtcyI6eyJuUGF0Y2hlcyI6MTUsInJlbGF4Q291bnQiOjQsInJlbGF4UGFzc2VzIjozfX0";

const share = decodeShare(hash)!;
const baseDoc = createGridDocument({
  size: share.size,
  seed: share.gridSeed ?? share.seed,
  grid: share.grid,
  patchParams: share.patchParams
});

const generated = generateCityAttempt(baseDoc, share.settings, share.seed)!;

const svgElem = renderCemeteries(generated);
console.log("Cemeteries SVG child elements count:", svgElem.children.length);
for (let i = 0; i < svgElem.children.length; i++) {
  const g = svgElem.children[i];
  console.log(`Cemetery group #${i}: tag=${g.tagName}, class=${g.getAttribute("class")}, inner elements=${g.children.length}`);
  const rects = g.querySelectorAll("rect");
  console.log(`  Number of rects (graves/slabs): ${rects.length}`);
  const paths = g.querySelectorAll("path");
  console.log(`  Number of paths (walls, courtyards, paths, parts): ${paths.length}`);
}
