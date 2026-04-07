import { create } from "zustand";

type HighlightSet = {
  targetId?: string;
  targetType?: "component" | "trace";
  directComponentIds: string[];
  traceIds: string[];
  netIds: string[];
};

type ViewerState = {
  hoveredFeatureId?: string;
  hoveredFeatureType?: "component" | "trace";
  highlight: HighlightSet;
  setHoveredFeature: (type?: "component" | "trace", id?: string) => void;
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
  },
  setHoveredFeature: (type, id) => set({ hoveredFeatureType: type, hoveredFeatureId: id }),
  setHighlight: (payload) => set({ highlight: payload }),
}));
