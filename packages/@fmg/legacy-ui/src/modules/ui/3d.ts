import { layerIsOn, toggleBurgIcons, toggleLabels } from "./layers";
import { tip } from "./general";
import { getMapURL } from "../io/export";
import { cloudImage } from "./cloud-image";

export const ThreeD = (function () {
  const options = {
    scale: 50,
    lightness: 0.6,
    shadow: 0.5,
    sun: { x: 100, y: 800, z: 1000 },
    rotateMesh: 0,
    rotateGlobe: 0.5,
    skyColor: "#9ecef5",
    waterColor: "#466eab",
    sunColor: "#cccccc",
    extendedWater: false,
    labels3d: false,
    wireframe: false,
    resolution: 2,
    resolutionScale: 2048,
    subdivide: false,
    isGlobe: false as boolean,
    isOn: false as boolean
  };

  // set variables
  let Renderer,
    scene,
    camera,
    controls,
    animationFrame,
    material,
    texture,
    geometry,
    mesh,
    ambientLight,
    spotLight,
    waterPlane,
    waterMaterial,
    waterMesh,
    raycaster;

  let labels = [];
  let icons = [];
  let lines = [];
  let gridToPackCellMap = null; // Map from grid cell index to pack cell index

  const context2d = document.createElement("canvas").getContext("2d");

  // initiate 3d scene
  const create = async function (canvas, type = "viewMesh") {
    options.isOn = true;
    options.isGlobe = type === "viewGlobe";
    return options.isGlobe ? newGlobe(canvas) : newMesh(canvas);
  };

  // redraw 3d scene
  const redraw = function () {
    deleteLabels();
    scene.remove(mesh);
    Renderer.setSize(Renderer.domElement.width, Renderer.domElement.height);
    // For globe view we must recreate/add the sphere mesh after removing it.
    // Ensure updateGlobeTexure is requested to also add the mesh when needed.
    if (options.isGlobe) updateGlobeTexure(true);
    else createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);
    render();
  };

  // update 3d texture
  const update = function () {
    if (options.isGlobe) updateGlobeTexure();
    else update3dTexture();
  };

  // try to clean the memory as much as possible
  const stop = function () {
    if (controls) controls.dispose();
    cancelAnimationFrame(animationFrame);
    if (texture) texture.dispose();
    if (geometry) geometry.dispose();
    if (material) material.dispose();
    if (waterPlane) waterPlane.dispose();
    if (waterMaterial) waterMaterial.dispose();
    deleteLabels();

    Renderer.renderLists.dispose();
    Renderer.dispose();
    scene.remove(mesh);
    scene.remove(spotLight);
    scene.remove(ambientLight);
    scene.remove(waterMesh);

    Renderer = undefined;
    scene = undefined;
    controls = undefined;
    camera = undefined;
    material = undefined;
    texture = undefined;
    geometry = undefined;
    mesh = undefined;

    ThreeD.options.isOn = false;
  };

  const setScale = function (scale) {
    options.scale = scale;
    if (!geometry) return;
    let vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      vertices.setZ(i, getMeshHeight(i));
    }
    geometry.setAttribute("position", vertices);
    geometry.verticesNeedUpdate = true;
    geometry.computeVertexNormals();
    geometry.verticesNeedUpdate = false;

    redraw();
  };

  const setSunColor = function (color) {
    options.sunColor = color;
    if (!spotLight) return;
    spotLight.color = new THREE.Color(color);
    render();
  };

  const setResolutionScale = function (scale) {
    options.resolutionScale = scale;
    if (!scene) return;
    redraw();
  };

  const setLightness = function (intensity) {
    options.lightness = intensity;
    if (!ambientLight) return;
    ambientLight.intensity = intensity;
    render();
  };

  const setSun = function (x, y, z) {
    options.sun = { x, y, z };
    if (!spotLight) return;
    spotLight.position.set(x, y, z);
    render();
  };

  const setRotation = function (speed) {
    if (options.isGlobe) options.rotateGlobe = speed;
    else options.rotateMesh = speed;
    if (!controls) return;
    controls.autoRotateSpeed = speed;

    const startAnimation = !controls.autoRotate && Boolean(speed);
    const endAnimation = controls.autoRotate && !Boolean(speed);

    controls.autoRotate = Boolean(speed);

    if (startAnimation) animate();
    if (endAnimation) cancelAnimationFrame(animationFrame);
  };

  const toggleSky = function () {
    if (!scene) return;
    if (options.extendedWater) {
      scene.background = null;
      scene.fog = null;
      scene.remove(waterMesh);
    } else extendWater(graphWidth, graphHeight);

    options.extendedWater = !options.extendedWater;
    redraw();
  };

  const toggleLabels = function () {
    options.labels3d = !options.labels3d;
    if (!scene) return;

    if (options.labels3d) {
      createLabels().then(() => update());
    } else {
      deleteLabels();
      update();
    }
  };

  const toggle3dSubdivision = function () {
    options.subdivide = !options.subdivide;
    if (!scene) return;
    redraw();
  };

  const toggleWireframe = function () {
    options.wireframe = !options.wireframe;
    if (!scene) return;
    redraw();
  };

  const setColors = function (sky, water) {
    options.skyColor = sky;
    if (!scene || !waterMaterial) return;
    scene.background = scene.fog.color = new THREE.Color(sky);
    options.waterColor = water;
    waterMaterial.color = new THREE.Color(water);
    render();
  };

  // Time of day presets
  const timeOfDayPresets = {
    dawn: {
      sun: { x: -500, y: 400, z: 800 },
      sunColor: "#ff9a56",
      lightness: 0.4,
      skyColor: "#ffccaa",
      waterColor: "#2d4d6b"
    },
    noon: {
      sun: { x: 100, y: 800, z: 1000 },
      sunColor: "#cccccc",
      lightness: 0.6,
      skyColor: "#9ecef5",
      waterColor: "#466eab"
    },
    evening: {
      sun: { x: 500, y: 400, z: 800 },
      sunColor: "#ff6b35",
      lightness: 0.5,
      skyColor: "#ff8c42",
      waterColor: "#1e3a52"
    },
    night: {
      sun: { x: 0, y: -500, z: 1000 },
      sunColor: "#4a5568",
      lightness: 0.2,
      skyColor: "#1a1a2e",
      waterColor: "#0f1419"
    }
  };

  const setTimeOfDay = function (presetName) {
    const preset = timeOfDayPresets[presetName];
    if (!preset) return;

    setSun(preset.sun.x, preset.sun.y, preset.sun.z);
    setSunColor(preset.sunColor);
    setLightness(preset.lightness);
    if (options.extendedWater) setColors(preset.skyColor, preset.waterColor);
  };

  const setResolution = function (resolution) {
    options.resolution = resolution;
    if (!scene) return;
    update();
  };

  // download screenshot
  const saveScreenshot = async function () {
    const URL = Renderer.domElement.toDataURL("image/jpeg");
    const link = document.createElement("a");
    link.download = getFileName() + ".jpeg";
    link.href = URL;
    link.click();
    tip(`Screenshot is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
    window.setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
  };

  const saveOBJ = async function () {
    const objexporter = await OBJExporter();
    const obj = await objexporter.parse(mesh);

    downloadFile(obj, getFileName() + ".obj", "text/plain;charset=UTF-8");
  };

  // start 3d view and heightmap edit preview
  async function newMesh(canvas) {
    const loaded = await loadTHREE();
    if (!loaded) return tip("Cannot load 3d library", false, "error", 4000);
    scene = new THREE.Scene();

    // light
    ambientLight = new THREE.AmbientLight(0xcccccc, options.lightness);
    scene.add(ambientLight);
    spotLight = new THREE.SpotLight(options.sunColor, 0.8, 2000, 0.8, 0, 0);
    spotLight.position.set(options.sun.x, options.sun.y, options.sun.z);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    scene.add(spotLight);

    // Renderer
    Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    Renderer.setSize(canvas.width, canvas.height);
    Renderer.shadowMap.enabled = true;
    Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (options.extendedWater) extendWater(graphWidth, graphHeight);
    createMesh(graphWidth, graphHeight, grid.cellsX, grid.cellsY);

    camera = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.1, 2000);
    camera.position.set(0, 400, 500); // Set initial camera position for isometric view
    controls = await MapControls(camera, canvas); // Google Maps-style navigation
    if (!controls) return false;

    // Set initial target at map center
    if (controls.target) controls.target.set(0, 0, 0);

    // Configure for bird's eye view with Google Maps-style controls
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controls.minZoom = 0.05;
    controls.maxZoom = 4;
    controls.zoomSpeed = 0.6;
    controls.panSpeed = 1.6;
    controls.enableRotate = true;
    controls.rotateSpeed = 0.5;
    controls.maxPolarAngle = Math.PI / 2; // Prevent camera from going below horizon
    controls.minPolarAngle = 0; // Allow full 90 degrees top-down view

    controls.autoRotate = Boolean(options.rotateMesh);
    controls.autoRotateSpeed = options.rotateMesh;
    animate();

    controls.addEventListener("change", render);
    return true;
  }

  function textureToSprite(texture, width, height) {
    const map = new THREE.TextureLoader().load(texture);
    if (Renderer) map.anisotropy = Renderer.capabilities.getMaxAnisotropy();
    const material = new THREE.SpriteMaterial({ map });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(width, height, 1);
    sprite.renderOrder = 1;
    return sprite;
  }

  async function createTextLabel({ text, font, size, color, quality }) {
    context2d.font = `${size * quality}px ${font}`;
    context2d.canvas.width = context2d.measureText(text).width;
    context2d.canvas.height = size * quality * 1.25; // 25% margin as text can overflow the font size
    context2d.clearRect(0, 0, context2d.canvas.width, context2d.canvas.height);

    context2d.font = `${size * quality}px ${font}`;
    context2d.fillStyle = color;
    context2d.fillText(text, 0, size * quality);

    return textureToSprite(
      context2d.canvas.toDataURL(),
      context2d.canvas.width / quality,
      context2d.canvas.height / quality
    );
  }

  function get3dCoords(baseX, baseY) {
    const x = baseX - graphWidth / 2;
    const z = baseY - graphHeight / 2;

    raycaster.ray.origin.x = x;
    raycaster.ray.origin.z = z;
    const y = raycaster.intersectObject(mesh)[0].point.y;
    return [x, y, z];
  }

  async function createLabels() {
    raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));

    const states = viewbox.select("#labels #states");

    const stateOptions = {
      font: states.attr("font-family"),
      size: +states.attr("data-size") / 2,
      color: states.attr("fill"),
      elevation: 20,
      quality: 80
    };

    // Cache icon materials and geometries by group to avoid recreating them
    const iconMaterials = {};
    const iconGeometries = {};
    const lineMaterials = {};

    // Helper function to get burg label options from its group
    function getBurgLabelOptions(burg) {
      if (!burg.group) return null;

      const labelGroup = burgLabels.select("#" + burg.group);
      if (labelGroup.empty()) return null;

      const font = labelGroup.attr("font-family") || "Arial";
      const size = +labelGroup.attr("data-size") || 10;
      const color = labelGroup.attr("fill") || "#000";

      // Calculate elevation, icon size, and line height based on label size
      // Larger labels get higher elevation and larger icons
      const elevation = Math.max(5, size * 0.5);
      const iconSize = Math.max(0.3, size * 0.08);
      const iconColor = "#666";

      return {
        font,
        size,
        color,
        elevation,
        quality: 40,
        iconSize,
        iconColor
      };
    }

    // Helper function to get or create icon material for a group
    function getIconMaterial(groupName, iconColor) {
      if (!iconMaterials[groupName]) {
        const material = new THREE.MeshPhongMaterial({ color: iconColor });
        material.wireframe = options.wireframe;
        iconMaterials[groupName] = material;
      }
      return iconMaterials[groupName];
    }

    // Helper function to get or create icon geometry for a group
    function getIconGeometry(groupName, iconSize) {
      const key = `${groupName}_${iconSize.toFixed(2)}`;
      if (!iconGeometries[key]) {
        iconGeometries[key] = new THREE.CylinderGeometry(iconSize * 2, iconSize * 2, iconSize, 16, 1);
      }
      return iconGeometries[key];
    }

    // Helper function to get or create line material for a group
    function getLineMaterial(groupName, iconColor) {
      if (!lineMaterials[groupName]) {
        lineMaterials[groupName] = new THREE.LineBasicMaterial({ color: iconColor });
      }
      return lineMaterials[groupName];
    }

    // burg labels
    for (let i = 1; i < pack.burgs.length; i++) {
      const burg = pack.burgs[i];
      if (burg.removed) continue;

      const burgOptions = getBurgLabelOptions(burg);
      if (!burgOptions) continue;

      const [x, y, z] = get3dCoords(burg.x, burg.y);

      if (layerIsOn("toggleLabels")) {
        const burgSprite = await createTextLabel({ text: burg.name, ...burgOptions });

        burgSprite.position.set(x, y + burgOptions.elevation, z);
        burgSprite.size = burgOptions.size;

        labels.push(burgSprite);
        scene.add(burgSprite);
      }

      // icons
      if (layerIsOn("toggleBurgIcons")) {
        const geometry = getIconGeometry(burg.group, burgOptions.iconSize);
        const material = getIconMaterial(burg.group, burgOptions.iconColor);
        const iconMesh = new THREE.Mesh(geometry, material);
        iconMesh.position.set(x, y, z);

        icons.push(iconMesh);
        scene.add(iconMesh);

        const line_material = getLineMaterial(burg.group, burgOptions.iconColor);
        // Line starts from top of icon (iconSize/2 above ground) and goes to just below label
        const lineStart = y + burgOptions.iconSize / 2;
        const lineEnd = y + burgOptions.elevation - burgOptions.size * 0.5;
        const points = [new THREE.Vector3(x, lineStart, z), new THREE.Vector3(x, lineEnd, z)];
        const line_geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(line_geometry, line_material);

        lines.push(line);
        scene.add(line);
      }
    }

    // state labels
    if (layerIsOn("toggleLabels")) {
      for (let i = 1; i < pack.states.length; i++) {
        const state = pack.states[i];
        if (state.removed) continue;

        const [x, y, z] = get3dCoords(state.pole[0], state.pole[1]);
        const text = states.select("#stateLabel" + state.i)?.text() || state.name;
        const stateSprite = await createTextLabel({ text, ...stateOptions });

        stateSprite.position.set(x, y + stateOptions.elevation, z);
        stateSprite.size = stateOptions.size;

        labels.push(stateSprite);
        scene.add(stateSprite);
      }
    }

    // apply visibility setting
    doWorkOnRender();
  }

  function deleteLabels() {
    raycaster = undefined;

    for (const mesh of labels) {
      scene.remove(mesh);
      mesh.material.map.dispose();
      mesh.material.dispose();
      mesh.geometry.dispose();
    }
    labels = [];

    for (const mesh of icons) {
      scene.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
    }
    icons = [];

    for (const line of lines) {
      scene.remove(line);
      line.material.dispose();
      line.geometry.dispose();
    }
    lines = [];
  }

  async function createMeshTextureUrl() {
    return new Promise(async (resolve, reject) => {
      const url = await getMapURL("mesh", {
        noLabels: options.labels3d,
        noWater: options.extendedWater,
        fullMap: true
      });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = options.resolutionScale;
      canvas.height = options.resolutionScale;
      const img = new Image();
      img.src = url;

      img.onload = function () {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          const blobObj = window.URL.createObjectURL(blob);
          window.setTimeout(() => {
            canvas.remove();
            window.URL.revokeObjectURL(blobObj);
          }, 100);
          resolve(blobObj);
        });
      };
    });
  }

  // create a mesh from pixel data
  async function createMesh(width, height, segmentsX, segmentsY) {
    // Build lookup map from grid cell index to pack cell index
    gridToPackCellMap = new Map();
    if (pack.cells?.g && pack.cells?.i) {
      for (const packCellIndex of pack.cells.i) {
        const gridCellIndex = pack.cells.g[packCellIndex];
        if (!gridToPackCellMap.has(gridCellIndex)) {
          gridToPackCellMap.set(gridCellIndex, packCellIndex);
        }
      }
    }

    if (texture) texture.dispose();
    if (!options.wireframe) {
      const url = await createMeshTextureUrl();
      await new Promise(resolve => {
        texture = new THREE.TextureLoader().load(
          url,
          t => {
            resolve(t);
          },
          undefined,
          () => resolve(null)
        );
      });
      if (texture && Renderer) {
        texture.anisotropy = Renderer.capabilities.getMaxAnisotropy();
      }
    }

    if (material) material.dispose();
    material = new THREE.MeshLambertMaterial();

    if (options.wireframe) {
      material.wireframe = true;
    } else {
      material.map = texture;
      material.transparent = true;
    }

    if (geometry) geometry.dispose();
    geometry = new THREE.PlaneGeometry(width, height, segmentsX - 1, segmentsY - 1);

    let vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      vertices.setZ(i, getMeshHeight(i));
    }

    geometry.setAttribute("position", vertices);
    geometry.computeVertexNormals();
    if (mesh) scene.remove(mesh);
    if (options.subdivide) {
      await loadLoopSubdivision();
      const subdivideParams = {
        split: true,
        uvSmooth: false,
        preserveEdges: true,
        flatOnly: false,
        maxTriangles: Infinity
      };
      const smoothGeometry = loopSubdivision.modify(geometry, 1, subdivideParams);
      mesh = new THREE.Mesh(smoothGeometry, material);
    } else {
      mesh = new THREE.Mesh(geometry, material);
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    render();

    if (options.labels3d) {
      await createLabels();
      render();
    }
  }

  const LOWER_BY_WATER = 18;
  const DIVIDER = 100 - LOWER_BY_WATER;

  function getMeshHeight(i) {
    const height = grid.cells.h[i];

    let waterCellId = null;
    if (height < 20) {
      waterCellId = i;
    } else if (grid.cells.c[i]) {
      waterCellId = grid.cells.c[i].find(c => grid.cells.h[c] < 20) ?? null;
    }

    // If water vertex, get uniform elevation
    if (waterCellId !== null) {
      const packCellIndex = gridToPackCellMap.get(waterCellId);
      const featureId = pack.cells.f[packCellIndex];
      if (featureId === undefined) return 0;

      const feature = pack.features[featureId];
      const waterHeight = feature.type === "lake" && feature.height ? feature.height : 20;
      return ((waterHeight - LOWER_BY_WATER) / DIVIDER) * options.scale;
    }

    // Land vertex
    return ((height - LOWER_BY_WATER) / DIVIDER) * options.scale;
  }

  function extendWater(width, height) {
    scene.background = new THREE.Color(options.skyColor);

    waterPlane = new THREE.PlaneGeometry(width * 10, height * 10, 1);
    waterMaterial = new THREE.MeshBasicMaterial({ color: options.waterColor });
    scene.fog = new THREE.Fog(scene.background, 500, 3000);

    waterMesh = new THREE.Mesh(waterPlane, waterMaterial);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y -= 3;
    scene.add(waterMesh);
  }

  async function update3dTexture() {
    if (texture) texture.dispose();
    const url = (await createMeshTextureUrl()) as string;
    window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
    texture = new THREE.TextureLoader().load(url, render);
    material.map = texture;
  }

  async function newGlobe(canvas) {
    const loaded = await loadTHREE();
    if (!loaded) {
      tip("Cannot load 3d library", false, "error", 4000);
      return false;
    }

    // scene
    scene = new THREE.Scene();
    scene.background = new THREE.TextureLoader().load(
      "https://i0.wp.com/azgaar.files.wordpress.com/2019/10/stars-1.png",
      render
    );

    // Renderer
    Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    Renderer.setSize(canvas.width, canvas.height);

    // material
    if (material) material.dispose();
    material = new THREE.MeshBasicMaterial();
    updateGlobeTexure(true);

    // camera
    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000).translateZ(5);

    controls = await OrbitControls(camera, Renderer.domElement); // OrbitControls for globe view
    if (!controls) return false;
    // Increase wheel zoom sensitivity for Globe view (~4x)
    controls.zoomSpeed = 1;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;
    controls.autoRotate = Boolean(options.rotateGlobe);
    controls.autoRotateSpeed = options.rotateGlobe;

    // ensure OrbitControls behavior (reset potentially changed defaults by MapControls)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    controls.addEventListener("change", render);

    return true;
  }

  function OrbitControls(camera, domElement) {
    if (THREE.OrbitControls) return new THREE.OrbitControls(camera, domElement);

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "libs/orbitControls.min.js";
      document.head.append(script);
      script.onload = () => resolve(new THREE.OrbitControls(camera, domElement));
      script.onerror = () => resolve(false);
    });
  }

  function MapControls(camera, domElement) {
    if (THREE.MapControls) return new THREE.MapControls(camera, domElement);

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "libs/mapControls.min.js";
      document.head.append(script);
      script.onload = () => {
        if (THREE.MapControls) {
          resolve(new THREE.MapControls(camera, domElement));
        } else {
          resolve(false);
        }
      };
      script.onerror = () => resolve(false);
    });
  }

  async function updateGlobeTexure(addMesh = false) {
    const world = mapCoordinates.latT > 179; // define if map covers whole world

    // texture size
    const scale = options.resolution;
    const height = 512 * scale;
    const width = 1024 * scale;

    // calculate map size and offset position
    const mapHeight = rn((mapCoordinates.latT / 180) * height);
    const mapWidth = world ? mapHeight * 2 : rn((graphWidth / graphHeight) * mapHeight);
    const dy = world ? 0 : ((90 - mapCoordinates.latN) / 180) * height;
    const dx = world ? 0 : mapWidth / 4;

    // draw map on canvas
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.canvas.width = width;
    ctx.canvas.height = height;

    // add cloud texture if map does not cover all the globe
    if (!world) {
      const img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = cloudImage;
    }

    // fill canvas segment with map texture
    const img2 = new Image();
    img2.onload = function () {
      ctx.drawImage(img2, dx, dy, mapWidth, mapHeight);
      if (texture) texture.dispose();
      texture = new THREE.CanvasTexture(ctx.canvas, render);
      material.map = texture;
      if (addMesh) addGlobe3dMesh();
    };
    img2.src = await getMapURL("mesh", { noScaleBar: true, fullMap: true, noVignette: true });
  }

  function addGlobe3dMesh() {
    geometry = new THREE.SphereBufferGeometry(1, 64, 64);
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    if (controls.autoRotate) animate();
    else render();
  }

  // render 3d scene and camera, do only on controls change
  const renderThrottled = throttle(doWorkOnRender, 200);
  function render() {
    Renderer.render(scene, camera);
    renderThrottled();
  }

  function doWorkOnRender() {
    for (const [i, label] of labels.entries()) {
      const dist = label.position.distanceTo(camera.position);
      const isVisible = dist < 100 * label.size && dist > label.size * 6;
      label.visible = isVisible;
      if (lines[i]) lines[i].visible = isVisible;
    }
  }

  // animate 3d scene and camera
  function animate() {
    animationFrame = requestAnimationFrame(animate);
    if (controls && controls.update) controls.update();
  }

  function loadTHREE() {
    if (window.THREE) return Promise.resolve(true);

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "libs/three.min.js";
      document.head.append(script);
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
    });
  }

  function loadLoopSubdivision() {
    if (window.loopSubdivision) return Promise.resolve(true);

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "libs/loopsubdivison.min.js";
      document.head.append(script);
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
    });
  }

  function OBJExporter() {
    if (THREE.OBJExporter) return new THREE.OBJExporter();

    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "libs/objexporter.min.js?v=1.89.35";
      document.head.append(script);
      script.onload = () => resolve(new THREE.OBJExporter());
      script.onerror = () => resolve(false);
    });
  }

  return {
    create,
    redraw,
    update,
    stop,
    options,
    setSunColor,
    setScale,
    setResolutionScale,
    setLightness,
    setSun,
    setRotation,
    toggleLabels,
    toggle3dSubdivision,
    toggleWireframe,
    toggleSky,
    setResolution,
    setColors,
    setTimeOfDay,
    timeOfDayPresets,
    saveScreenshot,
    saveOBJ
  };
})();
