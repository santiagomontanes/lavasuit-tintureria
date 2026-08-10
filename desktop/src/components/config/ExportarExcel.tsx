import React, { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../services/api';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Field, inputClassName } from '../ui/Input';
import { useToastStore } from '../../store/toast.store';
import { guardarArchivoExcel } from '../../lib/guardarArchivo';

/* Exportación de la operación a Excel.
 *
 * Es una CONSULTA: el backend solo lee. No modifica ni un registro.
 * El archivo trae una hoja por modelo real del sistema; los catálogos
 * (clientes, servicios, marcas, usuarios) van completos y lo transaccional
 * (pedidos, pagos, gastos, cajas, garantías, consolidaciones) respeta el rango
 * de fechas elegido. Nunca incluye contraseñas ni tokens.
 */

const HOJAS = [
  'CLIENTES', 'PEDIDOS', 'PRENDAS', 'PAGOS', 'GASTOS', 'CAJAS',
  'MARCAS', 'SERVICIOS', 'USUARIOS', 'GARANTIAS', 'CONSOLIDACIONES'
];

export default function ExportarExcel() {
  const toast = useToastStore((s) => s.show);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [exportando, setExportando] = useState(false);
  const [ultimaRuta, setUltimaRuta] = useState<string | null>(null);

  const exportar = async (todos: boolean) => {
    setExportando(true);
    setUltimaRuta(null);
    try {
      const params: Record<string, string> = todos
        ? { todos: 'true' }
        : { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) };

      const res = await api.get('/exportacion/excel', { params, responseType: 'arraybuffer' });

      const sufijo = todos
        ? 'completo'
        : `${desde || 'inicio'}_a_${hasta || dayjs().format('YYYY-MM-DD')}`;
      const ruta = await guardarArchivoExcel(res.data, `LavaSuit_export_${sufijo}.xlsx`);

      if (ruta) {
        setUltimaRuta(ruta);
        toast(`Archivo generado: ${ruta}`, 'success');
      } else {
        toast('Exportación generada', 'success');
      }
    } catch (e: any) {
      toast(e?.response?.data?.error || 'No se pudo generar la exportación', 'error');
    } finally {
      setExportando(false);
    }
  };

  const rangoIncompleto = !desde && !hasta;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-primary-600" />
            Exportar a Excel
          </span>
        </CardTitle>
        <Badge tone="neutral" outline>Solo lectura</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-slate-600">
          Genera un archivo <span className="font-medium">.xlsx</span> con la información del
          sistema, una hoja por módulo. No modifica ningún dato.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {HOJAS.map((h) => <Badge key={h} tone="info" outline>{h}</Badge>)}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Desde" hint="Aplica a pedidos, pagos, gastos, cajas y garantías.">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            leftIcon={<Download size={15} />}
            onClick={() => exportar(false)}
            disabled={exportando || rangoIncompleto}
          >
            {exportando ? 'Generando…' : 'Exportar rango'}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download size={15} />}
            onClick={() => exportar(true)}
            disabled={exportando}
          >
            Exportar todos
          </Button>
        </div>

        {rangoIncompleto && (
          <p className="text-xs text-slate-500">
            Elige al menos una fecha para exportar un rango, o usa “Exportar todos”.
          </p>
        )}

        {ultimaRuta && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800">
            Archivo guardado en:{' '}
            <span className="font-mono break-all">{ultimaRuta}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
