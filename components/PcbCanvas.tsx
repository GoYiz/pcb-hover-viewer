"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentItem, TraceItem } from "@/types/pcb";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  visibleLayers?: string[];
  focusComponentId?: string;
  hoveredId?: string;
  hoveredType?: "component" | "trace";
  directIds: string[];
  traceHighlightIds: string[];
  onHoverFeature: (type?: "component" | "trace", id?: string) => void;
};

const PAD = 20;

function mapX(x: number, bw: number, w: number) {
  return PAD + (x / Math.max(bw, 1)) * (w - PAD * 2);
}
function mapY(y: number, bh: number, h: number) {
  return PAD + (y / Math.max(bh, 1)) * (h - PAD * 2);
}
function unmapPoint(px: number, py: number, width: number, height: number, bw: number, bh: number) {
  return { x: ((px - PAD) / Math.max(width - PAD * 2, 1)) * bw, y: ((py - PAD) / Math.max(height - PAD * 2, 1)) * bh };
}

export default function PcbCanvas({
  width,
  height,
  boardWidthMm,
  boardHeightMm,
  components,
  traces,
  visibleLayers = ["F.Cu", "B.Cu"],
  focusComponentId,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  onHoverFeature,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<any>(null);
  const bridgeKeyRef = useRef("");
  const [bridgeState, setBridgeState] = useState({
    tool: "select" as "select" | "measure" | "pan",
    zoom: 1,
    ox: 0,
    oy: 0,
    sc: [] as string[],
    st: [] as string[],
    vd: "grid,components,labels,measures",
    lm: "adaptive",
    gm: "major+minor",
  });

  useEffect(() => {
    let isDestroy = false;

    import("leafer-ui")
      .then(({ Leafer, Rect, Text, Line, Group }) => {
        if (isDestroy || !hostRef.current || runtimeRef.current) return;

        const viewId = `leafer-view-${Math.random().toString(36).slice(2)}`;
        hostRef.current.innerHTML = `<div id="${viewId}" style="width:${width}px;height:${height}px"></div>`;

        const leafer = new Leafer({ view: viewId });
        const gridLayer = new Group();
        const boardLayer = new Group();
        const traceLayer = new Group();
        const compLayer = new Group();
        const overlayLayer = new Group();
        leafer.add(gridLayer);
        leafer.add(boardLayer);
        leafer.add(traceLayer);
        leafer.add(compLayer);
        leafer.add(overlayLayer);

        const board = new Rect({
          x: PAD,
          y: PAD,
          width: width - PAD * 2,
          height: height - PAD * 2,
          stroke: "#1e40af",
          strokeWidth: 2,
          fill: "#0f172a",
        });
        boardLayer.add(board);

        const title = new Text({
          x: 24,
          y: height - 24,
          text: "Leafer 2D · selection / measure / partial updates",
          fill: "#cbd5e1",
          fontSize: 12,
        });
        overlayLayer.add(title);

        const selectionBar = new Text({
          x: 24,
          y: height - 44,
          text: "Selection · 0 components · 0 traces · Total 0",
          fill: "#67e8f9",
          fontSize: 11,
        });
        overlayLayer.add(selectionBar);

        const topToolbar = new Rect({ x: 24, y: 40, width: 954, height: 30, fill: "rgba(15,23,42,0.82)", stroke: "rgba(148,163,184,0.24)", strokeWidth: 1, cornerRadius: 10 });
        overlayLayer.add(topToolbar);
        const sideToolbar = new Rect({ x: 24, y: 80, width: 58, height: 126, fill: "rgba(15,23,42,0.82)", stroke: "rgba(148,163,184,0.24)", strokeWidth: 1, cornerRadius: 10 });
        overlayLayer.add(sideToolbar);
        const toolbarLayer = new Group();
        overlayLayer.add(toolbarLayer);
        const helpLayer = new Group();
        overlayLayer.add(helpLayer);

        const hud = new Text({
          x: width - 320,
          y: 18,
          text: "Layer: All · Zoom 1.00x · Selected 0 · Measure —",
          fill: "#93c5fd",
          fontSize: 12,
        });
        overlayLayer.add(hud);

        const hint = new Text({
          x: 24,
          y: 18,
          text: "Drag pan · Wheel zoom · Shift box select · Shift+Cmd/Ctrl append box select · Alt+Shift+Cmd/Ctrl subtract box select · Alt+Shift box zoom · Cmd/Ctrl click append select · Double click to measure · ? help",
          fill: "#64748b",
          fontSize: 11,
        });
        overlayLayer.add(hint);

        const measurePanel = new Rect({
          x: width - 314,
          y: 44,
          width: 290,
          height: 152,
          fill: "rgba(15,23,42,0.82)",
          stroke: "rgba(99,102,241,0.35)",
          strokeWidth: 1,
          cornerRadius: 10,
        });
        const measurePanelTitle = new Text({
          x: width - 296,
          y: 58,
          text: "Measurements",
          fill: "#c4b5fd",
          fontSize: 12,
        });
        const measureCopyAllBg = new Rect({ x: width - 144, y: 54, width: 56, height: 18, cornerRadius: 6, fill: "rgba(30,64,175,0.78)" });
        const measureCopyAllText = new Text({ x: width - 135, y: 58, text: "CopyAll", fill: "#dbeafe", fontSize: 10.5 });
        const measureClearBg = new Rect({ x: width - 82, y: 54, width: 52, height: 18, cornerRadius: 6, fill: "rgba(127,29,29,0.72)" });
        const measureClearText = new Text({ x: width - 71, y: 58, text: "Clear", fill: "#fecaca", fontSize: 10.5 });
        const measurePanelBody = new Text({
          x: width - 296,
          y: 80,
          text: "No saved measurements",
          fill: "#94a3b8",
          fontSize: 11,
        });
        const measurePanelListLayer = new Group();
        overlayLayer.add(measurePanel);
        overlayLayer.add(measurePanelTitle);
        overlayLayer.add(measureCopyAllBg);
        overlayLayer.add(measureCopyAllText);
        overlayLayer.add(measureClearBg);
        overlayLayer.add(measureClearText);
        overlayLayer.add(measurePanelBody);
        overlayLayer.add(measurePanelListLayer);

        const selectedPanel = new Rect({
          x: width - 314,
          y: height - 214,
          width: 290,
          height: 152,
          fill: "rgba(15,23,42,0.82)",
          stroke: "rgba(34,211,238,0.35)",
          strokeWidth: 1,
          cornerRadius: 10,
        });
        const selectedPanelTitle = new Text({
          x: width - 296,
          y: height - 198,
          text: "Selected Objects",
          fill: "#67e8f9",
          fontSize: 12,
        });
        const selectedCenterBg = new Rect({ x: width - 108, y: height - 202, width: 34, height: 18, cornerRadius: 6, fill: "rgba(8,145,178,0.75)" });
        const selectedCenterText = new Text({ x: width - 102, y: height - 198, text: "Ctr", fill: "#cffafe", fontSize: 10.5 });
        const selectedZoomBg = new Rect({ x: width - 68, y: height - 202, width: 34, height: 18, cornerRadius: 6, fill: "rgba(30,64,175,0.78)" });
        const selectedZoomText = new Text({ x: width - 62, y: height - 198, text: "Zoom", fill: "#dbeafe", fontSize: 10.5 });
        const selectedPanelBody = new Text({
          x: width - 296,
          y: height - 176,
          text: "No selection",
          fill: "#94a3b8",
          fontSize: 11,
        });
        const selectedPanelListLayer = new Group();
        overlayLayer.add(selectedPanel);
        overlayLayer.add(selectedPanelTitle);
        overlayLayer.add(selectedCenterBg);
        overlayLayer.add(selectedCenterText);
        overlayLayer.add(selectedZoomBg);
        overlayLayer.add(selectedZoomText);
        overlayLayer.add(selectedPanelBody);
        overlayLayer.add(selectedPanelListLayer);

        const inspectorPanel = new Rect({
          x: width - 314,
          y: 206,
          width: 290,
          height: Math.max(170, height - 430),
          fill: "rgba(15,23,42,0.82)",
          stroke: "rgba(251,191,36,0.35)",
          strokeWidth: 1,
          cornerRadius: 10,
        });
        const inspectorTitle = new Text({
          x: width - 296,
          y: 220,
          text: "Inspector",
          fill: "#fcd34d",
          fontSize: 12,
        });
        const inspectorBody = new Text({
          x: width - 296,
          y: 244,
          text: "Hover an object or select one item",
          fill: "#94a3b8",
          fontSize: 11,
        });
        overlayLayer.add(inspectorPanel);
        overlayLayer.add(inspectorTitle);
        overlayLayer.add(inspectorBody);

        const cursorH = new Line({ points: [0, 0, width, 0], stroke: "rgba(34,211,238,0.55)", strokeWidth: 1, visible: false });
        const cursorV = new Line({ points: [0, 0, 0, height], stroke: "rgba(34,211,238,0.55)", strokeWidth: 1, visible: false });
        overlayLayer.add(cursorH);
        overlayLayer.add(cursorV);

        const box = new Rect({
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          stroke: "#f59e0b",
          strokeWidth: 1.5,
          fill: "rgba(245,158,11,0.08)",
          visible: false,
        });
        overlayLayer.add(box);

        const measureHistoryLayer = new Group();
        overlayLayer.add(measureHistoryLayer);

        const measureLine = new Line({ points: [0, 0, 0, 0], stroke: "#a78bfa", strokeWidth: 2, visible: false });
        const measureProjH = new Line({ points: [0, 0, 0, 0], stroke: "rgba(34,211,238,0.8)", strokeWidth: 1.5, dashPattern: [6, 4], visible: false });
        const measureProjV = new Line({ points: [0, 0, 0, 0], stroke: "rgba(56,189,248,0.8)", strokeWidth: 1.5, dashPattern: [6, 4], visible: false });
        const measureProjLabel = new Text({ x: 0, y: 0, text: "", fill: "#a5f3fc", fontSize: 11, visible: false });
        const measureLabel = new Text({ x: 0, y: 0, text: "", fill: "#ddd6fe", fontSize: 12, visible: false });
        const measureP1 = new Rect({ x: 0, y: 0, width: 6, height: 6, fill: "#c4b5fd", cornerRadius: 3, visible: false });
        const measureP2 = new Rect({ x: 0, y: 0, width: 6, height: 6, fill: "#c4b5fd", cornerRadius: 3, visible: false });
        const snapMarker = new Rect({ x: 0, y: 0, width: 10, height: 10, stroke: "#f472b6", strokeWidth: 1.5, fill: "rgba(244,114,182,0.10)", cornerRadius: 5, visible: false });
        overlayLayer.add(measureLine);
        overlayLayer.add(measureProjH);
        overlayLayer.add(measureProjV);
        overlayLayer.add(measureProjLabel);
        overlayLayer.add(measureLabel);
        overlayLayer.add(measureP1);
        overlayLayer.add(measureP2);
        overlayLayer.add(snapMarker);

        const traceMap = new Map<string, any>();
        const compMap = new Map<string, any>();
        const labelMap = new Map<string, any>();
        const labelAnchorMap = new Map<string, { x: number; y: number }>();
        const markerMap = new Map<string, any>();
        const compBoundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();
        const traceBoundsMap = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

        const selectedCompIds = new Set<string>();
        const selectedTraceIds = new Set<string>();
        const scaleRef = { value: 1 };
        const offsetRef = { x: 0, y: 0 };
        const dragRef = { active: false, x: 0, y: 0 };
        const boxRef = { active: false, sx: 0, sy: 0, ex: 0, ey: 0, mode: "select" as "select" | "zoom" | "subtract", append: false };
        const measureRef = { p1: null as null | { x: number; y: number }, p2: null as null | { x: number; y: number }, preview: null as null | { x: number; y: number }, distanceMm: null as null | number, dxMm: null as null | number, dyMm: null as null | number, snap: null as null | { x: number; y: number } };
        const measureHistory: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number }; dxMm: number; dyMm: number; distanceMm: number }> = [];
        const measureUiRef = { selectedIndex: -1, hoverIndex: -1, copyFlashIndex: -1, copyAllFlash: false };
        const selectionUiRef = { hoverKind: null as null | "component" | "trace", hoverId: null as null | string };
        const snapPoints: Array<{ x: number; y: number }> = [];
        const SNAP_RADIUS = 12;
        const toolModeRef = { value: "select" as "select" | "measure" | "pan" };
        const selectionFilterRef = { value: "all" as "all" | "component" | "trace" };
        const detailVisibilityRef = { value: { grid: true, components: true, labels: true, measures: true } };
        const helpRef = { visible: false };

        const readUrlState = () => {
          if (typeof window === "undefined") return null;
          const params = new URL(window.location.href).searchParams;
          const zoom = Number(params.get("zoom"));
          const ox = Number(params.get("ox"));
          const oy = Number(params.get("oy"));
          const sc = (params.get("sc") || "").split(",").filter(Boolean);
          const st = (params.get("st") || "").split(",").filter(Boolean);
          return {
            zoom: Number.isFinite(zoom) ? zoom : null,
            ox: Number.isFinite(ox) ? ox : null,
            oy: Number.isFinite(oy) ? oy : null,
            sc,
            st,
          };
        };

        const writeUrlState = () => {
          if (typeof window === "undefined") return;
          const url = new URL(window.location.href);
          const params = url.searchParams;
          const selectedCompList = Array.from(selectedCompIds);
          const selectedTraceList = Array.from(selectedTraceIds);
          if (Math.abs(scaleRef.value - 1) < 1e-6) params.delete("zoom");
          else params.set("zoom", scaleRef.value.toFixed(3));
          if (Math.abs(offsetRef.x) < 1e-3) params.delete("ox");
          else params.set("ox", offsetRef.x.toFixed(1));
          if (Math.abs(offsetRef.y) < 1e-3) params.delete("oy");
          else params.set("oy", offsetRef.y.toFixed(1));
          if (selectedCompList.length) params.set("sc", selectedCompList.join(","));
          else params.delete("sc");
          if (selectedTraceList.length) params.set("st", selectedTraceList.join(","));
          else params.delete("st");
          window.history.replaceState({}, "", url.toString());
        };

        const getExportSlug = () => {
          if (typeof window === "undefined") return "board";
          const parts = window.location.pathname.split("/").filter(Boolean);
          return parts[parts.length - 1] || "board";
        };

        const applyCamera = () => {
          for (const layer of [gridLayer, boardLayer, traceLayer, compLayer]) {
            layer.scaleX = scaleRef.value;
            layer.scaleY = scaleRef.value;
            layer.x = offsetRef.x;
            layer.y = offsetRef.y;
          }
        };

        const updateHud = () => {
          const label = visibleLayers.length === 0 || visibleLayers.length === 2 ? "All" : visibleLayers.join(" + ");
          const count = selectedCompIds.size + selectedTraceIds.size;
          const currentMeasureText = measureRef.distanceMm == null ? "—" : `ΔX ${Math.abs(measureRef.dxMm || 0).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm || 0).toFixed(2)} · D ${measureRef.distanceMm.toFixed(2)} mm`;
          hud.text = `Layer: ${label} · Zoom ${scaleRef.value.toFixed(2)}x · Tool ${toolModeRef.value} · Selected ${count} · Measures ${measureHistory.length} · Current ${currentMeasureText}`;
          hud.x = width - 18 - Math.max(320, String(hud.text).length * 6.7);
          const modeText = boxRef.active ? (boxRef.mode === "zoom" ? " · Box Zoom" : boxRef.mode === "subtract" ? " · Box Subtract" : boxRef.append ? " · Box Append" : " · Box Replace") : "";
          const filterLabel = selectionFilterRef.value === "all" ? "All" : selectionFilterRef.value === "component" ? "Comp" : "Trace";
          selectionBar.text = `Selection · Filter ${filterLabel} · ${selectedCompIds.size} components · ${selectedTraceIds.size} traces · Total ${count}${modeText}`;
          const visibleDetail = Object.entries(detailVisibilityRef.value)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
            .join(",") || "-";
          const nextBridge = {
            tool: toolModeRef.value,
            zoom: scaleRef.value,
            ox: offsetRef.x,
            oy: offsetRef.y,
            sc: Array.from(selectedCompIds),
            st: Array.from(selectedTraceIds),
            vd: visibleDetail,
            lm: "adaptive",
            gm: "major+minor",
          };
          const bridgeKey = JSON.stringify(nextBridge);
          if (bridgeKeyRef.current !== bridgeKey) {
            bridgeKeyRef.current = bridgeKey;
            setBridgeState(nextBridge);
          }
        };

        const zoomToFitBoard = () => {
          scaleRef.value = 1;
          offsetRef.x = 0;
          offsetRef.y = 0;
          renderGrid();
          applyCamera();
          refreshStyles();
        };

        const createToolbarButton = (x: number, y: number, w: number, h: number, label: string, active: boolean, fill: string) => {
          const bg = new Rect({ x, y, width: w, height: h, cornerRadius: 8, fill: active ? fill : "rgba(30,41,59,0.66)", stroke: active ? "rgba(255,255,255,0.16)" : "rgba(148,163,184,0.16)", strokeWidth: 1 });
          const text = new Text({ x: x + 8, y: y + 7, text: label, fill: active ? "#f8fafc" : "#cbd5e1", fontSize: 11 });
          toolbarLayer.add(bg);
          toolbarLayer.add(text);
          return { bg, text };
        };

        const renderHelpOverlay = () => {
          helpLayer.clear();
          if (!helpRef.visible) return;
          const panel = new Rect({ x: width / 2 - 250, y: height / 2 - 165, width: 500, height: 330, cornerRadius: 16, fill: "rgba(2,6,23,0.92)", stroke: "rgba(148,163,184,0.28)", strokeWidth: 1.2 });
          const title = new Text({ x: width / 2 - 226, y: height / 2 - 138, text: "Keyboard & Interaction Help", fill: "#e2e8f0", fontSize: 16 });
          const body = new Text({ x: width / 2 - 226, y: height / 2 - 104, text: [
            "?  Toggle help",
            "Esc  Clear current measure / clear all measurements / close help",
            "Wheel  Zoom",
            "Drag  Pan",
            "Shift + Drag  Box select",
            "Shift + Cmd/Ctrl + Drag  Append box select",
            "Alt + Shift + Drag  Box zoom",
            "Alt + Shift + Cmd/Ctrl + Drag  Subtract box select",
            "Cmd/Ctrl + Click  Append/toggle selection",
            "Double click  Measure two points",
            "Shift during measure  Orthogonal constraint",
            "Enter  Commit current measure",
            "Backspace  Delete last measure",
          ].join("\n"), fill: "#cbd5e1", fontSize: 12 });
          const footer = new Text({ x: width / 2 - 226, y: height / 2 + 128, text: "Tap Help or press ? again to close", fill: "#94a3b8", fontSize: 11 });
          helpLayer.add(panel);
          helpLayer.add(title);
          helpLayer.add(body);
          helpLayer.add(footer);
        };

        const toggleHelp = () => {
          helpRef.visible = !helpRef.visible;
          renderHelpOverlay();
          leafer.forceRender?.();
        };

        const getSelectionBounds = () => {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const id of selectedCompIds) {
            const b = compBoundsMap.get(id);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
          }
          for (const id of selectedTraceIds) {
            const b = traceBoundsMap.get(id);
            if (!b) continue;
            minX = Math.min(minX, b.minX);
            minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX);
            maxY = Math.max(maxY, b.maxY);
          }
          if (!Number.isFinite(minX)) return null;
          return { minX, minY, maxX, maxY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
        };

        const centerSelection = () => {
          const b = getSelectionBounds();
          if (!b) return;
          const cx = (b.minX + b.maxX) / 2;
          const cy = (b.minY + b.maxY) / 2;
          offsetRef.x = width / 2 - cx * scaleRef.value;
          offsetRef.y = height / 2 - cy * scaleRef.value;
          renderGrid();
          applyCamera();
          updateHud();
          writeUrlState();
        };

        const zoomToSelection = () => {
          const b = getSelectionBounds();
          if (!b) return;
          const pad = 28;
          const nextScale = Math.max(0.6, Math.min(3.5, Math.min((width - pad * 2) / b.width, (height - pad * 2) / b.height)));
          scaleRef.value = nextScale;
          offsetRef.x = width / 2 - ((b.minX + b.maxX) / 2) * scaleRef.value;
          offsetRef.y = height / 2 - ((b.minY + b.maxY) / 2) * scaleRef.value;
          renderGrid();
          applyCamera();
          refreshStyles();
        };

        const focusComponentById = (id: string) => {
          const b = compBoundsMap.get(id);
          if (!b) return;
          selectedCompIds.clear();
          selectedTraceIds.clear();
          selectedCompIds.add(id);
          const pad = 36;
          const nextScale = Math.max(0.8, Math.min(3.5, Math.min((width - pad * 2) / Math.max(b.width, 6), (height - pad * 2) / Math.max(b.height, 6))));
          scaleRef.value = nextScale;
          offsetRef.x = width / 2 - (b.x + b.width / 2) * scaleRef.value;
          offsetRef.y = height / 2 - (b.y + b.height / 2) * scaleRef.value;
          renderGrid();
          applyCamera();
          refreshStyles();
          writeUrlState();
        };

        const renderToolbars = () => {
          toolbarLayer.clear();
          const selectBtn = createToolbarButton(32, 88, 42, 28, "Sel", toolModeRef.value === "select", "rgba(245,158,11,0.82)");
          const measureBtn = createToolbarButton(32, 122, 42, 28, "Mea", toolModeRef.value === "measure", "rgba(167,139,250,0.82)");
          const panBtn = createToolbarButton(32, 156, 42, 28, "Pan", toolModeRef.value === "pan", "rgba(34,211,238,0.82)");
          const fitBtn = createToolbarButton(32, 46, 42, 18, "Fit", false, "rgba(30,64,175,0.78)");
          const ctrBtn = createToolbarButton(80, 46, 58, 18, "CenterSel", false, "rgba(8,145,178,0.75)");
          const zoomBtn = createToolbarButton(144, 46, 52, 18, "ZoomSel", false, "rgba(30,64,175,0.78)");
          const clearSelBtn = createToolbarButton(202, 46, 58, 18, "ClrSel", false, "rgba(127,29,29,0.72)");
          const clearMeaBtn = createToolbarButton(266, 46, 64, 18, "ClrMeas", false, "rgba(127,29,29,0.72)");
          const shotBtn = createToolbarButton(336, 46, 46, 18, "Shot", false, "rgba(22,163,74,0.80)");
          const exportTxtBtn = createToolbarButton(388, 46, 54, 18, "ExpTxt", false, "rgba(2,132,199,0.80)");
          const measCsvBtn = createToolbarButton(448, 46, 62, 18, "MeasCSV", false, "rgba(8,145,178,0.82)");
          const selJsonBtn = createToolbarButton(516, 46, 58, 18, "SelJSON", false, "rgba(79,70,229,0.82)");
          const filterAllBtn = createToolbarButton(580, 46, 40, 18, "All", selectionFilterRef.value === "all", "rgba(100,116,139,0.82)");
          const filterCompBtn = createToolbarButton(626, 46, 46, 18, "Comp", selectionFilterRef.value === "component", "rgba(245,158,11,0.82)");
          const filterTraceBtn = createToolbarButton(678, 46, 50, 18, "Trace", selectionFilterRef.value === "trace", "rgba(59,130,246,0.82)");
          const helpBtn = createToolbarButton(734, 46, 42, 18, helpRef.visible ? "Hide?" : "Help", helpRef.visible, "rgba(14,165,233,0.82)");
          const gridBtn = createToolbarButton(782, 46, 42, 18, "Grid", detailVisibilityRef.value.grid, "rgba(16,185,129,0.82)");
          const compBtn = createToolbarButton(830, 46, 44, 18, "Comp", detailVisibilityRef.value.components, "rgba(245,158,11,0.82)");
          const labelBtn = createToolbarButton(880, 46, 46, 18, "Label", detailVisibilityRef.value.labels, "rgba(168,85,247,0.82)");
          const measBtn = createToolbarButton(932, 46, 44, 18, "Meas", detailVisibilityRef.value.measures, "rgba(6,182,212,0.82)");
          for (const node of [selectBtn.bg, selectBtn.text]) node.on("pointer.tap", () => { toolModeRef.value = "select"; renderVisibility(); });
          for (const node of [measureBtn.bg, measureBtn.text]) node.on("pointer.tap", () => { toolModeRef.value = "measure"; renderVisibility(); });
          for (const node of [panBtn.bg, panBtn.text]) node.on("pointer.tap", () => { toolModeRef.value = "pan"; renderVisibility(); });
          for (const node of [fitBtn.bg, fitBtn.text]) node.on("pointer.tap", () => { zoomToFitBoard(); });
          for (const node of [ctrBtn.bg, ctrBtn.text]) node.on("pointer.tap", () => { centerSelection(); renderVisibility(); });
          for (const node of [zoomBtn.bg, zoomBtn.text]) node.on("pointer.tap", () => { zoomToSelection(); renderVisibility(); });
          for (const node of [clearSelBtn.bg, clearSelBtn.text]) node.on("pointer.tap", () => { clearSelection(); renderVisibility(); });
          for (const node of [clearMeaBtn.bg, clearMeaBtn.text]) node.on("pointer.tap", () => { clearAllMeasures(); renderVisibility(); });
          for (const node of [shotBtn.bg, shotBtn.text]) node.on("pointer.tap", () => { exportCanvasShot(); });
          for (const node of [exportTxtBtn.bg, exportTxtBtn.text]) node.on("pointer.tap", () => { exportWorkbenchText(); });
          for (const node of [measCsvBtn.bg, measCsvBtn.text]) node.on("pointer.tap", () => { exportMeasurementsCsv(); });
          for (const node of [selJsonBtn.bg, selJsonBtn.text]) node.on("pointer.tap", () => { exportSelectionJson(); });
          for (const node of [filterAllBtn.bg, filterAllBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "all"; renderVisibility(); });
          for (const node of [filterCompBtn.bg, filterCompBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "component"; renderVisibility(); });
          for (const node of [filterTraceBtn.bg, filterTraceBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "trace"; renderVisibility(); });
          for (const node of [helpBtn.bg, helpBtn.text]) node.on("pointer.tap", () => { toggleHelp(); renderToolbars(); });
          for (const node of [gridBtn.bg, gridBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.grid = !detailVisibilityRef.value.grid; renderVisibility(); });
          for (const node of [compBtn.bg, compBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.components = !detailVisibilityRef.value.components; renderVisibility(); });
          for (const node of [labelBtn.bg, labelBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.labels = !detailVisibilityRef.value.labels; renderVisibility(); });
          for (const node of [measBtn.bg, measBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.measures = !detailVisibilityRef.value.measures; renderVisibility(); });
        };

        const renderInspector = () => {
          let source: "hover" | "selected" | "summary" = "summary";
          let kind: "component" | "trace" | null = null;
          let targetId: string | null = null;

          if (hoveredId && hoveredType) {
            source = "hover";
            kind = hoveredType;
            targetId = hoveredId;
          } else if (selectedCompIds.size + selectedTraceIds.size === 1) {
            source = "selected";
            if (selectedCompIds.size === 1) {
              kind = "component";
              targetId = Array.from(selectedCompIds)[0];
            } else if (selectedTraceIds.size === 1) {
              kind = "trace";
              targetId = Array.from(selectedTraceIds)[0];
            }
          }

          if (kind === "component" && targetId) {
            const comp = components.find((c) => c.id === targetId);
            if (!comp) {
              inspectorBody.text = "Component not found";
              return;
            }
            const nets = (comp.netIds || []).slice(0, 5).join(", ") || "—";
            inspectorBody.text = [
              `Source: ${source}`,
              `Type: Component`,
              `Refdes: ${comp.refdes}`,
              `ID: ${comp.id}`,
              `Footprint: ${comp.footprint || "—"}`,
              `Rotation: ${comp.rotation}°`,
              `XY: ${comp.x.toFixed(2)}, ${comp.y.toFixed(2)} mm`,
              `BBox: ${comp.bbox.map((n) => n.toFixed(2)).join(", ")}`,
              `Nets: ${nets}`,
            ].join("\n");
            return;
          }

          if (kind === "trace" && targetId) {
            const trace = traces.find((tr) => tr.id === targetId);
            if (!trace) {
              inspectorBody.text = "Trace not found";
              return;
            }
            inspectorBody.text = [
              `Source: ${source}`,
              `Type: Trace`,
              `ID: ${trace.id}`,
              `Net: ${trace.netId}`,
              `Layer: ${trace.layerId}`,
              `Width: ${trace.width} mm`,
              `Points: ${trace.path.length}`,
              `Start: ${trace.path[0]?.map((n) => n.toFixed(2)).join(", ") || "—"}`,
              `End: ${trace.path[trace.path.length - 1]?.map((n) => n.toFixed(2)).join(", ") || "—"}`,
            ].join("\n");
            return;
          }

          inspectorBody.text = [
            "Source: summary",
            `Board: ${boardWidthMm.toFixed(2)} × ${boardHeightMm.toFixed(2)} mm`,
            `Components: ${components.length}`,
            `Traces: ${traces.length}`,
            `Selected Components: ${selectedCompIds.size}`,
            `Selected Traces: ${selectedTraceIds.size}`,
            `Measures: ${measureHistory.length}`,
            `Tool: ${toolModeRef.value}`,
            ].join("\n");
        };

        const renderSelectionPanel = () => {
          selectedPanelListLayer.clear();
          const items = [
            ...Array.from(selectedCompIds).map((id) => ({ kind: "component" as const, id, label: components.find((c) => c.id === id)?.refdes || id })),
            ...Array.from(selectedTraceIds).map((id) => ({ kind: "trace" as const, id, label: id })),
          ];
          if (!items.length) {
            selectedPanelBody.text = "No selection";
            return;
          }
          selectedPanelBody.text = "";
          items.slice(0, 6).forEach((item, idx) => {
            const y = height - 176 + idx * 20;
            const hover = selectionUiRef.hoverKind === item.kind && selectionUiRef.hoverId === item.id;
            const rowBg = new Rect({ x: width - 300, y: y - 2, width: 246, height: 18, cornerRadius: 6, fill: hover ? "rgba(34,211,238,0.16)" : "rgba(30,41,59,0.55)" });
            const rowText = new Text({ x: width - 294, y, text: `${item.kind === "component" ? "C" : "T"} · ${item.label}`, fill: hover ? "#cffafe" : "#cbd5e1", fontSize: 10.5 });
            const delBg = new Rect({ x: width - 50, y: y - 2, width: 20, height: 18, cornerRadius: 6, fill: "rgba(127,29,29,0.75)" });
            const delText = new Text({ x: width - 44, y, text: "×", fill: "#fecaca", fontSize: 12 });
            const hoverIn = () => {
              selectionUiRef.hoverKind = item.kind;
              selectionUiRef.hoverId = item.id;
              onHoverFeature(item.kind, item.id);
              renderSelectionPanel();
              leafer.forceRender?.();
            };
            const hoverOut = () => {
              if (selectionUiRef.hoverKind === item.kind && selectionUiRef.hoverId === item.id) {
                selectionUiRef.hoverKind = null;
                selectionUiRef.hoverId = null;
                onHoverFeature(undefined, undefined);
                renderSelectionPanel();
                leafer.forceRender?.();
              }
            };
            const focusItem = () => {
              onHoverFeature(item.kind, item.id);
              leafer.forceRender?.();
            };
            const removeItem = () => {
              if (item.kind === "component") selectedCompIds.delete(item.id);
              else selectedTraceIds.delete(item.id);
              if (selectionUiRef.hoverKind === item.kind && selectionUiRef.hoverId === item.id) {
                selectionUiRef.hoverKind = null;
                selectionUiRef.hoverId = null;
                onHoverFeature(undefined, undefined);
              }
              refreshStyles();
              renderSelectionPanel();
              leafer.forceRender?.();
            };
            for (const node of [rowBg, rowText]) {
              node.on("pointer.tap", focusItem);
              node.on("pointer.enter", hoverIn);
              node.on("pointer.leave", hoverOut);
            }
            delBg.on("pointer.tap", removeItem);
            delText.on("pointer.tap", removeItem);
            selectedPanelListLayer.add(rowBg);
            selectedPanelListLayer.add(rowText);
            selectedPanelListLayer.add(delBg);
            selectedPanelListLayer.add(delText);
          });
        };

        const snapPoint = (x: number, y: number) => {
          let best = { x, y };
          let bestD = SNAP_RADIUS;
          let snapped = false;
          for (const p of snapPoints) {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) {
              best = p;
              bestD = d;
              snapped = true;
            }
          }
          measureRef.snap = snapped ? best : null;
          snapMarker.visible = snapped;
          if (snapped) {
            snapMarker.x = best.x - 5;
            snapMarker.y = best.y - 5;
          }
          return best;
        };

        const applyOrthogonalConstraint = (x: number, y: number, enabled: boolean) => {
          if (!enabled || !measureRef.p1) return { x, y };
          const dx = x - measureRef.p1.x;
          const dy = y - measureRef.p1.y;
          return Math.abs(dx) >= Math.abs(dy) ? { x, y: measureRef.p1.y } : { x: measureRef.p1.x, y };
        };

        const resetCurrentMeasure = () => {
          measureRef.p1 = null;
          measureRef.p2 = null;
          measureRef.preview = null;
          measureRef.snap = null;
          measureRef.distanceMm = null;
          measureRef.dxMm = null;
          measureRef.dyMm = null;
          snapMarker.visible = false;
        };

        const buildAllMeasurementsText = () => {
          if (!measureHistory.length) return "No saved measurements";
          return measureHistory
            .map((item, index) => `#${index + 1}  ΔX ${Math.abs(item.dxMm).toFixed(2)}  ΔY ${Math.abs(item.dyMm).toFixed(2)}  D ${item.distanceMm.toFixed(2)} mm`)
            .join("\n");
        };

        const copyAllMeasurements = () => {
          const nav = typeof navigator !== "undefined" ? navigator : undefined;
          nav?.clipboard?.writeText?.(buildAllMeasurementsText());
          measureUiRef.copyAllFlash = true;
          measureCopyAllBg.fill = "rgba(21,128,61,0.85)";
          measureCopyAllText.text = "✓All";
          renderMeasurePanel();
          leafer.forceRender?.();
          window.setTimeout(() => {
            measureUiRef.copyAllFlash = false;
            measureCopyAllBg.fill = "rgba(30,64,175,0.78)";
            measureCopyAllText.text = "CopyAll";
            renderMeasurePanel();
            leafer.forceRender?.();
          }, 900);
        };

        const triggerDownload = (filename: string, href: string) => {
          if (typeof document === "undefined") return;
          const link = document.createElement("a");
          link.href = href;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
        };

        const exportCanvasShot = () => {
          const canvas = hostRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
          if (!canvas) return;
          const boardSlug = getExportSlug();
          triggerDownload(`${boardSlug}-workbench-shot.png`, canvas.toDataURL("image/png"));
        };

        const buildWorkbenchExportText = () => {
          const layerLabel = visibleLayers.length === 0 || visibleLayers.length === 2 ? "All" : visibleLayers.join(" + ");
          const selectedComponents = Array.from(selectedCompIds).map((id) => components.find((c) => c.id === id)?.refdes || id);
          const selectedTraces = Array.from(selectedTraceIds);
          return [
            `Board: ${getExportSlug()}`,
            `Layer: ${layerLabel}`,
            `Tool: ${toolModeRef.value}`,
            `Zoom: ${scaleRef.value.toFixed(3)}`,
            `Offset: ${offsetRef.x.toFixed(1)}, ${offsetRef.y.toFixed(1)}`,
            `Selected Components (${selectedComponents.length}): ${selectedComponents.join(", ") || "-"}`,
            `Selected Traces (${selectedTraces.length}): ${selectedTraces.join(", ") || "-"}`,
            "",
            "Measurements:",
            buildAllMeasurementsText(),
          ].join("\n");
        };

        const exportWorkbenchText = () => {
          const boardSlug = getExportSlug();
          const blob = new Blob([buildWorkbenchExportText()], { type: "text/plain;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          triggerDownload(`${boardSlug}-workbench-export.txt`, href);
          window.setTimeout(() => URL.revokeObjectURL(href), 1500);
        };

        const buildMeasurementsCsv = () => {
          const rows = [
            ["index", "p1_x_mm", "p1_y_mm", "p2_x_mm", "p2_y_mm", "dx_mm", "dy_mm", "distance_mm"],
            ...measureHistory.map((item, index) => [
              String(index + 1),
              item.p1.x.toFixed(4),
              item.p1.y.toFixed(4),
              item.p2.x.toFixed(4),
              item.p2.y.toFixed(4),
              item.dxMm.toFixed(4),
              item.dyMm.toFixed(4),
              item.distanceMm.toFixed(4),
            ]),
          ];
          return rows.map((row) => row.join(",")).join("\n");
        };

        const exportMeasurementsCsv = () => {
          const boardSlug = getExportSlug();
          const blob = new Blob([buildMeasurementsCsv()], { type: "text/csv;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          triggerDownload(`${boardSlug}-measurements.csv`, href);
          window.setTimeout(() => URL.revokeObjectURL(href), 1500);
        };

        const buildSelectionJson = () => {
          const selectedComponents = Array.from(selectedCompIds).map((id) => {
            const comp = components.find((c) => c.id === id);
            if (!comp) return { id, missing: true };
            return {
              kind: "component",
              id: comp.id,
              refdes: comp.refdes,
              footprint: comp.footprint,
              x: comp.x,
              y: comp.y,
              rotation: comp.rotation,
              bbox: comp.bbox,
              netIds: comp.netIds || [],
            };
          });
          const selectedTraces = Array.from(selectedTraceIds).map((id) => {
            const trace = traces.find((tr) => tr.id === id);
            if (!trace) return { id, missing: true };
            return {
              kind: "trace",
              id: trace.id,
              netId: trace.netId,
              layerId: trace.layerId,
              width: trace.width,
              points: trace.path.length,
              path: trace.path,
            };
          });
          return JSON.stringify({
            board: getExportSlug(),
            tool: toolModeRef.value,
            zoom: Number(scaleRef.value.toFixed(3)),
            offset: { x: Number(offsetRef.x.toFixed(1)), y: Number(offsetRef.y.toFixed(1)) },
            selectedComponents,
            selectedTraces,
          }, null, 2);
        };

        const exportSelectionJson = () => {
          const boardSlug = getExportSlug();
          const blob = new Blob([buildSelectionJson()], { type: "application/json;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          triggerDownload(`${boardSlug}-selection.json`, href);
          window.setTimeout(() => URL.revokeObjectURL(href), 1500);
        };

        const renderMeasurePanel = () => {
          measurePanelListLayer.clear();
          if (!measureHistory.length) {
            measurePanelBody.text = "No saved measurements";
            return;
          }
          measurePanelBody.text = "";
          const items = measureHistory.slice(-6);
          const startIndex = measureHistory.length - items.length;
          items.forEach((item, idx) => {
            const realIndex = startIndex + idx;
            const y = 80 + idx * 20;
            const active = measureUiRef.selectedIndex === realIndex;
            const hover = measureUiRef.hoverIndex === realIndex;
            const emph = active || hover;
            const valueText = `#${realIndex + 1}  ΔX ${Math.abs(item.dxMm).toFixed(2)}  ΔY ${Math.abs(item.dyMm).toFixed(2)}  D ${item.distanceMm.toFixed(2)} mm`;
            const rowBg = new Rect({ x: width - 300, y: y - 2, width: 206, height: 18, cornerRadius: 6, fill: active ? "rgba(99,102,241,0.22)" : hover ? "rgba(34,211,238,0.16)" : "rgba(30,41,59,0.55)" });
            const rowText = new Text({ x: width - 294, y, text: valueText, fill: emph ? "#e9d5ff" : "#cbd5e1", fontSize: 10.5 });
            const copyBg = new Rect({ x: width - 90, y: y - 2, width: 18, height: 18, cornerRadius: 6, fill: measureUiRef.copyFlashIndex === realIndex ? "rgba(21,128,61,0.85)" : "rgba(30,64,175,0.78)" });
            const copyText = new Text({ x: width - 85, y, text: measureUiRef.copyFlashIndex === realIndex ? "✓" : "C", fill: "#dbeafe", fontSize: 10.5 });
            const delBg = new Rect({ x: width - 66, y: y - 2, width: 18, height: 18, cornerRadius: 6, fill: "rgba(127,29,29,0.75)" });
            const delText = new Text({ x: width - 61, y, text: "×", fill: "#fecaca", fontSize: 12 });
            const rerender = () => {
              renderMeasurePanel();
              renderMeasureHistory();
              leafer.forceRender?.();
            };
            const toggleActive = () => {
              measureUiRef.selectedIndex = measureUiRef.selectedIndex === realIndex ? -1 : realIndex;
              rerender();
            };
            const hoverIn = () => {
              measureUiRef.hoverIndex = realIndex;
              rerender();
            };
            const hoverOut = () => {
              if (measureUiRef.hoverIndex === realIndex) measureUiRef.hoverIndex = -1;
              rerender();
            };
            const copyItem = () => {
              const nav = typeof navigator !== "undefined" ? navigator : undefined;
              nav?.clipboard?.writeText?.(valueText);
              measureUiRef.copyFlashIndex = realIndex;
              renderMeasurePanel();
              leafer.forceRender?.();
              window.setTimeout(() => {
                if (measureUiRef.copyFlashIndex === realIndex) {
                  measureUiRef.copyFlashIndex = -1;
                  renderMeasurePanel();
                  leafer.forceRender?.();
                }
              }, 800);
            };
            const removeItem = () => {
              measureHistory.splice(realIndex, 1);
              if (measureUiRef.selectedIndex === realIndex) measureUiRef.selectedIndex = -1;
              else if (measureUiRef.selectedIndex > realIndex) measureUiRef.selectedIndex -= 1;
              if (measureUiRef.hoverIndex === realIndex) measureUiRef.hoverIndex = -1;
              else if (measureUiRef.hoverIndex > realIndex) measureUiRef.hoverIndex -= 1;
              if (measureUiRef.copyFlashIndex === realIndex) measureUiRef.copyFlashIndex = -1;
              else if (measureUiRef.copyFlashIndex > realIndex) measureUiRef.copyFlashIndex -= 1;
              renderMeasurePanel();
              renderMeasureHistory();
              updateHud();
              leafer.forceRender?.();
            };
            for (const node of [rowBg, rowText]) {
              node.on("pointer.tap", toggleActive);
              node.on("pointer.enter", hoverIn);
              node.on("pointer.leave", hoverOut);
            }
            copyBg.on("pointer.tap", copyItem);
            copyText.on("pointer.tap", copyItem);
            delBg.on("pointer.tap", removeItem);
            delText.on("pointer.tap", removeItem);
            measurePanelListLayer.add(rowBg);
            measurePanelListLayer.add(rowText);
            measurePanelListLayer.add(copyBg);
            measurePanelListLayer.add(copyText);
            measurePanelListLayer.add(delBg);
            measurePanelListLayer.add(delText);
          });
        };

        const renderMeasureHistory = () => {
          measureHistoryLayer.clear();
          if (!detailVisibilityRef.value.measures) return;
          measureHistory.forEach((item, index) => {
            const active = measureUiRef.selectedIndex === index;
            const hover = measureUiRef.hoverIndex === index;
            const emph = active || hover;
            const line = new Line({ points: [item.p1.x, item.p1.y, item.p2.x, item.p2.y], stroke: active ? "#f472b6" : hover ? "#22d3ee" : "rgba(167,139,250,0.75)", strokeWidth: active ? 2.4 : hover ? 2.1 : 1.6 });
            const p1 = new Rect({ x: item.p1.x - (emph ? 3.5 : 2.5), y: item.p1.y - (emph ? 3.5 : 2.5), width: emph ? 7 : 5, height: emph ? 7 : 5, fill: active ? "#f9a8d4" : hover ? "#67e8f9" : "rgba(196,181,253,0.85)", cornerRadius: emph ? 3.5 : 2.5 });
            const p2 = new Rect({ x: item.p2.x - (emph ? 3.5 : 2.5), y: item.p2.y - (emph ? 3.5 : 2.5), width: emph ? 7 : 5, height: emph ? 7 : 5, fill: active ? "#f9a8d4" : hover ? "#67e8f9" : "rgba(196,181,253,0.85)", cornerRadius: emph ? 3.5 : 2.5 });
            const label = new Text({ x: (item.p1.x + item.p2.x) / 2 + 8, y: (item.p1.y + item.p2.y) / 2 - 18, text: `ΔX ${Math.abs(item.dxMm).toFixed(2)} · ΔY ${Math.abs(item.dyMm).toFixed(2)} · D ${item.distanceMm.toFixed(2)} mm`, fill: active ? "#fce7f3" : hover ? "#cffafe" : "rgba(221,214,254,0.88)", fontSize: emph ? 12 : 11 });
            measureHistoryLayer.add(line);
            measureHistoryLayer.add(label);
            measureHistoryLayer.add(p1);
            measureHistoryLayer.add(p2);
          });
        };

        const commitCurrentMeasure = () => {
          if (!measureRef.p1 || !measureRef.p2 || measureRef.distanceMm == null || measureRef.dxMm == null || measureRef.dyMm == null) return;
          measureHistory.push({ p1: { ...measureRef.p1 }, p2: { ...measureRef.p2 }, dxMm: measureRef.dxMm, dyMm: measureRef.dyMm, distanceMm: measureRef.distanceMm });
          measureUiRef.selectedIndex = measureHistory.length - 1;
          renderMeasureHistory();
          renderMeasurePanel();
          resetCurrentMeasure();
          updateMeasureOverlay();
        };

        const clearAllMeasures = () => {
          measureHistory.length = 0;
          measureUiRef.selectedIndex = -1;
          measureUiRef.hoverIndex = -1;
          measureUiRef.copyFlashIndex = -1;
          measureUiRef.copyAllFlash = false;
          measureCopyAllBg.fill = "rgba(30,64,175,0.78)";
          measureCopyAllText.text = "CopyAll";
          renderMeasureHistory();
          renderMeasurePanel();
          updateHud();
        };

        const popLastMeasure = () => {
          if (!measureHistory.length) return;
          measureHistory.pop();
          if (measureUiRef.selectedIndex >= measureHistory.length) measureUiRef.selectedIndex = measureHistory.length - 1;
          if (measureUiRef.hoverIndex >= measureHistory.length) measureUiRef.hoverIndex = -1;
          if (measureUiRef.copyFlashIndex >= measureHistory.length) measureUiRef.copyFlashIndex = -1;
          renderMeasureHistory();
          renderMeasurePanel();
          updateHud();
        };

        const updateMeasureOverlay = () => {
          if (!detailVisibilityRef.value.measures) {
            measureLine.visible = false;
            measureProjH.visible = false;
            measureProjV.visible = false;
            measureProjLabel.visible = false;
            measureLabel.visible = false;
            measureP1.visible = false;
            measureP2.visible = false;
            snapMarker.visible = false;
            updateHud();
            return;
          }
          if (!measureRef.p1) {
            measureLine.visible = false;
            measureProjH.visible = false;
            measureProjV.visible = false;
            measureProjLabel.visible = false;
            measureLabel.visible = false;
            measureP1.visible = false;
            measureP2.visible = false;
            snapMarker.visible = false;
            measureRef.distanceMm = null;
            measureRef.dxMm = null;
            measureRef.dyMm = null;
            updateHud();
            return;
          }
          measureP1.visible = true;
          measureP1.x = measureRef.p1.x - 3;
          measureP1.y = measureRef.p1.y - 3;
          const end = measureRef.p2 || measureRef.preview;
          if (!end) {
            measureLine.visible = false;
            measureProjH.visible = false;
            measureProjV.visible = false;
            measureProjLabel.visible = false;
            measureLabel.visible = false;
            measureP2.visible = false;
            measureRef.distanceMm = null;
            measureRef.dxMm = null;
            measureRef.dyMm = null;
            updateHud();
            return;
          }
          measureP2.visible = true;
          measureP2.x = end.x - 3;
          measureP2.y = end.y - 3;
          measureLine.visible = true;
          measureLine.points = [measureRef.p1.x, measureRef.p1.y, end.x, end.y];
          measureProjH.visible = true;
          measureProjV.visible = true;
          measureProjLabel.visible = true;
          measureProjH.points = [measureRef.p1.x, measureRef.p1.y, end.x, measureRef.p1.y];
          measureProjV.points = [end.x, measureRef.p1.y, end.x, end.y];
          const a = unmapPoint(measureRef.p1.x, measureRef.p1.y, width, height, boardWidthMm, boardHeightMm);
          const b = unmapPoint(end.x, end.y, width, height, boardWidthMm, boardHeightMm);
          measureRef.dxMm = b.x - a.x;
          measureRef.dyMm = b.y - a.y;
          measureRef.distanceMm = Math.hypot(measureRef.dxMm, measureRef.dyMm);
          measureLabel.visible = true;
          measureLabel.text = `ΔX ${Math.abs(measureRef.dxMm).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm).toFixed(2)} · D ${measureRef.distanceMm.toFixed(2)} mm`;
          measureLabel.x = (measureRef.p1.x + end.x) / 2 + 8;
          measureLabel.y = (measureRef.p1.y + end.y) / 2 - 18;
          measureProjLabel.text = `ΔX ${Math.abs(measureRef.dxMm).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm).toFixed(2)}`;
          measureProjLabel.x = Math.min(measureRef.p1.x, end.x) + 8;
          measureProjLabel.y = Math.min(measureRef.p1.y, end.y) + 8;
          updateHud();
        };

        const renderGrid = () => {
          gridLayer.clear();
          if (!detailVisibilityRef.value.grid) return;
          const majorWorldStep = scaleRef.value >= 2.2 ? 10 : scaleRef.value >= 1.3 ? 20 : 25;
          const minorWorldStep = majorWorldStep / 5;
          const majorStepX = (majorWorldStep / Math.max(boardWidthMm, 1)) * (width - PAD * 2) * scaleRef.value;
          const majorStepY = (majorWorldStep / Math.max(boardHeightMm, 1)) * (height - PAD * 2) * scaleRef.value;
          const minorStepX = (minorWorldStep / Math.max(boardWidthMm, 1)) * (width - PAD * 2) * scaleRef.value;
          const minorStepY = (minorWorldStep / Math.max(boardHeightMm, 1)) * (height - PAD * 2) * scaleRef.value;
          if (majorStepX < 10 || majorStepY < 10) return;

          const left = PAD * scaleRef.value + offsetRef.x;
          const top = PAD * scaleRef.value + offsetRef.y;
          const bw = (width - PAD * 2) * scaleRef.value;
          const bh = (height - PAD * 2) * scaleRef.value;

          const drawVerticals = (step: number, stroke: string, widthDiv: number) => {
            if (step < 12) return;
            for (let x = left; x <= left + bw + 1; x += step) {
              gridLayer.add(new Line({ points: [x, top, x, top + bh], stroke, strokeWidth: widthDiv / Math.max(scaleRef.value, 0.8) }));
            }
          };
          const drawHorizontals = (step: number, stroke: string, widthDiv: number) => {
            if (step < 12) return;
            for (let y = top; y <= top + bh + 1; y += step) {
              gridLayer.add(new Line({ points: [left, y, left + bw, y], stroke, strokeWidth: widthDiv / Math.max(scaleRef.value, 0.8) }));
            }
          };

          if (minorStepX >= 18 && minorStepY >= 18) {
            drawVerticals(minorStepX, "rgba(30,41,59,0.22)", 0.9);
            drawHorizontals(minorStepY, "rgba(30,41,59,0.22)", 0.9);
          }
          drawVerticals(majorStepX, "rgba(51,65,85,0.62)", 1.35);
          drawHorizontals(majorStepY, "rgba(51,65,85,0.62)", 1.35);
        };

        const updateTraceStyle = (id: string) => {
          const line = traceMap.get(id);
          if (!line) return;
          const isTarget = hoveredType === "trace" && hoveredId === id;
          const isSelected = selectedTraceIds.has(id);
          const isRelated = traceHighlightIds.includes(id);
          line.stroke = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#3b82f6";
          line.strokeWidth = (isTarget ? 5 : isSelected ? 4.5 : isRelated ? 4 : 2) / Math.max(scaleRef.value * 0.9, 0.8);
          line.opacity = isTarget || isSelected || isRelated ? 1 : 0.45;
          line.visible = true;
        };

        const applyLabelVisibilityStrategy = () => {
          const detail = detailVisibilityRef.value;
          if (!detail.components || !detail.labels) {
            for (const label of labelMap.values()) label.visible = false;
            return;
          }
          const forced = new Set<string>();
          if (hoveredType === "component" && hoveredId) forced.add(hoveredId);
          if (focusComponentId) forced.add(focusComponentId);
          for (const id of selectedCompIds) forced.add(id);
          for (const id of directIds) forced.add(id);

          const cellSize = scaleRef.value >= 2.4 ? 28 : scaleRef.value >= 1.6 ? 42 : scaleRef.value >= 1.0 ? 58 : scaleRef.value >= 0.75 ? 82 : 112;
          const occupied = new Set<string>();
          const entries = Array.from(labelMap.entries()).sort((a, b) => {
            const aForced = forced.has(a[0]) ? 1 : 0;
            const bForced = forced.has(b[0]) ? 1 : 0;
            if (aForced !== bForced) return bForced - aForced;
            return a[0].localeCompare(b[0]);
          });

          for (const [id, label] of entries) {
            const anchor = labelAnchorMap.get(id);
            if (!anchor) {
              label.visible = false;
              continue;
            }
            if (forced.has(id)) {
              label.visible = true;
              continue;
            }
            if (scaleRef.value < 0.68) {
              label.visible = false;
              continue;
            }
            const sx = anchor.x * scaleRef.value + offsetRef.x;
            const sy = anchor.y * scaleRef.value + offsetRef.y;
            if (sx < -40 || sy < -20 || sx > width + 20 || sy > height + 20) {
              label.visible = false;
              continue;
            }
            const key = `${Math.floor(sx / cellSize)}:${Math.floor(sy / cellSize)}`;
            if (occupied.has(key)) {
              label.visible = false;
              continue;
            }
            occupied.add(key);
            label.visible = true;
          }
        };

        const updateCompStyle = (id: string) => {
          const rect = compMap.get(id);
          const label = labelMap.get(id);
          if (!rect) return;
          const isTarget = hoveredType === "component" && hoveredId === id;
          const isSelected = selectedCompIds.has(id);
          const isRelated = directIds.includes(id);
          rect.visible = detailVisibilityRef.value.components;
          rect.fill = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#94a3b8";
          rect.opacity = isTarget ? 1 : isSelected ? 0.98 : isRelated ? 0.92 : 0.55;
          rect.stroke = isSelected ? "#fde68a" : isTarget ? "#fecdd3" : "rgba(0,0,0,0)";
          rect.strokeWidth = isSelected || isTarget ? 1.5 / Math.max(scaleRef.value, 0.8) : 0;
          if (label) {
            label.fill = isTarget ? "#ffffff" : isSelected ? "#fef3c7" : isRelated ? "#a5f3fc" : "#e2e8f0";
          }
        };

        const refreshStyles = () => {
          for (const trace of traces) {
            const line = traceMap.get(trace.id);
            if (!line) continue;
            line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
          }
          for (const id of traceMap.keys()) updateTraceStyle(id);
          for (const id of compMap.keys()) updateCompStyle(id);
          applyLabelVisibilityStrategy();
          for (const [id, marker] of markerMap) marker.visible = detailVisibilityRef.value.components && focusComponentId === id;
          updateMeasureOverlay();
          updateHud();
          renderSelectionPanel();
          renderInspector();
          writeUrlState();
          leafer.forceRender?.();
        };

        const clearSelection = () => {
          selectedCompIds.clear();
          selectedTraceIds.clear();
          refreshStyles();
        };

        const selectionKindAllowed = (kind: "component" | "trace") => {
          return selectionFilterRef.value === "all" || selectionFilterRef.value === kind;
        };

        const selectOnly = (kind: "component" | "trace", id: string) => {
          if (!selectionKindAllowed(kind)) return;
          selectedCompIds.clear();
          selectedTraceIds.clear();
          if (kind === "component") selectedCompIds.add(id);
          else selectedTraceIds.add(id);
          refreshStyles();
        };

        const toggleSelection = (kind: "component" | "trace", id: string) => {
          if (!selectionKindAllowed(kind)) return;
          if (kind === "component") {
            if (selectedCompIds.has(id)) selectedCompIds.delete(id);
            else selectedCompIds.add(id);
          } else {
            if (selectedTraceIds.has(id)) selectedTraceIds.delete(id);
            else selectedTraceIds.add(id);
          }
          refreshStyles();
        };

        const boxSelect = () => {
          const sx = Math.min(boxRef.sx, boxRef.ex);
          const sy = Math.min(boxRef.sy, boxRef.ey);
          const ex = Math.max(boxRef.sx, boxRef.ex);
          const ey = Math.max(boxRef.sy, boxRef.ey);
          const wx1 = (sx - offsetRef.x) / scaleRef.value;
          const wy1 = (sy - offsetRef.y) / scaleRef.value;
          const wx2 = (ex - offsetRef.x) / scaleRef.value;
          const wy2 = (ey - offsetRef.y) / scaleRef.value;
          const allowComp = selectionFilterRef.value !== "trace";
          const allowTrace = selectionFilterRef.value !== "component";

          if (boxRef.mode === "subtract") {
            if (allowComp) {
              for (const [id, b] of compBoundsMap) {
                if (b.x + b.width >= wx1 && b.x <= wx2 && b.y + b.height >= wy1 && b.y <= wy2) selectedCompIds.delete(id);
              }
            }
            if (allowTrace) {
              for (const [id, b] of traceBoundsMap) {
                if (b.maxX >= wx1 && b.minX <= wx2 && b.maxY >= wy1 && b.minY <= wy2) selectedTraceIds.delete(id);
              }
            }
            refreshStyles();
            return;
          }

          if (!boxRef.append) {
            selectedCompIds.clear();
            selectedTraceIds.clear();
          }

          if (allowComp) {
            for (const [id, b] of compBoundsMap) {
              if (b.x + b.width >= wx1 && b.x <= wx2 && b.y + b.height >= wy1 && b.y <= wy2) selectedCompIds.add(id);
            }
          }
          if (allowTrace) {
            for (const [id, b] of traceBoundsMap) {
              if (b.maxX >= wx1 && b.minX <= wx2 && b.maxY >= wy1 && b.minY <= wy2) selectedTraceIds.add(id);
            }
          }
          refreshStyles();
        };

        const boxZoom = () => {
          const w = Math.abs(boxRef.ex - boxRef.sx);
          const h = Math.abs(boxRef.ey - boxRef.sy);
          if (w > 12 && h > 12) {
            const worldX = (Math.min(boxRef.sx, boxRef.ex) - offsetRef.x) / scaleRef.value;
            const worldY = (Math.min(boxRef.sy, boxRef.ey) - offsetRef.y) / scaleRef.value;
            const worldW = w / scaleRef.value;
            const worldH = h / scaleRef.value;
            const nextScale = Math.max(0.6, Math.min(3.5, Math.min(width / worldW, height / worldH)));
            scaleRef.value = nextScale;
            offsetRef.x = -worldX * scaleRef.value + (width - worldW * scaleRef.value) / 2;
            offsetRef.y = -worldY * scaleRef.value + (height - worldH * scaleRef.value) / 2;
            renderGrid();
            applyCamera();
            refreshStyles();
          }
        };

        for (const trace of traces) {
          const points: number[] = [];
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const [x, y] of trace.path) {
            const px = mapX(x, boardWidthMm, width);
            const py = mapY(y, boardHeightMm, height);
            points.push(px, py);
            snapPoints.push({ x: px, y: py });
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
          const line = new Line({ points, stroke: "#3b82f6", strokeWidth: 2, opacity: 0.45, hitFill: "#ffffff", hitRadius: 8 });
          line.on("pointer.enter", () => onHoverFeature("trace", trace.id));
          line.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          line.on("pointer.tap", (e: any) => ((e?.metaKey || e?.ctrlKey) ? toggleSelection("trace", trace.id) : selectOnly("trace", trace.id)));
          traceLayer.add(line);
          traceMap.set(trace.id, line);
          traceBoundsMap.set(trace.id, { minX, minY, maxX, maxY });
        }

        for (const c of components) {
          const [bx, by, bw, bh] = c.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
          const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
          snapPoints.push({ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w / 2, y: y + h / 2 });
          const rect = new Rect({ x, y, width: w, height: h, fill: "#94a3b8", opacity: 0.55, cornerRadius: 2, stroke: "rgba(0,0,0,0)", strokeWidth: 0 });
          rect.on("pointer.enter", () => onHoverFeature("component", c.id));
          rect.on("pointer.leave", () => onHoverFeature(undefined, undefined));
          rect.on("pointer.tap", (e: any) => ((e?.metaKey || e?.ctrlKey) ? toggleSelection("component", c.id) : selectOnly("component", c.id)));
          const label = new Text({ x, y: Math.max(14, y - 12), text: c.refdes, fill: "#e2e8f0", fontSize: 11 });
          const marker = new Rect({ x: x - 4, y: y - 4, width: 10, height: 10, stroke: "#f59e0b", strokeWidth: 2, fill: "rgba(0,0,0,0)", cornerRadius: 3, visible: false });
          compLayer.add(rect);
          compLayer.add(label);
          compLayer.add(marker);
          compMap.set(c.id, rect);
          labelMap.set(c.id, label);
          labelAnchorMap.set(c.id, { x, y: Math.max(14, y - 12) });
          markerMap.set(c.id, marker);
          compBoundsMap.set(c.id, { x, y, width: w, height: h });
        }

        const initialUrlState = readUrlState();
        if (initialUrlState) {
          if (initialUrlState.zoom != null) scaleRef.value = Math.max(0.6, Math.min(3.5, initialUrlState.zoom));
          if (initialUrlState.ox != null) offsetRef.x = initialUrlState.ox;
          if (initialUrlState.oy != null) offsetRef.y = initialUrlState.oy;
          for (const id of initialUrlState.sc) if (compBoundsMap.has(id)) selectedCompIds.add(id);
          for (const id of initialUrlState.st) if (traceBoundsMap.has(id)) selectedTraceIds.add(id);
        }

        const view = hostRef.current!;
        const renderVisibility = () => {
          renderGrid();
          applyCamera();
          refreshStyles();
          renderMeasurePanel();
          renderSelectionPanel();
          renderInspector();
          renderToolbars();
          renderHelpOverlay();
        };

        renderToolbars();

        measureCopyAllBg.on("pointer.tap", () => {
          copyAllMeasurements();
        });
        measureCopyAllText.on("pointer.tap", () => {
          copyAllMeasurements();
        });
        measureClearBg.on("pointer.tap", () => {
          clearAllMeasures();
          leafer.forceRender?.();
        });
        measureClearText.on("pointer.tap", () => {
          clearAllMeasures();
          leafer.forceRender?.();
        });
        selectedCenterBg.on("pointer.tap", () => {
          centerSelection();
          leafer.forceRender?.();
        });
        selectedCenterText.on("pointer.tap", () => {
          centerSelection();
          leafer.forceRender?.();
        });
        selectedZoomBg.on("pointer.tap", () => {
          zoomToSelection();
          leafer.forceRender?.();
        });
        selectedZoomText.on("pointer.tap", () => {
          zoomToSelection();
          leafer.forceRender?.();
        });

        const onPointerDown = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (toolModeRef.value === "measure") {
            if (!(e.metaKey || e.ctrlKey)) {
              dragRef.active = false;
            }
            return;
          }
          if (e.shiftKey && toolModeRef.value !== "pan") {
            boxRef.active = true;
            boxRef.mode = e.altKey ? ((e.metaKey || e.ctrlKey) ? "subtract" : "zoom") : "select";
            boxRef.append = !!(e.metaKey || e.ctrlKey) && boxRef.mode === "select";
            boxRef.sx = x;
            boxRef.sy = y;
            boxRef.ex = x;
            boxRef.ey = y;
            box.visible = true;
            box.stroke = boxRef.mode === "zoom" ? "#22d3ee" : boxRef.mode === "subtract" ? "#fb7185" : boxRef.append ? "#a78bfa" : "#f59e0b";
            box.fill = boxRef.mode === "zoom" ? "rgba(34,211,238,0.08)" : boxRef.mode === "subtract" ? "rgba(251,113,133,0.10)" : boxRef.append ? "rgba(167,139,250,0.10)" : "rgba(245,158,11,0.08)";
            box.x = x;
            box.y = y;
            box.width = 0;
            box.height = 0;
            updateHud();
            leafer.forceRender?.();
            return;
          }
          if (toolModeRef.value !== "pan" && !(e.metaKey || e.ctrlKey)) clearSelection();
          dragRef.active = true;
          dragRef.x = x;
          dragRef.y = y;
        };

        const onPointerMove = (e: PointerEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          cursorH.visible = true;
          cursorV.visible = true;
          cursorH.points = [0, y, width, y];
          cursorV.points = [x, 0, x, height];
          if (boxRef.active) {
            boxRef.ex = x;
            boxRef.ey = y;
            box.x = Math.min(boxRef.sx, boxRef.ex);
            box.y = Math.min(boxRef.sy, boxRef.ey);
            box.width = Math.abs(boxRef.ex - boxRef.sx);
            box.height = Math.abs(boxRef.ey - boxRef.sy);
            leafer.forceRender?.();
            return;
          }
          if (measureRef.p1 && !measureRef.p2) {
            const constrainedPreview = applyOrthogonalConstraint(x, y, e.shiftKey);
            measureRef.preview = snapPoint(constrainedPreview.x, constrainedPreview.y);
            updateMeasureOverlay();
          }
          if (!dragRef.active) {
            leafer.forceRender?.();
            return;
          }
          const dx = x - dragRef.x;
          const dy = y - dragRef.y;
          dragRef.x = x;
          dragRef.y = y;
          offsetRef.x += dx;
          offsetRef.y += dy;
          renderGrid();
          applyCamera();
          updateHud();
          writeUrlState();
          leafer.forceRender?.();
        };

        const onPointerUp = () => {
          if (boxRef.active) {
            const w = Math.abs(boxRef.ex - boxRef.sx);
            const h = Math.abs(boxRef.ey - boxRef.sy);
            if (w > 12 && h > 12) {
              if (boxRef.mode === "zoom") boxZoom();
              else boxSelect();
            }
            boxRef.active = false;
            box.visible = false;
            boxRef.append = false;
            applyCamera();
            updateHud();
            leafer.forceRender?.();
          }
          dragRef.active = false;
        };

        const onDoubleClick = (e: MouseEvent) => {
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const constrained = applyOrthogonalConstraint(x, y, e.shiftKey);
          const snapped = snapPoint(constrained.x, constrained.y);
          if (!measureRef.p1 || measureRef.p2) {
            measureRef.p1 = snapped;
            measureRef.p2 = null;
            measureRef.preview = null;
          } else {
            measureRef.p2 = snapped;
            measureRef.preview = null;
          }
          updateMeasureOverlay();
          if (measureRef.p1 && measureRef.p2) commitCurrentMeasure();
          leafer.forceRender?.();
        };

        const onPointerLeave = () => {
          cursorH.visible = false;
          cursorV.visible = false;
          dragRef.active = false;
          if (measureRef.p1 && !measureRef.p2) {
            measureRef.preview = null;
            measureRef.snap = null;
            snapMarker.visible = false;
            updateMeasureOverlay();
          }
          leafer.forceRender?.();
        };

        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "?") {
            e.preventDefault();
            toggleHelp();
            renderToolbars();
            return;
          }
          if (e.key === "Enter") {
            commitCurrentMeasure();
            leafer.forceRender?.();
            return;
          }
          if (e.key === "Backspace") {
            e.preventDefault();
            popLastMeasure();
            leafer.forceRender?.();
            return;
          }
          if (e.key === "Escape") {
            if (helpRef.visible) {
              helpRef.visible = false;
              renderHelpOverlay();
              renderToolbars();
            } else if (measureRef.p1 || measureRef.p2 || measureRef.preview) {
              resetCurrentMeasure();
              updateMeasureOverlay();
            } else if (measureHistory.length) {
              clearAllMeasures();
            }
            leafer.forceRender?.();
          }
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const rect = view.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const old = scaleRef.value;
          const next = Math.max(0.6, Math.min(3.5, old * (e.deltaY < 0 ? 1.1 : 0.9)));
          if (next === old) return;
          offsetRef.x = x - ((x - offsetRef.x) / old) * next;
          offsetRef.y = y - ((y - offsetRef.y) / old) * next;
          scaleRef.value = next;
          renderGrid();
          applyCamera();
          refreshStyles();
          writeUrlState();
        };

        view.addEventListener("pointerdown", onPointerDown);
        view.addEventListener("pointermove", onPointerMove);
        view.addEventListener("pointerleave", onPointerLeave);
        view.addEventListener("dblclick", onDoubleClick);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("keydown", onKeyDown);
        view.addEventListener("wheel", onWheel, { passive: false });

        runtimeRef.current = {
          leafer,
          traceMap,
          compMap,
          labelMap,
          labelAnchorMap,
          markerMap,
          detailVisibilityRef,
          selectedCompIds,
          selectedTraceIds,
          traces,
          visibleLayers,
          scaleRef,
          offsetRef,
          updateHud,
          focusComponentById,
          cleanup: () => {
            view.removeEventListener("pointerdown", onPointerDown);
            view.removeEventListener("pointermove", onPointerMove);
            view.removeEventListener("pointerleave", onPointerLeave);
            view.removeEventListener("dblclick", onDoubleClick);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("keydown", onKeyDown);
            view.removeEventListener("wheel", onWheel);
          },
        };

        renderVisibility();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      isDestroy = true;
      try {
        runtimeRef.current?.cleanup?.();
        runtimeRef.current?.leafer?.destroy?.();
      } catch {}
      runtimeRef.current = null;
    };
  }, [width, height, boardWidthMm, boardHeightMm, components, traces, onHoverFeature]);

  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    if (focusComponentId && typeof rt.focusComponentById === "function") {
      rt.focusComponentById(focusComponentId);
      return;
    }
    for (const trace of rt.traces as TraceItem[]) {
      const line = rt.traceMap.get(trace.id);
      if (!line) continue;
      line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
      const isTarget = hoveredType === "trace" && hoveredId === trace.id;
      const isSelected = rt.selectedTraceIds.has(trace.id);
      const isRelated = traceHighlightIds.includes(trace.id);
      line.stroke = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#3b82f6";
      line.strokeWidth = (isTarget ? 5 : isSelected ? 4.5 : isRelated ? 4 : 2) / Math.max(rt.scaleRef.value * 0.9, 0.8);
      line.opacity = isTarget || isSelected || isRelated ? 1 : 0.45;
    }
    for (const [id, rect] of rt.compMap) {
      const label = rt.labelMap.get(id);
      const isTarget = hoveredType === "component" && hoveredId === id;
      const isSelected = rt.selectedCompIds.has(id);
      const isRelated = directIds.includes(id);
      const detail = rt.detailVisibilityRef?.value || { components: true, labels: true };
      rect.visible = detail.components;
      rect.fill = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? "#22d3ee" : "#94a3b8";
      rect.opacity = isTarget ? 1 : isSelected ? 0.98 : isRelated ? 0.92 : 0.55;
      rect.stroke = isSelected ? "#fde68a" : isTarget ? "#fecdd3" : "rgba(0,0,0,0)";
      rect.strokeWidth = isSelected || isTarget ? 1.5 / Math.max(rt.scaleRef.value, 0.8) : 0;
      if (label) {
        label.fill = isTarget ? "#ffffff" : isSelected ? "#fef3c7" : isRelated ? "#a5f3fc" : "#e2e8f0";
      }
    }
    if (rt.detailVisibilityRef?.value?.components && rt.detailVisibilityRef?.value?.labels) {
      const forced = new Set<string>();
      if (hoveredType === "component" && hoveredId) forced.add(hoveredId);
      if (focusComponentId) forced.add(focusComponentId);
      for (const id of rt.selectedCompIds as Set<string>) forced.add(id);
      for (const id of directIds) forced.add(id);
      const cellSize = rt.scaleRef.value >= 2.4 ? 28 : rt.scaleRef.value >= 1.6 ? 42 : rt.scaleRef.value >= 1.0 ? 58 : rt.scaleRef.value >= 0.75 ? 82 : 112;
      const occupied = new Set<string>();
      const entries = Array.from(rt.labelMap.entries()) as Array<[string, any]>;
      entries.sort((a, b) => {
        const aForced = forced.has(a[0]) ? 1 : 0;
        const bForced = forced.has(b[0]) ? 1 : 0;
        if (aForced !== bForced) return bForced - aForced;
        return String(a[0]).localeCompare(String(b[0]));
      });
      for (const [id, label] of entries) {
        const anchor = rt.labelAnchorMap?.get(id);
        if (!anchor) {
          label.visible = false;
          continue;
        }
        if (forced.has(id)) {
          label.visible = true;
          continue;
        }
        if (rt.scaleRef.value < 0.68) {
          label.visible = false;
          continue;
        }
        const sx = anchor.x * rt.scaleRef.value + (rt.offsetRef?.x || 0);
        const sy = anchor.y * rt.scaleRef.value + (rt.offsetRef?.y || 0);
        if (sx < -40 || sy < -20 || sx > width + 20 || sy > height + 20) {
          label.visible = false;
          continue;
        }
        const key = `${Math.floor(sx / cellSize)}:${Math.floor(sy / cellSize)}`;
        if (occupied.has(key)) {
          label.visible = false;
          continue;
        }
        occupied.add(key);
        label.visible = true;
      }
    } else {
      for (const label of rt.labelMap.values()) label.visible = false;
    }
    for (const [id, marker] of rt.markerMap) marker.visible = (rt.detailVisibilityRef?.value?.components ?? true) && focusComponentId === id;
    rt.updateHud?.();
    rt.leafer.forceRender?.();
  }, [visibleLayers, hoveredId, hoveredType, directIds, traceHighlightIds, focusComponentId]);

  if (error) {
    return (
      <div style={{ width, height, background: "#071025", color: "#fca5a5", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Leafer runtime error</div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width, height, borderRadius: 12, overflow: "hidden", position: "relative" }}>
      <div ref={hostRef} style={{ width, height, borderRadius: 12, overflow: "hidden" }} />
      <div
        data-testid="canvas-state-bridge"
        style={{
          position: "absolute",
          left: 92,
          bottom: 8,
          maxWidth: 520,
          background: "rgba(2,6,23,0.72)",
          color: "#93c5fd",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 8,
          padding: "6px 8px",
          fontSize: 10,
          lineHeight: 1.35,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
        }}
      >
        {`State tool=${bridgeState.tool} zoom=${bridgeState.zoom.toFixed(3)} ox=${bridgeState.ox.toFixed(1)} oy=${bridgeState.oy.toFixed(1)}
selected_components=${bridgeState.sc.join(",") || "-"}
selected_traces=${bridgeState.st.join(",") || "-"}
visible_detail=${bridgeState.vd || "-"}
label_mode=${bridgeState.lm || "adaptive"}
grid_mode=${bridgeState.gm || "major+minor"}`}
      </div>
    </div>
  );
}
