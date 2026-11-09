import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_COMPARE = 4;

export type CompareItem = { id: string; name: string };

interface CompareStore {
  items: CompareItem[];
  toggle: (item: CompareItem) => "added" | "removed" | "full";
  remove: (id: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (item) => {
        const { items } = get();
        if (items.some((existing) => existing.id === item.id)) {
          set({ items: items.filter((existing) => existing.id !== item.id) });
          return "removed";
        }
        if (items.length >= MAX_COMPARE) return "full";
        set({ items: [...items, item] });
        return "added";
      },
      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
      clear: () => set({ items: [] }),
    }),
    { name: "library-near-compare" },
  ),
);
