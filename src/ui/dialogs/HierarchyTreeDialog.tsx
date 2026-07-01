import type React from "react";
import { useEffect, useRef, useState } from "react";
import { initHierarchyTree, updateTree } from "../../controllers/hierarchy-tree";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { useHierarchyTreeState } from "../../store/hierarchyTreeState";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

// Local CSS for hierarchy tree
const localStyle = `
  .hierarchyTree_selectedOrigins > button { margin: 0 2px; }
  .hierarchyTree_container { display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%; }
  .hierarchyTree_container > svg { height: 100%; width: 100%; }
  .hierarchyTree_selectedOrigins { margin-right: 15px; }
  .hierarchyTree_selectedOrigin { border: 1px solid #aaa; background: none; padding: 1px 4px; }
  .hierarchyTree_selectedOrigin:hover { border: 1px solid #333; }
  .hierarchyTree_selectedOrigin::after { content: "✕"; margin-left: 8px; color: #999; }
  .hierarchyTree_selectedOrigin:hover:after { color: #333; }
  .hierarchyTree_originSelector > form > div { padding: 0.3em; margin: 1px 0; border-radius: 1em; }
  .hierarchyTree_originSelector > form > div:hover { background-color: #ddd; }
  .hierarchyTree_originSelector > form > div[data-checked="true"] { background-color: #c6d6d6; }
  g.hierarchyTree_nodes > g > text { pointer-events: none; stroke: none; font-size: 11px; }
  g.hierarchyTree_nodes > g.selected { stroke: #c13119; stroke-width: 1; cursor: move; }
  path.hierarchyTree_dragLine { marker-end: url(#end-arrow); stroke: #333333; stroke-dasharray: 5; stroke-dashoffset: 1000; animation: dash 80s linear backwards; }
`;

interface OriginSelectorProps {
  selectedNode: { i: number; name: string; origins: (number | null)[] };
  elements: { i: number; name: string; code?: string; color?: string; removed?: boolean }[];
  isOpen: boolean;
  onSelect: (origins: number[]) => void;
  onCancel: () => void;
}

