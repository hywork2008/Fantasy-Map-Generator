import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceDir = resolve(root, "docs/data/city-landmarks/sources");
const manifest = JSON.parse(readFileSync(resolve(sourceDir, "manifest.json"), "utf8"));
const assets = manifest.items.map(item => ({
  source: item.localOriginal,
  ...JSON.parse(readFileSync(resolve(root, `src/city-editor/assets/${item.assetId}.json`), "utf8"))
}));
const initial = {
  "pantheon-prototype": {x: 875, y: 900, scale: 30, angle: 0},
  "san-vitale-prototype": {x: 146, y: 71, scale: 2.1, angle: 90},
  "chartres-prototype": {x: 278, y: 464, scale: 6.7, angle: 0}
};
const payload = JSON.stringify({assets, initial}).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>歴史建築の原図照合</title>
<style>
  body {font: 15px/1.5 system-ui, sans-serif; margin: 1.5rem; color: #222; background: #f2f1ed}
  h1 {margin-bottom: .25rem} p {margin-top: .25rem}
  section {background: white; margin: 1.5rem 0; padding: 1rem; border: 1px solid #bbb}
  .controls {display: flex; flex-wrap: wrap; gap: .7rem 1.2rem; margin: 1rem 0}
  label {display: flex; align-items: center; gap: .4rem}
  input[type=number] {width: 5.5rem}
  .viewer {position: relative; width: min(100%, 900px); border: 1px solid #777; background: white}
  .viewer img {display: block; width: 100%; height: auto}
  .viewer svg {position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none}
  .legend {font-size: .9rem}
</style>
<h1>歴史建築の原図照合</h1>
<p>段階0の手動確認用です。青＝建物輪郭、橙＝必要敷地、赤＝入口。原図をクリックすると元画像のピクセル座標を表示します。変換値は初期目安で、確定したトレース座標ではありません。</p>
<main id="reviews"></main>
<script type="module">
const {assets, initial} = ${payload};
const main = document.getElementById("reviews");
for (const asset of assets) {
  const section = document.createElement("section");
  const title = document.createElement("h2");
  title.textContent = asset.name;
  section.append(title);
  if (asset.id === "chartres-prototype") {
    const artLink = document.createElement("a");
    artLink.href = "chartres-roof-study.svg";
    artLink.textContent = "屋根・尖塔・支柱の試作SVGを開く";
    section.append(artLink);
  }
  const controls = document.createElement("div");
  controls.className = "controls";
  const settings = {...initial[asset.id], opacity: 0.65};
  for (const [key, label, step] of [["x", "中心X", 1], ["y", "中心Y", 1], ["scale", "倍率", 0.1], ["angle", "角度", 1], ["opacity", "不透明度", 0.05]]) {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.value = String(settings[key]);
    input.addEventListener("input", () => {settings[key] = Number(input.value); render();});
    wrapper.append(input);
    controls.append(wrapper);
  }
  section.append(controls);
  const viewer = document.createElement("div");
  viewer.className = "viewer";
  const image = document.createElement("img");
  image.src = asset.source;
  image.alt = asset.name + " 原図";
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  viewer.append(image, overlay);
  section.append(viewer);
  const picked = document.createElement("p");
  picked.textContent = "原図上の点をクリックすると座標を表示します。";
  section.append(picked);
  viewer.addEventListener("click", event => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const bounds = image.getBoundingClientRect();
    const x = Math.round((event.clientX - bounds.left) * image.naturalWidth / bounds.width);
    const y = Math.round((event.clientY - bounds.top) * image.naturalHeight / bounds.height);
    picked.textContent = "原図の座標: (" + x + ", " + y + ") px";
  });
  const legend = document.createElement("p");
  legend.className = "legend";
  legend.textContent = "実寸参照: " + asset.dimensionSource;
  section.append(legend);
  main.append(section);
  image.addEventListener("load", render);
  function render() {
    if (!image.naturalWidth || !image.naturalHeight) return;
    overlay.setAttribute("viewBox", "0 0 " + image.naturalWidth + " " + image.naturalHeight);
    const transform = "translate(" + settings.x + " " + settings.y + ") rotate(" + settings.angle + ") scale(" + settings.scale + " " + -settings.scale + ")";
    const polygon = (part, color) => {
      const outer = part.outer.map(point => point.join(",")).join(" ");
      return '<polygon points="' + outer + '" fill="none" stroke="' + color + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/>';
    };
    const entrance = point => '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="' + 5 / settings.scale + '" fill="#d62230"/>';
    overlay.innerHTML = '<g opacity="' + settings.opacity + '" transform="' + transform + '">' + asset.minimumSite.map(part => polygon(part, "#e77e00")).join("") + asset.footprint.map(part => polygon(part, "#0066cf")).join("") + asset.entrances.map(item => entrance(item.point)).join("") + '</g>';
  }
}
</script>
</html>
`;
const output = resolve(sourceDir, "review.html");
writeFileSync(output, html);
const chartres = assets.find(asset => asset.id === "chartres-prototype");
if (chartres) writeFileSync(resolve(sourceDir, "chartres-roof-study.svg"), chartres.renderSvg);
console.log(output);
