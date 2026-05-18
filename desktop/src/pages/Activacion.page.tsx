import React, { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { useLicenciaStore } from '../store/licencia.store';
import { cn } from '../lib/cn';

export default function ActivacionPage() {
  const cargando        = useLicenciaStore((s) => s.cargando);
  const activar         = useLicenciaStore((s) => s.activar);
  const errorStore      = useLicenciaStore((s) => s.error);
  const deviceId        = useLicenciaStore((s) => s.deviceId);
  const resumenViejo    = useLicenciaStore((s) => s.resumen);
  const verificar       = useLicenciaStore((s) => s.verificarSilencioso);

  const [key, setKey]   = useState(resumenViejo?.license_key ?? '');
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const onActivar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);
    setEnviando(true);
    try {
      await activar(key);
    } catch (e: any) {
      setErrorLocal(e?.message || 'No se pudo activar');
    } finally {
      setEnviando(false);
    }
  };

  const onReintentar = async () => {
    setErrorLocal(null);
    setEnviando(true);
    try { await verificar(); } finally { setEnviando(false); }
  };

  const errorMostrar = errorLocal ?? errorStore;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-modal p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-slate-950 text-cyan-300 flex items-center justify-center font-black text-xl">
            L
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Activar LavaSuit</h1>
            <p className="text-sm text-slate-500">Desktop</p>
          </div>
        </div>

        <div className="mb-5 px-4 py-3 rounded-lg bg-primary-50/60 border border-primary-100 text-sm text-slate-700">
          Ingresa la clave de licencia que recibiste. Solo se necesita una vez por equipo.
        </div>

        <form onSubmit={onActivar} className="space-y-4">
          <Field label="Clave de licencia *" hint="Formato: SISTE-XXXX-XXXX-XXXX">
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className="pl-9 font-mono tracking-wider"
                placeholder="SISTE-XXXX-XXXX-XXXX"
                autoFocus
                disabled={enviando || cargando}
              />
            </div>
          </Field>

          <div className="text-xs text-slate-500 font-mono break-all px-3 py-2 bg-slate-50 rounded-md border border-slate-100">
            <span className="font-semibold text-slate-700">ID dispositivo: </span>{deviceId}
          </div>

          {errorMostrar && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger-50 border border-danger-200 text-sm text-danger-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{errorMostrar}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              loading={enviando || cargando}
              disabled={enviando || cargando || !key.trim()}
              leftIcon={<ShieldCheck size={16} />}
            >
              Activar
            </Button>
            {resumenViejo?.license_key && (
              <Button
                type="button"
                variant="secondary"
                onClick={onReintentar}
                loading={enviando}
                leftIcon={<RefreshCw size={16} />}
              >
                Reintentar verificación
              </Button>
            )}
          </div>
        </form>

        <p className="mt-6 text-xs text-slate-400 text-center">
          ¿Sin licencia? Contacta a tu proveedor de LavaSuit.
        </p>
      </div>
    </div>
  );
}
