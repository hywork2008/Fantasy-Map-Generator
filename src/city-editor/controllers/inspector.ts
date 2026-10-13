import { editorHtml, editorText } from "../../i18n/editorMessages";
import type { createEditorControls, FloatingWindow } from "../components/editorControls";
import { div, text } from "../components/editorControls";
import {
  evaluateApproachBeyond,
  normalizeApproachBeyond,
  REALM_RELATION_LABELS,
  REALM_RELATIONS,
  SETTLEMENT_ROLE_LABELS,
  SETTLEMENT_ROLES,
  SETTLEMENT_SCALE_LABELS,
  SETTLEMENT_SCALES
} from "../generators/approachBeyond";
import {
  createCastleOnFace,
  deleteCastle,
  regenerateCastleInterior,
  setCastleLocked,
  setCastlePartLocked
} from "../generators/castles";
import { syncDocumentCemeteries } from "../generators/cemeteryLayout";
import { defaultDistrictParameters, resolveDistricts, setDistrictParameters } from "../generators/fabricDistricts";
import {
  gateOpeningCandidates,
  placeGateOpening,
  removeEdgeFromGroup,
  toggleGate,
  vertexHasWall,
  vertexHasWallPassage
} from "../generators/features";
import { reservedCastleFaces } from "../generators/fortifications";
import { transformPlacedLandmark } from "../generators/landmarks";
import {
  clone,
  faceNeighbors,
  faceVertices,
  mergeFaces,
  setFaceDepth,
  setFaceElevation,
  setFaceWater,
  splitFace
} from "../generators/mesh";
import { openGatePassage } from "../generators/passages";
import { CASTLE_STYLE_PROFILES, resolveCastleStyle } from "../renderers/castlePatterns";
import { SHIP_SPECS } from "../renderers/shipSpecifications";
import type { DocumentsState, InteractionState } from "../state/editorSession";
import type { CastleStyle } from "../types/contracts/castlePatterns";
import type { InfillLane } from "../types/contracts/localInfill";
import type {
  ApproachBeyond,
  ApproachBeyondData,
  BeyondRealmRelation,
  CityDocument,
  EdgeFeatureGroup,
  Id,
  Point,
  SettlementRole,
  SettlementScale,
  WardKind,
  WaterKind
} from "../types/document";
import type { ContextMenuAction } from "../types/editor";
import type { RenderSelection } from "../types/selection";

