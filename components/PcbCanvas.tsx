"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentItem, TraceItem } from "@/types/pcb";
import type { HoverFeatureType } from "@/store/viewerStore";

type Props = {
  width: number;
  height: number;
  boardWidthMm: number;
  boardHeightMm: number;
  components: ComponentItem[];
  traces: TraceItem[];
  visibleDetail?: string[];
  pads?: TraceItem[];
  keepouts?: TraceItem[];
  silkscreen?: TraceItem[];
  documentation?: TraceItem[];
  mechanical?: TraceItem[];
  graphics?: TraceItem[];
  drills?: TraceItem[];
  boardOutlines?: TraceItem[];
  zones?: TraceItem[];
  vias?: TraceItem[];
  visibleLayers?: string[];
  focusComponentId?: string;
  hoveredId?: string;
  hoveredType?: HoverFeatureType;
  directIds: string[];
  traceHighlightIds: string[];
  overlayHighlightKeys?: string[];
  relationNetIds?: string[];
  relationMode?: 'none' | 'target' | 'selection-union';
  relationVisualTone?: string;
  relationClassLabel?: string;
  relationSourceLabel?: string;
  relationRationale?: string;
  activeOverlayFamilyPreset?: string | null;
  rendererLabel?: string;
  onHoverFeature: (type?: HoverFeatureType, id?: string) => void;
  onRuntimeReady?: (runtime: { exportCanvasShot?: () => void; exportWorkbenchText?: () => void; exportMeasurementsCsv?: () => void; exportSelectionJson?: () => void; exportWorkbenchSession?: () => void } | null) => void;
  onSelectFeature?: (type?: HoverFeatureType, id?: string, overlayKeys?: string[]) => void;
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
  visibleDetail,
  pads = [],
  keepouts = [],
  silkscreen = [],
  documentation = [],
  mechanical = [],
  graphics = [],
  drills = [],
  boardOutlines = [],
  zones = [],
  vias = [],
  visibleLayers = ["F.Cu", "B.Cu"],
  focusComponentId,
  hoveredId,
  hoveredType,
  directIds,
  traceHighlightIds,
  overlayHighlightKeys = [],
  relationNetIds = [],
  relationMode = 'none',
  relationVisualTone = '#22d3ee',
  relationClassLabel = 'Idle',
  relationSourceLabel = 'No active target',
  relationRationale = 'Awaiting hover, inspect target, or selection union.',
  activeOverlayFamilyPreset = null,
  rendererLabel = 'leafer',
  onHoverFeature,
  onSelectFeature,
  onRuntimeReady,
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
    so: [] as string[],
    sf: "all" as "all" | "component" | "trace",
    vd: "grid,components,labels,measures",
    lm: "adaptive",
    gm: "major+minor",
    th: "adaptive-v1",
    le: "-",
    sof: "-",
    sok: "-",
    sol: "-",
    son: "-",
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
        const zoneLayer = new Group();
        const keepoutLayer = new Group();
        const traceLayer = new Group();
        const viaLayer = new Group();
        const padLayer = new Group();
        const drillLayer = new Group();
        const silkLayer = new Group();
        const docLayer = new Group();
        const mechLayer = new Group();
        const graphicsLayer = new Group();
        const boardOutlineLayer = new Group();
        const compLayer = new Group();
        const overlayLayer = new Group();
        leafer.add(gridLayer);
        leafer.add(boardLayer);
        leafer.add(zoneLayer);
        leafer.add(keepoutLayer);
        leafer.add(traceLayer);
        leafer.add(viaLayer);
        leafer.add(padLayer);
        leafer.add(drillLayer);
        leafer.add(silkLayer);
        leafer.add(docLayer);
        leafer.add(mechLayer);
        leafer.add(graphicsLayer);
        leafer.add(boardOutlineLayer);
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

        const topToolbar = new Rect({ x: 24, y: 40, width: 1260, height: 54, fill: "rgba(15,23,42,0.82)", stroke: "rgba(148,163,184,0.24)", strokeWidth: 1, cornerRadius: 10 });
        overlayLayer.add(topToolbar);
        const sideToolbar = new Rect({ x: 24, y: 104, width: 58, height: 126, fill: "rgba(15,23,42,0.82)", stroke: "rgba(148,163,184,0.24)", strokeWidth: 1, cornerRadius: 10 });
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
        const traceMetaMap = new Map<string, { widthMm: number }>();
        const overlayMap = new Map<string, any[]>();
        const compMap = new Map<string, any>();
        const labelMap = new Map<string, any>();
        const labelAnchorMap = new Map<string, { x: number; y: number }>();
        const markerMap = new Map<string, any>();
        const compBoundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();
        const traceBoundsMap = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

        const selectedCompIds = new Set<string>();
        const selectedTraceIds = new Set<string>();
        const selectedOverlayKeys = new Set<string>();
        const overlayBuckets = { zones, vias, pads, keepouts, silkscreen, boardOutlines, documentation, mechanical, graphics, drills } as const;
        const scaleRef = { value: 1 };
        const offsetRef = { x: 0, y: 0 };
        const dragRef = { active: false, x: 0, y: 0 };
        const boxRef = { active: false, sx: 0, sy: 0, ex: 0, ey: 0, mode: "select" as "select" | "zoom" | "subtract", append: false };
        const measureRef = { p1: null as null | { x: number; y: number }, p2: null as null | { x: number; y: number }, preview: null as null | { x: number; y: number }, distanceMm: null as null | number, dxMm: null as null | number, dyMm: null as null | number, snap: null as null | { x: number; y: number } };
        const measureHistory: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number }; dxMm: number; dyMm: number; distanceMm: number }> = [];
        const measureUiRef = { selectedIndex: -1, hoverIndex: -1, copyFlashIndex: -1, copyAllFlash: false };
        const selectionUiRef = { hoverKind: null as null | HoverFeatureType, hoverId: null as null | string };
        const snapPoints: Array<{ x: number; y: number; priority?: number }> = [];
        const snapSegments: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
        const SNAP_RADIUS = 12;
        const toolModeRef = { value: "select" as "select" | "measure" | "pan" };
        const selectionFilterRef = { value: "all" as "all" | "component" | "trace" };
        const detailVisibilityRef = { value: { grid: true, components: true, labels: true, measures: true, pads: true, keepouts: true, silkscreen: true, documentation: true, mechanical: true, graphics: true, drills: true, zones: true, vias: true, boardOutlines: true } };
        const helpRef = { visible: false };
        const exportStateRef = { last: "-" };

        const readUrlState = () => {
          if (typeof window === "undefined") return null;
          const params = new URL(window.location.href).searchParams;
          const zoom = Number(params.get("zoom"));
          const ox = Number(params.get("ox"));
          const oy = Number(params.get("oy"));
          const sc = (params.get("sc") || "").split(",").filter(Boolean);
          const st = (params.get("st") || "").split(",").filter(Boolean);
          const tool = params.get("tool");
          const sf = params.get("sf");
          const vd = (params.get("vd") || "").split(",").filter(Boolean);
          return {
            zoom: Number.isFinite(zoom) ? zoom : null,
            ox: Number.isFinite(ox) ? ox : null,
            oy: Number.isFinite(oy) ? oy : null,
            sc,
            st,
            tool: tool === "select" || tool === "measure" || tool === "pan" ? tool : null,
            sf: sf === "all" || sf === "component" || sf === "trace" ? sf : null,
            vd,
          };
        };

        const writeUrlState = () => {
          if (typeof window === "undefined") return;
          const url = new URL(window.location.href);
          const params = url.searchParams;
          const selectedCompList = Array.from(selectedCompIds);
          const selectedTraceList = Array.from(selectedTraceIds);
          const visibleDetailList = Object.entries(detailVisibilityRef.value).filter(([, enabled]) => enabled).map(([key]) => key);
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
          const selectedOverlayList = Array.from(selectedOverlayKeys);
          if (selectedOverlayList.length) {
            params.set("os", selectedOverlayList.join(","));
            const parts = selectedOverlayList[0].split(":");
            params.set("ok", parts[0]);
            params.set("oi", parts.slice(1).join(":"));
          } else {
            params.delete("os");
            params.delete("ok");
            params.delete("oi");
          }
          if (toolModeRef.value === "select") params.delete("tool");
          else params.set("tool", toolModeRef.value);
          if (selectionFilterRef.value === "all") params.delete("sf");
          else params.set("sf", selectionFilterRef.value);
          if (visibleDetailList.length === 14) params.delete("vd");
          else params.set("vd", visibleDetailList.join(","));
          window.history.replaceState({}, "", url.toString());
        };

        const getExportSlug = () => {
          if (typeof window === "undefined") return "board";
          const parts = window.location.pathname.split("/").filter(Boolean);
          return parts[parts.length - 1] || "board";
        };

        const applyCamera = () => {
          for (const layer of [gridLayer, boardLayer, zoneLayer, keepoutLayer, traceLayer, viaLayer, padLayer, drillLayer, silkLayer, docLayer, mechLayer, graphicsLayer, boardOutlineLayer, compLayer]) {
            layer.scaleX = scaleRef.value;
            layer.scaleY = scaleRef.value;
            layer.x = offsetRef.x;
            layer.y = offsetRef.y;
          }
        };

        const updateHud = () => {
          const label = visibleLayers.length === 0 || visibleLayers.length === 2 ? "All" : visibleLayers.join(" + ");
          const count = selectedCompIds.size + selectedTraceIds.size + selectedOverlayKeys.size;
          const currentMeasureText = measureRef.distanceMm == null ? "—" : `ΔX ${Math.abs(measureRef.dxMm || 0).toFixed(2)} · ΔY ${Math.abs(measureRef.dyMm || 0).toFixed(2)} · D ${measureRef.distanceMm.toFixed(2)} mm`;
          hud.text = `Layer: ${label} · Zoom ${scaleRef.value.toFixed(2)}x · Tool ${toolModeRef.value} · Selected ${count} · Measures ${measureHistory.length} · Current ${currentMeasureText}`;
          hud.x = width - 18 - Math.max(320, String(hud.text).length * 6.7);
          const modeText = boxRef.active ? (boxRef.mode === "zoom" ? " · Box Zoom" : boxRef.mode === "subtract" ? " · Box Subtract" : boxRef.append ? " · Box Append" : " · Box Replace") : "";
          const filterLabel = selectionFilterRef.value === "all" ? "All" : selectionFilterRef.value === "component" ? "Comp" : "Trace";
          selectionBar.text = `Selection · Filter ${filterLabel} · ${selectedCompIds.size} components · ${selectedTraceIds.size} traces · ${selectedOverlayKeys.size} overlays · Total ${count}${modeText}`;
          const visibleDetail = Object.entries(detailVisibilityRef.value)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
            .join(",") || "-";
          const overlaySummary = getSelectedOverlayDetails();
          const overlayBuckets = { zones, vias, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills, boardOutlines } as const;
          const nextBridge = {
            tool: toolModeRef.value,
            zoom: scaleRef.value,
            ox: offsetRef.x,
            oy: offsetRef.y,
            sc: Array.from(selectedCompIds),
            st: Array.from(selectedTraceIds),
            so: Array.from(selectedOverlayKeys),
            sf: selectionFilterRef.value,
            vd: visibleDetail,
            lm: "adaptive",
            gm: "major+minor",
            th: "adaptive-v1",
            le: exportStateRef.last,
            sof: `copper:${overlaySummary.familyCounts.copper}|fabrication:${overlaySummary.familyCounts.fabrication}|documentation:${overlaySummary.familyCounts.documentation}|structure:${overlaySummary.familyCounts.structure}`,
            sok: overlaySummary.topKinds.join('|') || '-',
            sol: overlaySummary.topLayers.join('|') || '-',
            son: overlaySummary.netIds.join(',') || '-',
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

        const getSelectedOverlayDetails = () => {
          const familyCounts = { copper: 0, fabrication: 0, documentation: 0, structure: 0 };
          const kindCounts = new Map<string, number>();
          const layerCounts = new Map<string, number>();
          const netSet = new Set<string>();
          const selected = Array.from(selectedOverlayKeys).map((key) => {
            const parts = key.split(':');
            const kind = parts[0] as keyof typeof overlayBuckets;
            const id = parts.slice(1).join(':');
            const item = (overlayBuckets[kind] || []).find((entry: any) => entry.id === id) as any;
            if (!item) return { key, kind, id, missing: true };
            if (kind === 'zones' || kind === 'vias' || kind === 'pads') familyCounts.copper += 1;
            else if (kind === 'keepouts' || kind === 'silkscreen' || kind === 'drills') familyCounts.fabrication += 1;
            else if (kind === 'documentation' || kind === 'mechanical' || kind === 'graphics') familyCounts.documentation += 1;
            else if (kind === 'boardOutlines') familyCounts.structure += 1;
            kindCounts.set(kind, (kindCounts.get(kind) || 0) + 1);
            const layer = item.layerId || '—';
            layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
            if (item.netId) netSet.add(item.netId);
            return { key, kind, id, layerId: item.layerId || null, netId: item.netId || null, width: item.width ?? null, points: item.path?.length ?? 0 };
          });
          const topKinds = Array.from(kindCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => `${k}:${c}`);
          const topLayers = Array.from(layerCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => `${k}:${c}`);
          return { selected, familyCounts, kindCounts: Object.fromEntries(kindCounts), layerCounts: Object.fromEntries(layerCounts), netIds: Array.from(netSet), topKinds, topLayers };
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
          for (const key of selectedOverlayKeys) {
            const nodes = overlayMap.get(key) || [];
            for (const node of nodes) {
              const x = Number(node.x || 0);
              const y = Number(node.y || 0);
              const w = Number(node.width || 0);
              const h = Number(node.height || 0);
              if (w > 0 && h > 0) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
              }
            }
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
          const overlayLegend = new Text({ x: 734, y: 73, text: "Overlays", fill: "#94a3b8", fontSize: 10.5 });
          toolbarLayer.add(overlayLegend);
          const isAllPreset = detailVisibilityRef.value.zones && detailVisibilityRef.value.vias && detailVisibilityRef.value.pads && detailVisibilityRef.value.keepouts && detailVisibilityRef.value.silkscreen && detailVisibilityRef.value.documentation && detailVisibilityRef.value.mechanical && detailVisibilityRef.value.graphics && detailVisibilityRef.value.drills && detailVisibilityRef.value.boardOutlines;
          const isCopperPreset = detailVisibilityRef.value.zones && detailVisibilityRef.value.vias && detailVisibilityRef.value.pads && !detailVisibilityRef.value.keepouts && !detailVisibilityRef.value.silkscreen && !detailVisibilityRef.value.documentation && !detailVisibilityRef.value.mechanical && !detailVisibilityRef.value.graphics && !detailVisibilityRef.value.drills && !detailVisibilityRef.value.boardOutlines;
          const isFabPreset = !detailVisibilityRef.value.zones && !detailVisibilityRef.value.vias && !detailVisibilityRef.value.pads && detailVisibilityRef.value.keepouts && detailVisibilityRef.value.silkscreen && detailVisibilityRef.value.documentation && detailVisibilityRef.value.mechanical && detailVisibilityRef.value.graphics && detailVisibilityRef.value.drills && detailVisibilityRef.value.boardOutlines;
          const selectBtn = createToolbarButton(32, 112, 42, 28, "Sel", toolModeRef.value === "select", "rgba(245,158,11,0.82)");
          const measureBtn = createToolbarButton(32, 146, 42, 28, "Mea", toolModeRef.value === "measure", "rgba(167,139,250,0.82)");
          const panBtn = createToolbarButton(32, 180, 42, 28, "Pan", toolModeRef.value === "pan", "rgba(34,211,238,0.82)");
          const fitBtn = createToolbarButton(32, 46, 42, 18, "Fit", false, "rgba(30,64,175,0.78)");
          const ctrBtn = createToolbarButton(80, 46, 58, 18, "CenterSel", false, "rgba(8,145,178,0.75)");
          const zoomBtn = createToolbarButton(144, 46, 52, 18, "ZoomSel", false, "rgba(30,64,175,0.78)");
          const clearSelBtn = createToolbarButton(202, 46, 58, 18, "ClrSel", false, "rgba(127,29,29,0.72)");
          const clearMeaBtn = createToolbarButton(266, 46, 64, 18, "ClrMeas", false, "rgba(127,29,29,0.72)");
          const shotBtn = createToolbarButton(336, 46, 46, 18, "Shot", false, "rgba(22,163,74,0.80)");
          const exportTxtBtn = createToolbarButton(388, 46, 54, 18, "ExpTxt", false, "rgba(2,132,199,0.80)");
          const measCsvBtn = createToolbarButton(448, 46, 62, 18, "MeasCSV", false, "rgba(8,145,178,0.82)");
          const selJsonBtn = createToolbarButton(516, 46, 58, 18, "SelJSON", false, "rgba(79,70,229,0.82)");
          const sessionBtn = createToolbarButton(580, 46, 42, 18, "Sess", false, "rgba(124,58,237,0.82)");
          const filterAllBtn = createToolbarButton(628, 46, 40, 18, "All", selectionFilterRef.value === "all", "rgba(100,116,139,0.82)");
          const filterCompBtn = createToolbarButton(674, 46, 46, 18, "Comp", selectionFilterRef.value === "component", "rgba(245,158,11,0.82)");
          const filterTraceBtn = createToolbarButton(726, 46, 50, 18, "Trace", selectionFilterRef.value === "trace", "rgba(59,130,246,0.82)");
          const helpBtn = createToolbarButton(782, 46, 42, 18, helpRef.visible ? "Hide?" : "Help", helpRef.visible, "rgba(14,165,233,0.82)");
          const presetAllBtn = createToolbarButton(830, 46, 34, 18, "All+", isAllPreset, "rgba(30,64,175,0.78)");
          const presetCopperBtn = createToolbarButton(870, 46, 52, 18, "Copper", isCopperPreset, "rgba(2,132,199,0.80)");
          const presetFabBtn = createToolbarButton(928, 46, 34, 18, "Fab", isFabPreset, "rgba(124,58,237,0.82)");
          const gridBtn = createToolbarButton(968, 46, 42, 18, "Grid", detailVisibilityRef.value.grid, "rgba(16,185,129,0.82)");
          const compBtn = createToolbarButton(1016, 46, 44, 18, "Comp", detailVisibilityRef.value.components, "rgba(245,158,11,0.82)");
          const labelBtn = createToolbarButton(1066, 46, 46, 18, "Label", detailVisibilityRef.value.labels, "rgba(168,85,247,0.82)");
          const measBtn = createToolbarButton(1118, 46, 44, 18, "Meas", detailVisibilityRef.value.measures, "rgba(6,182,212,0.82)");
          const zoneBtn = createToolbarButton(830, 70, 42, 18, "Zone", detailVisibilityRef.value.zones, "rgba(59,130,246,0.82)");
          const viaBtn = createToolbarButton(878, 70, 40, 18, "Via", detailVisibilityRef.value.vias, "rgba(14,165,233,0.82)");
          const padBtn = createToolbarButton(924, 70, 42, 18, "Pads", detailVisibilityRef.value.pads, "rgba(251,191,36,0.82)");
          const keepBtn = createToolbarButton(972, 70, 44, 18, "Keep", detailVisibilityRef.value.keepouts, "rgba(239,68,68,0.82)");
          const silkBtn = createToolbarButton(1022, 70, 42, 18, "Silk", detailVisibilityRef.value.silkscreen, "rgba(226,232,240,0.82)");
          const docBtn = createToolbarButton(1070, 70, 40, 18, "Doc", detailVisibilityRef.value.documentation, "rgba(34,197,94,0.82)");
          const mechBtn = createToolbarButton(1116, 70, 44, 18, "Mech", detailVisibilityRef.value.mechanical, "rgba(244,114,182,0.82)");
          const gfxBtn = createToolbarButton(1166, 70, 38, 18, "Gfx", detailVisibilityRef.value.graphics, "rgba(148,163,184,0.82)");
          const drillBtn = createToolbarButton(1210, 70, 42, 18, "Drll", detailVisibilityRef.value.drills, "rgba(100,116,139,0.82)");
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
          for (const node of [sessionBtn.bg, sessionBtn.text]) node.on("pointer.tap", () => { exportWorkbenchSession(); });
          for (const node of [filterAllBtn.bg, filterAllBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "all"; renderVisibility(); });
          for (const node of [filterCompBtn.bg, filterCompBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "component"; renderVisibility(); });
          for (const node of [filterTraceBtn.bg, filterTraceBtn.text]) node.on("pointer.tap", () => { selectionFilterRef.value = "trace"; renderVisibility(); });
          for (const node of [helpBtn.bg, helpBtn.text]) node.on("pointer.tap", () => { toggleHelp(); renderToolbars(); });
          for (const node of [presetAllBtn.bg, presetAllBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.zones = true; detailVisibilityRef.value.vias = true; detailVisibilityRef.value.pads = true; detailVisibilityRef.value.keepouts = true; detailVisibilityRef.value.silkscreen = true; detailVisibilityRef.value.documentation = true; detailVisibilityRef.value.mechanical = true; detailVisibilityRef.value.graphics = true; detailVisibilityRef.value.drills = true; detailVisibilityRef.value.boardOutlines = true; renderVisibility(); });
          for (const node of [presetCopperBtn.bg, presetCopperBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.zones = true; detailVisibilityRef.value.vias = true; detailVisibilityRef.value.pads = true; detailVisibilityRef.value.keepouts = false; detailVisibilityRef.value.silkscreen = false; detailVisibilityRef.value.documentation = false; detailVisibilityRef.value.mechanical = false; detailVisibilityRef.value.graphics = false; detailVisibilityRef.value.drills = false; detailVisibilityRef.value.boardOutlines = false; renderVisibility(); });
          for (const node of [presetFabBtn.bg, presetFabBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.zones = false; detailVisibilityRef.value.vias = false; detailVisibilityRef.value.pads = false; detailVisibilityRef.value.keepouts = true; detailVisibilityRef.value.silkscreen = true; detailVisibilityRef.value.documentation = true; detailVisibilityRef.value.mechanical = true; detailVisibilityRef.value.graphics = true; detailVisibilityRef.value.drills = true; detailVisibilityRef.value.boardOutlines = true; renderVisibility(); });
          for (const node of [gridBtn.bg, gridBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.grid = !detailVisibilityRef.value.grid; renderVisibility(); });
          for (const node of [compBtn.bg, compBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.components = !detailVisibilityRef.value.components; renderVisibility(); });
          for (const node of [labelBtn.bg, labelBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.labels = !detailVisibilityRef.value.labels; renderVisibility(); });
          for (const node of [measBtn.bg, measBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.measures = !detailVisibilityRef.value.measures; renderVisibility(); });
          for (const node of [zoneBtn.bg, zoneBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.zones = !detailVisibilityRef.value.zones; renderVisibility(); });
          for (const node of [viaBtn.bg, viaBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.vias = !detailVisibilityRef.value.vias; renderVisibility(); });
          for (const node of [padBtn.bg, padBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.pads = !detailVisibilityRef.value.pads; renderVisibility(); });
          for (const node of [keepBtn.bg, keepBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.keepouts = !detailVisibilityRef.value.keepouts; renderVisibility(); });
          for (const node of [silkBtn.bg, silkBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.silkscreen = !detailVisibilityRef.value.silkscreen; renderVisibility(); });
          for (const node of [docBtn.bg, docBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.documentation = !detailVisibilityRef.value.documentation; renderVisibility(); });
          for (const node of [mechBtn.bg, mechBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.mechanical = !detailVisibilityRef.value.mechanical; renderVisibility(); });
          for (const node of [gfxBtn.bg, gfxBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.graphics = !detailVisibilityRef.value.graphics; renderVisibility(); });
          for (const node of [drillBtn.bg, drillBtn.text]) node.on("pointer.tap", () => { detailVisibilityRef.value.drills = !detailVisibilityRef.value.drills; renderVisibility(); });
        };

        const renderInspector = () => {
          let source: "hover" | "selected" | "summary" = "summary";
          let kind: HoverFeatureType | null = null;
          let targetId: string | null = null;
          const selectedCompList = Array.from(selectedCompIds);
          const selectedTraceList = Array.from(selectedTraceIds);
          const totalSelected = selectedCompList.length + selectedTraceList.length;

          if (hoveredId && hoveredType) {
            source = "hover";
            kind = hoveredType;
            targetId = hoveredId;
          } else if (totalSelected === 1) {
            source = "selected";
            if (selectedCompList.length === 1) {
              kind = "component";
              targetId = selectedCompList[0];
            } else if (selectedTraceList.length === 1) {
              kind = "trace";
              targetId = selectedTraceList[0];
            }
          }

          if (kind === "component" && targetId) {
            const comp = components.find((c) => c.id === targetId);
            if (!comp) {
              inspectorBody.text = "Component not found";
              return;
            }
            const nets = comp.netIds || [];
            const relatedTraces = traces.filter((tr) => nets.includes(tr.netId));
            const relatedComponents = components.filter((c) => c.id !== comp.id && (c.netIds || []).some((net) => nets.includes(net)));
            inspectorBody.text = [
              `Source: ${source}`,
              `Type: Component`,
              `Refdes: ${comp.refdes}`,
              `ID: ${comp.id}`,
              `Footprint: ${comp.footprint || "—"}`,
              `Rotation: ${comp.rotation}°`,
              `XY: ${comp.x.toFixed(2)}, ${comp.y.toFixed(2)} mm`,
              `BBox: ${comp.bbox.map((n) => n.toFixed(2)).join(", ")}`,
              `Nets (${nets.length}): ${nets.slice(0, 6).join(", ") || "—"}`,
              `Related Components: ${relatedComponents.length}`,
              `Related Traces: ${relatedTraces.length}`,
            ].join("\n");
            return;
          }

          if (kind === "trace" && targetId) {
            const trace = traces.find((tr) => tr.id === targetId);
            if (!trace) {
              inspectorBody.text = "Trace not found";
              return;
            }
            const relatedComponents = components.filter((c) => (c.netIds || []).includes(trace.netId));
            const relatedTraces = traces.filter((tr) => tr.netId === trace.netId);
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
              `Related Components: ${relatedComponents.length}`,
              `Sibling Traces on Net: ${Math.max(0, relatedTraces.length - 1)}`,
            ].join("\n");
            return;
          }

          if (totalSelected > 1 || selectedOverlayKeys.size > 0) {
            const selectedCompObjs = components.filter((c) => selectedCompIds.has(c.id));
            const selectedTraceObjs = traces.filter((tr) => selectedTraceIds.has(tr.id));
            const netSet = new Set<string>();
            for (const c of selectedCompObjs) for (const net of c.netIds || []) netSet.add(net);
            for (const tr of selectedTraceObjs) netSet.add(tr.netId);
            const overlaySummary = getSelectedOverlayDetails();
          const overlayBuckets = { zones, vias, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills, boardOutlines } as const;
            for (const net of overlaySummary.netIds) netSet.add(net);
            const relatedComponents = components.filter((c) => !selectedCompIds.has(c.id) && (c.netIds || []).some((net) => netSet.has(net)));
            const relatedTraces = traces.filter((tr) => !selectedTraceIds.has(tr.id) && netSet.has(tr.netId));
            inspectorBody.text = [
              "Source: selection-summary",
              `Selected Objects: ${totalSelected + selectedOverlayKeys.size}`,
              `Selected Components: ${selectedCompList.length}`,
              `Selected Traces: ${selectedTraceList.length}`,
              `Selected Overlays: ${selectedOverlayKeys.size}`,
              `Overlay Families: copper ${overlaySummary.familyCounts.copper} · fab ${overlaySummary.familyCounts.fabrication} · docs ${overlaySummary.familyCounts.documentation} · outline ${overlaySummary.familyCounts.structure}`,
              `Overlay Kinds: ${overlaySummary.topKinds.join(', ') || '—'}`,
              `Overlay Layers: ${overlaySummary.topLayers.join(', ') || '—'}`,
              `Covered Nets: ${netSet.size}`,
              `Related Components: ${relatedComponents.length}`,
              `Related Traces: ${relatedTraces.length}`,
              `Measures: ${measureHistory.length}`,
              `Tool: ${toolModeRef.value}`,
            ].join("\n");
            return;
          }

          inspectorBody.text = [
            "Source: summary",
            `Board: ${boardWidthMm.toFixed(2)} × ${boardHeightMm.toFixed(2)} mm`,
            `Components: ${components.length}`,
            `Traces: ${traces.length}`,
            `Selected Components: ${selectedCompList.length}`,
            `Selected Traces: ${selectedTraceList.length}`,
            `Selected Overlays: ${selectedOverlayKeys.size}`,
            `Current Related Components: ${directIds.length}`,
            `Current Related Traces: ${traceHighlightIds.length}`,
            `Measures: ${measureHistory.length}`,
            `Tool: ${toolModeRef.value}`,
          ].join("\n");
        };

        const renderSelectionPanel = () => {
          selectedPanelListLayer.clear();
          const items = [
            ...Array.from(selectedCompIds).map((id) => ({ kind: "component" as const, id, label: components.find((c) => c.id === id)?.refdes || id })),
            ...Array.from(selectedTraceIds).map((id) => ({ kind: "trace" as const, id, label: id })),
            ...Array.from(selectedOverlayKeys).map((key) => {
              const parts = key.split(":");
              const kind = parts[0] as HoverFeatureType;
              const id = parts.slice(1).join(":");
              return { kind, id, label: `${kind}:${id}` };
            }),
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
            const tag = item.kind === "component" ? "C" : item.kind === "trace" ? "T" : "O";
            const rowText = new Text({ x: width - 294, y, text: `${tag} · ${item.label}`, fill: hover ? "#cffafe" : "#cbd5e1", fontSize: 10.5 });
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
              else if (item.kind === "trace") selectedTraceIds.delete(item.id);
              else {
                selectedOverlayKeys.delete(`${item.kind}:${item.id}`);
                const first = Array.from(selectedOverlayKeys)[0];
                if (first) {
                  const parts = first.split(":");
                  onSelectFeature?.(parts[0] as HoverFeatureType, parts.slice(1).join(":"), Array.from(selectedOverlayKeys));
                } else {
                  onSelectFeature?.(undefined, undefined, []);
                }
              }
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

        const projectPointToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
          const abx = bx - ax;
          const aby = by - ay;
          const ab2 = abx * abx + aby * aby;
          if (ab2 <= 1e-6) return { x: ax, y: ay, d: Math.hypot(px - ax, py - ay) };
          let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
          if (t < 0) t = 0;
          if (t > 1) t = 1;
          const x = ax + abx * t;
          const y = ay + aby * t;
          return { x, y, d: Math.hypot(px - x, py - y) };
        };

        const snapPoint = (x: number, y: number) => {
          let best = { x, y };
          let bestD = SNAP_RADIUS;
          let bestPriority = -1;
          let snapped = false;
          for (const p of snapPoints) {
            const d = Math.hypot(p.x - x, p.y - y);
            const priority = p.priority || 0;
            if (d < bestD || (Math.abs(d - bestD) < 0.75 && priority > bestPriority)) {
              best = { x: p.x, y: p.y };
              bestD = d;
              bestPriority = priority;
              snapped = true;
            }
          }
          if (bestPriority < 2) {
            for (const seg of snapSegments) {
              const proj = projectPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by);
              if (proj.d < bestD) {
                best = { x: proj.x, y: proj.y };
                bestD = proj.d;
                snapped = true;
              }
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
          exportStateRef.last = "shot";
          updateHud();
        };

        const relationOverlayEntriesForExport = () => {
          return overlayHighlightKeys.map((key) => {
            const parts = key.split(':');
            const kind = parts[0];
            const id = parts.slice(1).join(':');
            const bucket = overlayBuckets[kind as keyof typeof overlayBuckets] || [];
            const item = bucket.find((entry: any) => entry.id === id);
            return item ? { kind, layerId: item.layerId, netId: item.netId } : null;
          }).filter(Boolean) as Array<{ kind: string; layerId?: string; netId?: string }>;
        };

        const relationOverlayKindsForExport = () => {
          const counts = new Map<string, number>();
          for (const item of relationOverlayEntriesForExport()) counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
          return Array.from(counts.entries()).map(([k, c]) => `${k}:${c}`).join(' · ') || '-';
        };

        const relationOverlayLayersForExport = () => {
          const counts = new Map<string, number>();
          for (const item of relationOverlayEntriesForExport()) counts.set(String(item.layerId || '—'), (counts.get(String(item.layerId || '—')) || 0) + 1);
          return Array.from(counts.entries()).map(([k, c]) => `${k}:${c}`).join(' · ') || '-';
        };

        const relationOverlayNetsForExport = () => {
          const counts = new Map<string, number>();
          for (const item of relationOverlayEntriesForExport()) counts.set(String(item.netId || '—'), (counts.get(String(item.netId || '—')) || 0) + 1);
          return Array.from(counts.entries()).map(([k, c]) => `${k}:${c}`).join(' · ') || '-';
        };

        const buildWorkbenchExportText = () => {
          const layerLabel = visibleLayers.length === 0 || visibleLayers.length === 2 ? "All" : visibleLayers.join(" + ");
          const selectedComponents = Array.from(selectedCompIds).map((id) => components.find((c) => c.id === id)?.refdes || id);
          const selectedTraces = Array.from(selectedTraceIds);
          const selectedOverlays = Array.from(selectedOverlayKeys);
          const overlaySummary = getSelectedOverlayDetails();
          return [
            `Board: ${getExportSlug()}`,
            `Layer: ${layerLabel}`,
            `Tool: ${toolModeRef.value}`,
            `Renderer: ${rendererLabel}`,
            `Zoom: ${scaleRef.value.toFixed(3)}`,
            `Offset: ${offsetRef.x.toFixed(1)}, ${offsetRef.y.toFixed(1)}`,
            `Active Overlay Family Preset: ${activeOverlayFamilyPreset || 'custom'}`,
            `Enabled Overlays: ${Object.entries(detailVisibilityRef.value).filter(([, enabled]) => enabled).map(([key]) => key).join(', ')}`,
            `Selected Components (${selectedComponents.length}): ${selectedComponents.join(", ") || "-"}`,
            `Selected Traces (${selectedTraces.length}): ${selectedTraces.join(", ") || "-"}`,
            `Selected Overlays (${selectedOverlays.length}): ${selectedOverlays.join(", ") || "-"}`,
            `Overlay Families: copper ${overlaySummary.familyCounts.copper} · fab ${overlaySummary.familyCounts.fabrication} · docs ${overlaySummary.familyCounts.documentation} · outline ${overlaySummary.familyCounts.structure}`,
            `Overlay Kinds: ${overlaySummary.topKinds.join(", ") || "-"}`,
            `Overlay Layers: ${overlaySummary.topLayers.join(", ") || "-"}`,
            `Overlay Nets (${overlaySummary.netIds.length}): ${overlaySummary.netIds.join(", ") || "-"}`,
            `Relation Class: ${relationClassLabel}`,
            `Relation Source: ${relationSourceLabel}`,
            `Relation Rationale: ${relationRationale}`,
            `Related Components (${directIds.length}): ${directIds.join(", ") || "-"}`,
            `Related Traces (${traceHighlightIds.length}): ${traceHighlightIds.join(", ") || "-"}`,
            `Related Overlays (${overlayHighlightKeys.length}): ${overlayHighlightKeys.join(", ") || "-"}`,
            `Related Nets (${relationNetIds.length}): ${relationNetIds.join(", ") || "-"}`,
            `Related Overlay Families: ${overlayHighlightKeys.length ? bridgeState.sof || '-' : '-'}`,
            `Related Overlay Kinds: ${overlayHighlightKeys.length ? relationOverlayKindsForExport() : '-'}`,
            `Related Overlay Layers: ${overlayHighlightKeys.length ? relationOverlayLayersForExport() : '-'}`,
            `Related Overlay Nets Summary: ${overlayHighlightKeys.length ? relationOverlayNetsForExport() : '-'}`,
            `Relation Visual Tone: ${relationVisualTone}`,
            `Last Export: ${exportStateRef.last}`,
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
          exportStateRef.last = "export-text";
          updateHud();
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
          exportStateRef.last = "measurements-csv";
          updateHud();
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
          const overlaySummary = getSelectedOverlayDetails();
          return JSON.stringify({
            board: getExportSlug(),
            tool: toolModeRef.value,
            zoom: Number(scaleRef.value.toFixed(3)),
            offset: { x: Number(offsetRef.x.toFixed(1)), y: Number(offsetRef.y.toFixed(1)) },
            selectedComponents,
            selectedTraces,
            selectedOverlays: overlaySummary.selected,
            overlaySummary: {
              familyCounts: overlaySummary.familyCounts,
              kindCounts: overlaySummary.kindCounts,
              layerCounts: overlaySummary.layerCounts,
              netIds: overlaySummary.netIds,
            },
            relationOverlaySummary: {
              mode: relationMode,
              relatedComponentIds: directIds,
              relatedTraceIds: traceHighlightIds,
              relatedOverlayKeys: overlayHighlightKeys,
              relatedOverlayCount: overlayHighlightKeys.length,
              relatedNetIds: relationNetIds,
            },
            relationSemantics: {
              classLabel: relationClassLabel,
              sourceLabel: relationSourceLabel,
              rationale: relationRationale,
              visualTone: relationVisualTone,
            },
            activeOverlayFamilyPreset: activeOverlayFamilyPreset || 'custom',
            enabledOverlays: Object.entries(detailVisibilityRef.value).filter(([, enabled]) => enabled).map(([key]) => key),
            renderer: rendererLabel,
            lastExport: exportStateRef.last,
            relatedOverlaySummary: {
              families: bridgeState.sof || '-',
              kinds: relationOverlayKindsForExport(),
              layers: relationOverlayLayersForExport(),
              nets: relationOverlayNetsForExport(),
            },
          }, null, 2);
        };

        const exportSelectionJson = () => {
          const boardSlug = getExportSlug();
          const blob = new Blob([buildSelectionJson()], { type: "application/json;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          triggerDownload(`${boardSlug}-selection.json`, href);
          exportStateRef.last = "selection-json";
          updateHud();
          window.setTimeout(() => URL.revokeObjectURL(href), 1500);
        };

        const buildWorkbenchSessionJson = () => {
          const selectedComponents = Array.from(selectedCompIds).map((id) => components.find((c) => c.id === id)).filter(Boolean);
          const selectedTraces = Array.from(selectedTraceIds).map((id) => traces.find((tr) => tr.id === id)).filter(Boolean);
          const overlaySummary = getSelectedOverlayDetails();
          const visibleDetail = Object.entries(detailVisibilityRef.value).filter(([, enabled]) => enabled).map(([key]) => key);
          return JSON.stringify({
            board: getExportSlug(),
            current_url: typeof window !== "undefined" ? window.location.href : null,
            tool: toolModeRef.value,
            selection_filter: selectionFilterRef.value,
            visible_detail: visibleDetail,
            camera: {
              zoom: Number(scaleRef.value.toFixed(3)),
              ox: Number(offsetRef.x.toFixed(1)),
              oy: Number(offsetRef.y.toFixed(1)),
            },
            label_mode: "adaptive",
            grid_mode: "major+minor",
            trace_hit: "adaptive-v1",
            selected_components: selectedComponents,
            selected_traces: selectedTraces,
            selected_overlays: overlaySummary.selected,
            overlay_summary: {
              familyCounts: overlaySummary.familyCounts,
              kindCounts: overlaySummary.kindCounts,
              layerCounts: overlaySummary.layerCounts,
              netIds: overlaySummary.netIds,
            },
            relation_overlay_summary: {
              mode: relationMode,
              related_component_ids: directIds,
              related_trace_ids: traceHighlightIds,
              related_overlay_keys: overlayHighlightKeys,
              related_overlay_count: overlayHighlightKeys.length,
              related_net_ids: relationNetIds,
            },
            relation_semantics: {
              class_label: relationClassLabel,
              source_label: relationSourceLabel,
              rationale: relationRationale,
              visual_tone: relationVisualTone,
            },
            active_overlay_family_preset: activeOverlayFamilyPreset || 'custom',
            enabled_overlays: Object.entries(detailVisibilityRef.value).filter(([, enabled]) => enabled).map(([key]) => key),
            renderer: rendererLabel,
            last_export: exportStateRef.last,
            related_overlay_summary_expanded: {
              families: bridgeState.sof || '-',
              kinds: relationOverlayKindsForExport(),
              layers: relationOverlayLayersForExport(),
              nets: relationOverlayNetsForExport(),
            },
            measurements: measureHistory,
          }, null, 2);
        };

        const exportWorkbenchSession = () => {
          const boardSlug = getExportSlug();
          const blob = new Blob([buildWorkbenchSessionJson()], { type: "application/json;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          triggerDownload(`${boardSlug}-workbench-session.json`, href);
          exportStateRef.last = "session-json";
          updateHud();
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

        const getTraceHitRadius = (id: string) => {
          const meta = traceMetaMap.get(id);
          const widthMm = meta?.widthMm || 0.18;
          const base = widthMm <= 0.12 ? 12 : widthMm <= 0.2 ? 10 : widthMm <= 0.35 ? 8 : 6;
          const zoomBonus = scaleRef.value < 0.8 ? 3 : scaleRef.value < 1.2 ? 2 : scaleRef.value < 2 ? 1 : 0;
          return Math.max(4, Math.min(16, base + zoomBonus));
        };

        const updateTraceStyle = (id: string) => {
          const line = traceMap.get(id);
          if (!line) return;
          const isTarget = hoveredType === "trace" && hoveredId === id;
          const isSelected = selectedTraceIds.has(id);
          const isRelated = traceHighlightIds.includes(id);
          line.stroke = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? relationVisualTone : "#3b82f6";
          line.strokeWidth = (isTarget ? 5 : isSelected ? 4.5 : isRelated ? 4 : 2) / Math.max(scaleRef.value * 0.9, 0.8);
          line.opacity = isTarget || isSelected || isRelated ? 1 : 0.45;
          line.hitRadius = getTraceHitRadius(id);
          const trace = traces.find((tr) => tr.id === id);
          line.visible = trace ? (visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true) : true;
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

        const updateOverlayStyle = (kind: Exclude<HoverFeatureType, 'component' | 'trace'>, id: string) => {
          const nodes = overlayMap.get(`${kind}:${id}`) || [];
          const isTarget = hoveredType === kind && hoveredId === id;
          const isSelected = selectedOverlayKeys.has(`${kind}:${id}`);
          const isRelated = overlayHighlightKeys.includes(`${kind}:${id}`);
          for (const node of nodes) {
            if (!node) continue;
            const baseOpacity = Number(node.__baseOpacity ?? node.opacity ?? 1);
            const baseStrokeWidth = Number(node.__baseStrokeWidth ?? node.strokeWidth ?? 1.2);
            const baseStroke = node.__baseStroke ?? node.stroke;
            node.opacity = isTarget ? 1 : isSelected ? Math.min(baseOpacity + 0.18, 1) : isRelated ? Math.min(baseOpacity + 0.12, 0.96) : baseOpacity;
            node.strokeWidth = isTarget ? 1.8 : isSelected ? 1.5 : isRelated ? 1.35 : baseStrokeWidth;
            if (baseStroke) {
              node.stroke = isTarget ? '#f43f5e' : isSelected ? '#f59e0b' : isRelated ? relationVisualTone : baseStroke;
            }
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
          rect.fill = isTarget ? "#f43f5e" : isSelected ? "#f59e0b" : isRelated ? relationVisualTone : "#94a3b8";
          rect.opacity = isTarget ? 1 : isSelected ? 0.98 : isRelated ? 0.92 : 0.55;
          rect.stroke = isSelected ? "#fde68a" : isTarget ? "#fecdd3" : "rgba(0,0,0,0)";
          rect.strokeWidth = isSelected || isTarget ? 1.5 / Math.max(scaleRef.value, 0.8) : 0;
          if (label) {
            label.fill = isTarget ? "#ffffff" : isSelected ? "#fef3c7" : isRelated ? relationVisualTone : "#e2e8f0";
          }
        };

        const refreshStyles = () => {
          for (const trace of traces) {
            const line = traceMap.get(trace.id);
            if (!line) continue;
            line.visible = visibleLayers.length ? visibleLayers.includes(String(trace.layerId)) : true;
          }
          zoneLayer.visible = detailVisibilityRef.value.zones;
          viaLayer.visible = detailVisibilityRef.value.vias;
          keepoutLayer.visible = detailVisibilityRef.value.keepouts;
          padLayer.visible = detailVisibilityRef.value.pads;
          silkLayer.visible = detailVisibilityRef.value.silkscreen;
          docLayer.visible = detailVisibilityRef.value.documentation;
          mechLayer.visible = detailVisibilityRef.value.mechanical;
          graphicsLayer.visible = detailVisibilityRef.value.graphics;
          boardOutlineLayer.visible = detailVisibilityRef.value.boardOutlines;
          drillLayer.visible = detailVisibilityRef.value.drills;
          for (const id of traceMap.keys()) updateTraceStyle(id);
          for (const id of compMap.keys()) updateCompStyle(id);
          for (const key of overlayMap.keys()) {
            const idx = key.indexOf(':');
            const kind = key.slice(0, idx) as Exclude<HoverFeatureType, 'component' | 'trace'>;
            const id = key.slice(idx + 1);
            updateOverlayStyle(kind, id);
          }
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
          selectedOverlayKeys.clear();
          onSelectFeature?.(undefined, undefined, []);
          refreshStyles();
        };

        const selectionKindAllowed = (kind: "component" | "trace") => {
          return selectionFilterRef.value === "all" || selectionFilterRef.value === kind;
        };

        const selectOnly = (kind: HoverFeatureType, id: string) => {
          if (kind === "component" || kind === "trace") {
            if (!selectionKindAllowed(kind)) return;
            selectedCompIds.clear();
            selectedTraceIds.clear();
            selectedOverlayKeys.clear();
            if (kind === "component") selectedCompIds.add(id);
            else selectedTraceIds.add(id);
            onSelectFeature?.(kind, id);
            refreshStyles();
            return;
          }
          selectedCompIds.clear();
          selectedTraceIds.clear();
          selectedOverlayKeys.clear();
          selectedOverlayKeys.add(`${kind}:${id}`);
          onSelectFeature?.(kind, id, Array.from(selectedOverlayKeys));
          refreshStyles();
        };

        const toggleSelection = (kind: HoverFeatureType, id: string) => {
          if (kind === "component" || kind === "trace") {
            if (!selectionKindAllowed(kind)) return;
            if (kind === "component") {
              if (selectedCompIds.has(id)) selectedCompIds.delete(id);
              else selectedCompIds.add(id);
            } else {
              if (selectedTraceIds.has(id)) selectedTraceIds.delete(id);
              else selectedTraceIds.add(id);
            }
            onSelectFeature?.(kind, id);
            refreshStyles();
            return;
          }
          const key = `${kind}:${id}`;
          if (selectedOverlayKeys.has(key)) {
            selectedOverlayKeys.delete(key);
          } else {
            selectedOverlayKeys.add(key);
          }
          const first = Array.from(selectedOverlayKeys)[0];
          if (first) {
            const parts = first.split(":");
            onSelectFeature?.(parts[0] as HoverFeatureType, parts.slice(1).join(":"), Array.from(selectedOverlayKeys));
          } else {
            onSelectFeature?.(undefined, undefined, []);
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
            for (const [key, nodes] of overlayMap) {
              let hit = false
              for (const node of nodes) {
                const x = Number(node.x || 0)
                const y = Number(node.y || 0)
                const w = Number(node.width || 0)
                const h = Number(node.height || 0)
                if (w > 0 && h > 0 && x + w >= sx && x <= ex && y + h >= sy && y <= ey) {
                  hit = true
                  break
                }
              }
              if (hit) selectedOverlayKeys.delete(key)
            }
            const first = Array.from(selectedOverlayKeys)[0]
            if (first) {
              const parts = first.split(':')
              onSelectFeature?.(parts[0] as HoverFeatureType, parts.slice(1).join(':'), Array.from(selectedOverlayKeys))
            } else if (!selectedCompIds.size && !selectedTraceIds.size) {
              onSelectFeature?.(undefined, undefined, [])
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
          for (const [key, nodes] of overlayMap) {
            let hit = false;
            for (const node of nodes) {
              const x = Number(node.x || 0);
              const y = Number(node.y || 0);
              const w = Number(node.width || 0);
              const h = Number(node.height || 0);
              if (w > 0 && h > 0 && x + w >= sx && x <= ex && y + h >= sy && y <= ey) {
                hit = true;
                break;
              }
            }
            if (hit) selectedOverlayKeys.add(key);
          }
          const first = Array.from(selectedOverlayKeys)[0];
          if (first) {
            const parts = first.split(":");
            onSelectFeature?.(parts[0] as HoverFeatureType, parts.slice(1).join(":"), Array.from(selectedOverlayKeys));
          } else if (!selectedCompIds.size && !selectedTraceIds.size) {
            onSelectFeature?.(undefined, undefined, []);
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

        const renderOverlayPath = (targetLayer: any, kind: Exclude<HoverFeatureType, 'component' | 'trace'>, feature: TraceItem, style: { stroke: string; fill?: string; opacity?: number; strokeWidth?: number }) => {
          const points: number[] = [];
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const [x, y] of feature.path) {
            const px = mapX(x, boardWidthMm, width);
            const py = mapY(y, boardHeightMm, height);
            points.push(px, py);
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
          if (points.length < 4) return;
          if (style.fill && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
            const fillRect = new Rect({
              x: minX,
              y: minY,
              width: Math.max(1, maxX - minX),
              height: Math.max(1, maxY - minY),
              fill: style.fill,
              stroke: 'rgba(0,0,0,0)',
              strokeWidth: 0,
              opacity: Math.min(style.opacity ?? 1, 0.22),
              cornerRadius: 2,
            });
            fillRect.on('pointer.enter', () => onHoverFeature(kind, feature.id));
            fillRect.on('pointer.leave', () => onHoverFeature(undefined, undefined));
            fillRect.on('pointer.tap', (e: any) => ((e?.metaKey || e?.ctrlKey) ? toggleSelection(kind, feature.id) : selectOnly(kind, feature.id)));
            targetLayer.add(fillRect);
            if (!overlayMap.has(`${kind}:${feature.id}`)) overlayMap.set(`${kind}:${feature.id}`, []);
            (fillRect as any).__baseOpacity = Math.min(style.opacity ?? 1, 0.22);
            (fillRect as any).__baseStrokeWidth = 0;
            (fillRect as any).__baseStroke = 'rgba(0,0,0,0)';
            overlayMap.get(`${kind}:${feature.id}`)?.push(fillRect);
          }
          const line = new Line({ points, stroke: style.stroke, strokeWidth: style.strokeWidth ?? 1.2, opacity: style.opacity ?? 1, hitRadius: 8, hitFill: '#ffffff' });
          line.on('pointer.enter', () => onHoverFeature(kind, feature.id));
          line.on('pointer.leave', () => onHoverFeature(undefined, undefined));
          line.on('pointer.tap', (e: any) => ((e?.metaKey || e?.ctrlKey) ? toggleSelection(kind, feature.id) : selectOnly(kind, feature.id)));
          targetLayer.add(line);
          if (!overlayMap.has(`${kind}:${feature.id}`)) overlayMap.set(`${kind}:${feature.id}`, []);
          (line as any).__baseOpacity = style.opacity ?? 1;
          (line as any).__baseStrokeWidth = style.strokeWidth ?? 1.2;
          (line as any).__baseStroke = style.stroke;
          overlayMap.get(`${kind}:${feature.id}`)?.push(line);
        };

        for (const zone of zones) {
          renderOverlayPath(zoneLayer, "zones", zone, { stroke: 'rgba(96,165,250,0.55)', fill: 'rgba(37,99,235,0.10)', opacity: 0.68, strokeWidth: 1.0 });
        }

        for (const via of vias) {
          renderOverlayPath(viaLayer, "vias", via, { stroke: 'rgba(34,211,238,0.95)', fill: 'rgba(8,145,178,0.16)', opacity: 0.9, strokeWidth: 1.0 });
        }

        for (const keepout of keepouts) {
          renderOverlayPath(keepoutLayer, "keepouts", keepout, { stroke: 'rgba(248,113,113,0.95)', fill: 'rgba(127,29,29,0.18)', opacity: 0.95, strokeWidth: 1.4 });
        }

        for (const pad of pads) {
          renderOverlayPath(padLayer, "pads", pad, { stroke: 'rgba(251,191,36,0.95)', fill: 'rgba(250,204,21,0.18)', opacity: 0.9, strokeWidth: 1.1 });
        }

        for (const drill of drills) {
          renderOverlayPath(drillLayer, "drills", drill, { stroke: 'rgba(148,163,184,0.95)', fill: 'rgba(15,23,42,0.42)', opacity: 0.88, strokeWidth: 1.0 });
        }

        for (const silk of silkscreen) {
          renderOverlayPath(silkLayer, "silkscreen", silk, { stroke: 'rgba(226,232,240,0.92)', opacity: 0.82, strokeWidth: 0.9 });
        }

        for (const outline of boardOutlines) {
          renderOverlayPath(boardOutlineLayer, "boardOutlines", outline, { stroke: 'rgba(167,139,250,0.96)', opacity: 0.9, strokeWidth: 1.2 });
        }

        for (const doc of documentation) {
          renderOverlayPath(docLayer, "documentation", doc, { stroke: 'rgba(34,197,94,0.82)', opacity: 0.72, strokeWidth: 0.85 });
        }

        for (const mech of mechanical) {
          renderOverlayPath(mechLayer, "mechanical", mech, { stroke: 'rgba(244,114,182,0.86)', opacity: 0.76, strokeWidth: 0.95 });
        }

        for (const graphic of graphics) {
          renderOverlayPath(graphicsLayer, "graphics", graphic, { stroke: 'rgba(148,163,184,0.82)', opacity: 0.62, strokeWidth: 0.8 });
        }

        for (const trace of traces) {
          const points: number[] = [];
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          let prev: null | { x: number; y: number } = null;
          for (const [x, y] of trace.path) {
            const px = mapX(x, boardWidthMm, width);
            const py = mapY(y, boardHeightMm, height);
            points.push(px, py);
            snapPoints.push({ x: px, y: py, priority: 0 });
            if (prev) snapSegments.push({ ax: prev.x, ay: prev.y, bx: px, by: py });
            prev = { x: px, y: py };
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
          traceMetaMap.set(trace.id, { widthMm: trace.width });
          traceBoundsMap.set(trace.id, { minX, minY, maxX, maxY });
        }

        for (const c of components) {
          const [bx, by, bw, bh] = c.bbox;
          const x = mapX(bx, boardWidthMm, width);
          const y = mapY(by, boardHeightMm, height);
          const w = (bw / Math.max(boardWidthMm, 1)) * (width - PAD * 2);
          const h = (bh / Math.max(boardHeightMm, 1)) * (height - PAD * 2);
          snapPoints.push(
            { x, y, priority: 1 },
            { x: x + w, y, priority: 1 },
            { x, y: y + h, priority: 1 },
            { x: x + w, y: y + h, priority: 1 },
            { x: x + w / 2, y: y + h / 2, priority: 2 },
          );
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
          if (initialUrlState.tool) toolModeRef.value = initialUrlState.tool as "select" | "measure" | "pan";
          if (initialUrlState.sf) selectionFilterRef.value = initialUrlState.sf as "all" | "component" | "trace";
          if (initialUrlState.vd.length) {
            detailVisibilityRef.value = {
              grid: initialUrlState.vd.includes("grid"),
              components: initialUrlState.vd.includes("components"),
              labels: initialUrlState.vd.includes("labels"),
              measures: initialUrlState.vd.includes("measures"),
              zones: initialUrlState.vd.includes("zones"),
              vias: initialUrlState.vd.includes("vias"),
              pads: initialUrlState.vd.includes("pads"),
              keepouts: initialUrlState.vd.includes("keepouts"),
              silkscreen: initialUrlState.vd.includes("silkscreen"),
              documentation: initialUrlState.vd.includes("documentation"),
              mechanical: initialUrlState.vd.includes("mechanical"),
              graphics: initialUrlState.vd.includes("graphics"),
              drills: initialUrlState.vd.includes("drills"),
              boardOutlines: initialUrlState.vd.includes("boardOutlines"),
            };
            if (detailVisibilityRef.value.labels) detailVisibilityRef.value.components = true;
          }
          for (const id of initialUrlState.sc) if (compBoundsMap.has(id)) selectedCompIds.add(id);
          for (const id of initialUrlState.st) if (traceBoundsMap.has(id)) selectedTraceIds.add(id);
          const params = new URL(window.location.href).searchParams;
          const os = (params.get("os") || "").split(",").filter(Boolean);
          for (const key of os) if (overlayMap.has(key)) selectedOverlayKeys.add(key);
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
          renderVisibility,
          traceMetaMap,
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
          exportCanvasShot,
          exportWorkbenchText,
          exportMeasurementsCsv,
          exportSelectionJson,
          exportWorkbenchSession,
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

        onRuntimeReady?.(runtimeRef.current);
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
      onRuntimeReady?.(null);
    };
  }, [width, height, boardWidthMm, boardHeightMm, components, traces, pads, keepouts, silkscreen, documentation, mechanical, graphics, drills, boardOutlines, zones, vias, onHoverFeature]);

  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt || !Array.isArray(visibleDetail) || visibleDetail.length === 0) return;
    const next = {
      grid: visibleDetail.includes("grid"),
      components: visibleDetail.includes("components") || visibleDetail.includes("labels"),
      labels: visibleDetail.includes("labels"),
      measures: visibleDetail.includes("measures"),
      zones: visibleDetail.includes("zones"),
      vias: visibleDetail.includes("vias"),
      pads: visibleDetail.includes("pads"),
      keepouts: visibleDetail.includes("keepouts"),
      silkscreen: visibleDetail.includes("silkscreen"),
      documentation: visibleDetail.includes("documentation"),
      mechanical: visibleDetail.includes("mechanical"),
      graphics: visibleDetail.includes("graphics"),
      drills: visibleDetail.includes("drills"),
      boardOutlines: visibleDetail.includes("boardOutlines"),
    };
    const current = rt.detailVisibilityRef?.value as typeof next | undefined;
    const same = current && (Object.keys(next) as Array<keyof typeof next>).every((key) => current[key] === next[key]);
    if (same) return;
    rt.detailVisibilityRef.value = next;
    rt.renderVisibility?.();
    rt.updateHud?.();
  }, [visibleDetail]);

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
      const widthMm = rt.traceMetaMap?.get(trace.id)?.widthMm || trace.width || 0.18;
      const base = widthMm <= 0.12 ? 12 : widthMm <= 0.2 ? 10 : widthMm <= 0.35 ? 8 : 6;
      const zoomBonus = rt.scaleRef.value < 0.8 ? 3 : rt.scaleRef.value < 1.2 ? 2 : rt.scaleRef.value < 2 ? 1 : 0;
      line.hitRadius = Math.max(4, Math.min(16, base + zoomBonus));
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
selected_overlays_count=${bridgeState.so.length || 0}
selected_overlay_families=${bridgeState.sof || "-"}
selected_overlay_kinds=${bridgeState.sok || "-"}
selected_overlay_layers=${bridgeState.sol || "-"}
selected_overlay_nets=${bridgeState.son || "-"}
selection_filter=${bridgeState.sf || "all"}
visible_detail=${bridgeState.vd || "-"}
label_mode=${bridgeState.lm || "adaptive"}
grid_mode=${bridgeState.gm || "major+minor"}
trace_hit=${bridgeState.th || "adaptive-v1"}
last_export=${bridgeState.le || "-"}`}
      </div>
    </div>
  );
}
