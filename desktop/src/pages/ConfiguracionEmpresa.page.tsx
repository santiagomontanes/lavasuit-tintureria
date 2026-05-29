import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Image as ImageIcon, Trash2, Receipt } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Field, Input, Textarea } from '../components/ui/Input';
import { useToastStore } from '../store/toast.store';
import { useAuthStore } from '../store/auth.store';

interface ConfigEmpresa {
  nombreNegocio:  string;
  nit:            string | null;
  telefono:       string | null;
  direccion:      string | null;
  ciudad:         string | null;
  logoBase64:     string | null;
  politicasTexto: string | null;
  garantiaTexto:  string | null;
  pieRecibo:      string | null;
}

type FormState = {
  nombreNegocio:  string;
  nit:            string;
  telefono:       string;
  direccion:      string;
  ciudad:         string;
  logoBase64:     string;
  politicasTexto: string;
  garantiaTexto:  string;
  pieRecibo:      string;
};

const VACIO: FormState = {
  nombreNegocio: '', nit: '', telefono: '', direccion: '', ciudad: '',
  logoBase64: '', politicasTexto: '', garantiaTexto: '', pieRecibo: ''
};

const aFormState = (c: ConfigEmpresa): FormState => ({
  nombreNegocio:  c.nombreNegocio ?? '',
  nit:            c.nit ?? '',
  telefono:       c.telefono ?? '',
  direccion:      c.direccion ?? '',
  ciudad:         c.ciudad ?? '',
  logoBase64:     c.logoBase64 ?? '',
  politicasTexto: c.politicasTexto ?? '',
  garantiaTexto:  c.garantiaTexto ?? '',
  pieRecibo:      c.pieRecibo ?? ''
});

/* Redimensiona la imagen a un máximo de `max` px y la devuelve como data URI.
 * Mantener el logo pequeño evita exceder el límite del cuerpo JSON. */
