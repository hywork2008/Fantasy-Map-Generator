import * as THREE from "three";
import type { Point } from "../../types/primitives";

export interface PlacementGhost {
  building: readonly Point[];
  plot: readonly Point[];
  level: number;
  ok: boolean;
  facingDegrees: number;
}

/** Reused line loops for the 3D cursor. Positions are updated in place. */
export function createPlacementGhost(scene: THREE.Scene): {
  update(ghost: PlacementGhost | null): void;
  dispose(): void;
} {
  const plot = loop();
  const building = loop();
  const arrow = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: 0x2e7d32 })
  );
  arrow.frustumCulled = false;
  const group = new THREE.Group();
  group.name = "ce-placement-ghost";
  group.frustumCulled = false;
  group.add(plot.line, building.line, arrow);
  group.visible = false;
  scene.add(group);
  const paint = (line: THREE.Line, points: readonly Point[], y: number) => {
    const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) {
      const point = points[i] ?? points[0] ?? [0, 0];
      attribute.setXYZ(i, point[0], y, -point[1]);
    }
    attribute.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  };
  return {
    update(ghost) {
      group.visible = ghost !== null;
      if (!ghost) return;
      const color = ghost.ok ? 0x2e7d32 : 0xc62828;
      (plot.line.material as THREE.LineBasicMaterial).color.setHex(color);
      (building.line.material as THREE.LineBasicMaterial).color.setHex(color);
      (arrow.material as THREE.LineBasicMaterial).color.setHex(color);
      paint(plot.line, ghost.plot, ghost.level + 0.05);
      paint(building.line, ghost.building, ghost.level + 0.2);
      const center = ghost.building.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0] as Point);
      const count = ghost.building.length || 1;
      const origin: Point = [center[0] / count, center[1] / count];
      const radians = (ghost.facingDegrees * Math.PI) / 180;
      const tip: Point = [origin[0] + Math.sin(radians) * 8, origin[1] + Math.cos(radians) * 8];
      const attribute = arrow.geometry.getAttribute("position") as THREE.BufferAttribute;
      attribute.setXYZ(0, origin[0], ghost.level + 0.25, -origin[1]);
      attribute.setXYZ(1, tip[0], ghost.level + 0.25, -tip[1]);
      attribute.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      plot.line.geometry.dispose();
      building.line.geometry.dispose();
      arrow.geometry.dispose();
      (plot.line.material as THREE.Material).dispose();
      (building.line.material as THREE.Material).dispose();
      (arrow.material as THREE.Material).dispose();
    }
  };
}

function loop(): { line: THREE.LineLoop } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x2e7d32 }));
  line.frustumCulled = false;
  return { line };
}