const OriginSelector: React.FC<OriginSelectorProps> = ({ selectedNode, elements, isOpen, onSelect, onCancel }) => {
  const [primary, setPrimary] = useState(selectedNode.origins[0] || 0);
  const [secondary, setSecondary] = useState<number[]>(
    selectedNode.origins.slice(1).filter((v): v is number => v !== null)
  );

  const selectableElements = elements.filter(el => !el.removed && el.i !== selectedNode.i);

  return (
    <div
      className="hierarchyTree_originSelector"
      style={{
        display: isOpen ? "block" : "none",
        marginTop: "1em",
        padding: "1em",
        border: "1px solid #ccc",
        background: "#f9f9f9"
      }}
    >
      <h4>Select origins</h4>
      <form className="-hierarchy-tree-dialog__max-height-35vh--overflow-y-auto">
        {selectableElements.map(({ i, name, code, color }) => {
          const isPrimary = primary === i;
          const isChecked = isPrimary || secondary.includes(i);

          if (i === 0) {
            return (
              <div key={i} data-checked={isChecked}>
                <input type="radio" name="primary" value={i} checked={isPrimary} onChange={() => setPrimary(i)} /> Top
                level
              </div>
            );
          }
          return (
            <div key={i} data-checked={isChecked}>
              <input type="radio" name="primary" value={i} checked={isPrimary} onChange={() => setPrimary(i)} />
              <input
                type="checkbox"
                id={`selectElementOrigin${i}`}
                className="checkbox"
                checked={isChecked}
                onChange={e => {
                  if (e.target.checked) setSecondary([...secondary, i]);
                  else setSecondary(secondary.filter(v => v !== i));
                }}
              />
              <label htmlFor={`selectElementOrigin${i}`} className="checkbox-label">
                <FillBox fill={color as string} size=".8em" disabled />
                {code}: {name}
              </label>
            </div>
          );
        })}
      </form>
      <div className="-hierarchy-tree-dialog__margin-top-1em">
        <button
          type="button"
          onClick={() => {
            onSelect([primary, ...secondary.filter(s => s !== primary)]);
          }}
        >
          Select
        </button>
        <button type="button" onClick={onCancel} style={{ marginLeft: "0.5em" }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export const HierarchyTreeDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("hierarchyTree"));
  const {
    props,
    selectedElementId,
    originSelectorOpen,
    infoLine,
    updateElementCode,
    updateOrigins,
    setSelectedElementId,
    setOriginSelectorOpen
  } = useHierarchyTreeState(state => state);
  const svgRef = useRef<SVGSVGElement>(null);

  // Setup D3 context when dialog opens
  useEffect(() => {
    if (isOpen && svgRef.current && props) {
      initHierarchyTree(svgRef.current, props);
    }
  }, [isOpen, props]);

  if (!props) return null;

  const selectedNode = props.data.find(d => d.i === selectedElementId);

  return (
    <Dialog
      isOpen={isOpen}
      title={`${props.type.charAt(0).toUpperCase() + props.type.slice(1)} tree`}
      onClose={() => closeDialog("hierarchyTree")}
      className="-hierarchy-tree-dialog__width-700"
    >
      <style>{localStyle}</style>
      <div className="hierarchyTree_container -hierarchy-tree-dialog__min-height-400px">
        <svg ref={svgRef}>
          <title>{props.type} tree</title>
          <g
            id="hierarchyTree_viewbox"
            className="-hierarchy-tree-dialog__text-anchor-middle--dominant-baseline-central"
          >
            <g transform="translate(10, -45)">
              <g id="hierarchyTree_links" fill="none" stroke="#aaa">
                <g id="hierarchyTree_linksPrimary"></g>
                <g id="hierarchyTree_linksSecondary" strokeDasharray="1"></g>
              </g>
              <g id="hierarchyTree_nodes" className="hierarchyTree_nodes"></g>
              <path id="hierarchyTree_dragLine" className="hierarchyTree_dragLine" />
            </g>
          </g>
        </svg>

        <div id="hierarchyTree_details" className="chartInfo">
          {!selectedNode ? (
            <div id="hierarchyTree_infoLine" className="-hierarchy-tree-dialog__display-block">
              {infoLine}
            </div>
          ) : (
            <div id="hierarchyTree_selected">
              <span>
                <span id="hierarchyTree_selectedName">{selectedNode.name}</span>.{" "}
              </span>
              <span data-name="Type short name (abbreviation)">
                Abbreviation:
                <input
                  type="text"
                  maxLength={3}
                  size={3}
                  value={selectedNode.code ?? ""}
                  onChange={e => {
                    if (e.target.value.length > 3)
                      return tip("Abbreviation must be 3 characters or less", false, "error", 3000);
                    if (!e.target.value.length) return tip("Abbreviation cannot be empty", false, "error", 3000);
                    updateElementCode(selectedNode.i, e.target.value);
                    // Force text update in D3 node immediately
                    if (svgRef.current) {
                      const d3 = window.d3;
                      d3.select(svgRef.current).select(`g[data-id="${selectedNode.i}"] text`).text(e.target.value);
                    }
                  }}
                />
              </span>
              <span>
                Origins:
                <span className="hierarchyTree_selectedOrigins">
                  {selectedNode.origins
                    .filter(o => o !== null)
                    .map((origin, index) => {
                      const originEl = props.data.find(r => r.i === origin) || { name: "", code: "" };
                      const type = index ? "Secondary" : "Primary";
                      const tipText = `${type} origin: ${originEl.name}. Click to remove link to that origin`;
                      return (
                        <button
                          key={origin}
                          type="button"
                          className="hierarchyTree_selectedButton hierarchyTree_selectedOrigin"
                          data-tip={tipText}
                          onClick={() => {
                            const filtered = selectedNode.origins.filter(o => o !== origin);
                            updateOrigins(selectedNode.i, filtered.length ? filtered : [0]);
                            updateTree();
                          }}
                        >
                          {originEl.code}
                        </button>
                      );
                    })}
                </span>
              </span>
              <button
                type="button"
                data-tip="Edit this node's origins"
                className="hierarchyTree_selectedButton"
                onClick={() => setOriginSelectorOpen(!originSelectorOpen)}
              >
                Edit
              </button>
              <button
                type="button"
                data-tip="Unselect this node"
                className="hierarchyTree_selectedButton"
                onClick={() => {
                  setSelectedElementId(null);
                  if (svgRef.current) {
                    window.d3
                      .select(svgRef.current)
                      .select("g#hierarchyTree_nodes")
                      .selectAll("g")
                      .style("outline", "none");
                  }
                }}
              >
                Unselect
              </button>
            </div>
          )}
        </div>

        {originSelectorOpen && selectedNode && (
          <OriginSelector
            selectedNode={selectedNode}
            elements={props.data}
            isOpen={originSelectorOpen}
            onSelect={origins => {
              updateOrigins(selectedNode.i, origins);
              updateTree();
              setOriginSelectorOpen(false);
            }}
            onCancel={() => setOriginSelectorOpen(false)}
          />
        )}
      </div>
    </Dialog>
  );
};
