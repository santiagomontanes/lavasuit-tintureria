import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { inputClassName } from './Input';

/* Autocomplete reutilizable estilo POS.
 * - Filtra prefix-first sobre código, abreviaturas y nombre.
 * - Teclado completo: ↑↓ navega, Enter selecciona, Esc cierra, Tab confirma.
 * - Debounce configurable (default 120ms) para queries remotas.
 * - Si pasas `fetcher`, hace request server-side; si pasas `options`, filtra local. */

export interface AutocompleteItem {
  id:            string;
  nombre:        string;
  codigo?:       string | null;
  abreviaturas?: string | null;
  /* Texto opcional a la derecha (precio, marca, etc) */
  meta?:         React.ReactNode;
}

interface Props<T extends AutocompleteItem> {
  value?:       T | null;
  onSelect:     (item: T) => void;
  onClear?:     () => void;
  fetcher?:     (q: string) => Promise<T[]>;
  options?:     T[];
  placeholder?: string;
  autoFocus?:   boolean;
  disabled?:    boolean;
  inputId?:     string;
  /* Si true, al hacer focus muestra los top N sin necesidad de teclear. */
  abrirEnFoco?: boolean;
  debounceMs?:  number;
  className?:   string;
  /* Renderer custom para cada item; recibe el item y devuelve JSX. */
  renderItem?:  (item: T, opts: { activo: boolean; query: string }) => React.ReactNode;
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const matchLocal = <T extends AutocompleteItem>(items: T[], qNorm: string, limit = 12): T[] => {
  if (!qNorm) return items.slice(0, limit);
  const ranked = items
    .map((it) => {
      const codigo = normalizar(it.codigo ?? '');
      const nombre = normalizar(it.nombre);
      const abr    = String(it.abreviaturas ?? '').split(',').map(normalizar).filter(Boolean);
      let s = 0;
      if (codigo === qNorm)                        s = 100;
      else if (codigo && codigo.startsWith(qNorm)) s = 90;
      else if (abr.some((a) => a.startsWith(qNorm))) s = 80;
      else if (nombre.startsWith(qNorm))           s = 60;
      else if (nombre.split(' ').some((w) => w.startsWith(qNorm))) s = 50;
      return { it, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.it.nombre.localeCompare(b.it.nombre))
    .slice(0, limit)
    .map((x) => x.it);
  return ranked;
};

export function Autocomplete<T extends AutocompleteItem>(props: Props<T>) {
  const {
    value, onSelect, onClear, fetcher, options, placeholder,
    autoFocus, disabled, inputId, abrirEnFoco = true,
    debounceMs = 120, className, renderItem
  } = props;

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [open,  setOpen]  = useState(false);
  const [idx,   setIdx]   = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef  = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (value) setQuery(value.nombre);
    else       setQuery('');
  }, [value?.id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const qNorm = normalizar(query);
      if (fetcher) {
        setLoading(true);
        const myReq = ++reqIdRef.current;
        try {
          const data = await fetcher(query);
          if (reqIdRef.current === myReq) {
            setItems(data);
            setIdx(0);
          }
        } finally {
          if (reqIdRef.current === myReq) setLoading(false);
        }
      } else if (options) {
        setItems(matchLocal(options, qNorm));
        setIdx(0);
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [query, open, fetcher, options, debounceMs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const seleccionar = (it: T) => {
    setOpen(false);
    setQuery(it.nombre);
    onSelect(it);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')     {
      if (open && items[idx]) { e.preventDefault(); seleccionar(items[idx]); }
    }
    else if (e.key === 'Tab' && open && items[idx]) {
      seleccionar(items[idx]);
    }
    else if (e.key === 'Escape')    { setOpen(false); }
  };

  const renderDefault = (it: T, activo: boolean) => (
    <div className={cn(
      'flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-sm',
      activo ? 'bg-primary-50 text-primary-900' : 'text-slate-800 hover:bg-slate-50'
    )}>
      <div className="min-w-0 flex items-center gap-2">
        {it.codigo && (
          <span className={cn(
            'px-1.5 py-0.5 text-[10px] font-mono uppercase rounded',
            activo ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-600'
          )}>{it.codigo}</span>
        )}
        <span className="truncate font-medium">{it.nombre}</span>
      </div>
      {it.meta != null && <span className="text-xs text-slate-500 whitespace-nowrap">{it.meta}</span>}
    </div>
  );

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        id={inputId}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? 'Buscar (cam, ph, pd…)'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value && onClear) onClear(); }}
        onFocus={() => { if (abrirEnFoco) setOpen(true); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        className={cn(inputClassName, 'pl-9 pr-9')}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={() => { setQuery(''); onClear(); setOpen(true); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs px-1"
          tabIndex={-1}
          aria-label="Limpiar selección"
        >×</button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Buscando…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
          )}
          <ul role="listbox" className="max-h-72 overflow-auto py-1">
            {items.map((it, i) => (
              <li
                key={it.id}
                role="option"
                aria-selected={i === idx}
                onMouseEnter={() => setIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); seleccionar(it); }}
              >
                {renderItem
                  ? renderItem(it, { activo: i === idx, query })
                  : renderDefault(it, i === idx)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Autocomplete;
