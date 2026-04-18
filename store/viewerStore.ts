import { create } from "zustand";

export type HoverFeatureType = "component" | "trace" | "zones" | "vias" | "pads" | "keepouts" | "silkscreen" | "boardOutlines" | "documentation" | "mechanical" | "graphics" | "drills";

type HighlightSet = {
  targetId?: string;
  targetType?: HoverFeatureType;
  directComponentIds: string[];
  traceIds: string[];
  netIds: string[];
  overlayKeys: string[];
};

type ViewerState = {
  hoveredFeatureId?: string;
  hoveredFeatureType?: HoverFeatureType;
  highlight: HighlightSet;
  setHoveredFeature: (type?: HoverFeatureType, id?: string) => void;
  setHighlight: (payload: HighlightSet) => void;
};

export const useViewerStore = create<ViewerState>((set) => ({
  hoveredFeatureId: undefined,
  hoveredFeatureType: undefined,
  highlight: {
    targetId: undefined,
    targetType: undefined,
    directComponentIds: [],
    traceIds: [],
    netIds: [],
    overlayKeys: [],
  },
  setHoveredFeature: (type, id) => set({ hoveredFeatureType: type, hoveredFeatureId: id }),
  setHighlight: (payload) => set({ highlight: payload }),
}));
