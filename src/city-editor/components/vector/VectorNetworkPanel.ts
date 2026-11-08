import { type EditorMessageKey, editorOptionText, editorText } from "../../../i18n/editorMessages";
import { HISTORICAL_PERIODS } from "../../../types/historicalPeriod";
import { prepareVectorEdit } from "../../generators/vector/editing/dependencies";
import {
  adoptVectorBridge,
  connectVectorAnchors,
  createInnerWall,
  createVectorGate,
  createWallGapRoad,
  disconnectVectorNode,
  networkId,
  proposeSquareBridge,
  removeVectorBridge,
  removeVectorGate,
  setWallCircuit
} from "../../generators/vector/editing/network";
import { evaluateAnchor, pathSegmentIds } from "../../generators/vector/geometry/curves";
import { unit } from "../../generators/vector/geometry/network";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import { line } from "../../renderers/svgPrimitives";
import { vectorPathSvg } from "../../renderers/vector/documentSvg";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { Point } from "../../types/primitives";
import type { CurveAnchor, VectorCityDocument } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.network.${key}` as EditorMessageKey);
export function createVectorNetworkPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  status: HTMLElement,
  readCurrent: () => VectorCityDocument,
  selected: () => string,
  commit: (document: VectorCityDocument, label: string) => void,
  peek: () => Readonly<VectorCityDocument> = readCurrent
) {
  const read = () => prepareVectorEdit(readCurrent());
  const details = document.createElement("details"),
    summary = document.createElement("summary"),
    body = document.createElement("div");
  summary.textContent = text("title");
  details.append(summary, body);
  parent.append(details);
  body.style.cssText = "display:flex;flex-direction:column;gap:8px;margin:10px 0";
  let pending: VectorCityDocument | undefined,
    pendingLabel = "";
  const field = (key: string, input: HTMLElement) => {
    const label = document.createElement("label");
    label.textContent = text(key);
    label.append(input);
    body.append(label);
    return input;
  };
  const numeric = (key: string, value: number) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.dataset.networkField = key;
    field(key, input);
    return input;
  };
  const choice = (key: string, values: { value: string; label: string }[]) => {
    const input = document.createElement("select");
    input.dataset.networkField = key;
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value.value;
      option.textContent = value.label;
      input.append(option);
    }
    field(key, input);
    return input;
  };
  const fail = (error: unknown) => {
    const raw = error instanceof Error ? error.message : "invalid-path",
      code =
        raw.match(
          /bridge-[a-z-]+|gate-[a-z-]+|road-clearance|circuit-containment|offset-split|route-budget|fixed-[a-z-]+|interior-connection|duplicate-connection|protected-land|no-candidate|referenced-segment/
        )?.[0] ?? raw,
      key = `cityEditor.vector.network.errors.${code}` as EditorMessageKey,
      message = editorText(key);
    status.textContent = message === key ? text("errors.invalid-network") : message;
  };
  const button = (key: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.networkAction = key;
    body.append(b);
    scope.listen(b, "click", () => {
      scope.invalidate("import");
      try {
        action();
      } catch (error) {
        pending = undefined;
        fail(error);
      }
    });
    return b;
  };
  const draft = (d: string, invalid = false) => {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.querySelector("[data-network-draft]")?.remove();
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    for (const [key, value] of Object.entries({
      d,
      fill: "none",
      stroke: invalid ? "#c22" : "#de6b26",
      "stroke-width": "2",
      "stroke-dasharray": "5 3",
      "vector-effect": "non-scaling-stroke",
      "pointer-events": "none",
      "data-network-draft": "true"
    }))
      path.setAttribute(key, value);
    svg.append(path);
  };
  const preview = (candidate: VectorCityDocument, key: string) => {
    assertVectorDocument(candidate);
    pending = candidate;
    pendingLabel = text(key);
    const current = read();
    draft(
      Object.values(candidate.paths)
        .filter(p => JSON.stringify(p) !== JSON.stringify(current.paths[p.id]))
        .map(vectorPathSvg)
        .join(" ")
    );
    status.textContent = text("candidateReady");
  };
  function refresh() {
    pending = undefined;
    const previousGate = body.querySelector<HTMLSelectElement>('[data-network-field="gate"]')?.value,
      previousBridge = body.querySelector<HTMLSelectElement>('[data-network-field="bridge"]')?.value;
    map.querySelector("[data-network-draft]")?.remove();
    scope.replaceChildren(body);
    const documentValue = read(),
      paths = Object.values(documentValue.paths),
      circuits = Object.values(documentValue.connections.circuits),
      gates = Object.values(documentValue.connections.gates),
      bridges = Object.values(documentValue.connections.bridges);
    const help = document.createElement("p");
    help.textContent = text("help");
    body.append(help);
    const anchor = (key: string, defaultId: string) => {
      const path = choice(
        `${key}Path`,
        paths.map(p => ({ value: p.id, label: `${p.id} (${editorOptionText(p.role)})` }))
      );
      if (paths.some(p => p.id === defaultId)) path.value = defaultId;
      const segment = choice(`${key}Segment`, []),
        t = numeric(`${key}T`, key === "source" ? 1 : 0.5);
      const fill = () => {
        segment.replaceChildren();
        const source = peek().paths[path.value];
        if (source)
          for (const id of pathSegmentIds(source)) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = id;
            segment.append(option);
          }
      };
      fill();
      scope.listen(path, "change", fill);
      return () => ({ pathId: path.value, segmentId: segment.value, t: Number(t.value) }) satisfies CurveAnchor;
    };
    const target = anchor("target", selected()),
      source = anchor("source", paths.find(p => p.role === "road" && p.id !== selected())?.id ?? paths[0]?.id ?? "");
    button("connect", () => commit(connectVectorAnchors(read(), target(), source()), text("connect")));
    const nodes = choice(
      "node",
      Object.values(documentValue.connections.nodes).map(n => ({ value: n.id, label: `${n.id} (${n.anchors.length})` }))
    );
    button("disconnect", () => commit(disconnectVectorNode(read(), nodes.value), text("disconnect")));
    const gate = choice("gate", [{ value: "", label: text("new") }, ...gates.map(g => ({ value: g.id, label: g.id }))]),
      kind = choice(
        "gateKind",
        ["passage", "water"].map(value => ({ value, label: text(value) }))
      ),
      gateWidth = numeric("gateWidth", 4);
    gate.value = gates.some(g => g.id === previousGate) ? previousGate! : (gates.at(-1)?.id ?? "");
    button("previewGate", () =>
      preview(
        createVectorGate(
          read(),
          target(),
          source(),
          Number(gateWidth.value),
          kind.value as "passage" | "water",
          gate.value || undefined
        ),
        "gateEdit"
      )
    );
    button("deleteGate", () => commit(removeVectorGate(read(), gate.value), text("deleteGate")));
    const parentCircuit = choice("parentCircuit", [
      { value: "", label: text("none") },
      ...circuits.map(c => ({ value: c.id, label: c.id }))
    ]);
    button("registerCircuit", () =>
      commit(setWallCircuit(read(), target().pathId, parentCircuit.value || undefined), text("registerCircuit"))
    );
    const outerCircuit = choice(
        "outerCircuit",
        circuits.map(c => ({ value: c.id, label: c.id }))
      ),
      offset = numeric("offset", 8);
    button("previewInner", () =>
      preview(createInnerWall(read(), outerCircuit.value, Number(offset.value)), "innerWall")
    );
    const innerCircuit = choice(
      "innerCircuit",
      circuits.map(c => ({ value: c.id, label: c.id }))
    );
    if (circuits.length > 1) innerCircuit.value = circuits[1].id;
    const sx = numeric("startX", -40),
      sy = numeric("startY", 26),
      ex = numeric("endX", 40),
      ey = numeric("endY", 26),
      roadWidth = numeric("roadWidth", 4),
      clearance = numeric("clearance", 0.5);
    button("previewRoute", () => {
      const start: Point = [Number(sx.value), Number(sy.value)],
        end: Point = [Number(ex.value), Number(ey.value)];
      draft(line([start, end]), true);
      preview(
        createWallGapRoad(
          read(),
          outerCircuit.value,
          innerCircuit.value,
          start,
          end,
          Number(roadWidth.value),
          Number(clearance.value)
        ),
        "wallRoad"
      );
    });
    const period = choice(
      "period",
      HISTORICAL_PERIODS.map(value => ({ value, label: editorOptionText(value) }))
    );
    period.value = documentValue.context.historicalPeriod;
    const tier = choice(
      "tier",
      [0, 1, 2].map(value => ({ value: String(value), label: text(`tier${value}`) }))
    );
    tier.value = String(documentValue.context.bridgeSkewTier ?? 0);
    button("applyTechnology", () => {
      const candidate = read();
      candidate.context.historicalPeriod = period.value as typeof candidate.context.historicalPeriod;
      candidate.context.bridgeSkewTier = Number(tier.value) as 0 | 1 | 2;
      candidate.revision++;
      assertVectorDocument(candidate);
      commit(candidate, text("applyTechnology"));
    });
    const bridge = choice("bridge", [
        { value: "", label: text("new") },
        ...bridges.map(b => ({ value: b.id, label: b.id }))
      ]),
      structure = choice(
        "structure",
        ["stone", "timber"].map(value => ({ value, label: text(value) }))
      ),
      landing = numeric("landing", 2);
    bridge.value = bridges.some(b => b.id === previousBridge) ? previousBridge! : (bridges.at(-1)?.id ?? "");
    button("previewSquare", () => {
      const a = target(),
        river = read().paths[a.pathId],
        p = evaluateAnchor(river, a),
        t = unit(evaluateAnchor(river, a, true)),
        half =
          Math.max(river.width.leftMeters, river.width.rightMeters) + Number(landing.value) + Number(roadWidth.value);
      draft(
        line([
          [p[0] + t[1] * half, p[1] - t[0] * half],
          [p[0] - t[1] * half, p[1] + t[0] * half]
        ]),
        true
      );
      preview(
        proposeSquareBridge(
          read(),
          a,
          Number(roadWidth.value),
          Number(landing.value),
          structure.value as "stone" | "timber"
        ),
        "bridgeEdit"
      );
    });
    const toSegment = choice("bridgeToSegment", []),
      toT = numeric("bridgeToT", 1);
    const fillBridgeEnd = () => {
      const path = read().paths[source().pathId];
      toSegment.replaceChildren();
      if (path)
        for (const id of pathSegmentIds(path)) {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = id;
          toSegment.append(option);
        }
      if (toSegment.options.length) toSegment.selectedIndex = toSegment.options.length - 1;
    };
    fillBridgeEnd();
    const sourcePath = body.querySelector<HTMLSelectElement>('[data-network-field="sourcePath"]')!;
    scope.listen(sourcePath, "change", fillBridgeEnd);
    button("previewExistingBridge", () => {
      const from = source(),
        id = bridge.value || networkId(read().connections.bridges, "bridge");
      preview(
        adoptVectorBridge(read(), {
          id,
          roadPathId: from.pathId,
          riverAnchor: target(),
          from,
          to: { pathId: from.pathId, segmentId: toSegment.value, t: Number(toT.value) },
          structure: structure.value as "stone" | "timber",
          dryLandingMeters: Number(landing.value),
          editPolicy: "editable"
        }),
        "bridgeEdit"
      );
    });
    button("toggleBridgeLock", () => {
      const candidate = read(),
        b = candidate.connections.bridges[bridge.value];
      if (!b) throw new Error("bridge-reference");
      b.editPolicy = b.editPolicy === "fixed" ? "editable" : "fixed";
      candidate.revision++;
      assertVectorDocument(candidate);
      commit(candidate, text("toggleBridgeLock"));
    });
    button("deleteBridge", () => commit(removeVectorBridge(read(), bridge.value), text("deleteBridge")));
    button("adopt", () => {
      if (!pending) throw new Error("no-candidate");
      const candidate = pending;
      pending = undefined;
      commit(candidate, pendingLabel);
    });
    button("cancel", () => {
      pending = undefined;
      map.querySelector("[data-network-draft]")?.remove();
      status.textContent = text("cancelled");
    });
  }
  scope.listen(body, "input", () => {
    scope.invalidate("import");
    pending = undefined;
    map.querySelector("[data-network-draft]")?.remove();
  });
  return {
    refresh,
    /** Follow the editor's selection without rebuilding the panel's lists. */
    selectTarget(id: string) {
      const target = body.querySelector<HTMLSelectElement>('[data-network-field="targetPath"]');
      if (!target || target.value === id || ![...target.options].some(o => o.value === id)) return;
      target.value = id;
      target.dispatchEvent(new Event("change"));
    }
  };
}
