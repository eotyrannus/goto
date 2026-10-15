import { create } from 'zustand';

/** Which doors are shut in the 3D view. A viewing aid, not part of the saved design: doors start open. */
export const useDoors = create<{ shut: Record<string, boolean>; toggle: (id: string) => void }>((set) => ({
  shut: {},
  toggle: (id) => set((s) => ({ shut: { ...s.shut, [id]: !s.shut[id] } })),
}));
