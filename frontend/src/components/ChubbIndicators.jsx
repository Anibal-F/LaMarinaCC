import { useState, useEffect, useCallback } from "react";
import ChubbExpedientes from "./ChubbExpedientes.jsx";

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

export default function ChubbIndicators({ onRefresh }) {
  const [indicadores, setIndicadores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [logs, setLogs] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [estatusInfo, setEstatusInfo] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  
  // Estado para filtro de expedientes
  const [filtroEstado, setFiltroEstado] = useState('');
  
  // Estado del scheduler automático
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [togglingScheduler, setTogglingScheduler] = useState(false);

  // Cargar indicadores al montar
  useEffect(() => {
    fetchIndicadores();
    fetchEstatus();
    fetchSchedulerStatus();
  }, []);
  
  // Obtener estado del scheduler
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch(getApiUrl() + '/admin/rpa-queue/scheduler/chubb/status');
      if (response.ok) {
        const data = await response.json();
        setSchedulerEnabled(data.running === true);
      }
    } catch (err) {
      console.error("Error fetching scheduler status:", err);
    }
  };
  
  // Toggle scheduler
  const toggleScheduler = async () => {
    try {
      setTogglingScheduler(true);
      const newState = !schedulerEnabled;
      
      const endpoint = newState 
        ? getApiUrl() + '/admin/rpa-queue/scheduler/chubb/start'
        : getApiUrl() + '/admin/rpa-queue/scheduler/chubb/stop';
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      if (response.ok) {
        setSchedulerEnabled(newState);
      } else {
        console.error("Error toggling scheduler");
      }
    } catch (err) {
      console.error("Error toggling scheduler:", err);
    } finally {
      setTogglingScheduler(false);
    }
  };

  // Polling de tarea activa
  useEffect(() => {
    if (!activeTask) return;
    
    const interval = setInterval(async () => {
      await checkTaskStatus(activeTask);
    }, 3000); // Cada 3 segundos
    
    return () => clearInterval(interval);
  }, [activeTask]);

  const fetchIndicadores = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        getApiUrl() + '/admin/chubb/indicadores'
      );
      
      if (response.status === 404) {
        setIndicadores(null);
        setError("No hay datos disponibles. Presiona 'Actualizar' para obtener los indicadores.");
        return;
      }
      
      if (!response.ok) {
        throw new Error("Error al cargar indicadores");
      }
      
      const data = await response.json();
      setIndicadores(data);
      setLastUpdate(new Date(data.fecha_extraccion));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstatus = async () => {
    try {
      const response = await fetch(
        getApiUrl() + '/admin/chubb/indicadores/estatus'
      );
      if (response.ok) {
        const data = await response.json();
        setEstatusInfo(data);
      }
    } catch (err) {
      console.error("Error fetching estatus:", err);
    }
  };

  const handleRefresh = async () => {
    try {
      setUpdating(true);
      setError(null);
      setLogs("");
      setShowLogs(false);
      
      if (onRefresh) onRefresh(true);
      
      // Usar cola asíncrona
      const response = await fetch(
        getApiUrl() + '/admin/rpa-queue/chubb/actualizar',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        }
      );
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Error encolando tarea");
      }
      
      // Guardar ID de tarea para polling
      setActiveTask(data.task_id);
      
    } catch (err) {
      setError(err.message);
      setUpdating(false);
      if (onRefresh) onRefresh(false);
    }
  };

  const checkTaskStatus = async (taskId) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/admin/rpa-queue/tasks/${taskId}`
      );
      
      if (!response.ok) return;
      
      const task = await response.json();
      
      // Guardar logs si hay
      if (task.logs) {
        setLogs(task.logs);
      }
      
      // Si la tarea terminó
      if (task.status === 'completed') {
        setActiveTask(null);
        setUpdating(false);
        if (onRefresh) onRefresh(false);
        
        // Recargar indicadores
        await fetchIndicadores();
        await fetchEstatus();
        
      } else if (task.status === 'failed') {
        setActiveTask(null);
        setUpdating(false);
        if (onRefresh) onRefresh(false);
        
        setError(`Error: ${task.error || 'La tarea falló'}`);
        if (task.logs) {
          setLogs(task.logs);
          setShowLogs(true);
        }
      }
      // Si está pending o running, seguir esperando
      
    } catch (err) {
      console.error("Error checking task:", err);
    }
  };

  // Zona horaria de Mazatlán
  const MAZATLAN_TZ = 'America/Mazatlan';

  // Calcular si los datos son recientes (< 2 horas)
  const isDataFresh = () => {
    if (!lastUpdate) return false;
    const now = new Date();
    const diffHours = (now - lastUpdate) / (1000 * 60 * 60);
    return diffHours < 2;
  };

  // Formatear fecha en zona horaria de Mazatlán
  const formatMazatlanDate = (date) => {
    if (!date) return '';
    return date.toLocaleString('es-MX', { 
      timeZone: MAZATLAN_TZ,
      hour: '2-digit', 
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
      hour12: true
    });
  };

  // Formatear número con separador de miles
  const formatNumber = (num) => {
    return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
  };

  // Calcular tiempo estimado
  const getEstimatedTime = () => {
    if (estatusInfo?.tiene_sesion) {
      return "~1-2 minutos (usando sesión guardada)";
    }
    return "~2-4 minutos (login completo)";
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-dark border border-border-dark p-5 rounded-xl animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-slate-700 rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con botón de actualizar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden">
            <img src="/assets/CHUBB_profile.jpg" alt="CHUBB" className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Indicadores CHUBB</h3>
            <div className="flex items-center gap-2">
              {lastUpdate && (
                <p className={`text-xs ${isDataFresh() ? 'text-alert-green' : 'text-alert-amber'}`}>
                  Actualizado: {formatMazatlanDate(lastUpdate)}
                  {!isDataFresh() && ' (Datos antiguos)'}
                </p>
              )}
              {estatusInfo?.tiene_sesion && (
                <span className="text-[10px] bg-alert-green/20 text-alert-green px-1.5 py-0.5 rounded">
                  Sesión activa
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Toggle Scheduler */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-medium">Auto</span>
            <button
              onClick={toggleScheduler}
              disabled={togglingScheduler}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                schedulerEnabled ? 'bg-purple-600' : 'bg-slate-700'
              } ${togglingScheduler ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
              title={schedulerEnabled ? "Desactivar actualización automática" : "Activar actualización automática"}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  schedulerEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Botón Actualizar */}
          <button
            onClick={handleRefresh}
            disabled={updating}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              updating
                ? "bg-slate-700 text-slate-400 cursor-wait"
                : "bg-purple-600 hover:bg-purple-500 text-white"
            }`}
          >
            {updating ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                <span>Actualizando...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">sync</span>
                <span>Actualizar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mensaje de actualización en progreso */}
      {updating && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-purple-400 animate-spin">refresh</span>
              <div>
                <p className="text-sm text-purple-400 font-bold">Actualización en progreso</p>
                <p className="text-xs text-slate-400">
                  {getEstimatedTime()}
                </p>
              </div>
            </div>
            
            {/* Botón Ver/Ocultar logs durante actualización */}
            {logs && (
              <button
                onClick={() => setShowLogs(!showLogs)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  showLogs 
                    ? 'bg-purple-500/30 text-purple-300' 
                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-sm">terminal</span>
                <span>{showLogs ? 'Ocultar logs' : 'Ver logs'}</span>
              </button>
            )}
          </div>
          
          {/* Logs en tiempo real */}
          {showLogs && logs && (
            <div className="mt-3 p-3 bg-black/70 rounded-lg border border-purple-500/20">
              <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed overflow-auto max-h-48">{logs}</pre>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && !updating && (
        <div className="bg-alert-red/10 border border-alert-red/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-alert-red">error</span>
            <span className="text-xs text-alert-red font-bold">{error}</span>
          </div>
        </div>
      )}
      
      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Por Autorizar */}
          <div 
            onClick={() => setFiltroEstado(filtroEstado === 'Por aprobar' ? '' : 'Por aprobar')}
            className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
              filtroEstado === 'Por aprobar' 
                ? 'border-purple-500 ring-2 ring-purple-500/30' 
                : 'border-border-dark hover:border-purple-500/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Por Autorizar
              </span>
              <span className="material-symbols-outlined text-purple-500 text-xl group-hover:scale-110 transition-transform">
                pending_actions
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.por_autorizar)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Expedientes pendientes de autorización</p>
          </div>

          {/* Card 2: Autorizadas */}
          <div 
            onClick={() => setFiltroEstado(filtroEstado === 'Autorizado' ? '' : 'Autorizado')}
            className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
              filtroEstado === 'Autorizado' 
                ? 'border-alert-green ring-2 ring-alert-green/30' 
                : 'border-border-dark hover:border-alert-green/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Autorizadas
              </span>
              <span className="material-symbols-outlined text-alert-green text-xl group-hover:scale-110 transition-transform">
                check_circle
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.autorizadas)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Expedientes autorizados</p>
          </div>

          {/* Card 3: Rechazadas */}
          <div 
            onClick={() => setFiltroEstado(filtroEstado === 'Rechazado' ? '' : 'Rechazado')}
            className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
              filtroEstado === 'Rechazado' 
                ? 'border-alert-red ring-2 ring-alert-red/30' 
                : 'border-border-dark hover:border-alert-red/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Rechazadas
              </span>
              <span className="material-symbols-outlined text-alert-red text-xl group-hover:scale-110 transition-transform">
                cancel
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.rechazadas)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Expedientes rechazados</p>
          </div>

          {/* Card 4: Complementos */}
          <div 
            onClick={() => setFiltroEstado(filtroEstado === 'Complemento' ? '' : 'Complemento')}
            className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
              filtroEstado === 'Complemento' 
                ? 'border-alert-amber ring-2 ring-alert-amber/30' 
                : 'border-border-dark hover:border-alert-amber/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Complementos
              </span>
              <span className="material-symbols-outlined text-alert-amber text-xl group-hover:scale-110 transition-transform">
                add_circle
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.complementos)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Complementos solicitados</p>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!indicadores && !loading && !error && !updating && (
        <div className="bg-surface-dark border border-border-dark border-dashed rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">
            analytics
          </span>
          <p className="text-sm text-slate-400 mb-4">No hay indicadores de CHUBB disponibles</p>
          <button
            onClick={handleRefresh}
            disabled={updating}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-all"
          >
            {updating ? 'Obteniendo datos...' : 'Obtener Indicadores'}
          </button>
        </div>
      )}

      {/* Tabla de Expedientes */}
      {indicadores && !loading && (
        <ChubbExpedientes 
          fechaExtraccion={indicadores?.fecha_extraccion}
          filtroEstadoInicial={filtroEstado}
        />
      )}
    </div>
  );
}
