import { create } from "zustand";

type HighlightSet = {
  targetId?: string;
  directComponentIds: string[];
  traceIds: string[];
  netIds: string[];
};

type ViewerState = {
  hoveredComponentId?: string;
  highlight: HighlightSet;
  setHoveredComponentId: (id?: string) => void;
  setHighlight: (payload: HighlightSet) => void;
};

export const useViewerStore = create<ViewerState>((set) => ({
  hoveredComponentId: undefined,
  highlight: {
    targetId: undefined,
    directComponentIds: [],
    traceIds: [],
    netIds: [],
  },
  setHoveredComponentId: (id) => set({ hoveredComponentId: id }),
  setHighlight: (payload) => set({ highlight: payload }),
}));
