import * as THREE from "three";
import type { LandmarkModel } from "../architectureKit";
import { NotreDameKit } from "./details";

const WEST = -Math.PI / 2;

/** Detailed exterior interpretation; ornament spacing is not a measured survey. */
export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "notre-dame-paris",
  task: "G01",
  name: "Notre-Dame de Paris · high detail",
  style: "Gothic",
  state: "Restored exterior with the Viollet-le-Duc spire design; high-detail procedural model",
  size: [132, 58, 97],
  dimensions:
    "Metre-scale interpretation based on the cathedral's published plans: 127 m length, 48 m transept, 43.5 m facade envelope, 69 m towers, 96 m spire; west rose diameter 9.70 m, transept roses 13.10 m. Bay spacing, chapel profiles and ornament are estimated.",
  note: "Detailed five-aisled exterior: recessed triple portals and archivolts, 28 schematic crowned kings, open upper gallery and twin belfries, three patterned rose windows, paired lancets, roof seams, radial curved flying buttresses, pinnacles, gargoyles and spire with copper figures. Sculptures and glazing are geometric interpretations, not replicas. Interior, sacristy, individual glass scenes and surveyed masonry joints are omitted. No textures or external model downloads are required.",
  sources: [
    {
      title: "Cathedral: plans, elevations and principal dimensions",
      url: "https://www.notredamedeparis.fr/en/understand/architecture/plans/"
    },
    {
      title: "Cathedral: western facade and 28 kings",
      url: "https://www.notredamedeparis.fr/en/understand/architecture/the-western-facade/"
    },
    {
      title: "Cathedral: exterior architecture and flying buttresses",
      url: "https://www.notredamedeparis.fr/en/understand/architecture/exterior-architecture/"
    },
    {
      title: "Cathedral: restored spire design",
      url: "https://www.notredamedeparis.fr/en/understand/architecture/the-spire/"
    }
  ],
  create() {
    const k = new NotreDameKit(this.id);
    // The shell ends behind the west front; the transepts share the 43 m roof ridge.
    k.nave("nave-and-choir", -5, 0, 94, 13, 32.8, 10.2);
    for (const side of [-1, 1]) {
      k.nave("inner-aisle-gallery", -5, side * 9.45, 94, 5.9, 19, 3.5);
      k.nave("outer-aisle", -5, side * 15.35, 94, 5.9, 11.5, 3.5);
      k.crossNave("transept", 3, side * 13.5, 21, 14, 32.8, 10.2);
    }
    k.apse("outer-ambulatory", 42, 0, 18.3, 11.5, 3.5);
    k.apse("inner-ambulatory-gallery", 42, 0, 12.4, 19, 3.5);
    k.apse("choir-apse", 42, 0, 6.5, 32.8, 10.2);

    // Continuous side chapels, interrupted by the shallow transepts.
    const bays = [-43, -35, -27, -19, -11, 17, 25, 33];
    for (const x of bays)
      for (const side of [-1, 1]) {
        const angle = side > 0 ? 0 : Math.PI;
        k.nave("side-chapel", x, side * 19.6, 7.5, 3.8, 10.5, 2.5);
        k.window(x, side * 21.5, 2.5, 4.1, 6.8, angle);
        k.window(x, side * 12.4, 12.2, 3.3, 5.7, angle);
        k.window(x, side * 6.51, 23, 4.4, 8.3, angle);
        for (const [z, y, w] of [
          [21.7, 10.5, 7.7],
          [12.5, 19, 8],
          [6.6, 32.7, 8]
        ]) {
          k.box("side-stringcourse", [x, y, side * z], [w, 0.28, 0.3], "white");
        }
        k.flying(x + 3.8, 0, 0, side, 6.7, 23.4, 17, 31.5);
        // Lead standing seams follow each roof slope, without cross-hatching the stone walls.
        for (const sx of [-2.5, 0, 2.5]) {
          k.beam("lead-roof-seam", [x + sx, 43.04, 0], [x + sx, 32.84, side * 6.5], 0.055, "stone");
          k.beam("aisle-roof-seam", [x + sx, 22.54, side * 9.45], [x + sx, 19.04, side * 12.4], 0.045, "stone");
        }
      }
    k.beam("lead-ridge-cap", [-48, 43.1, 0], [42, 43.1, 0], 0.18, "iron");
    for (let x = -44; x <= 40; x += 2) {
      k.beam("ridge-cresting", [x, 43.1, 0], [x, 43.65, 0], 0.08, "iron");
      k.beam("ridge-cresting", [x - 0.45, 43.2, 0], [x, 43.65, 0], 0.065, "iron");
      k.beam("ridge-cresting", [x + 0.45, 43.2, 0], [x, 43.65, 0], 0.065, "iron");
    }

    // Polygonal chevet chapels and long single-flight radial buttresses.
    for (let i = 0; i < 7; i++) {
      const a = ((i + 0.5) * Math.PI) / 7;
      const dx = Math.sin(a),
        dz = Math.cos(a);
      const points = [
        [42 + dx * 15 - dz * 3.2, dz * 15 + dx * 3.2],
        [42 + dx * 19.7 - dz * 3, dz * 19.7 + dx * 3],
        [42 + dx * 21.5, dz * 21.5],
        [42 + dx * 19.7 + dz * 3, dz * 19.7 - dx * 3],
        [42 + dx * 15 + dz * 3.2, dz * 15 - dx * 3.2]
      ] as const;
      k.prism("chevet-chapel", points, 0, 10.5);
      const center = [42 + dx * 17.9, dz * 17.9];
      // A hipped fan roof, each triangle meeting a common ridge point.
      for (let j = 0; j < points.length; j++) {
        const p = points[j],
          q = points[(j + 1) % points.length];
        const roof = new THREE.BufferGeometry();
        roof.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([p[0], 10.5, p[1], q[0], 10.5, q[1], center[0], 14, center[1]], 3)
        );
        roof.computeVertexNormals();
        // Supply UVs so all roof facets can be batched with the same attribute layout.
        roof.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        k.add("chevet-chapel-roof", roof, "iron");
      }
      for (const delta of [-0.17, 0.17]) {
        const t = a + delta,
          nx = Math.sin(t),
          nz = Math.cos(t);
        k.window(42 + nx * 20.3, nz * 20.3, 2.4, 2.2, 6.3, t);
      }
    }
    for (let i = 0; i <= 8; i++) {
      const a = (i * Math.PI) / 8;
      const dx = Math.sin(a),
        dz = Math.cos(a);
      k.flying(42, 0, dx, dz, 6.7, 23.4, 17, 31.5);
      if (i > 0 && i < 8) k.window(42 + dx * 6.52, dz * 6.52, 23, 2.1, 8, a);
    }

    // West facade: an actual perforated screen, with recessed doors behind its openings.
    const front = new THREE.Shape();
    front.moveTo(-21.75, 0);
    front.lineTo(21.75, 0);
    front.lineTo(21.75, 37);
    front.lineTo(-21.75, 37);
    front.closePath();
    for (const u of [-14, 0, 14])
      front.holes.push(new THREE.Path(k.arch(u ? 8.2 : 9.2, u ? 12.7 : 14.3, 0.15, u).getPoints(48)));
    const roseHole = new THREE.Path();
    roseHole.absarc(0, 28.5, 4.85, 0, Math.PI * 2, true);
    front.holes.push(roseHole);
    k.panel("perforated-west-facade", front, -61, 0, 0, WEST, 2);
    for (const z of [-14, 0, 14]) {
      const h = z ? 12.7 : 14.3,
        w = z ? 8.2 : 9.2;
      k.panel("west-portal-shadow", k.arch(w, h), -61.03, 0.15, z, WEST, 0.025, "dark");
      for (let layer = 0; layer < 5; layer++)
        k.molding(
          "west-portal-archivolt",
          -63.03 - layer * 0.12,
          0.18,
          z,
          WEST,
          w + layer * 0.65,
          h + layer * 0.48,
          0.16
        );
      for (const u of [-1, 1]) {
        k.box("west-door-leaf", [-61.22, 2.85, z + u * w * 0.22], [0.16, 5.4, w * 0.42], "oak");
        for (const y of [1.3, 2.8, 4.3])
          k.box("door-ironwork", [-61.33, y, z + u * w * 0.22], [0.09, 0.11, w * 0.36], "iron");
        for (let j = 0; j < 3; j++) k.statue("portal-jamb-saint", -63.3 - j * 0.1, 1.7, z + u * (w / 2 + j * 0.3), 2.4);
      }
      k.block("portal-trumeau", -62.1, z, 1.6, 0.32, 6.4);
      k.statue("portal-trumeau-saint", -63.2, 2.4, z, 2.4);
      for (const y of [6.6, 8.1, 9.6])
        k.box("tympanum-register", [-61.17, y, z], [0.2, 0.12, w * (1 - (y - 6) / h)], "white");
      for (let row = 0; row < 3; row++) {
        const count = 7 - row * 2;
        for (let i = 0; i < count; i++) {
          k.statue("tympanum-relief", -61.35, 6.75 + row * 1.5, z + (i - (count - 1) / 2) * 0.85, 1.05);
        }
      }
    }
    for (const y of [17.8, 22.7, 36.7, 44.5]) k.box("west-stringcourse", [-63.1, y, 0], [0.7, 0.42, 44], "white");
    k.box("kings-gallery-recess", [-63.04, 20.4, 0], [0.04, 3.7, 42], "stone");
    k.arcade("kings-niche", -21, -63.25, 42, 28, 18.4, 4, Math.PI / 2, true);
    for (let i = 0; i < 28; i++) {
      const z = -21 + (i + 0.5) * 1.5;
      k.statue("king", -63.65, 19, z, 2.9);
      k.cylinder("king-crown", [-63.65, 21.8, z], 0.33, 0.22, "white", 0.37, 8);
    }
    k.rosette(-63.04, 28.5, 0, 4.85, WEST, 16);
    for (const z of [-14, 14]) for (const offset of [-2.5, 2.5]) k.window(-63.03, z + offset, 25, 3.3, 8, WEST);
    for (const z of [-14, 14]) k.box("upper-gallery-recess", [-61.1, 40.6, z], [0.1, 6.8, 14.8], "dark");
    k.arcade("open-west-gallery", -21.3, -62.6, 42.6, 17, 37, 7.2, Math.PI / 2, true);
    for (const z of [-21, -7, 7, 21]) {
      k.block("west-facade-buttress", -63.1, z, 1.5, 1.1, 44.5);
      k.statue("gallery-chimera", -63.9, 44.6, z, 1.15, "stone");
    }

    // Hollow belfries: paired high pointed openings on all four faces.
    for (const z of [-14, 14]) {
      k.block("west-tower-shaft", -54.5, z, 12.6, 15.5, 45);
      // Shallow ashlar joints on the tower flanks; front openings stay unobstructed.
      for (const side of [-1, 1]) {
        for (let row = 0; row < 37; row++) {
          const y = 0.8 + row * 1.2;
          k.box("tower-ashlar-bed", [-54.5, y, z + side * 7.758], [12.6, 0.025, 0.018], "stone");
          for (let col = 0; col < 5; col++) {
            const x = -59.8 + col * 2.4 + (row % 2) * 1.2;
            k.box("tower-ashlar-joint", [x, y + 0.6, z + side * 7.758], [0.025, 1.18, 0.018], "stone");
          }
        }
        for (const y of [18, 23, 37, 44.5]) {
          k.box("tower-flank-stringcourse", [-54.5, y, z + side * 7.84], [13, 0.32, 0.35], "white");
        }
      }
      k.block("tower-belfry-floor", -54.5, z, 15.6, 16, 0.6, 45);
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const wall = new THREE.Shape();
        wall.moveTo(-7.75, 0);
        wall.lineTo(7.75, 0);
        wall.lineTo(7.75, 22);
        wall.lineTo(-7.75, 22);
        wall.closePath();
        for (const u of [-3.7, 3.7]) wall.holes.push(new THREE.Path(k.arch(5.1, 18.6, 0.8, u).getPoints(40)));
        const p = k.point(-54.5, 45.6, z, a, 0, 0, 6.65);
        k.panel("open-belfry-wall", wall, ...p, a, 1.1);
        for (const u of [-3.7, 3.7])
          k.molding("belfry-arch-molding", ...k.point(-54.5, 46.4, z, a, u, 0, 7.8), a, 5.3, 18.8, 0.16);
      }
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          k.block("tower-corner-buttress", -54.5 + sx * 7, z + sz * 7.25, 1.6, 1.6, 22.5, 45);
        }
      k.block("tower-lead-terrace", -54.5, z, 15.8, 16.2, 0.35, 67.6);
      for (const side of [-1, 1]) {
        k.block("tower-parapet", -54.5, z + side * 7.9, 16, 0.4, 1.05, 67.95);
        k.block("tower-parapet", -54.5 + side * 7.8, z, 0.4, 16, 1.05, 67.95);
      }
      k.cylinder("bronze-bell", [-54.5, 51.5, z], 1.5, 2.8, "iron", 0.65, 32);
      k.beam("bell-yoke", [-57.5, 54, z], [-51.5, 54, z], 0.6, "oak");
    }

    // Rose-bearing transept fronts, with a lancet screen and decorated gable.
    for (const side of [-1, 1]) {
      const a = side > 0 ? 0 : Math.PI;
      k.rosette(3, 24.2, side * 24.03, 6.55, a, side > 0 ? 12 : 16);
      for (let i = -3; i <= 3; i++) k.window(3 + i * 1.7, side * 24.03, 12.5, 1.25, 4.2, a);
      k.panel("transept-portal", k.arch(5, 10), 3, 0.1, side * 24.04, a, 0.08, "dark");
      for (let i = 0; i < 4; i++)
        k.molding("transept-portal-molding", 3, 0.1, side * (24.14 + i * 0.09), a, 5 + i * 0.65, 10 + i * 0.4, 0.12);
      for (const s of [-1, 1]) {
        k.block("transept-corner-pier", 3 + s * 7, side * 23.7, 1.4, 2, 34);
        k.pinnacle(3 + s * 7, 34, side * 23.7, 0.8, 6);
        k.beam("transept-gable-molding", [3 + s * 7, 32.9, side * 24.12], [3, 43.1, side * 24.12], 0.25, "white");
        for (let i = 1; i < 8; i++)
          k.sphere("gable-crocket", [3 + s * (7 - i * 0.8), 32.9 + i * 1.16, side * 24.18], [0.23, 0.3, 0.23], "white");
      }
      k.pinnacle(3, 43, side * 24, 0.4, 2.8);
    }

    // Octagonal restored crossing spire: two open arcade stages, ribs and copper figures.
    k.cylinder("spire-octagonal-socle", [3, 44.5, 0], 4.3, 3, "iron", 3.8, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        dx = Math.cos(a),
        dz = Math.sin(a);
      for (const [base, h, r] of [
        [46, 7, 3.4],
        [53, 7, 2.6]
      ]) {
        k.beam("spire-lantern-post", [3 + dx * r, base, dz * r], [3 + dx * r, base + h, dz * r], 0.28, "iron");
        const b = a + Math.PI / 4;
        k.beam(
          "spire-lantern-arch",
          [3 + dx * r, base + h - 2, dz * r],
          [3 + Math.cos(a + Math.PI / 8) * r, base + h, Math.sin(a + Math.PI / 8) * r],
          0.18,
          "iron"
        );
        k.beam(
          "spire-lantern-arch",
          [3 + Math.cos(b) * r, base + h - 2, Math.sin(b) * r],
          [3 + Math.cos(a + Math.PI / 8) * r, base + h, Math.sin(a + Math.PI / 8) * r],
          0.18,
          "iron"
        );
      }
      k.beam("spire-hip-rib", [3 + dx * 3.1, 60, dz * 3.1], [3, 94.4, 0], 0.16, "stone");
      for (let j = 0; j < 9; j++) {
        const y = 62 + j * 3.4,
          r = (3.1 * (94.4 - y)) / 34.4;
        k.sphere("spire-crocket", [3 + dx * (r + 0.12), y, dz * (r + 0.12)], [0.18, 0.25, 0.18], "iron");
      }
    }
    for (const y of [46, 53, 60])
      k.ring("spire-stage-cornice", [3, y, 0], y === 46 ? 3.7 : y === 53 ? 3 : 2.8, 0.18, "iron");
    k.spire("restored-crossing-spire", 3, 60, 0, 3.1, 34.4);
    k.beam("spire-cross", [3, 94, 0], [3, 95.7, 0], 0.12, "iron");
    k.beam("spire-cross", [2.55, 95.1, 0], [3.45, 95.1, 0], 0.1, "iron");
    k.sphere("spire-rooster", [3, 95.85, 0], [0.24, 0.15, 0.12], "straw");
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const r = 3.4 + i * 0.85,
            y = 44 - i * 0.9;
          k.statue("spire-copper-figure", 3 + sx * r, y, sz * r, 1.9, "green");
          k.box("spire-figure-plinth", [3 + sx * r, y - 0.18, sz * r], [0.8, 0.35, 0.8], "iron");
        }
    return k.finish();
  }
};
