import React from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, Package, LogOut, Route, Banknote, UserCog
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useNavStore, View } from '../../store/nav.store';
import { cn } from '../../lib/cn';
import UpdateChecker from './UpdateChecker';

interface Item {
  id:        View['kind'];
  label:     string;
  icon:      React.ComponentType<{ size?: number; className?: string }>;
  soloAdmin?: boolean;
}

const items: Item[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pedidos',   label: 'Pedidos',   icon: ShoppingBag     },
  { id: 'clientes',  label: 'Clientes',  icon: Users           },
  { id: 'rutas',     label: 'Rutas',     icon: Route           },
  { id: 'servicios', label: 'Servicios', icon: Package         },
  { id: 'caja',      label: 'Caja',      icon: Banknote        },
  { id: 'empleados', label: 'Empleados', icon: UserCog, soloAdmin: true }
];

export default function Sidebar() {
  const { usuario, logout } = useAuthStore();
  const view    = useNavStore((s) => s.view);
  const navegar = useNavStore((s) => s.navegar);

  const activa: View['kind'] = view.kind === 'pedido-detalle' ? 'pedidos' : view.kind;
  const esAdmin = usuario?.rol === 'ADMIN';

  const iniciales = (usuario?.nombre ?? 'U')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((s) => s[0]!.toUpperCase()).join('');

  const itemsVisibles = items.filter((i) => !i.soloAdmin || esAdmin);

  return (
    <aside className="w-72 shrink-0 h-full bg-slate-950 text-white flex flex-col shadow-pop">
      <div className="h-20 px-5 flex items-center gap-3 border-b border-white/10">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary-400 to-cyan-200 text-slate-950 font-black flex items-center justify-center shadow-pop">
          L
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">LavaSuit</p>
          <p className="text-xs text-slate-400 leading-tight">Administracion desktop</p>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Operacion
        </p>
        <ul className="space-y-1.5">
          {itemsVisibles.map(({ id, label, icon: Icon }) => {
            const active = activa === id;
            return (
              <li key={id}>
                <button
                  onClick={() => navegar({ kind: id } as View)}
                  className={cn(
                    'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all focus-ring',
                    active
                      ? 'bg-white text-slate-950 shadow-pop'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon
                    size={17}
                    className={cn(active ? 'text-primary-700' : 'text-slate-500 group-hover:text-slate-300')}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 pb-4">
        <div className="mb-3">
          <UpdateChecker />
        </div>

        {usuario && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3">
            <div className="h-10 w-10 rounded-xl bg-primary-400 text-slate-950 text-xs font-bold flex items-center justify-center shrink-0">
              {iniciales}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{usuario.nombre}</p>
              <p className="text-xs text-slate-400 truncate">{usuario.rol}</p>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesion"
              className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 focus-ring"
              aria-label="Cerrar sesion"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