function redimensionarImagen(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas no disponible')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ConfiguracionEmpresaPage() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [form, setForm] = useState<FormState>(VACIO);

  const { data, isLoading } = useQuery({
    queryKey: ['configuracion-empresa'],
    queryFn: async () => {
      const { data } = await api.get('/configuracion/empresa');
      return data as ConfigEmpresa;
    }
  });

  useEffect(() => {
    if (data) setForm(aFormState(data));
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const guardar = useMutation({
    mutationFn: async () => {
      const body = {
        nombreNegocio:  form.nombreNegocio.trim(),
        nit:            form.nit.trim() || null,
        telefono:       form.telefono.trim() || null,
        direccion:      form.direccion.trim() || null,
        ciudad:         form.ciudad.trim() || null,
        logoBase64:     form.logoBase64 || null,
        politicasTexto: form.politicasTexto.trim() || null,
        garantiaTexto:  form.garantiaTexto.trim() || null,
        pieRecibo:      form.pieRecibo.trim() || null
      };
      const { data } = await api.put('/configuracion/empresa', body);
      return data as ConfigEmpresa;
    },
    onSuccess: (data) => {
      qc.setQueryData(['configuracion-empresa'], data);
      toast('Configuración de empresa guardada', 'success');
    },
    onError: (e: any) => {
      toast(e?.response?.data?.error || 'No se pudo guardar la configuración', 'error');
    }
  });

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('El logo debe ser una imagen', 'error');
      return;
    }
    try {
      const dataUrl = await redimensionarImagen(file, 320);
      set('logoBase64', dataUrl);
    } catch {
      toast('No se pudo procesar la imagen', 'error');
    }
  };

  const nombreNegocioValido = form.nombreNegocio.trim().length > 0;
  const ubicacion = useMemo(
    () => [form.direccion.trim(), form.ciudad.trim()].filter(Boolean).join(', '),
    [form.direccion, form.ciudad]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-7 w-7 rounded-full border-2 border-slate-300 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuración"
        title="Datos de la empresa"
        description="Estos datos se imprimen en los recibos térmicos y PDF, tanto en desktop como en mobile."
        meta={!esAdmin ? <Badge tone="warning" outline>Solo lectura — se requiere ADMIN</Badge> : undefined}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Formulario ── */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Building2 size={16} className="text-primary-600" />
                  Datos del negocio
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Nombre del negocio *" error={!nombreNegocioValido ? 'Requerido' : undefined}>
                  <Input
                    value={form.nombreNegocio}
                    onChange={(e) => set('nombreNegocio', e.target.value)}
                    placeholder="LavaSuit"
                    disabled={!esAdmin}
                  />
                </Field>
                <Field label="NIT">
                  <Input
                    value={form.nit}
                    onChange={(e) => set('nit', e.target.value)}
                    placeholder="900.123.456-7"
                    disabled={!esAdmin}
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    value={form.telefono}
                    onChange={(e) => set('telefono', e.target.value)}
                    placeholder="300 000 0000"
                    disabled={!esAdmin}
                  />
                </Field>
                <Field label="Ciudad">
                  <Input
                    value={form.ciudad}
                    onChange={(e) => set('ciudad', e.target.value)}
                    placeholder="Bogotá"
                    disabled={!esAdmin}
                  />
                </Field>
                <Field label="Dirección" className="md:col-span-2">
                  <Input
                    value={form.direccion}
                    onChange={(e) => set('direccion', e.target.value)}
                    placeholder="Calle 1 # 2-3"
                    disabled={!esAdmin}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <ImageIcon size={16} className="text-primary-600" />
                  Logo
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {form.logoBase64 ? (
                    <img src={form.logoBase64} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon size={28} className="text-slate-300" />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label>
                      <input type="file" accept="image/*" onChange={onLogo} className="hidden" disabled={!esAdmin} />
                      <span className={`inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 shadow-sm bg-white ${esAdmin ? 'cursor-pointer hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'}`}>
                        <ImageIcon size={15} /> Seleccionar logo
                      </span>
                    </label>
                    {form.logoBase64 && esAdmin && (
                      <Button variant="ghost" size="sm" leftIcon={<Trash2 size={15} />} onClick={() => set('logoBase64', '')}>
                        Quitar
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Se redimensiona automáticamente. La impresión térmica usa el nombre del
                    negocio en texto grande; el logo queda preparado para una fase posterior.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Receipt size={16} className="text-primary-600" />
                  Textos del recibo
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Políticas del recibo" hint="Una política por línea.">
                <Textarea
                  value={form.politicasTexto}
                  onChange={(e) => set('politicasTexto', e.target.value)}
                  rows={4}
                  placeholder={'- Reclamos solo con este recibo.\n- Verifique sus prendas al recibir.'}
                  disabled={!esAdmin}
                />
              </Field>
              <Field label="Texto de garantía">
                <Textarea
                  value={form.garantiaTexto}
                  onChange={(e) => set('garantiaTexto', e.target.value)}
                  rows={3}
                  placeholder="Garantía según revisión del servicio."
                  disabled={!esAdmin}
                />
              </Field>
              <Field label="Pie de página del recibo">
                <Textarea
                  value={form.pieRecibo}
                  onChange={(e) => set('pieRecibo', e.target.value)}
                  rows={2}
                  placeholder="Gracias por su preferencia."
                  disabled={!esAdmin}
                />
              </Field>
            </CardBody>
          </Card>

          <div className="flex items-center gap-3">
            <Button
              leftIcon={<Save size={16} />}
              disabled={!esAdmin || !nombreNegocioValido}
              loading={guardar.isPending}
              onClick={() => guardar.mutate()}
            >
              Guardar configuración
            </Button>
            {!esAdmin && (
              <span className="text-xs text-slate-500">Solo un administrador puede editar estos datos.</span>
            )}
          </div>
        </div>

        {/* ── Vista previa del recibo ── */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Vista previa del recibo</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="mx-auto w-[300px] bg-white border border-slate-300 rounded-md p-4 font-mono text-[11px] leading-snug text-slate-800">
                <div className="text-center">
                  {form.logoBase64 && (
                    <img src={form.logoBase64} alt="Logo" className="mx-auto mb-1 max-h-14 object-contain" />
                  )}
                  <div className="text-base font-black tracking-tight">
                    {form.nombreNegocio.trim() || 'LAVASUIT'}
                  </div>
                  {form.nit.trim() && <div>NIT: {form.nit.trim()}</div>}
                  {ubicacion && <div>{ubicacion}</div>}
                  {form.telefono.trim() && <div>Tel: {form.telefono.trim()}</div>}
                </div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="text-center font-bold">RECIBO DE ORDEN</div>
                <div className="text-center text-sm font-black">ORDEN: SAN-001</div>
                <div className="text-center text-sm font-black">CLIENTE: 20_1</div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="flex justify-between"><span>1 x Lavado</span><span>$12.000</span></div>
                <div className="flex justify-between font-bold mt-1"><span>TOTAL:</span><span>$12.000</span></div>
                <div className="border-t border-dashed border-slate-400 my-2" />
                <div className="font-bold uppercase">Politicas</div>
                <div className="whitespace-pre-wrap">
                  {form.politicasTexto.trim() ||
                    '- Reclamos solo con este recibo.\n- Verifique sus prendas al recibir.'}
                </div>
                {form.garantiaTexto.trim() && (
                  <>
                    <div className="font-bold uppercase mt-2">Garantia</div>
                    <div className="whitespace-pre-wrap">{form.garantiaTexto.trim()}</div>
                  </>
                )}
                <div className="text-center mt-3">____________________</div>
                <div className="text-center">Firma / recibido</div>
                {form.pieRecibo.trim() && (
                  <div className="text-center mt-2 text-slate-500 whitespace-pre-wrap">
                    {form.pieRecibo.trim()}
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500 text-center">
                Referencia aproximada del recibo térmico de 80&nbsp;mm.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
