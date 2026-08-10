import { create } from 'zustand';

export type View =
  | { kind: 'dashboard' }
  | { kind: 'pedidos' }
  | { kind: 'clientes' }
  | { kind: 'rutas' }
  | { kind: 'servicios' }
  | { kind: 'marcas' }
  | { kind: 'colores' }
  | { kind: 'caja' }
  | { kind: 'gastos' }
  | { kind: 'reportes' }
  | { kind: 'empleados' }
  | { kind: 'configuracion' }
  | { kind: 'pedido-detalle'; id: string };

interface NavState {
  view:    View;
  history: View[];
  navegar: (v: View) => void;
  volver:  () => void;
  reset:   () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  view:    { kind: 'dashboard' },
  history: [],

  navegar: (v) => {
    const actual = get().view;
    if (actual.kind === v.kind && JSON.stringify(actual) === JSON.stringify(v)) return;
    set((s) => ({
      view:    v,
      history: [...s.history, s.view].slice(-20)
    }));
  },

  volver: () => {
    const h = get().history;
    if (h.length === 0) return;
    set({
      view:    h[h.length - 1],
      history: h.slice(0, -1)
    });
  },

  reset: () => set({ view: { kind: 'dashboard' }, history: [] })
}));

export const tituloVista: Record<View['kind'], string> = {
  'dashboard':       'Dashboard',
  'pedidos':         'Pedidos',
  'clientes':        'Clientes',
  'rutas':           'Rutas y asignaciones',
  'servicios':       'Servicios',
  'marcas':          'Marcas',
  'colores':         'Colores',
  'caja':            'Caja',
  'gastos':          'Gastos',
  'reportes':        'Reportes',
  'empleados':       'Usuarios',
  'configuracion':   'Configuración de empresa',
  'pedido-detalle':  'Detalle del pedido'
};
