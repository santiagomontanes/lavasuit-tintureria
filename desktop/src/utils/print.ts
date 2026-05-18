/**
 * Abre una nueva ventana con el HTML dado, llama a print() y la cierra.
 * Funciona tanto en Electron como en Chrome normal.
 */
export function printHtml(html: string): void {
  const win = window.open('', '_blank', 'width=860,height=720,menubar=no,toolbar=no');
  if (!win) {
    console.warn('[print] No se pudo abrir la ventana de impresión. Verificar permisos popup.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Esperar a que los estilos y fuentes carguen antes de imprimir
  setTimeout(() => {
    win.print();
    win.close();
  }, 600);
}
