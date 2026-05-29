import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api, { backendBaseUrl } from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { cn } from '../../lib/cn';

interface ReporteImport {
  total:        number;
  creadas:      number;
  actualizadas: number;
  errores:      Array<{ fila: number; error: string }>;
}

interface Props {
  open:                boolean;
  onClose:             () => void;
  titulo:              string;
  subtitulo:           string;
  endpointImport:      string;  // p.ej. '/servicios/importar-excel'
  endpointPlantilla:   string;  // p.ej. '/servicios/plantilla-excel'
  invalidarQueryKeys?: string[][];
}

export default function ImportarExcelModal({
  open, onClose, titulo, subtitulo,
  endpointImport, endpointPlantilla, invalidarQueryKeys = []
}: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reporte, setReporte] = useState<ReporteImport | null>(null);

  const reset = () => { setArchivo(null); setReporte(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const cerrar = () => { reset(); onClose(); };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!archivo) throw new Error('Sin archivo');
      const fd = new FormData();
      fd.append('archivo', archivo);
      const { data } = await api.post<ReporteImport>(endpointImport, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000
      });
      return data;
    },
    onSuccess: (data) => {
      setReporte(data);
      invalidarQueryKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      toast.show(
        `${data.creadas} creadas, ${data.actualizadas} actualizadas` +
        (data.errores.length ? `, ${data.errores.length} con error` : ''),
        data.errores.length ? 'info' : 'success'
      );
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || 'No se pudo importar';
      toast.show(msg, 'error');
    }
  });

  const descargarPlantilla = async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${backendBaseUrl}/api${endpointPlantilla}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = endpointPlantilla.includes('marcas') ? 'plantilla_marcas.xlsx' : 'plantilla_prendas.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.show('No se pudo descargar la plantilla', 'error');
    }
  };

  return (
    <Modal open={open} onClose={cerrar} title={titulo} subtitle={subtitulo}>
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
          <p className="font-medium text-slate-800">Formato esperado</p>
          <p>El Excel debe tener la hoja con headers en la primera fila. Si la hoja no se llama exactamente igual, se toma la primera. Columnas tolerantes a mayúsculas/acentos.</p>
          <button
            type="button"
            onClick={descargarPlantilla}
            className="inline-flex items-center gap-1.5 mt-1 text-primary-700 hover:text-primary-800 font-medium"
          >
            <Download size={14} /> Descargar plantilla
          </button>
        </div>

        <div
          className={cn(
            'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
            archivo ? 'border-primary-300 bg-primary-50/30' : 'border-slate-300 bg-slate-50/40'
          )}
        >
          <FileSpreadsheet size={28} className="mx-auto text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-800">
            {archivo ? archivo.name : 'Arrastra un .xlsx o haz click'}
          </p>
          {archivo && (
            <p className="text-xs text-slate-500">{(archivo.size / 1024).toFixed(1)} KB</p>
          )}
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setReporte(null); }}
              className="hidden"
              id="excel-file-input"
            />
            <label
              htmlFor="excel-file-input"
              className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Upload size={14} /> Elegir archivo
            </label>
          </div>
        </div>

        {reporte && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success-600" /> Importación completada
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-slate-50 p-2"><p className="text-slate-500">Total</p><p className="font-semibold text-slate-900">{reporte.total}</p></div>
              <div className="rounded bg-success-50 p-2"><p className="text-success-700">Creadas</p><p className="font-semibold text-success-800">{reporte.creadas}</p></div>
              <div className="rounded bg-primary-50 p-2"><p className="text-primary-700">Actualizadas</p><p className="font-semibold text-primary-800">{reporte.actualizadas}</p></div>
            </div>
            {reporte.errores.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded bg-danger-50 p-2 text-xs text-danger-800">
                <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={14} /> {reporte.errores.length} errores</p>
                <ul className="mt-1 space-y-0.5">
                  {reporte.errores.slice(0, 25).map((e, i) => (
                    <li key={i}>Fila {e.fila}: {e.error}</li>
                  ))}
                  {reporte.errores.length > 25 && <li>… y {reporte.errores.length - 25} más</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={cerrar} variant="secondary" disabled={mutation.isPending}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!archivo || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            leftIcon={<Upload size={14} />}
          >
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
