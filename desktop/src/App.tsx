import React, { useEffect, useState } from 'react';
import Sidebar              from './components/ui/Sidebar';
import Header               from './components/ui/Header';
import ToastContainer       from './components/ui/Toast';
import LoginPage            from './pages/Login.page';
import ActivacionPage       from './pages/Activacion.page';
import ConfigurarServidorPage from './pages/ConfigurarServidor.page';
import { useLicenciaStore } from './store/licencia.store';
import DashboardPage        from './pages/Dashboard.page';
import PedidosPage          from './pages/Pedidos.page';
import ClientesPage         from './pages/Clientes.page';
import RutasPage            from './pages/Rutas.page';
import ServiciosPage        from './pages/Servicios.page';
import MarcasPage            from './pages/Marcas.page';
import ColoresPage           from './pages/Colores.page';
import CajaPage             from './pages/Caja.page';
import EmpleadosPage        from './pages/Empleados.page';
import ConfiguracionEmpresaPage from './pages/ConfiguracionEmpresa.page';
import PedidoDetallePage    from './pages/PedidoDetalle.page';
import { useAuthStore }     from './store/auth.store';
import { useNavStore }      from './store/nav.store';
import { onUnauthorized }   from './services/api';
import { onSocketEvent }    from './services/socket.service';
import { startBackendPolling, onBackendStatusChange, refreshBackendStatus, type BackendStatus } from './services/backendStatus';
import { queryClient }      from './lib/queryClient';

function RenderView() {
  const view = useNavStore((s) => s.view);
  switch (view.kind) {
    case 'dashboard':       return <DashboardPage />;
    case 'pedidos':         return <PedidosPage />;
    case 'clientes':        return <ClientesPage />;
    case 'rutas':           return <RutasPage />;
    case 'servicios':       return <ServiciosPage />;
    case 'marcas':          return <MarcasPage />;
    case 'colores':         return <ColoresPage />;
    case 'caja':            return <CajaPage />;
    case 'empleados':       return <EmpleadosPage />;
    case 'configuracion':   return <ConfiguracionEmpresaPage />;
    case 'pedido-detalle':  return <PedidoDetallePage id={view.id} />;
    default:                return <DashboardPage />;
  }
}

