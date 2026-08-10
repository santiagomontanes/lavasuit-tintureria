import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Plus, Search, UserRound, Pencil, FileText, Hash, Download } from 'lucide-react';
import api from '../services/api';
import NuevoClienteModal from '../components/forms/NuevoCliente.modal';
import HistorialFacturasCliente from '../components/clientes/HistorialFacturasCliente';
import CambiarIdentificadorModal from '../components/clientes/CambiarIdentificador.modal';
import { useAuthStore } from '../store/auth.store';
import { useToastStore } from '../store/toast.store';
import { guardarArchivoExcel } from '../lib/guardarArchivo';
import dayjs from 'dayjs';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import { Card } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { inputClassName } from '../components/ui/Input';
import { cn } from '../lib/cn';

const fetchClientes = async (q: string) => {
  const { data } = await api.get('/clientes', { params: q ? { q } : {} });
  return data as any[];
};

export default function ClientesPage() {
  const [busqueda,    setBusqueda]    = useState('');
  const [busquedaDeb, setBusquedaDeb] = useState('');
  const [openNuevo,   setOpenNuevo]   = useState(false);
  const [editCliente, setEditCliente] = useState<any | null>(null);
  const [histCliente, setHistCliente] = useState<any | null>(null);
  const [idCliente,   setIdCliente]   = useState<any | null>(null);
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');
  const toast = useToastStore((s) => s.show);
  const [exportando, setExportando] = useState<'filtrados' | 'todos' | null>(null);

  /* Exporta a Excel. `filtrados` respeta la búsqueda activa; `todos` no manda
   * ningún filtro, así que trae la lista completa —no se limita a lo que se ve
   * en pantalla ni a los primeros registros—. Es solo lectura. */
  const exportarClientes = async (modo: 'filtrados' | 'todos') => {
    setExportando(modo);
    try {
      const params: Record<string, string> = {};
      if (modo === 'filtrados' && busquedaDeb.trim()) params.q = busquedaDeb.trim();

      const res = await api.get('/exportacion/clientes', { params, responseType: 'arraybuffer' });
      const ruta = await guardarArchivoExcel(res.data, `clientes_lavasuit_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      if (ruta) toast(`Archivo guardado en: ${ruta}`, 'success');
      else toast('Exportación de clientes generada', 'success');
    } catch (e: any) {
      toast(e?.response?.data?.error || 'No se pudo exportar los clientes', 'error');
    } finally {
      setExportando(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes', busquedaDeb],
    queryFn:  () => fetchClientes(busquedaDeb)
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Comercial"
        title="Clientes"
        description="Consulta contactos, telefonos y datos base para crear pedidos con rapidez."
        meta={<Badge tone="info" outline>{clientes.length} clientes</Badge>}
        actions={(
          <>
            <Button
              variant="secondary"
              leftIcon={<Download size={15} />}
              onClick={() => exportarClientes('filtrados')}
              disabled={exportando !== null || !busquedaDeb.trim()}
            >
              {exportando === 'filtrados' ? 'Exportando…' : 'Exportar filtrados'}
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Download size={15} />}
              onClick={() => exportarClientes('todos')}
              disabled={exportando !== null}
            >
              {exportando === 'todos' ? 'Exportando…' : 'Exportar clientes'}
            </Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setOpenNuevo(true)}>Nuevo cliente</Button>
          </>
        )}
      />

      <Card className="p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o código"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={cn(inputClassName, 'pl-9')}
          />
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Cargando clientes..." />
      ) : clientes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserRound size={22} />}
            title="No se encontraron clientes"
            description="Crea un nuevo cliente o cambia el termino de busqueda."
            action={<Button leftIcon={<Plus size={16} />} onClick={() => setOpenNuevo(true)}>Nuevo cliente</Button>}
          />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>ID</TH>
                <TH>Cliente</TH>
                <TH>Telefono</TH>
                <TH>Email</TH>
                <TH>Estado</TH>
                <TH align="right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {clientes.map((c) => (
                <TR key={c.id}>
                  <TD>
                    {c.identificador
                      ? <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">{c.identificador}</span>
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 flex items-center justify-center">
                        <UserRound size={16} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950">{c.nombre}</p>
                        {c.direccion && <p className="text-xs text-slate-500">{c.direccion}</p>}
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-2 text-slate-700">
                      <Phone size={14} className="text-slate-400" /> {c.telefono}
                    </span>
                  </TD>
                  <TD>
                    {c.email ? (
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <Mail size={14} className="text-slate-400" /> {c.email}
                      </span>
                    ) : <span className="text-slate-400">---</span>}
                  </TD>
                  <TD><Badge tone={c.activo === false ? 'neutral' : 'success'} dot>{c.activo === false ? 'Inactivo' : 'Activo'}</Badge></TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" leftIcon={<FileText size={14} />} onClick={() => setHistCliente(c)}>
                        Historial
                      </Button>
                      {esAdmin && (
                        <Button variant="secondary" size="sm" leftIcon={<Hash size={14} />} onClick={() => setIdCliente(c)}>
                          Número
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditCliente(c)}>
                        Editar
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      {histCliente && (
        <HistorialFacturasCliente cliente={histCliente} onClose={() => setHistCliente(null)} />
      )}

      <CambiarIdentificadorModal
        open={!!idCliente}
        cliente={idCliente}
        onClose={() => setIdCliente(null)}
      />

      <NuevoClienteModal open={openNuevo} onClose={() => setOpenNuevo(false)} />
      <NuevoClienteModal
        open={!!editCliente}
        cliente={editCliente}
        onClose={() => setEditCliente(null)}
      />
    </div>
  );
}
