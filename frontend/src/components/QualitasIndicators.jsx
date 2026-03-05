import { useState, useEffect, useCallback, useMemo } from "react";
import QualitasOrdenesAsignadas from "./QualitasOrdenesAsignadas.jsx";

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

export default function QualitasIndicators({ onRefresh }) {
  const [indicadores, setIndicadores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [logs, setLogs] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [estatusInfo, setEstatusInfo] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  
  // Estado para filtro de órdenes
  const [filtroEstatus, setFiltroEstatus] = useState('');
  
  // Trigger para recargar tabla de órdenes
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Órdenes para calcular indicadores por estatus
  const [ordenes, setOrdenes] = useState([]);
  
  // Estado del scheduler automático
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [togglingScheduler, setTogglingScheduler] = useState(false);

  // Cargar indicadores al montar
  useEffect(() => {
    fetchIndicadores();
    fetchEstatus();
    fetchSchedulerStatus();
    fetchOrdenes();
  }, []);
  
  // Obtener estado del scheduler
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch(getApiUrl() + '/admin/rpa-queue/scheduler/qualitas/status');
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
        ? getApiUrl() + '/admin/rpa-queue/scheduler/qualitas/start'
        : getApiUrl() + '/admin/rpa-queue/scheduler/qualitas/stop';
      
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

  // Polling de tarea activa - más frecuente para logs en tiempo real
  useEffect(() => {
    if (!activeTask) return;
    
    const interval = setInterval(async () => {
      await checkTaskStatus(activeTask);
    }, 2000); // Cada 2 segundos para mejor tiempo real
    
    return () => clearInterval(interval);
  }, [activeTask]);

  const fetchIndicadores = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        getApiUrl() + '/admin/qualitas/indicadores'
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
        getApiUrl() + '/admin/qualitas/indicadores/estatus'
      );
      if (response.ok) {
        const data = await response.json();
        setEstatusInfo(data);
      }
    } catch (err) {
      console.error("Error fetching estatus:", err);
    }
  };

  const fetchOrdenes = async () => {
    try {
      const response = await fetch(getApiUrl() + '/admin/qualitas/ordenes-asignadas');
      
      if (!response.ok) {
        if (response.status === 404) {
          setOrdenes([]);
        }
        return;
      }
      
      const data = await response.json();
      setOrdenes(data.ordenes || []);
    } catch (err) {
      console.error("Error fetching ordenes:", err);
    }
  };

  // Calcular conteos por estatus desde las órdenes
  const statusCounts = useMemo(() => {
    const counts = {};
    ordenes.forEach(orden => {
      const estatus = orden.estatus?.trim() || 'Sin Estatus';
      counts[estatus] = (counts[estatus] || 0) + 1;
    });
    return counts;
  }, [ordenes]);

  // Configuración de estatus para las tarjetas
  const statusConfig = useMemo(() => [
    { key: 'Asignados', label: 'Asignados', icon: 'assignment_ind', color: 'blue' },
    { key: 'Tránsito', label: 'Tránsito', icon: 'local_shipping', color: 'amber' },
    { key: 'Piso', label: 'Piso', icon: 'garage', color: 'slate' },
    { key: 'Terminadas', label: 'Terminadas', icon: 'check_circle', color: 'green' },
    { key: 'Entregadas', label: 'Entregadas', icon: 'task_alt', color: 'purple' },
    { key: 'Histórico', label: 'Histórico', icon: 'history', color: 'orange' },
  ], []);

  const handleRefresh = async () => {
    try {
      setUpdating(true);
      setError(null);
      setLogs("");
      setShowLogs(false);
      
      if (onRefresh) onRefresh(true);
      
      // Usar cola asíncrona
      const response = await fetch(
        getApiUrl() + '/admin/rpa-queue/qualitas/actualizar',
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
      
      // Guardar logs si hay (actualizar en tiempo real)
      if (task.logs && task.logs !== logs) {
        setLogs(task.logs);
        // Auto-scroll al final si los logs están visibles
        if (showLogs) {
          setTimeout(() => {
            const logsContainer = document.querySelector('.custom-scrollbar pre');
            if (logsContainer) {
              logsContainer.parentElement.scrollTop = logsContainer.parentElement.scrollHeight;
            }
          }, 100);
        }
      }
      
      // Si la tarea terminó
      if (task.status === 'completed') {
        setActiveTask(null);
        setUpdating(false);
        if (onRefresh) onRefresh(false);
        
        // Recargar indicadores y tabla de órdenes
        await fetchIndicadores();
        await fetchEstatus();
        await fetchOrdenes();  // Recargar órdenes para actualizar indicadores
        setRefreshTrigger(prev => prev + 1);  // Forzar recarga de la tabla
        
        // Mostrar logs automáticamente al completar
        if (task.logs) {
          setShowLogs(true);
        }
        
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
      return "~10-30 segundos (usando sesión guardada)";
    }
    return "~1-3 minutos (resolviendo CAPTCHA)";
  };

  // Renderizar una tarjeta de indicador por estatus
  const renderStatusCard = (config, isActive, onClick) => {
    const value = statusCounts[config.key] || 0;
    const colorClasses = {
      blue: { border: 'border-blue-500', ring: 'ring-blue-500/30', text: 'text-blue-500', hover: 'hover:border-blue-500/50', bg: 'bg-blue-500/20' },
      amber: { border: 'border-alert-amber', ring: 'ring-alert-amber/30', text: 'text-alert-amber', hover: 'hover:border-alert-amber/50', bg: 'bg-alert-amber/20' },
      green: { border: 'border-alert-green', ring: 'ring-alert-green/30', text: 'text-alert-green', hover: 'hover:border-alert-green/50', bg: 'bg-alert-green/20' },
      red: { border: 'border-alert-red', ring: 'ring-alert-red/30', text: 'text-alert-red', hover: 'hover:border-alert-red/50', bg: 'bg-alert-red/20' },
      purple: { border: 'border-purple-500', ring: 'ring-purple-500/30', text: 'text-purple-500', hover: 'hover:border-purple-500/50', bg: 'bg-purple-500/20' },
      orange: { border: 'border-orange-500', ring: 'ring-orange-500/30', text: 'text-orange-500', hover: 'hover:border-orange-500/50', bg: 'bg-orange-500/20' },
      slate: { border: 'border-slate-500', ring: 'ring-slate-500/30', text: 'text-slate-400', hover: 'hover:border-slate-500/50', bg: 'bg-slate-500/20' }
    };
    const colors = colorClasses[config.color] || colorClasses.blue;

    return (
      <div 
        key={config.key}
        onClick={onClick}
        className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
          isActive 
            ? `${colors.border} ring-2 ${colors.ring}` 
            : `border-border-dark ${colors.hover}`
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {config.label}
          </span>
          <span className={`material-symbols-outlined ${colors.text} text-xl group-hover:scale-110 transition-transform`}>
            {config.icon}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold text-white tracking-tight">
            {formatNumber(value)}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          {isActive ? 'Mostrando órdenes' : 'Clic para filtrar'}
        </p>
      </div>
    );
  };

  // Filtrar solo estatus con datos > 0
  const estatusConDatos = useMemo(() => {
    return statusConfig.filter(config => {
      const value = statusCounts[config.key];
      return value && value > 0;
    });
  }, [statusConfig, statusCounts]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
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
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden">
            <img src="/assets/Qualitas_profile.jpg" alt="Qualitas" className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Indicadores Qualitas</h3>
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
                schedulerEnabled ? 'bg-blue-600' : 'bg-slate-700'
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
                : "bg-blue-600 hover:bg-blue-500 text-white"
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
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-400 animate-spin">refresh</span>
              <div>
                <p className="text-sm text-blue-400 font-bold">Actualización en progreso</p>
                <p className="text-xs text-slate-400">
                  {getEstimatedTime()}
                </p>
              </div>
            </div>
            
            {/* Botón para expandir/colapsar logs */}
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-sm">
                {showLogs ? 'expand_less' : 'expand_more'}
              </span>
              {showLogs ? 'Ocultar logs' : 'Ver logs'}
            </button>
          </div>
          
          {/* Logs en tiempo real - Expandible */}
          {showLogs && logs && (
            <div className="mt-3 p-3 bg-black/70 rounded-lg border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  Logs de ejecución (tiempo real)
                </span>
                <span className="text-[9px] text-slate-500">
                  {logs.split('\n').filter(l => l.trim()).length} líneas
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-300 overflow-auto max-h-64 custom-scrollbar">
                <pre className="whitespace-pre-wrap break-all">
                  {logs}
                </pre>
              </div>
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
          
          {logs && (
            <div className="mt-2">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-[10px] text-alert-red underline hover:no-underline"
              >
                {showLogs ? 'Ocultar logs' : 'Ver logs de debug'}
              </button>
              
              {showLogs && (
                <div className="mt-2 p-2 bg-black/50 rounded text-[9px] font-mono text-slate-300 overflow-auto max-h-48">
                  <pre>{logs}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Indicadores - Grid dinámico por estatus */}
      {ordenes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Tarjeta "Todos" - muestra el total de órdenes */}
          <div 
            onClick={() => setFiltroEstatus('')}
            className={`bg-surface-dark border p-5 rounded-xl transition-all group cursor-pointer ${
              filtroEstatus === '' 
                ? 'border-blue-500 ring-2 ring-blue-500/30' 
                : 'border-border-dark hover:border-blue-500/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Total Órdenes
              </span>
              <span className="material-symbols-outlined text-blue-500 text-xl group-hover:scale-110 transition-transform">
                inventory_2
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold text-white tracking-tight">
                {formatNumber(ordenes.length)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {filtroEstatus === '' ? 'Mostrando todas' : 'Clic para ver todas'}
            </p>
          </div>

          {/* Tarjetas por estatus con datos */}
          {estatusConDatos.map(config => 
            renderStatusCard(
              config,
              filtroEstatus === config.key,
              () => setFiltroEstatus(filtroEstatus === config.key ? '' : config.key)
            )
          )}
        </div>
      )}

      {/* Estado vacío */}
      {ordenes.length === 0 && !loading && !error && !updating && (
        <div className="bg-surface-dark border border-border-dark border-dashed rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">
            analytics
          </span>
          <p className="text-sm text-slate-400 mb-4">No hay órdenes de Qualitas disponibles</p>
          <button
            onClick={handleRefresh}
            disabled={updating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
          >
            {updating ? 'Obteniendo datos...' : 'Obtener Órdenes'}
          </button>
        </div>
      )}

      {/* Tabla de Órdenes Asignadas */}
      {(ordenes.length > 0 || indicadores) && !loading && (
        <QualitasOrdenesAsignadas 
          fechaExtraccion={indicadores?.fecha_extraccion}
          filtroEstatusInicial={filtroEstatus}
          onFiltroChange={setFiltroEstatus}
          refreshTrigger={refreshTrigger}
        />
      )}
    </div>
  );
}