function AppShell({ onConfigurarServidor }: { onConfigurarServidor: () => void }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100/70">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onConfigurarServidor={onConfigurarServidor} />
        <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.10),transparent_34rem)]">
          <div className="mx-auto max-w-[1440px] px-8 py-7">
            <RenderView />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const token        = useAuthStore((s) => s.token);
  const forzarLogout = useAuthStore((s) => s.forzarLogout);
  const resetNav     = useNavStore((s) => s.reset);
  const licActivada  = useLicenciaStore((s) => s.activada);
  const licCargando  = useLicenciaStore((s) => s.cargando);
  const licCargar    = useLicenciaStore((s) => s.cargar);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [configOverlay, setConfigOverlay] = useState(false);

  useEffect(() => { licCargar(); }, [licCargar]);

  useEffect(() => {
    startBackendPolling();
    return onBackendStatusChange(setBackendStatus);
  }, []);

  useEffect(() => {
    const offAuth = onUnauthorized(() => {
      forzarLogout();
      resetNav();
    });

    const invalidarPedidos = () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['pedido'] });
      queryClient.invalidateQueries({ queryKey: ['reportes'] });
      queryClient.invalidateQueries({ queryKey: ['caja'] });
    };
    const invalidarGarantias = (data?: any) => {
      const pedidoId = data?.pedidoId ?? data?.pedido?.id;
      queryClient.invalidateQueries({ queryKey: ['garantias'] });
      if (pedidoId) {
        queryClient.invalidateQueries({ queryKey: ['garantias', pedidoId] });
        queryClient.invalidateQueries({ queryKey: ['pedido', pedidoId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['pedido'] });
      }
      queryClient.invalidateQueries({ queryKey: ['reportes'] });
      queryClient.invalidateQueries({ queryKey: ['empleados'] });
    };
    const invalidarClientes = () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['rutas'] });
      queryClient.invalidateQueries({ queryKey: ['empleados'] });
    };
    const invalidarEmpleados = () => {
      queryClient.invalidateQueries({ queryKey: ['empleados'] });
      queryClient.invalidateQueries({ queryKey: ['empleado-rendimiento'] });
      queryClient.invalidateQueries({ queryKey: ['empleado-actividad'] });
    };
    const invalidarServicios = () => {
      queryClient.invalidateQueries({ queryKey: ['servicios'] });
    };
    const invalidarMarcas = () => {
      queryClient.invalidateQueries({ queryKey: ['marcas'] });
    };
    const invalidarColores = () => {
      queryClient.invalidateQueries({ queryKey: ['colores'] });
    };

    const offs = [
      onSocketEvent('nuevo-pedido',        (d) => { invalidarPedidos(); invalidarEmpleados(); }),
      onSocketEvent('estado-cambiado',     (d) => { invalidarPedidos(); invalidarEmpleados(); }),
      onSocketEvent('pedido-actualizado',  invalidarPedidos),
      onSocketEvent('pedido-eliminado',    invalidarPedidos),
      onSocketEvent('pedido-entregado',    (d) => { invalidarPedidos(); invalidarEmpleados(); }),
      onSocketEvent('nuevo-cliente',       invalidarClientes),
      onSocketEvent('cliente-actualizado', invalidarClientes),
      onSocketEvent('clientes-importados', invalidarClientes),
      onSocketEvent('clientes-asignados',  invalidarClientes),
      onSocketEvent('nuevo-pago',          (d) => { invalidarPedidos(); invalidarEmpleados(); }),
      onSocketEvent('nueva-garantia',      invalidarGarantias),
      onSocketEvent('garantia-actualizada', invalidarGarantias),
      onSocketEvent('servicio-creado',      invalidarServicios),
      onSocketEvent('servicio-actualizado', invalidarServicios),
      onSocketEvent('servicio-eliminado',   invalidarServicios),
      onSocketEvent('servicios-importados', invalidarServicios),
      onSocketEvent('marca-creada',         invalidarMarcas),
      onSocketEvent('marca-actualizada',    invalidarMarcas),
      onSocketEvent('marca-eliminada',      invalidarMarcas),
      onSocketEvent('marcas-importadas',    invalidarMarcas),
      onSocketEvent('color-creado',         invalidarColores),
      onSocketEvent('color-actualizado',    invalidarColores),
      onSocketEvent('color-eliminado',      invalidarColores)
    ];

    return () => {
      offAuth();
      offs.forEach((off) => off());
    };
  }, [forzarLogout, resetNav]);

  /* Gating en orden:
   *   1. configOverlay (acceso manual desde Header) → permite reconfigurar sin importar resto
   *   2. backend offline → ConfigurarServidor bloqueante (no se puede activar licencia ni loggear sin backend)
   *   3. licencia cargando → splash
   *   4. licencia no activada → ActivacionPage
   *   5. sin token → LoginPage
   *   6. AppShell normal
   * El polling sigue corriendo en background; si vuelve online se sale del gate solo. */
  if (configOverlay) {
    return (
      <>
        <ConfigurarServidorPage
          motivoBackendCaido={backendStatus === 'offline'}
          onCancelar={() => { setConfigOverlay(false); refreshBackendStatus(); }}
        />
        <ToastContainer />
      </>
    );
  }

  if (backendStatus === 'checking' || licCargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-slate-400 border-t-transparent" />
      </div>
    );
  }

  if (backendStatus === 'offline') {
    return (
      <>
        <ConfigurarServidorPage motivoBackendCaido />
        <ToastContainer />
      </>
    );
  }

  if (!licActivada) {
    return (
      <>
        <ActivacionPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      {!token
        ? <LoginPage onConfigurarServidor={() => setConfigOverlay(true)} />
        : <AppShell onConfigurarServidor={() => setConfigOverlay(true)} />}
      <ToastContainer />
    </>
  );
}
