import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id:      string;
  message: string;
  kind:    ToastKind;
}

interface ToastState {
  toasts:  Toast[];
  show:    (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
  clear:   () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, kind = 'info') => {
    const id = `t-${++seq}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), 3500);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] })
}));