export interface InspectorContext {
  controls: ReturnType<typeof createEditorControls>;
  scope: import("../services/editorLifetime").EditorLifetime;
  commit: (next: CityDocument, label?: string) => void;
  runContextAction: (operation: () => CityDocument | null, label?: string) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  showContextMenuAt: (clientX: number, clientY: number, actions: ContextMenuAction[]) => void;
  inspector: FloatingWindow;
  applySelection: (nextSelection: RenderSelection) => void;
  preservedLandmarkLanes: () => InfillLane[];
  refresh: () => void;
  documents: Pick<DocumentsState, "documentState">;
  interaction: Pick<InteractionState, "selection" | "activeGroupId" | "inspectedInfo">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createInspectorController(ctx: InspectorContext) {
  const { checkbox, divider, label, makeButton, makeIconButton, numberInput, rangeInput, select, toggleLabel } =
    ctx.controls;
  function appendApproachBeyondControls(
    container: HTMLElement,
    groupId: Id,
    current: ApproachBeyond | undefined
  ): void {
    const wrap = document.createElement("div");
    wrap.className = "ce-beyond-controls";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";
    wrap.style.marginTop = "8px";
    wrap.style.padding = "8px";
    wrap.style.border = "1px solid var(--line, #ccc)";
    wrap.style.borderRadius = "4px";
    wrap.style.background = "rgba(0,0,0,0.03)";

    const norm = normalizeApproachBeyond(current);

    const PRESETS = [
      {
        id: "city_domestic",
        get label() {
          return editorText("cityEditor.messages.cityHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "city" as const, role: "generic" as const, population: 15000, wealth: 70 }
        }
      },
      {
        id: "granary_domestic",
        get label() {
          return editorText("cityEditor.messages.foodSupplyingVillageHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "village" as const, role: "granary" as const, population: 800, wealth: 45 }
        }
      },
      {
        id: "fortress_enemy",
        get label() {
          return editorText("cityEditor.messages.fortressTownEnemyRealm");
        },
        data: {
          realm: { relation: "Enemy" as const },
          settlement: { scale: "town" as const, role: "fortress" as const, population: 4000, wealth: 55 }
        }
      },
      {
        id: "market_ally",
        get label() {
          return editorText("cityEditor.messages.tradingCityAlly");
        },
        data: {
          realm: { relation: "Ally" as const },
          settlement: { scale: "city" as const, role: "market" as const, population: 14000, wealth: 75 }
        }
      },
      {
        id: "hamlet_domestic",
        get label() {
          return editorText("cityEditor.messages.depopulatedHamletHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "hamlet" as const, role: "generic" as const, population: 150, wealth: 25 }
        }
      }
    ] as const;

    // プリセットセレクタ
    const presetSelect = document.createElement("select");
    presetSelect.className = "ce-approach-beyond-select";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = editorText("cityEditor.messages.none");
    presetSelect.appendChild(noneOption);
    for (const p of PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      presetSelect.appendChild(opt);
    }

    if (!norm) {
      presetSelect.value = "";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "city") {
      presetSelect.value = "city_domestic";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "village") {
      presetSelect.value = "granary_domestic";
    } else if (norm.realm.relation === "Enemy") {
      presetSelect.value = "fortress_enemy";
    } else if (norm.realm.relation === "Ally") {
      presetSelect.value = "market_ally";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "hamlet") {
      presetSelect.value = "hamlet_domestic";
    } else {
      presetSelect.value = "";
    }

    wrap.append(label(editorText("cityEditor.messages.beyondTheRoadPreset"), presetSelect));

    ctx.scope.listen(presetSelect, "change", () => {
      const next = clone(ctx.documents.documentState);
      const target = next.featureGroups.find(c => c.id === groupId);
      if (target?.kind !== "road") return;
      if (!presetSelect.value) {
        delete target.beyond;
        ctx.commit(next, editorText("cityEditor.messages.clearRoadDestination"));
        return;
      }
      const found = PRESETS.find(p => p.id === presetSelect.value);
      if (found) {
        target.beyond = structuredClone(found.data as ApproachBeyondData);
        ctx.commit(next, editorText("cityEditor.messages.changeRoadDestination"));
      }
    });

    if (norm) {
      // 1. 国・外交関係
      const realmSelect = document.createElement("select");
      realmSelect.className = "ce-beyond-realm-select";
      for (const rel of REALM_RELATIONS) {
        const opt = document.createElement("option");
        opt.value = rel;
        opt.textContent = REALM_RELATION_LABELS[rel];
        realmSelect.appendChild(opt);
      }
      realmSelect.value = norm.realm.relation;

      // 相手国名
      const stateInput = document.createElement("input");
      stateInput.type = "text";
      stateInput.className = "ce-beyond-state-input";
      stateInput.placeholder = editorText("cityEditor.messages.homeRealmOrRealmName");
      stateInput.value = norm.realm.stateName ?? "";

      // 2. 都市規模
      const scaleSelect = document.createElement("select");
      scaleSelect.className = "ce-beyond-scale-select";
      for (const s of SETTLEMENT_SCALES) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = SETTLEMENT_SCALE_LABELS[s];
        scaleSelect.appendChild(opt);
      }
      scaleSelect.value = norm.settlement.scale;

      // 都市役割
      const roleSelect = document.createElement("select");
      roleSelect.className = "ce-beyond-role-select";
      for (const r of SETTLEMENT_ROLES) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = SETTLEMENT_ROLE_LABELS[r];
        roleSelect.appendChild(opt);
      }
      roleSelect.value = norm.settlement.role ?? "generic";

      // 都市名
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "ce-beyond-name-input";
      nameInput.placeholder = editorText("cityEditor.messages.cityNameOptional");
      nameInput.value = norm.settlement.name ?? "";

      // 人口
      const popInput = document.createElement("input");
      popInput.type = "number";
      popInput.min = "10";
      popInput.step = "100";
      popInput.className = "ce-beyond-pop-input";
      popInput.value = String(norm.settlement.population ?? 1000);

      // 富
      const wealthInput = document.createElement("input");
      wealthInput.type = "number";
      wealthInput.min = "0";
      wealthInput.max = "100";
      wealthInput.className = "ce-beyond-wealth-input";
      wealthInput.value = String(norm.settlement.wealth ?? 50);

      // 評価パネル
      const assessBox = document.createElement("div");
      assessBox.className = "ce-beyond-assessment";
      assessBox.style.fontSize = "12px";
      assessBox.style.lineHeight = "1.4";
      assessBox.style.padding = "6px 8px";
      assessBox.style.background = "#fff";
      assessBox.style.borderRadius = "3px";
      assessBox.style.border = "1px solid rgba(0,0,0,0.12)";

      const assess = evaluateApproachBeyond(norm, {
        extentMeters: ctx.documents.documentState.frame.extentMeters,
        hasWalls: ctx.documents.documentState.featureGroups.some(g => g.kind === "wall")
      });

      if (assess) {
        assessBox.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>${editorHtml("cityEditor.messages.utility")}<span style="color: #2e7d32;">${assess.utilityLabel}</span></span>
            <span>${editorHtml("cityEditor.messages.defenceNeeded")}<span style="color: #c62828;">${assess.defenseLabel}</span></span>
          </div>
          <div style="color: #333; margin-bottom: 2px;">• ${assess.utilityReason}</div>
          <div style="color: #333;">• ${assess.defenseReason}</div>
        `;
      }

      function updateData(mutator: (d: ApproachBeyondData) => void, desc: string) {
        const next = clone(ctx.documents.documentState);
        const target = next.featureGroups.find(c => c.id === groupId);
        if (target?.kind !== "road") return;
        const currentData =
          normalizeApproachBeyond(target.beyond) ?? structuredClone(PRESETS[0].data as ApproachBeyondData);
        mutator(currentData);
        target.beyond = currentData;
        ctx.commit(next, desc);
      }

      ctx.scope.listen(realmSelect, "change", () => {
        updateData(d => {
          d.realm.relation = realmSelect.value as BeyondRealmRelation;
        }, editorText("cityEditor.messages.changeDiplomaticRelationship"));
      });
      ctx.scope.listen(stateInput, "change", () => {
        updateData(d => {
          d.realm.stateName = stateInput.value || undefined;
        }, editorText("cityEditor.messages.changeDestinationRealmName"));
      });
      ctx.scope.listen(scaleSelect, "change", () => {
        updateData(d => {
          d.settlement.scale = scaleSelect.value as SettlementScale;
        }, editorText("cityEditor.messages.changeSettlementScale"));
      });
      ctx.scope.listen(roleSelect, "change", () => {
        updateData(d => {
          d.settlement.role = roleSelect.value as SettlementRole;
        }, editorText("cityEditor.messages.changeSettlementRole"));
      });
      ctx.scope.listen(nameInput, "change", () => {
        updateData(d => {
          d.settlement.name = nameInput.value || undefined;
        }, editorText("cityEditor.messages.changeSettlementName"));
      });
      ctx.scope.listen(popInput, "change", () => {
        updateData(d => {
          d.settlement.population = Number(popInput.value) || 1000;
        }, editorText("cityEditor.messages.changeDestinationPopulation"));
      });
      ctx.scope.listen(wealthInput, "change", () => {
        updateData(d => {
          d.settlement.wealth = Number(wealthInput.value) || 50;
        }, editorText("cityEditor.messages.changeDestinationEconomy"));
      });

      wrap.append(
        label(editorText("cityEditor.messages.realmAndDiplomacy"), realmSelect),
        label(editorText("cityEditor.messages.realmName"), stateInput),
        label(editorText("cityEditor.messages.settlementScale"), scaleSelect),
        label(editorText("cityEditor.messages.specialisedRole"), roleSelect),
        label(editorText("cityEditor.messages.settlementName"), nameInput),
        label(editorText("cityEditor.messages.estimatedPopulation"), popInput),
        label(editorText("cityEditor.messages.economicIndexWealth0100"), wealthInput),
        label(editorText("cityEditor.messages.settlementAndDefenceAssessment"), assessBox)
      );
    }

    container.appendChild(wrap);
  }

  function populateInspectorEditControls(container: HTMLElement): void {
    const castle = ctx.documents.documentState.castles?.find(
      c =>
        c.id === ctx.interaction.selection.inspectedId ||
        (ctx.interaction.selection.faceId &&
          ctx.documents.documentState.defenseCircuits
            ?.find(d => d.id === c.circuitId)
            ?.areaFaceIds.includes(ctx.interaction.selection.faceId))
    );
    if (castle) {
      const currentProfile = resolveCastleStyle(ctx.documents.documentState, castle);
      const styleSelect = document.createElement("select");
      styleSelect.className = "ce-select";
      const styleChoices: Array<[string, string]> = [
        ["auto", editorText("cityEditor.messages.automaticAssessment")],
        ...Object.entries(CASTLE_STYLE_PROFILES).map(([k, p]) => [k, p.label] as [string, string])
      ];
      for (const [val, lbl] of styleChoices) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = lbl;
        if (val === (castle.castleStyle ?? "auto")) opt.selected = true;
        styleSelect.appendChild(opt);
      }
      styleSelect.onchange = () => {
        ctx.runContextAction(() => {
          const next = clone(ctx.documents.documentState);
          const target = next.castles?.find(c => c.id === castle.id);
          if (!target) return null;
          if (styleSelect.value === "auto") {
            delete target.castleStyle;
          } else {
            target.castleStyle = styleSelect.value as CastleStyle;
          }
          return next;
        }, editorText("cityEditor.messages.castleStyleChange"));
      };

      container.append(
        text(
          editorText("cityEditor.messages.castleCityEditorPage", {
            value0: castle.position,
            value1: castle.relationship,
            value2: castle.form
          })
        ),
        label(editorText("cityEditor.messages.style", { value0: currentProfile.label }), styleSelect),
        makeButton(
          castle.locked ? editorText("cityEditor.messages.unlockCastle") : editorText("cityEditor.messages.lockCastle"),
          () =>
            ctx.runContextAction(
              () => setCastleLocked(ctx.documents.documentState, castle.id, !castle.locked),
              editorText("cityEditor.messages.castleLock")
            )
        ),
        makeButton(editorText("cityEditor.messages.regenerateCastleInterior"), () =>
          ctx.runContextAction(
            () => regenerateCastleInterior(ctx.documents.documentState, castle.id, false),
            editorText("cityEditor.messages.castleLayout")
          )
        ),
        makeButton(editorText("cityEditor.messages.switchCastleForm"), () =>
          ctx.runContextAction(
            () => regenerateCastleInterior(ctx.documents.documentState, castle.id),
            editorText("cityEditor.messages.castleInterior")
          )
        ),
        makeButton(editorText("cityEditor.messages.deleteCastle"), () =>
          ctx.runContextAction(
            () => deleteCastle(ctx.documents.documentState, castle.id),
            editorText("cityEditor.messages.deleteCastle")
          )
        )
      );
      for (const part of castle.parts) {
        const input = checkbox(part.locked, checked =>
          ctx.runContextAction(
            () => setCastlePartLocked(ctx.documents.documentState, castle.id, part.id, checked),
            editorText("cityEditor.messages.castleBuildingLock")
          )
        );
        input.disabled = castle.locked;
        container.append(toggleLabel(editorText("cityEditor.messages.lock", { value0: part.role }), input));
      }
      return;
    }
    if (ctx.interaction.selection.faceId && !reservedCastleFaces(ctx.documents.documentState).size)
      container.append(
        makeButton(editorText("cityEditor.messages.createACastleInTheSelectedCell"), () =>
          ctx.runContextAction(
            () => createCastleOnFace(ctx.documents.documentState, ctx.interaction.selection.faceId!),
            editorText("cityEditor.messages.createCastle")
          )
        )
      );

    function appendWallMaterialControls(targetContainer: HTMLElement, wallGroup: EdgeFeatureGroup): void {
      const materialSelect = document.createElement("select");
      const optStone = document.createElement("option");
      optStone.value = "stone";
      optStone.textContent = editorText("cityEditor.messages.stoneMasonryWalls");
      const optWood = document.createElement("option");
      optWood.value = "wood";
      optWood.textContent = editorText("cityEditor.messages.woodPalisadeAndDefensiveWalls");
      materialSelect.append(optStone, optWood);
      materialSelect.value = wallGroup.wallMaterial ?? "stone";
      ctx.scope.listen(materialSelect, "change", () => {
        const nextMat = materialSelect.value as "stone" | "wood";
        const next = clone(ctx.documents.documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.wallMaterial = nextMat;
          target.style = {
            ...target.style,
            color: nextMat === "wood" ? "#7a522c" : "#342a22",
            widthMeters: nextMat === "wood" ? 2.4 : Math.max(4, target.style.widthMeters)
          };
          ctx.commit(
            next,
            editorText("cityEditor.messages.setMaterialTo", {
              value0: wallGroup.name,
              value1:
                nextMat === "wood" ? editorText("cityEditor.messages.wood") : editorText("cityEditor.messages.stone")
            })
          );
        }
      });

      const walkwaySelect = document.createElement("select");
      const optAuto = document.createElement("option");
      optAuto.value = "auto";
      optAuto.textContent = editorText("cityEditor.messages.automaticBasedOnWidth");
      const optWalkway = document.createElement("option");
      optWalkway.value = "walkway";
      optWalkway.textContent = editorText("cityEditor.messages.presentWallTopWalkway");
      const optNone = document.createElement("option");
      optNone.value = "none";
      optNone.textContent = editorText("cityEditor.messages.nonePalisadeOrSingleStoneWall");
      walkwaySelect.append(optAuto, optWalkway, optNone);
      walkwaySelect.value = wallGroup.walkway ?? "auto";
      ctx.scope.listen(walkwaySelect, "change", () => {
        const nextWalkway = walkwaySelect.value as "auto" | "none" | "walkway";
        const next = clone(ctx.documents.documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.walkway = nextWalkway;
          ctx.commit(
            next,
            editorText("cityEditor.messages.setWalkwayTo", { value0: wallGroup.name, value1: nextWalkway })
          );
        }
      });

      const currentWidth = wallGroup.style.widthMeters;
      const widthSlider = rangeInput(String(currentWidth), "1.0", "8.0", "0.2");
      const widthValue = document.createElement("span");
      widthValue.style.marginLeft = "6px";
      widthValue.style.fontSize = "11px";
      widthValue.textContent = editorText("cityEditor.messages.wallWidthMetres", { value0: currentWidth.toFixed(1) });

      ctx.scope.listen(widthSlider, "input", () => {
        widthValue.textContent = editorText("cityEditor.messages.wallWidthMetres", {
          value0: parseFloat(widthSlider.value).toFixed(1)
        });
      });
      ctx.scope.listen(widthSlider, "change", () => {
        const nextWidth = parseFloat(widthSlider.value);
        if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
        const next = clone(ctx.documents.documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.style = { ...target.style, widthMeters: nextWidth };
          ctx.commit(
            next,
            editorText("cityEditor.messages.setWidthToM", { value0: wallGroup.name, value1: nextWidth.toFixed(1) })
          );
        }
      });

      const widthRow = document.createElement("div");
      widthRow.style.display = "flex";
      widthRow.style.alignItems = "center";
      widthRow.append(widthSlider, widthValue);

      targetContainer.append(
        divider(),
        label(editorText("cityEditor.messages.wallMaterialCityEditorPage"), materialSelect),
        label(editorText("cityEditor.messages.wallTopWalkway"), walkwaySelect),
        label(editorText("cityEditor.messages.wallThicknessWidth"), widthRow)
      );
    }

    if (ctx.interaction.selection.edgeId && ctx.interaction.activeGroupId) {
      const group = ctx.documents.documentState.featureGroups.find(
        candidate => candidate.id === ctx.interaction.activeGroupId
      );
      if (group) {
        container.append(
          text(
            editorText("cityEditor.messages.selectedEdgeIn", {
              value0: ctx.interaction.selection.edgeId,
              value1: group.name
            })
          ),
          makeIconButton("×", editorText("cityEditor.messages.deleteSelectedEdge"), () => {
            const next = removeEdgeFromGroup(
              ctx.documents.documentState,
              group.id,
              ctx.interaction.selection.edgeId as Id
            );
            if (next) {
              ctx.interaction.selection.edgeId = null;
              ctx.commit(next, editorText("cityEditor.messages.deleteEdgeIn", { value0: group.name }));
            }
          })
        );
        if (group.kind === "road") appendApproachBeyondControls(container, group.id, group.beyond);
        if (group.kind === "wall") appendWallMaterialControls(container, group as EdgeFeatureGroup);
        return;
      }
    }
    if (ctx.interaction.activeGroupId) {
      const group = ctx.documents.documentState.featureGroups.find(
        candidate => candidate.id === ctx.interaction.activeGroupId
      );
      if (group) {
        if (group.kind === "road") appendApproachBeyondControls(container, group.id, group.beyond);
        if (group.kind === "wall") appendWallMaterialControls(container, group as EdgeFeatureGroup);
        container.appendChild(
          text(
            group.kind === "road"
              ? editorText("cityEditor.messages.describeTheDestinationOfARoadFromAnOuterWall")
              : group.locked
                ? `${group.name} is locked`
                : editorText("cityEditor.messages.routeDrawingInRiverRoadOrWallModeLeftDrag")
          )
        );
        return;
      }
    }
    if (ctx.interaction.selection.vertexId) {
      const vertex = ctx.documents.documentState.mesh.vertices[ctx.interaction.selection.vertexId];
      if (!vertex) return;
      const gate = ctx.documents.documentState.gates.find(candidate => candidate.vertexId === vertex.id);
      const wallVertex = vertexHasWall(ctx.documents.documentState, vertex.id);
      const gateButton = makeIconButton(
        gate ? "⌑" : "＋",
        gate
          ? editorText("cityEditor.messages.removeGate")
          : editorText("cityEditor.messages.placeGateOnThisWallVertex"),
        () => {
          if (gate) {
            const next = toggleGate(ctx.documents.documentState, vertex.id);
            if (next) ctx.commit(next, editorText("cityEditor.messages.removeGate"));
            return;
          }
          if (vertexHasWallPassage(ctx.documents.documentState, vertex.id)) {
            const next = toggleGate(ctx.documents.documentState, vertex.id);
            if (next) {
              ctx.commit(next, editorText("cityEditor.messages.placeGate"));
              return;
            }
          }
          const splitOpened = openGatePassage(ctx.documents.documentState, vertex.id);
          if (splitOpened) {
            ctx.commit(splitOpened, editorText("cityEditor.messages.placeGate"));
            return;
          }
          const candidates = gateOpeningCandidates(ctx.documents.documentState, vertex.id);
          if (candidates.length === 1) {
            const next = placeGateOpening(ctx.documents.documentState, vertex.id, candidates[0].vertexId);
            if (next) ctx.commit(next, editorText("cityEditor.messages.placeGate"));
            else ctx.showNotice(editorText("cityEditor.messages.cannotCreateAThroughRoadAtThisWallVertex"));
            return;
          }
          if (!candidates.length) {
            ctx.showNotice(editorText("cityEditor.messages.thisWallVertexHasNoEdgeThatCanBecomeA"));
            return;
          }
          const bounds = gateButton.getBoundingClientRect();
          ctx.showContextMenuAt(
            bounds.right + 6,
            bounds.top,
            candidates.map(candidate => ({
              label: editorText("cityEditor.messages.openVia", {
                value0: candidate.edgeId,
                value1: candidate.vertexId
              }),
              run: () =>
                ctx.runContextAction(
                  () => placeGateOpening(ctx.documents.documentState, vertex.id, candidate.vertexId),
                  editorText("cityEditor.messages.placeGate")
                ),
              highlight: { vertexId: candidate.vertexId, edgeId: candidate.edgeId }
            }))
          );
        }
      );
      gateButton.disabled = !wallVertex;
      container.append(
        text(editorText("cityEditor.messages.vertexCityEditorPage", { value0: vertex.id })),
        text(
          wallVertex
            ? editorText("cityEditor.messages.placeAGateToSplitAdjacentCellsAndCreateA")
            : editorText("cityEditor.messages.drawAnOuterWallThroughThisVertexBeforePlacingA")
        ),
        gateButton
      );
      return;
    }
    if (ctx.interaction.selection.faceId) {
      const face = ctx.documents.documentState.mesh.faces[ctx.interaction.selection.faceId];
      if (!face) return;
      const water = select(["land", "sea", "lake", "openWater"], face.properties.water);
      ctx.scope.listen(water, "change", () =>
        ctx.commit(
          setFaceWater(ctx.documents.documentState, face.id, water.value as WaterKind),
          editorText("cityEditor.messages.setWater", { value0: water.value })
        )
      );
      const elevation = numberInput(String(face.properties.elevation), "-1000", "1");
      ctx.scope.listen(elevation, "change", () =>
        ctx.commit(
          setFaceElevation(ctx.documents.documentState, face.id, Number(elevation.value)),
          editorText("cityEditor.messages.setElevation")
        )
      );
      const depth = numberInput(String(face.properties.depth ?? 3), "0", "0.1");
      depth.disabled = face.properties.locked || face.properties.water === "land";
      ctx.scope.listen(depth, "change", () =>
        ctx.commit(
          setFaceDepth(ctx.documents.documentState, face.id, Number(depth.value)),
          editorText("cityEditor.messages.setWaterDepth")
        )
      );
      const ward = select(
        [
          "",
          "market",
          "castle",
          "merchant",
          "craftsmen",
          "patriciate",
          "harbor",
          "park",
          "cemetery",
          ...(ctx.documents.documentState.gridKind === "evolution" ? ["farm"] : []),
          "empty"
        ],
        face.properties.ward ?? ""
      );
      const patriciateOption = [...ward.options].find(o => o.value === "patriciate");
      if (patriciateOption) patriciateOption.textContent = editorText("cityEditor.messages.patriciateWealthyDistrict");
      const cemeteryOption = [...ward.options].find(o => o.value === "cemetery");
      if (cemeteryOption) cemeteryOption.textContent = editorText("cityEditor.messages.cemeteryBurialGround");
      water.disabled = elevation.disabled = ward.disabled = face.properties.locked;
      ctx.scope.listen(ward, "change", () => {
        if (face.properties.locked) return;
        const next = clone(ctx.documents.documentState);
        next.mesh.faces[face.id].properties.ward = (ward.value || null) as WardKind | null;
        if (face.properties.ward === "cemetery" || ward.value === "cemetery") syncDocumentCemeteries(next, [face.id]);
        ctx.commit(
          next,
          ward.value
            ? editorText("cityEditor.messages.setWard", { value0: ward.value })
            : editorText("cityEditor.messages.clearWard")
        );
      });
      if (
        ctx.documents.documentState.gridKind === "evolution" ||
        ctx.documents.documentState.buildingPattern === "medieval"
      ) {
        const district = resolveDistricts(ctx.documents.documentState, ctx.documents.documentState.fabric).find(d =>
          d.faceIds.includes(face.id)
        );
        const parameters = district?.parameters ?? defaultDistrictParameters(face, ctx.documents.documentState);
        container.append(
          text(editorText("cityEditor.messages.districtCells", { value0: district?.faceIds.length ?? 1 }))
        );
        const fields = [
          ["occupancy", editorText("cityEditor.messages.lotOccupancy"), parameters.occupancy * 100, 0, 100, 1],
          ["coverage", editorText("cityEditor.messages.buildingCoverage"), parameters.coverage * 100, 15, 100, 1],
          ["lotArea", editorText("cityEditor.messages.targetLotAreaM2"), parameters.lotArea, 80, 3000, 10],
          ["laneWidth", editorText("cityEditor.messages.laneWidthM"), parameters.laneWidth, 1, 12, 0.2],
          [
            "orientation",
            editorText("cityEditor.messages.localStreetDirection"),
            (parameters.orientation * 180) / Math.PI,
            -180,
            180,
            1
          ]
        ] as const;
        for (const [key, title, value, min, max, step] of fields) {
          if (key === "coverage" && ctx.documents.documentState.buildingPattern === "medieval") continue;
          const input = numberInput(String(Math.round(value * 100) / 100), String(min), String(step));
          input.max = String(max);
          input.setAttribute("aria-label", title);
          input.disabled = face.properties.locked;
          ctx.scope.listen(input, "change", () => {
            const number = Number(input.value);
            const value =
              key === "occupancy" || key === "coverage"
                ? number / 100
                : key === "orientation"
                  ? (number * Math.PI) / 180
                  : number;
            const next = setDistrictParameters(ctx.documents.documentState, face.id, { [key]: value });
            if (next) ctx.commit(next, editorText("cityEditor.messages.editDistrictDensity"));
            else ctx.showNotice(editorText("cityEditor.messages.enterAValueWithinTheDistrictSettingRange"));
          });
          container.append(label(title, input));
        }
        if (
          ctx.documents.documentState.buildingPattern === "medieval" ||
          ctx.documents.documentState.fabric?.version === 5
        ) {
          const composition = select(
            ["standard", "commercial", "warehouses", "estates"],
            parameters.composition ?? "standard"
          );
          for (const option of [...composition.options])
            option.textContent = (
              {
                get standard() {
                  return editorText("cityEditor.messages.matchDistrict");
                },
                get commercial() {
                  return editorText("cityEditor.messages.merchantHouses");
                },
                get warehouses() {
                  return editorText("cityEditor.messages.warehouses");
                },
                get estates() {
                  return editorText("cityEditor.messages.manors");
                }
              } as Record<string, string>
            )[option.value];
          composition.disabled = face.properties.locked;
          ctx.scope.listen(composition, "change", () => {
            const next = setDistrictParameters(ctx.documents.documentState, face.id, {
              composition: composition.value as NonNullable<typeof parameters.composition>
            });
            if (next) ctx.commit(next, editorText("cityEditor.messages.changeBuildingComposition"));
          });
          container.append(label(editorText("cityEditor.messages.buildingComposition"), composition));
          for (const [key, title, initial] of [
            ["sizeVariation", editorText("cityEditor.messages.sizeVariation"), 0.7],
            ["gardenAmount", editorText("cityEditor.messages.gardensAndWorkYards"), 0.55],
            ["parcelCoverage", editorText("cityEditor.messages.targetBuildingCoverage"), 0.55]
          ] as const) {
            const value = parameters[key] ?? (key === "parcelCoverage" ? null : initial);
            const input = numberInput(
              value === null ? "" : String(Math.round(Math.max(key === "parcelCoverage" ? 0.55 : 0, value) * 100)),
              key === "parcelCoverage" ? "55" : "0",
              "1"
            );
            if (key === "parcelCoverage") input.placeholder = editorText("cityEditor.messages.matchPurpose");
            input.max = key === "parcelCoverage" ? "90" : "100";
            input.disabled = face.properties.locked;
            ctx.scope.listen(input, "change", () => {
              const next = setDistrictParameters(ctx.documents.documentState, face.id, {
                [key]: key === "parcelCoverage" && input.value === "" ? undefined : Number(input.value) / 100
              });
              if (next) ctx.commit(next, editorText("cityEditor.messages.editParcelProfile"));
              else ctx.showNotice(editorText("cityEditor.messages.enterAValueWithinTheDistrictSettingRange"));
            });
            container.append(label(title, input));
          }
          const preset = select(["small", "dense", "warehouse"], parameters.harborPreset ?? "dense");
          preset.options[0].textContent = editorText("cityEditor.messages.smallHarbour");
          preset.options[1].textContent = editorText("cityEditor.messages.denseTradingHarbour");
          preset.options[2].textContent = editorText("cityEditor.messages.warehouseHarbour");
          preset.disabled = face.properties.locked;
          ctx.scope.listen(preset, "change", () => {
            const next = setDistrictParameters(ctx.documents.documentState, face.id, {
              harborPreset: preset.value as NonNullable<typeof parameters.harborPreset>
            });
            if (next) ctx.commit(next, editorText("cityEditor.messages.changeHarborPreset"));
          });
          if (face.properties.ward === "harbor" || parameters.composition === "warehouses")
            container.append(label(editorText("cityEditor.messages.harbourComposition"), preset));
        }
        container.append(divider());
      }
      const vertices = faceVertices(ctx.documents.documentState.mesh, face);
      const splitFrom = select(vertices, vertices[0]);
      const splitTo = select(vertices, vertices[Math.floor(vertices.length / 2)]);
      const neighbors = faceNeighbors(ctx.documents.documentState.mesh, face.id);
      const mergeWith = select(neighbors, neighbors[0] ?? "");
      container.append(
        label(editorText("cityEditor.messages.elevation"), elevation),
        label(editorText("cityEditor.messages.water"), water),
        ...(face.properties.water !== "land" ? [label(editorText("cityEditor.messages.depthM"), depth)] : []),
        label(editorText("cityEditor.messages.ward"), ward),
        text(editorText("cityEditor.messages.wardAutomaticallyControlsTheLandmarkDrawnInThisCell")),
        divider(),
        label(editorText("cityEditor.messages.splitFrom"), splitFrom),
        label(editorText("cityEditor.messages.splitTo"), splitTo),
        makeIconButton("✂", editorText("cityEditor.messages.splitCell"), () => {
          const next = splitFace(ctx.documents.documentState, face.id, splitFrom.value, splitTo.value);
          if (next) ctx.commit(next, editorText("cityEditor.messages.splitCell"));
        }),
        label(editorText("cityEditor.messages.mergeWithCityEditorPage"), mergeWith),
        makeIconButton("⊕", editorText("cityEditor.messages.mergeCell"), () => {
          if (!mergeWith.value) return;
          const next = mergeFaces(ctx.documents.documentState, face.id, mergeWith.value);
          if (next) ctx.commit(next, editorText("cityEditor.messages.mergeCells"));
        })
      );
    }
  }

  function renderInspector(): void {
    ctx.scope.replaceChildren(ctx.inspector.content);

    if (ctx.interaction.inspectedInfo) {
      const kind = document.createElement("strong");
      kind.className = "ce-inspector-kind cg-inspector-kind";
      kind.textContent = ctx.interaction.inspectedInfo.label;

      const content = document.createElement("pre");
      content.className = "ce-inspector-content cg-inspector-content";
      content.textContent = JSON.stringify(ctx.interaction.inspectedInfo, null, 2);

      const clearButton = makeButton(editorText("cityEditor.messages.clearSelection"), () => {
        ctx.interaction.inspectedInfo = null;
        ctx.interaction.activeGroupId = null;
        ctx.applySelection({
          faceId: null,
          edgeId: null,
          vertexId: null,
          groupId: null,
          inspectedId: null
        });
      });

      ctx.inspector.content.append(kind, content, clearButton);

      if (ctx.interaction.inspectedInfo.layer === "landmarks" && typeof ctx.interaction.inspectedInfo.id === "string") {
        const instance = ctx.documents.documentState.landmarks?.find(
          item => item.id === ctx.interaction.inspectedInfo?.id
        );
        if (instance && !instance.locked) {
          const x = numberInput(String(instance.position[0]), "-100000", "0.1");
          const y = numberInput(String(instance.position[1]), "-100000", "0.1");
          const angle = numberInput(String((instance.rotation * 180) / Math.PI), "-360", "1");
          const scale = numberInput(String(instance.scale), "0.01", "0.01");
          ctx.inspector.content.append(
            divider(),
            label(editorText("cityEditor.messages.xM"), x),
            label(editorText("cityEditor.messages.yM"), y),
            label(editorText("cityEditor.messages.rotation"), angle),
            label(editorText("cityEditor.messages.scale"), scale),
            makeButton(editorText("cityEditor.messages.updateLandmark"), () => {
              const result = transformPlacedLandmark(
                ctx.documents.documentState,
                instance.id,
                {
                  position: [Number(x.value), Number(y.value)],
                  rotation: (Number(angle.value) * Math.PI) / 180,
                  scale: Number(scale.value)
                },
                ctx.preservedLandmarkLanes()
              );
              if (result.document)
                ctx.commit(
                  result.document,
                  editorText("cityEditor.messages.update", {
                    value0: ctx.interaction.inspectedInfo?.label ?? "landmark"
                  })
                );
              else ctx.showNotice(result.reasons.join("; "));
            })
          );
          ctx.inspector.content.appendChild(
            makeButton(editorText("cityEditor.messages.deleteLandmark"), () => {
              ctx.commit(
                {
                  ...ctx.documents.documentState,
                  landmarks: ctx.documents.documentState.landmarks?.filter(item => item.id !== instance.id)
                },
                editorText("cityEditor.messages.delete", { value0: ctx.interaction.inspectedInfo?.label ?? "landmark" })
              );
              ctx.interaction.inspectedInfo = null;
              ctx.interaction.selection.inspectedId = null;
              ctx.refresh();
            })
          );
        }
      }

      if (
        ctx.interaction.inspectedInfo.layer === "elements" &&
        ctx.interaction.inspectedInfo.kind === "ship" &&
        typeof ctx.interaction.inspectedInfo.id === "string"
      ) {
        const shipElem = ctx.documents.documentState.elements.find(
          item => item.id === ctx.interaction.inspectedInfo?.id
        );
        if (shipElem && !shipElem.locked && shipElem.point) {
          const x = numberInput(String(shipElem.point[0]), "-100000", "0.1");
          const y = numberInput(String(shipElem.point[1]), "-100000", "0.1");
          const length = numberInput(String(shipElem.sizeMeters ?? SHIP_SPECS.small.defaultSizeMeters), "5", "1");
          const angle = numberInput(String(((shipElem.rotation ?? 0) * 180) / Math.PI), "-360", "1");
          ctx.inspector.content.append(
            divider(),
            label(editorText("cityEditor.messages.xM"), x),
            label(editorText("cityEditor.messages.yM"), y),
            label(editorText("cityEditor.messages.lengthM"), length),
            label(editorText("cityEditor.messages.rotation"), angle),
            makeButton(editorText("cityEditor.messages.updateShip"), () => {
              const updated = ctx.documents.documentState.elements.map(item => {
                if (item.id !== shipElem.id) return item;
                return {
                  ...item,
                  point: [Number(x.value), Number(y.value)] as Point,
                  sizeMeters: Number(length.value) || item.sizeMeters,
                  rotation: (Number(angle.value) * Math.PI) / 180
                };
              });
              ctx.commit(
                { ...ctx.documents.documentState, elements: updated },
                editorText("cityEditor.messages.updateShipCityEditorPage", { value0: shipElem.id })
              );
            }),
            makeButton(editorText("cityEditor.messages.deleteShip"), () => {
              ctx.commit(
                {
                  ...ctx.documents.documentState,
                  elements: ctx.documents.documentState.elements.filter(item => item.id !== shipElem.id)
                },
                editorText("cityEditor.messages.deleteShipCityEditorPage", { value0: shipElem.id })
              );
              ctx.interaction.inspectedInfo = null;
              ctx.interaction.selection.inspectedId = null;
              ctx.refresh();
            })
          );
        }
      }

      const editSection = div("ce-inspector-edit-section");
      populateInspectorEditControls(editSection);
      if (editSection.hasChildNodes()) {
        ctx.inspector.content.append(divider(), editSection);
      }
      return;
    }

    const editSection = div("ce-inspector-edit-section");
    populateInspectorEditControls(editSection);
    if (editSection.hasChildNodes()) {
      ctx.inspector.content.append(editSection);
    } else {
      ctx.inspector.content.appendChild(text(editorText("cityEditor.messages.selectACellToSetWaterAWardOrAn")));
    }
  }

  return { appendApproachBeyondControls, populateInspectorEditControls, renderInspector };
}
