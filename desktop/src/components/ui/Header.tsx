import React from 'react';
import { ArrowLeft, CalendarDays, Search, Server } from 'lucide-react';
import { useNavStore, tituloVista } from '../../store/nav.store';
import { useAuthStore } from '../../store/auth.store';
import ConnectionStatus from './ConnectionStatus';

interface HeaderProps {
  onConfigurarServidor?: () => void;
}

const subtitulo: Record<string, string> = {
  dashboard:        'Resumen operativo de hoy',
  pedidos:          'Gestiona los pedidos en curso',
  clientes:         'Base de clientes y contacto',
  servicios:        'Catalogo de servicios y precios',
  'pedido-detalle': 'Ficha completa del pedido'
};

export default function Header({ onConfigurarServidor }: HeaderProps = {}) {
  const view    = useNavStore((s) => s.view);
  const navegar = useNavStore((s) => s.navegar);
  const usuario = useAuthStore((s) => s.usuario);

  const esDetalle = view.kind === 'pedido-detalle';

  return (
    <header className="h-20 px-7 bg-white/90 backdrop-blur border-b border-slate-200/80 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {esDetalle && (
          <button
            onClick={() => navegar({ kind: 'pedidos' })}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-ring"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-950 truncate leading-tight">
            {tituloVista[view.kind]}
          </h1>
          <p className="text-xs text-slate-500 leading-tight">{subtitulo[view.kind] ?? ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl w-72 text-sm text-slate-400 shadow-sm">
          <Search size={14} />
          <span className="flex-1">Buscar...</span>
          <kbd className="font-mono text-[10px] text-slate-400 border border-slate-200 bg-white px-1.5 rounded">
            Ctrl K
          </kbd>
        </div>
        <div className="hidden xl:flex items-center gap-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-500 shadow-sm">
          <CalendarDays size={14} className="text-slate-400" />
          <span>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
        <ConnectionStatus />
        {onConfigurarServidor && (
          <button
            onClick={onConfigurarServidor}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-ring"
            title="Configurar servidor"
            aria-label="Configurar servidor"
          >
            <Server size={16} />
          </button>
        )}
        {usuario && (
          <div className="hidden lg:block text-right leading-tight">
            <p className="text-sm font-semibold text-slate-900">{usuario.nombre}</p>
            <p className="text-xs text-slate-500">{usuario.rol}</p>
          </div>
        )}
      </div>
    </header>
  );
}
