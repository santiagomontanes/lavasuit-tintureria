import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Plus, Search, UserRound } from 'lucide-react';
import api from '../services/api';
import NuevoClienteModal from '../components/forms/NuevoCliente.modal';
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
        actions={<Button leftIcon={<Plus size={16} />} onClick={() => setOpenNuevo(true)}>Nuevo cliente</Button>}
      />

      <Card className="p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o telefono"
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
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <NuevoClienteModal open={openNuevo} onClose={() => setOpenNuevo(false)} />
    </div>
  );
}
