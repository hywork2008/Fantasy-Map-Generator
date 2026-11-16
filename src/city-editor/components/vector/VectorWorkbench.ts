import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { convertVectorPreset } from "../../generators/vector/editing/convertPreset";
import { prepareVectorEdit } from "../../generators/vector/editing/dependencies";
import { replaceVectorPathCandidate } from "../../generators/vector/editing/pathCandidate";
import {
  curveSource,
  freshPathId,
  moveCurveHandle,
  moveCurveVertex,
  removeCurveVertex,
  removeVectorPath,
  replaceVectorPath as replaceRawVectorPath,
  reverseVectorPath,
  setCurveClosed,
  setVectorPathPolicy
} from "../../generators/vector/editing/paths";
import { splitVectorPath } from "../../generators/vector/editing/splitPath";
import { fabricHouseInCell, fabricHouseInfo } from "../../generators/vector/fabric/houses";
import { nearestFabricLine } from "../../generators/vector/fabric/lines";
import { pathSegmentIds } from "../../generators/vector/geometry/curves";
import { vectorPathMeasurement } from "../../generators/vector/geometry/measurement";
import { presetArea, presetDimensionsForArea } from "../../generators/vector/geometry/presets";
import { clearVectorGeometryCache } from "../../generators/vector/geometry/surfaces";
import { element, line } from "../../renderers/svgPrimitives";
import { renderVectorDocument, updateVectorSelection, vectorPathSvg } from "../../renderers/vector/documentSvg";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument, VectorHandleMode, VectorPath, VectorPreset } from "../../types/vector/document";
import { createVectorNetworkPanel } from "./VectorNetworkPanel";

const text = (key: string) => editorText(`cityEditor.vector.edit.${key}` as EditorMessageKey);
type Tool = "select" | "polyline" | "freehand" | "bezier";

