import { useState, useEffect, useRef } from 'react';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

// Formatear fecha a Mazatlán
const formatMazatlanDate = (date) => {
  if (!date) return 'Nunca';
  return new Date(date).toLocaleString('es-MX', {
    timeZone: 'America/Mazatlan',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function ChubbPiezasExtractor({ onExtractionComplete }) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [maxExpedientes, setMaxExpedientes] = useState('');
  const [fechaDesde, setFechaDesde] = useState('2026-01-01'); // Fecha por defecto: 1 enero 2026
  const [lastExecution, setLastExecution] = useState(null);
  const [expedientesPendientes, setExpedientesPendientes] = useState(0);
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);
  const intervalRef = useRef(null);

  // Cargar datos al montar (incluyendo última ejecución desde BD)
  useEffect(() => {
    fetchExpedientesPendientes();
    fetchLastExecution();
  }, []);

  // Consultar última ejecución real del RPA (manual o automática)
  const fetchLastExecution = async () => {
    try {
      const response = await fetch(getApiUrl() + '/admin/piezas-execution/last/CHUBB');
      if (response.ok) {
        const data = await response.json();
        if (data.has_execution && data.execution) {
          setLastExecution(new Date(data.execution.started_at));
        }
      }
    } catch (err) {
      console.error('Error al consultar última ejecución:', err);
    }
  };

  // Consultar expedientes pendientes
  const fetchExpedientesPendientes = async () => {
    try {
      const response = await fetch(getApiUrl() + '/admin/chubb/expedientes/pendientes?limit=1000');
      if (response.ok) {
        const data = await response.json();
        setExpedientesPendientes(data.total || 0);
        // NOTA: Ya no usamos la fecha del expediente como última ejecución
        // porque eso es la fecha del expediente en CHUBB, no la última extracción
      }
    } catch (err) {
      console.error('Error al consultar expedientes pendientes:', err);
    }
  };

  // Refrescar última ejecución desde BD
  const refreshLastExecution = () => {
    fetchLastExecution();
  };

  // Calcular si la ejecución es reciente (< 4 horas)
  const isExecutionFresh = () => {
    if (!lastExecution) return false;
    const now = new Date();
    const diffHours = (now - lastExecution) / (1000 * 60 * 60);
    return diffHours < 4;
  };

  // Auto-scroll logs DENTRO del contenedor
  useEffect(() => {
    if (showLogs && logsContainerRef.current && logsEndRef.current) {
      const container = logsContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [logs, showLogs]);

  // Limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startExtraction = async () => {
    try {
      setIsExtracting(true);
      setLogs([]);

      const response = await fetch(getApiUrl() + '/admin/rpa/chubb/piezas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_expedientes: maxExpedientes ? parseInt(maxExpedientes) : null,
          fecha_desde: fechaDesde, // Formato: YYYY-MM-DD
          headless: true
        })
      });

      if (!response.ok) {
        throw new Error('Error al iniciar extracción');
      }

      const data = await response.json();
      setJobId(data.job_id);
      addLog(`Extracción iniciada (Job: ${data.job_id.slice(0, 8)}...)`);
      
      // Auto-expandir logs al iniciar
      setShowLogs(true);

      // Iniciar polling de estado
      startPolling(data.job_id);

    } catch (err) {
      addLog(`Error: ${err.message}`);
      setIsExtracting(false);
    }
  };

  const startPolling = (jid) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      try {
        // Obtener logs
        const logsResponse = await fetch(getApiUrl() + `/admin/rpa/status/${jid}/logs?lines=50`);
        if (logsResponse.ok) {
          const logsData = await logsResponse.json();
          if (logsData.logs && logsData.logs.length > 0) {
            setLogs(logsData.logs);
          }
        }

        // Obtener estado
        const statusResponse = await fetch(getApiUrl() + `/admin/rpa/status/${jid}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          
          if (statusData.status === 'completed') {
            clearInterval(intervalRef.current);
            setIsExtracting(false);
            addLog('✓ Extracción completada exitosamente');
            refreshLastExecution(); // Refresca desde BD
            fetchExpedientesPendientes();
            if (onExtractionComplete) {
              onExtractionComplete();
            }
          } else if (statusData.status === 'failed') {
            clearInterval(intervalRef.current);
            setIsExtracting(false);
            addLog(`✗ Error: ${statusData.error || 'Error desconocido'}`);
          }
        }
      } catch (err) {
        console.error('Error en polling:', err);
      }
    }, 2000);
  };

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  return (
    <div className="space-y-3">
      {/* Header con info de expedientes pendientes */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={startExtraction}
            disabled={isExtracting || expedientesPendientes === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              isExtracting
                ? 'bg-slate-700 text-slate-400 cursor-wait'
                : expedientesPendientes === 0
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isExtracting ? (
              <>
                <span className="material-symbols-outlined animate-spin">refresh</span>
                <span>Extrayendo piezas...</span>
              </>
            ) : (
              <>
                <img src="/assets/CHUBB_profile.jpg" alt="CHUBB" className="w-4 h-4 rounded" />
                <span>Extraer Piezas de CHUBB</span>
              </>
            )}
          </button>
          
          {/* Badge de expedientes pendientes */}
          <div className={`flex items-center gap-1 text-xs ${expedientesPendientes > 0 ? 'text-alert-green' : 'text-slate-500'}`}>
            <span className="material-symbols-outlined text-sm">inventory_2</span>
            <span>
              {expedientesPendientes} expediente{expedientesPendientes !== 1 ? 's' : ''} pendiente{expedientesPendientes !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Última ejecución */}
          {lastExecution && (
            <div className={`flex items-center gap-1 text-xs ${isExecutionFresh() ? 'text-alert-green' : 'text-alert-amber'}`}>
              <span className="material-symbols-outlined text-sm">schedule</span>
              <span>
                Última: {formatMazatlanDate(lastExecution)}
                {!isExecutionFresh() && ' (+' + Math.floor((new Date() - lastExecution) / (1000 * 60 * 60)) + 'h)'}
              </span>
            </div>
          )}
        </div>

        {/* Input para fecha desde */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Desde:</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            disabled={isExtracting}
            className="w-32 bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
          />
        </div>

        {/* Input para máximo de expedientes */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Máx. expedientes:</label>
          <input
            type="number"
            value={maxExpedientes}
            onChange={(e) => setMaxExpedientes(e.target.value)}
            placeholder="Todos"
            min="1"
            disabled={isExtracting}
            className="w-20 bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
          />
        </div>

        {/* Botón para expandir/colapsar logs */}
        {(logs.length > 0 || isExtracting) && (
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              {showLogs ? 'expand_less' : 'expand_more'}
            </span>
            {showLogs ? 'Ocultar logs' : 'Ver logs'}
          </button>
        )}
      </div>

      {/* Logs en tiempo real - Expandible */}
      {showLogs && logs.length > 0 && (
        <div className="bg-black/70 border border-blue-500/20 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">
              Logs de ejecución (tiempo real)
            </span>
            <span className="text-[9px] text-slate-500">
              {logs.length} líneas
            </span>
          </div>
          <div ref={logsContainerRef} className="text-[10px] font-mono text-slate-300 overflow-auto max-h-64 custom-scrollbar">
            <pre className="whitespace-pre-wrap break-all">
              {logs.join('\n')}
            </pre>
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Mensaje de estado cuando se está extrayendo pero aún no hay logs */}
      {isExtracting && logs.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <span className="material-symbols-outlined animate-spin">refresh</span>
          <span>Iniciando extracción...</span>
        </div>
      )}

      {/* Info */}
      <p className="text-[10px] text-slate-500">
        Este proceso navegará automáticamente por los expedientes CHUBB con estado "Autorizado" 
        y extraerá las piezas de cada uno desde la sección Inpart.
      </p>
    </div>
  );
}
