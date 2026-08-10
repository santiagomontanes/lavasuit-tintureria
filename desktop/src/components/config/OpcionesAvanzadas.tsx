import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldCheck, Save, History, KeyRound } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../services/api';
import Button from '../ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/Card';
import { Field, Input } from '../ui/Input';
import { useToastStore } from '../../store/toast.store';

interface ConfigAvanzada {
  mostrarNombreEnRecibo:  boolean;
  descontarGastosDeCaja:  boolean;
  exigirFotoCambioEstado: boolean;
  exigirFotoEntrega:      boolean;
  solicitarMontoRecibido: boolean;
  mostrarDeudaConsolidadaEnFactura: boolean;
  backupAutomaticoAlCerrarDia: boolean;
  configPasswordSet:      boolean;
}

const FLAGS: { key: keyof ConfigAvanzada; label: string; hint: string }[] = [
  { key: 'mostrarNombreEnRecibo',  label: 'Mostrar nombre de la lavandería en recibos', hint: 'Si se desactiva, los recibos muestran solo logo y fecha.' },
  { key: 'descontarGastosDeCaja',  label: 'Descontar gastos automáticamente de caja',   hint: 'Si se desactiva, la caja disponible = ingresos (sin restar gastos). Siempre se muestran los gastos del día.' },
  { key: 'exigirFotoCambioEstado', label: 'Exigir fotografía para cambio de estado',     hint: 'Controla cambios de estado no relacionados con entrega. La trazabilidad siempre se registra.' },
  { key: 'exigirFotoEntrega',      label: 'Exigir fotografía para entrega',              hint: 'Si se desactiva, se permite entregar sin foto. La trazabilidad siempre se registra.' },
  { key: 'solicitarMontoRecibido', label: 'Solicitar monto recibido al registrar pago',  hint: 'Si se desactiva, en efectivo el recibido = pagado y las vueltas = 0.' },
  { key: 'mostrarDeudaConsolidadaEnFactura', label: 'Mostrar deuda anterior consolidada en factura', hint: 'Solo visualización. Si se activa, el recibo muestra el desglose de la deuda consolidada y el total a pagar. La lógica financiera no cambia.' },
  { key: 'backupAutomaticoAlCerrarDia', label: 'Generar backup automático al cerrar el día', hint: 'Si se activa, al cerrar la caja del día se genera una copia de seguridad. No bloquea el cierre si el backup falla (solo muestra advertencia).' }
];

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-primary-600' : 'bg-slate-300'} ${disabled ? 'opacity-50' : ''}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${on ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