/** Drafts never enter the ledger until a complete, validated gesture is accepted. */
export function createVectorWorkbench(
  scope: EditorLifetime,
  panel: HTMLElement,
  map: HTMLElement,
  status: HTMLElement,
  readCurrent: () => VectorCityDocument,
  commit: (document: VectorCityDocument, label: string) => void,
  onRender?: (doc: VectorCityDocument) => void,
  /** Read-only current document for selection; never mutated. Defaults to a copy. */
  peek: () => Readonly<VectorCityDocument> = readCurrent,
  /** A generated house was chosen on the map, or `""` when the selection moved to a path. */
  onSelectHouse?: (id: string) => void,
  /** A fabric street or lane was chosen on the map. */
  onSelectFabricLine?: (id: string) => void
) {
  const read = () => prepareVectorEdit(readCurrent());
  const replaceVectorPath = (doc: VectorCityDocument, path: VectorPath) =>
    readCurrent().urban ? replaceVectorPathCandidate(doc, path) : replaceRawVectorPath(doc, path);
  let selectedSegmentId = "";
  let selectedHouse = "";
  let selectedId = "",
    points: Point[] = [],
    handles: (Point | undefined)[] = [],
    pointer = false;
  let drag: { path: VectorPath; index: number; key: "from" | "to" | "control1" | "control2" } | undefined;
  const toolbar = document.createElement("fieldset"),
    inspector = document.createElement("fieldset");
  toolbar.style.cssText = inspector.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:12px";
  panel.append(toolbar, inspector);
  const label = (parent: HTMLElement, key: string, input: HTMLElement) => {
    const row = document.createElement("label");
    row.textContent = text(key);
    row.append(input);
    parent.append(row);
    return input;
  };
  const select = (parent: HTMLElement, key: string, values: string[]) => {
    const input = document.createElement("select");
    input.dataset.field = key;
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text(value);
      input.append(option);
    }
    label(parent, key, input);
    return input;
  };
  const number = (parent: HTMLElement, key: string, value: number) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.dataset.field = key;
    label(parent, key, input);
    return input;
  };
  const button = (parent: HTMLElement, key: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.action = key;
    parent.append(b);
    scope.listen(b, "click", () => attempt(action));
    return b;
  };
  const tool = select(toolbar, "tool", ["select", "polyline", "freehand", "bezier"]),
    role = select(toolbar, "role", ["road", "river", "wall"]);
  const closed = document.createElement("input");
  closed.type = "checkbox";
  label(toolbar, "closed", closed);
  const tolerance = number(toolbar, "tolerance", 0.5),
    left = number(toolbar, "left", 3),
    right = number(toolbar, "right", 3);
  const shape = select(toolbar, "preset", ["ellipse", "rectangle", "polygon"]);
  const mode = select(toolbar, "mode", ["corner", "aligned", "symmetric"]);
  const paths = document.createElement("select");
  paths.className = "ce-vector-paths";
  label(toolbar, "paths", paths);
  const hint = document.createElement("p");
  hint.textContent = text("drawingHelp");
  toolbar.append(hint);
  const fail = (error: unknown) => {
    const code = error instanceof Error ? error.message : "invalid-path";
    const message = text(`errors.${code}`);
    status.textContent = message.startsWith("cityEditor.") ? text("errors.invalid-path") : message;
  };
  function attempt(action: () => void) {
    try {
      action();
    } catch (error) {
      fail(error);
    }
  }
  const apply = (next: VectorCityDocument, key: string) => {
    points = [];
    handles = [];
    drag = undefined;
    pointer = false;
    commit(next, text(key));
  };
  const newPath = (source: VectorPath["source"], origin: VectorPath["origin"] = "manual"): VectorPath => ({
    id: freshPathId(read()),
    revision: 0,
    role: role.value as VectorPath["role"],
    origin,
    editPolicy: "editable",
    source,
    width: { leftMeters: Number(left.value), rightMeters: Number(right.value), stations: [], interpolation: "linear" }
  });
  const finish = () => {
    const path = newPath(
      curveSource(
        points,
        tool.value as "polyline" | "freehand" | "bezier",
        closed.checked,
        Number(tolerance.value),
        handles
      )
    );
    const next = replaceVectorPath(read(), path);
    selectedId = path.id;
    apply(next, "draw");
  };
  button(toolbar, "finish", finish);
  button(toolbar, "cancel", () => {
    points = [];
    handles = [];
    drag = undefined;
    pointer = false;
    draw();
  });
  const addPreset = (automatic: boolean) => {
    const current = read(),
      size = automatic
        ? Math.max(100, Math.sqrt(current.context.targetPopulation) * 8)
        : current.frame.extentMeters * 0.65;
    const source: VectorPreset = {
      kind: "preset",
      ...(shape.value === "polygon"
        ? { preset: "polygon" as const, sides: 6 }
        : { preset: shape.value as "ellipse" | "rectangle" }),
      center: [0, 0],
      widthMeters: size,
      heightMeters: size * 0.8,
      bearingDegrees: 90
    };
    const path = newPath(source, automatic ? "automatic" : "manual");
    selectedId = path.id;
    apply(replaceVectorPath(current, path), automatic ? "automatic" : "addPreset");
  };
  button(toolbar, "addPreset", () => addPreset(false));
  button(toolbar, "automatic", () => addPreset(true));
  scope.listen(tool, "change", () => {
    points = [];
    handles = [];
    draw();
  });
  scope.listen(paths, "change", () => selectPath(paths.value));
  function draw() {
    const shown = peek() as VectorCityDocument;
    const svg = renderVectorDocument(
      shown,
      selectedId,
      selectedSegmentId || undefined,
      undefined,
      selectedHouse || undefined
    );
    svg.setAttribute("aria-label", editorText("cityEditor.vector.preview"));
    svg.style.cssText = "width:100%;height:100%;min-height:300px;touch-action:none";
    map.replaceChildren(svg);
    onRender?.(shown);
    preview();
  }
  function preview(path?: VectorPath) {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.querySelector("[data-vector-draft]")?.remove();
    let d = "";
    if (path) d = vectorPathSvg(path);
    else if (points.length) {
      try {
        d = vectorPathSvg(
          newPath(
            curveSource(
              points,
              tool.value as "polyline" | "freehand" | "bezier",
              closed.checked,
              Number(tolerance.value),
              handles
            )
          )
        );
      } catch {
        d = line(points);
      }
    }
    if (d)
      svg.append(
        element("path", {
          d,
          fill: "none",
          stroke: "#e25526",
          "stroke-width": "2",
          "stroke-dasharray": "5 3",
          "vector-effect": "non-scaling-stroke",
          "pointer-events": "none",
          "data-vector-draft": "true"
        })
      );
  }
  /** Selection changes only the inspector and the selection layer; the document and drawing stay as they are. */
  function showSelection() {
    const svg = map.querySelector<SVGSVGElement>("svg");
    if (
      !svg ||
      !updateVectorSelection(svg, peek(), selectedId, selectedSegmentId || undefined, selectedHouse || undefined)
    )
      draw();
  }
  /** Highlights a generated house; the path inspector stays as it is. */
  function selectHouse(id: string) {
    selectedHouse = fabricHouseInfo(peek().fabric, id) ? id : "";
    showSelection();
  }
  function selectPath(id: string) {
    const path = Object.hasOwn(peek().paths, id) ? peek().paths[id] : undefined;
    if (!path) {
      // A surface without its own path (for example a parcel) keeps the old behaviour.
      selectedId = id;
      refresh();
      return;
    }
    points = [];
    handles = [];
    drag = undefined;
    pointer = false;
    if (selectedHouse) {
      selectedHouse = "";
      onSelectHouse?.("");
    }
    selectedId = id;
    paths.value = id;
    scope.replaceChildren(inspector);
    buildInspector(path);
    networkPanel.selectTarget(id);
    showSelection();
  }
  const networkPanel = createVectorNetworkPanel(
    scope,
    toolbar,
    map,
    status,
    readCurrent,
    () => selectedId,
    (next, label) => {
      points = [];
      handles = [];
      drag = undefined;
      pointer = false;
      commit(next, label);
    },
    peek
  );
  function refresh() {
    points = [];
    handles = [];
    drag = undefined;
    pointer = false;
    // Listing reads the snapshot; preparing an edit (`read`) copies the whole document twice.
    const current = peek();
    if (!current.paths[selectedId]) selectedId = Object.keys(current.paths)[0] ?? "";
    if (selectedHouse && !fabricHouseInfo(peek().fabric, selectedHouse)) selectedHouse = "";
    paths.replaceChildren(
      ...Object.keys(current.paths).map(id => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id;
        return option;
      })
    );
    paths.value = selectedId;
    scope.replaceChildren(inspector);
    const path = current.paths[selectedId];
    if (path) buildInspector(structuredClone(path));
    networkPanel.refresh();
    draw();
  }
  function buildInspector(path: VectorPath) {
    const measured = vectorPathMeasurement(path),
      output = document.createElement("output");
    output.dataset.vectorMeasurement = path.id;
    output.dataset.lengthMeters = String(measured.lengthMeters);
    output.textContent = editorText("cityEditor.vector.measurement.length", {
      value0: measured.lengthMeters.toFixed(2)
    });
    if (measured.areaMeters2 !== null) {
      output.dataset.areaMeters2 = String(measured.areaMeters2);
      output.textContent += ` · ${editorText("cityEditor.vector.measurement.area", { value0: measured.areaMeters2.toFixed(2) })}`;
    }
    inspector.append(output);

    const locked = path.editPolicy === "fixed";
    button(inspector, locked ? "unlock" : "lock", () =>
      apply(setVectorPathPolicy(read(), path.id, locked ? "editable" : "fixed"), "policy")
    );
    if (locked) return;
    const l = number(inspector, "left", path.width.leftMeters),
      r = number(inspector, "right", path.width.rightMeters);
    button(inspector, "applyWidth", () => {
      const p = structuredClone(path);
      p.width.leftMeters = Number(l.value);
      p.width.rightMeters = Number(r.value);
      apply(replaceVectorPath(read(), p), "applyWidth");
    });
    const segment = select(inspector, "segment", []);
    for (const id of pathSegmentIds(path)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id;
      segment.append(option);
    }
    if (!pathSegmentIds(path).includes(selectedSegmentId)) selectedSegmentId = segment.options[0]?.value ?? "";
    segment.value = selectedSegmentId;
    scope.listen(segment, "change", () => {
      selectedSegmentId = segment.value;
      showSelection();
    });
    const t = number(inspector, "parameter", 0.5),
      sl = number(inspector, "stationLeft", path.width.leftMeters),
      sr = number(inspector, "stationRight", path.width.rightMeters);
    button(inspector, "addStation", () => {
      const p = structuredClone(path);
      p.width.stations.push({
        anchor: { pathId: path.id, segmentId: segment.value, t: Number(t.value) },
        leftMeters: Number(sl.value),
        rightMeters: Number(sr.value)
      });
      apply(replaceVectorPath(read(), p), "addStation");
    });
    path.width.stations.forEach((station, index) => {
      const item = document.createElement("div");
      item.textContent = `${station.anchor.segmentId} @ ${station.anchor.t}: ${station.leftMeters} / ${station.rightMeters} m`;
      inspector.append(item);
      button(item, "editStation", () => {
        const p = structuredClone(path);
        p.width.stations[index] = {
          anchor: { pathId: path.id, segmentId: segment.value, t: Number(t.value) },
          leftMeters: Number(sl.value),
          rightMeters: Number(sr.value)
        };
        apply(replaceVectorPath(read(), p), "editStation");
      });
      button(item, "removeStation", () => {
        const p = structuredClone(path);
        p.width.stations.splice(index, 1);
        apply(replaceVectorPath(read(), p), "removeStation");
      });
    });
    if (path.source.kind === "preset") {
      const source = path.source,
        x = number(inspector, "centerX", source.center[0]),
        y = number(inspector, "centerY", source.center[1]);
      const w = number(inspector, "width", source.widthMeters),
        h = number(inspector, "height", source.heightMeters),
        bearing = number(inspector, "bearing", source.bearingDegrees),
        radius = number(inspector, "radius", source.cornerRadiusMeters ?? 0);
      radius.disabled = source.preset === "ellipse";
      const sides = source.preset === "polygon" ? number(inspector, "sides", source.sides) : undefined;
      const area = number(inspector, "area", presetArea(source)),
        ratio = number(inspector, "ratio", source.widthMeters / source.heightMeters);
      const candidate = (byArea: boolean) => {
        const p = structuredClone(path);
        if (p.source.kind !== "preset") throw new Error("invalid-path");
        p.source = {
          ...p.source,
          center: [Number(x.value), Number(y.value)],
          widthMeters: Number(w.value),
          heightMeters: Number(h.value),
          bearingDegrees: Number(bearing.value),
          cornerRadiusMeters: Number(radius.value)
        };
        if (p.source.preset === "polygon" && sides) p.source.sides = Number(sides.value);
        if (byArea) p.source = presetDimensionsForArea(p.source, Number(area.value), Number(ratio.value));
        return p;
      };
      button(inspector, "preview", () => preview(candidate(false)));
      button(inspector, "applyPreset", () => apply(replaceVectorPath(read(), candidate(false)), "applyPreset"));
      button(inspector, "applyArea", () => apply(replaceVectorPath(read(), candidate(true)), "applyArea"));
      button(inspector, "convert", () => apply(convertVectorPreset(read(), path.id), "convert"));
    } else {
      button(inspector, path.source.closed ? "openPath" : "closePath", () =>
        apply(setCurveClosed(read(), path.id, path.source.kind === "curve" && !path.source.closed), "editCurve")
      );
      const vertexSide = select(inspector, "vertexSide", ["from", "to", "control1", "control2"]),
        vx = number(inspector, "vertexX", 0),
        vy = number(inspector, "vertexY", 0);
      button(inspector, "applyPoint", () => {
        const p = structuredClone(path);
        if (p.source.kind !== "curve") return;
        const i = p.source.segments.findIndex(s => s.id === segment.value);
        const key = vertexSide.value as "from" | "to" | "control1" | "control2";
        const point: Point = [Number(vx.value), Number(vy.value)];
        if (key === "from" || key === "to") moveCurveVertex(p, i, key, point);
        else moveCurveHandle(p, i, key, point, mode.value as VectorHandleMode);
        apply(replaceVectorPath(read(), p), "editCurve");
      });
      button(inspector, "split", () => {
        const ids = new Set(pathSegmentIds(path));
        let i = 0;
        while (ids.has(`split:${i}:a`) || ids.has(`split:${i}:b`)) i++;
        apply(
          splitVectorPath(read(), {
            pathId: path.id,
            segmentId: segment.value,
            t: Number(t.value),
            leftId: `split:${i}:a`,
            rightId: `split:${i}:b`
          }),
          "split"
        );
      });
      button(inspector, "join", () => {
        if (path.source.kind !== "curve") return;
        apply(
          removeCurveVertex(
            read(),
            path.id,
            path.source.segments.findIndex(s => s.id === segment.value)
          ),
          "join"
        );
      });
      button(inspector, "reverse", () => apply(reverseVectorPath(read(), path.id), "reverse"));
      const dx = number(inspector, "translateX", 0),
        dy = number(inspector, "translateY", 0),
        rotation = number(inspector, "rotation", 0);
      button(inspector, "transform", () => {
        const p = structuredClone(path);
        if (p.source.kind !== "curve") return;
        const a = (Number(rotation.value) * Math.PI) / 180,
          c = Math.cos(a),
          s = Math.sin(a);
        const transform = (q: Point): Point => [
          q[0] * c - q[1] * s + Number(dx.value),
          q[0] * s + q[1] * c + Number(dy.value)
        ];
        for (const segment of p.source.segments) {
          segment.from = transform(segment.from);
          segment.to = transform(segment.to);
          if (segment.kind === "cubic") {
            segment.control1 = transform(segment.control1);
            segment.control2 = transform(segment.control2);
          }
        }
        apply(replaceVectorPath(read(), p), "transform");
      });
    }
    button(inspector, "delete", () => {
      selectedId = "";
      apply(removeVectorPath(read(), path.id), "delete");
    });
  }
  function position(event: PointerEvent): Point {
    const svg = map.querySelector("svg")!;
    const matrix = svg.getScreenCTM?.();
    if (matrix) {
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return [p.x, -p.y];
    }
    const rect = svg.getBoundingClientRect(),
      box = svg.getAttribute("viewBox")!.split(" ").map(Number),
      scale = Math.min(rect.width / box[2], rect.height / box[3]);
    return [
      (event.clientX - rect.left - (rect.width - box[2] * scale) / 2) / scale + box[0],
      -((event.clientY - rect.top - (rect.height - box[3] * scale) / 2) / scale + box[1])
    ];
  }
  scope.listen(map, "pointerdown", event =>
    attempt(() => {
      if (event.button !== 0) return;
      map.focus();
      const target = event.target as Element,
        toolValue = tool.value as Tool;
      if (toolValue === "select") {
        const handle = target.closest<SVGElement>("[data-handle]");
        if (handle && read().paths[selectedId]?.editPolicy === "editable") {
          drag = {
            path: structuredClone(read().paths[selectedId]),
            index: Number(handle.dataset.segment),
            key: handle.dataset.handle as "from"
          };
          pointer = true;
          map.setPointerCapture?.(event.pointerId);
          return;
        }
        // Generated houses: the clicked street block's path, then only that block's houses.
        const cellId = target.closest<SVGElement>("[data-vector-fabric-cell]")?.dataset.vectorFabricCell,
          fabric = peek().fabric,
          house =
            cellId && fabric && Object.hasOwn(fabric.cells, cellId)
              ? fabricHouseInCell(fabric.cells[cellId], position(event))
              : undefined;
        if (house) {
          selectHouse(house);
          onSelectHouse?.(house);
          return;
        }
        // Fabric streets and lanes share one surface per owner; the line comes from the click point.
        const surfaceId = target.closest<SVGElement>("[data-vector-surface]")?.dataset.vectorSurface;
        if (surfaceId && /~[sl]$/.test(surfaceId) && onSelectFabricLine) {
          const line = nearestFabricLine(peek().fabric, position(event), 8);
          if (line?.id.startsWith(surfaceId)) {
            onSelectFabricLine(line.id);
            return;
          }
        }
        const hit = target.closest<SVGElement>("[data-vector-path],[data-vector-surface]");
        if (hit) selectPath((hit.dataset.vectorPath ?? hit.dataset.vectorSurface)!);
        return;
      }
      scope.invalidate("import");
      const point = position(event);
      pointer = true;
      map.setPointerCapture?.(event.pointerId);
      if (toolValue === "freehand") {
        points = [point];
        handles = [];
      } else {
        points.push(point);
        handles.push(undefined);
      }
      preview();
      event.preventDefault();
    })
  );
  scope.listen(map, "pointermove", event =>
    attempt(() => {
      if (!pointer) return;
      const point = position(event);
      if (drag) {
        if (drag.key === "from" || drag.key === "to") moveCurveVertex(drag.path, drag.index, drag.key, point);
        else moveCurveHandle(drag.path, drag.index, drag.key, point, mode.value as VectorHandleMode);
        preview(drag.path);
      } else if (tool.value === "freehand") {
        if (points.length >= 16384) throw new Error("precision-budget");
        points.push(point);
        preview();
      } else if (tool.value === "bezier") {
        handles[handles.length - 1] = point;
        preview();
      }
    })
  );
  scope.listen(map, "pointerup", event => {
    if (!pointer) return;
    pointer = false;
    if (map.hasPointerCapture?.(event.pointerId)) map.releasePointerCapture(event.pointerId);
    attempt(() => {
      if (drag) {
        const candidate = drag.path;
        drag = undefined;
        apply(replaceVectorPath(read(), candidate), "editCurve");
      } else if (tool.value === "freehand") finish();
    });
  });
  const cancel = () => {
    pointer = false;
    drag = undefined;
    points = [];
    handles = [];
    draw();
  };
  scope.listen(map, "pointercancel", cancel);
  scope.listen(rootForKeys(), "keydown", event => {
    if ((event.target as HTMLElement).matches("input,select,textarea")) return;
    if (event.key === "Escape") {
      cancel();
      event.preventDefault();
    }
    if (event.key === "Enter" && points.length) {
      attempt(finish);
      event.preventDefault();
    }
    if (event.key === "Backspace" && points.length) {
      points.pop();
      handles.pop();
      preview();
      event.preventDefault();
    }
  });
  function rootForKeys() {
    map.tabIndex = 0;
    return map;
  }
  scope.own(clearVectorGeometryCache);
  return {
    refresh,
    cancel,
    select(id: string) {
      if (!Object.hasOwn(peek().paths, id)) return;
      selectPath(id);
    },
    selectHouse
  };
}
