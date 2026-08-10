import React from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Receipt } from 'lucide-react';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../ui/Table';
import api from '../../services/api';
import { formatCurrencyCOP } from '../../lib/currency';
import { resultadoCaja } from '../../lib/cajaResultado';

const moneda = formatCurrencyCOP;

/* Detalle de una sesión de caja.
 *
 * Los gastos se piden al backend filtrados por `cajaSesionId` —nunca por
 * fecha—, así que aquí solo aparecen los movimientos de ESA caja y no los de
 * otra sesión del mismo día. Antes Desktop no tenía forma de consultarlos una
 * vez cerrada la sesión: por eso el cierre se veía sin gastos.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  cajaSesionId: string | null;
}

function Fila({ label, valor, tono }: { label: string; valor: React.ReactNode; tono?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`num font-semibold ${tono ?? 'text-slate-900'}`}>{valor}</span>
    </div>
  );
}

export default function DetalleCierreModal({ open, onClose, cajaSesionId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['caja-sesion-detalle', cajaSesionId],
    queryFn:  () => api.get(`/caja/sesiones/${cajaSesionId}`).then((r) => r.data),
    enabled:  open && !!cajaSesionId
  });

  const caja    = data?.cajaSesion;
  const r       = data?.resumen ?? {};
  const gastos  = (data?.gastos ?? []) as any[];
  const dif     = r.diferencia != null ? Number(r.diferencia) : null;
  const res     = caja?.estado === 'ABIERTA' ? null : resultadoCaja(dif);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalle del cierre de caja"
      subtitle={caja ? `${caja.usuario?.nombre ?? '—'} · ${dayjs(caja.fechaApertura).format('DD/MM/YYYY HH:mm')}` : undefined}
    >
      {isLoading || !caja ? (
        <LoadingState label="Cargando cierre..." />
      ) : (
        <div className="p-6 space-y-5">
          {/* Resumen de la sesión */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sesión</p>
              <Fila label="Empleado / cajero" valor={caja.usuario?.nombre ?? '—'} />
              <Fila label="Apertura" valor={dayjs(caja.fechaApertura).format('DD/MM/YYYY HH:mm')} />
              <Fila label="Cierre" valor={caja.fechaCierre ? dayjs(caja.fechaCierre).format('DD/MM/YYYY HH:mm') : '—'} />
              <Fila label="Base inicial" valor={moneda(Number(caja.montoBase ?? 0))} />
              <Fila label="Total recibido" valor={moneda(Number(r.totalRecibido ?? 0))} tono="text-success-700" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Por método</p>
              <Fila label="Efectivo" valor={moneda(Number(r.totalEfectivo ?? 0))} />
              <Fila label="Nequi" valor={moneda(Number(r.totalNequi ?? 0))} />
              <Fila label="Daviplata" valor={moneda(Number(r.totalDaviplata ?? 0))} />
              <Fila label="Transferencia" valor={moneda(Number(r.totalTransferencia ?? 0))} />
              {Number(r.totalTarjeta ?? 0) > 0 && <Fila label="Tarjeta" valor={moneda(Number(r.totalTarjeta))} />}
              {Number(r.totalOtro ?? 0) > 0 && <Fila label="Otros métodos" valor={moneda(Number(r.totalOtro))} />}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gastos</p>
              <Fila label="Total de gastos" valor={moneda(Number(r.totalGastos ?? 0))} tono="text-warning-700" />
              <Fila label="Gastos en efectivo" valor={moneda(Number(r.totalGastosEfectivo ?? 0))} tono="text-warning-700" />
              <Fila label="Gastos otros métodos" valor={moneda(Number(r.totalGastosOtros ?? 0))} tono="text-warning-700" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Arqueo</p>
              <Fila label="Efectivo esperado" valor={r.efectivoEsperado != null ? moneda(Number(r.efectivoEsperado)) : '—'} tono="text-info-700" />
              <Fila label="Efectivo contado" valor={r.efectivoContado != null ? moneda(Number(r.efectivoContado)) : '—'} />
              <Fila
                label="Diferencia"
                valor={dif != null ? `${dif >= 0 ? '+' : ''}${moneda(dif)}` : '—'}
                tono={dif == null ? undefined : dif >= -0.01 ? 'text-success-700' : 'text-danger-700'}
              />
              {res && (
                <div className="pt-1">
                  <Badge tone={res.badge}>{res.texto}</Badge>
                </div>
              )}
            </div>
          </div>

          {/* Gastos de ESTA sesión */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={16} className="text-warning-600" />
              <h3 className="text-sm font-bold text-slate-800">Gastos de esta sesión</h3>
              <Badge tone={gastos.length ? 'warning' : 'neutral'} outline>{gastos.length}</Badge>
            </div>

            {gastos.length === 0 ? (
              <EmptyState
                compact
                icon={<Receipt size={20} />}
                title="Sin gastos en esta sesión"
                description="No se registró ningún gasto mientras esta caja estuvo abierta."
              />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <TR>
                      <TH>Hora</TH>
                      <TH>Concepto</TH>
                      <TH>Categoría</TH>
                      <TH>Descripción</TH>
                      <TH>Método</TH>
                      <TH align="right">Valor</TH>
                      <TH>Registrado por</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {gastos.map((g) => (
                      <TR key={g.id}>
                        <TD className="text-slate-500">{dayjs(g.fecha).format('HH:mm')}</TD>
                        <TD className="font-medium text-slate-900">{g.concepto}</TD>
                        <TD className="text-slate-700">{g.categoria}</TD>
                        <TD className="text-slate-500">{g.descripcion || '—'}</TD>
                        <TD><Badge tone="info" outline>{g.metodoPago}</Badge></TD>
                        <TD align="right" className="num font-semibold text-warning-700">{moneda(Number(g.valor))}</TD>
                        <TD className="text-slate-700">{g.creadoPor?.nombre ?? '—'}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </div>

          {caja.observacionCierre && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Observación de cierre</p>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{caja.observacionCierre}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