export default function OpcionesAvanzadas() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const [desbloqueado, setDesbloqueado] = useState(false);
  const [password, setPassword] = useState('');
  const [flags, setFlags] = useState<ConfigAvanzada | null>(null);

  // Cambio/creación de contraseña.
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva]   = useState('');

  const { data: config } = useQuery({
    queryKey: ['configuracion-empresa'],
    queryFn: async () => (await api.get('/configuracion/empresa')).data as ConfigAvanzada
  });

  useEffect(() => {
    if (config) setFlags({
      mostrarNombreEnRecibo:  config.mostrarNombreEnRecibo,
      descontarGastosDeCaja:  config.descontarGastosDeCaja,
      exigirFotoCambioEstado: config.exigirFotoCambioEstado,
      exigirFotoEntrega:      config.exigirFotoEntrega,
      solicitarMontoRecibido: config.solicitarMontoRecibido,
      mostrarDeudaConsolidadaEnFactura: config.mostrarDeudaConsolidadaEnFactura,
      backupAutomaticoAlCerrarDia: config.backupAutomaticoAlCerrarDia,
      configPasswordSet:      config.configPasswordSet
    });
  }, [config]);

  const auditoria = useQuery({
    queryKey: ['configuracion-auditoria'],
    queryFn: async () => (await api.get('/configuracion/auditoria', { params: { limit: 50 } })).data as any[],
    enabled: desbloqueado
  });

  const verificar = useMutation({
    mutationFn: async () => (await api.post('/configuracion/verificar-password', { password })).data,
    onSuccess: (d: any) => {
      if (d.ok) { setDesbloqueado(true); setPassword(''); toast('Acceso concedido', 'success'); }
      else toast('Contraseña incorrecta', 'error');
    },
    onError: () => toast('No se pudo verificar', 'error')
  });

  const guardarPass = useMutation({
    mutationFn: async () =>
      (await api.post('/configuracion/password', { passwordActual: passActual || undefined, nuevaPassword: passNueva })).data,
    onSuccess: (d: any) => {
      setPassActual(''); setPassNueva('');
      qc.invalidateQueries({ queryKey: ['configuracion-empresa'] });
      if (d.creada) { setDesbloqueado(true); toast('Contraseña creada. Opciones desbloqueadas.', 'success'); }
      else toast('Contraseña actualizada', 'success');
    },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo guardar la contraseña', 'error')
  });

  const guardarFlags = useMutation({
    mutationFn: async () => {
      if (!flags) throw new Error('Sin datos');
      const body = {
        password,
        mostrarNombreEnRecibo:  flags.mostrarNombreEnRecibo,
        descontarGastosDeCaja:  flags.descontarGastosDeCaja,
        exigirFotoCambioEstado: flags.exigirFotoCambioEstado,
        exigirFotoEntrega:      flags.exigirFotoEntrega,
        solicitarMontoRecibido: flags.solicitarMontoRecibido,
        mostrarDeudaConsolidadaEnFactura: flags.mostrarDeudaConsolidadaEnFactura,
        backupAutomaticoAlCerrarDia: flags.backupAutomaticoAlCerrarDia
      };
      return (await api.patch('/configuracion/avanzada', body)).data;
    },
    onSuccess: (d: any) => {
      qc.setQueryData(['configuracion-empresa'], (prev: any) => ({ ...prev, ...d }));
      qc.invalidateQueries({ queryKey: ['configuracion-auditoria'] });
      toast('Opciones avanzadas guardadas', 'success');
    },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo guardar (¿contraseña correcta?)', 'error')
  });

  const passwordSet = flags?.configPasswordSet ?? config?.configPasswordSet ?? false;

  // ── Gate: primero crear contraseña, luego desbloquear ──
  if (!desbloqueado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><span className="inline-flex items-center gap-2"><Lock size={16} className="text-amber-600" /> Opciones Avanzadas</span></CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 max-w-md">
          {!passwordSet ? (
            <>
              <p className="text-sm text-slate-600">
                Aún no se ha creado la contraseña de Opciones Avanzadas. Créala para proteger esta sección.
              </p>
              <Field label="Nueva contraseña">
                <Input type="password" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} placeholder="Mínimo 4 caracteres" />
              </Field>
              <Button leftIcon={<KeyRound size={15} />} disabled={passNueva.length < 4} loading={guardarPass.isPending} onClick={() => guardarPass.mutate()}>
                Crear contraseña y entrar
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Ingresa la contraseña de configuración para administrar las opciones avanzadas.</p>
              <Field label="Contraseña de configuración">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && password && verificar.mutate()} placeholder="••••••" />
              </Field>
              <Button leftIcon={<ShieldCheck size={15} />} disabled={!password} loading={verificar.isPending} onClick={() => verificar.mutate()}>
                Desbloquear
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle><span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-green-600" /> Opciones Avanzadas</span></CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {flags && FLAGS.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                <p className="text-xs text-slate-500">{f.hint}</p>
              </div>
              <Toggle on={!!flags[f.key]} onChange={(v) => setFlags((s) => s ? { ...s, [f.key]: v } : s)} />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <Field label="Confirma tu contraseña de configuración para guardar" className="flex-1">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </Field>
            <Button leftIcon={<Save size={15} />} disabled={!password} loading={guardarFlags.isPending} onClick={() => guardarFlags.mutate()}>
              Guardar
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="inline-flex items-center gap-2"><KeyRound size={16} className="text-primary-600" /> Cambiar contraseña de configuración</span></CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 max-w-md">
          <Field label="Contraseña actual"><Input type="password" value={passActual} onChange={(e) => setPassActual(e.target.value)} /></Field>
          <Field label="Nueva contraseña"><Input type="password" value={passNueva} onChange={(e) => setPassNueva(e.target.value)} placeholder="Mínimo 4 caracteres" /></Field>
          <Button variant="secondary" disabled={passNueva.length < 4} loading={guardarPass.isPending} onClick={() => guardarPass.mutate()}>
            Cambiar contraseña
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><span className="inline-flex items-center gap-2"><History size={16} className="text-slate-500" /> Auditoría de configuraciones</span></CardTitle>
        </CardHeader>
        <CardBody>
          {(auditoria.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Sin cambios registrados.</p>
          ) : (
            <div className="space-y-2">
              {(auditoria.data ?? []).map((a: any) => (
                <div key={a.id} className="text-sm border-b border-slate-100 pb-2 last:border-0">
                  <p className="font-medium text-slate-800">{a.etiqueta ?? a.campo}</p>
                  <p className="text-xs text-slate-500">
                    {a.usuario?.nombre ?? '—'}{a.usuario?.rol ? ` (${a.usuario.rol})` : ''} · {dayjs(a.createdAt).format('DD/MM/YYYY HH:mm')}
                    {' · '}<span className="text-slate-400">{a.valorAnterior ?? '—'}</span> → <span className="font-semibold">{a.valorNuevo ?? '—'}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
