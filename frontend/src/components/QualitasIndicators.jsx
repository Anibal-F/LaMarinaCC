import { useState, useEffect, useCallback } from "react";
import QualitasOrdenesAsignadas from "./QualitasOrdenesAsignadas.jsx";

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

  // Cargar indicadores al montar
  useEffect(() => {
    fetchIndicadores();
    fetchEstatus();
  }, []);

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
        `${import.meta.env.VITE_API_URL}/admin/qualitas/indicadores`
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
        `${import.meta.env.VITE_API_URL}/admin/qualitas/indicadores/estatus`
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
        `${import.meta.env.VITE_API_URL}/admin/rpa-queue/qualitas/actualizar`,
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
        `${import.meta.env.VITE_API_URL}/admin/rpa-queue/tasks/${taskId}`
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
      return "~10-30 segundos (usando sesión guardada)";
    }
    return "~1-3 minutos (resolviendo CAPTCHA)";
  };

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
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-white">shield</span>
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

      {/* Mensaje de actualización en progreso */}
      {updating && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-400 animate-spin">refresh</span>
            <div>
              <p className="text-sm text-blue-400 font-bold">Actualización en progreso</p>
              <p className="text-xs text-slate-400">
                {getEstimatedTime()}
              </p>
            </div>
          </div>
          
          {/* Logs en tiempo real */}
          {logs && (
            <div className="mt-3 p-2 bg-black/50 rounded text-[9px] font-mono text-slate-300 overflow-auto max-h-32">
              <pre>{logs.split('\n').slice(-10).join('\n')}</pre>
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

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Asignados */}
          <div className="bg-surface-dark border border-border-dark p-5 rounded-xl hover:border-blue-500/50 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Asignados
              </span>
              <span className="material-symbols-outlined text-blue-500 text-xl group-hover:scale-110 transition-transform">
                assignment_ind
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.asignados)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Órdenes asignadas al taller</p>
          </div>

          {/* Card 2: Pendiente Valuación */}
          <div className="bg-surface-dark border border-border-dark p-5 rounded-xl hover:border-alert-amber/50 transition-all group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Pendiente Valuación
              </span>
              <span className="material-symbols-outlined text-alert-amber text-xl group-hover:scale-110 transition-transform">
                pending_actions
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-extrabold text-white tracking-tight">
                {formatNumber(indicadores.revisar_valuacion)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Por revisar valuación</p>
          </div>

          {/* Card 3: Complementos (3 en 1) */}
          <div className="bg-surface-dark border border-border-dark p-5 rounded-xl hover:border-purple-500/50 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Complementos
              </span>
              <span className="material-symbols-outlined text-purple-500 text-xl group-hover:scale-110 transition-transform">
                add_circle
              </span>
            </div>
            
            {/* Grid de 3 indicadores */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-alert-green/10 rounded-lg">
                <span className="text-lg font-bold text-alert-green block">
                  {formatNumber(indicadores.complemento_autorizado)}
                </span>
                <span className="text-[9px] text-slate-400 uppercase">Autorizado</span>
              </div>
              <div className="text-center p-2 bg-alert-amber/10 rounded-lg">
                <span className="text-lg font-bold text-alert-amber block">
                  {formatNumber(indicadores.complemento_solicitado)}
                </span>
                <span className="text-[9px] text-slate-400 uppercase">Solicitado</span>
              </div>
              <div className="text-center p-2 bg-alert-red/10 rounded-lg">
                <span className="text-lg font-bold text-alert-red block">
                  {formatNumber(indicadores.complemento_rechazado)}
                </span>
                <span className="text-[9px] text-slate-400 uppercase">Rechazado</span>
              </div>
            </div>
            
            {/* Total */}
            <div className="mt-3 pt-2 border-t border-border-dark flex justify-between items-center">
              <span className="text-[10px] text-slate-400">Total Complementos</span>
              <span className="text-sm font-bold text-white">
                {formatNumber(indicadores.total_complementos || 
                  (indicadores.complemento_autorizado + indicadores.complemento_solicitado + indicadores.complemento_rechazado)
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!indicadores && !loading && !error && !updating && (
        <div className="bg-surface-dark border border-border-dark border-dashed rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">
            analytics
          </span>
          <p className="text-sm text-slate-400 mb-4">No hay indicadores de Qualitas disponibles</p>
          <button
            onClick={handleRefresh}
            disabled={updating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
          >
            {updating ? 'Obteniendo datos...' : 'Obtener Indicadores'}
          </button>
        </div>
      )}

      {/* Tabla de Órdenes Asignadas */}
      {indicadores && !loading && (
        <QualitasOrdenesAsignadas 
          fechaExtraccion={indicadores?.fecha_extraccion} 
        />
      )}
    </div>
  );
}
