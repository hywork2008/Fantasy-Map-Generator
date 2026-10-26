import * as THREE from "three";
import { createRegionalHouse, defaultRegionalHouseSpec, type RegionalHouseProfile } from "../../src/buildings/houses/regionalHouses";

export function run() {
  const cases: Array<{ profile: RegionalHouseProfile; width: number; craft?: boolean; label: string }> = [
    { profile: "atlantic", width: 5, label: "Atlantic · compact home · one open pot" },
    { profile: "atlantic", width: 8, label: "Atlantic · larger home · two open pots" },
    { profile: "northern-urban", width: 5, craft: true, label: "Northern urban · workshop · octagonal pots" },
    { profile: "northern-wooded", width: 5, label: "Northern wooded · open masonry outlet" },
    { profile: "mediterranean", width: 5, label: "Mediterranean · raised tile cowl" },
    { profile: "stone-upland", width: 8, label: "Stone upland · raised stone cowl" }
  ];
  return cases.map(sample => {
    const card = document.createElement("section");
    const title = document.createElement("h2");
    title.textContent = sample.label;
    card.append(title);
    document.body.append(card);
    const spec = { ...defaultRegionalHouseSpec(sample.profile, 0), width: sample.width, depth: 8, jetty: 0, attached: true,
      groundUse: sample.craft ? "craft" as const : "residential" as const };
    const model = createRegionalHouse(spec, "high");
    const scene = new THREE.Scene();
    scene.add(model.group, new THREE.HemisphereLight(0xffffff, 0x807464, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-5, 10, 6);
    scene.add(sun);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor("#e5dfd2");
    renderer.setSize(450, 380);
    const top = new THREE.Box3().setFromObject(model.group).max.y;
    const x = spec.cover === "thatch" ? 0 : 0.7;
    const z = -8 * 0.2625;
    const camera = new THREE.OrthographicCamera(-0.85, 0.85, 0.72, -0.72, 0.1, 100);
    camera.position.set(x + 1.7, top + 1.6, z + 2.5);
    camera.lookAt(x, top - 0.4, z);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    if (gl.getError() || gl.isContextLost()) throw new Error(`Invalid chimney view: ${sample.profile}`);
    const image = document.createElement("img");
    image.src = renderer.domElement.toDataURL("image/png");
    image.style.display = "block";
    card.append(image);
    const report = { ...sample, triangles: renderer.info.render.triangles };
    model.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return report;
  });
}
