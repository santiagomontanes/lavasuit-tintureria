/* Guardado de archivos generados por el backend (exportaciones a Excel).
 *
 * En Electron abre el diálogo nativo "Guardar como" y devuelve la RUTA final,
 * para poder mostrársela al usuario. Fuera de Electron (navegador) cae en una
 * descarga normal y no hay ruta que informar.
 */

declare global {
  interface Window {
    exportAPI?: {
      guardarArchivo: (
        nombreSugerido: string,
        datos: number[],
        filtros?: { name: string; extensions: string[] }[]
      ) => Promise<{ ok: boolean; ruta?: string; cancelado?: boolean; error?: string }>;
    };
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param datos          ArrayBuffer devuelto por axios (`responseType: 'arraybuffer'`).
 * @param nombreSugerido Nombre propuesto en el diálogo.
 * @returns La ruta donde se guardó, o null si el usuario canceló / es navegador.
 */
export async function guardarArchivoExcel(
  datos: ArrayBuffer,
  nombreSugerido: string
): Promise<string | null> {
  const bytes = new Uint8Array(datos);

  if (window.exportAPI?.guardarArchivo) {
    const res = await window.exportAPI.guardarArchivo(
      nombreSugerido,
      Array.from(bytes),
      [{ name: 'Libro de Excel', extensions: ['xlsx'] }]
    );
    if (res?.cancelado) return null;
    if (!res?.ok) throw new Error(res?.error || 'No se pudo guardar el archivo');
    return res.ruta ?? null;
  }

  // Navegador: descarga estándar (la ruta la decide el navegador).
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreSugerido;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return null;
}
