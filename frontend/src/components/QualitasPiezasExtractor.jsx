import { useState, useEffect, useRef } from 'react';

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

export default function QualitasPiezasExtractor({ onExtractionComplete }) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [maxOrdenes, setMaxOrdenes] = useState('');
  const logsEndRef = useRef(null);
  const intervalRef = useRef(null);

  // Auto-scroll logs solo cuando están visibles
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
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

      const response = await fetch(getApiUrl() + '/admin/rpa/qualitas/piezas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_ordenes: maxOrdenes ? parseInt(maxOrdenes) : null,
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
    // Limpiar intervalo anterior si existe
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
      {/* Controles */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={startExtraction}
          disabled={isExtracting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            isExtracting
              ? 'bg-slate-700 text-slate-400 cursor-wait'
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
              <img src="/assets/Qualitas_profile.jpg" alt="Qualitas" className="w-4 h-4 rounded" />
              <span>Extraer Piezas de Qualitas</span>
            </>
          )}
        </button>

        {/* Input para máximo de órdenes */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Máx. órdenes:</label>
          <input
            type="number"
            value={maxOrdenes}
            onChange={(e) => setMaxOrdenes(e.target.value)}
            placeholder="Todas"
            min="1"
            disabled={isExtracting}
            className="w-20 bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
          />
        </div>

        {/* Botón para expandir/colapsar logs - Solo visible cuando hay logs */}
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
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              Logs de ejecución (tiempo real)
            </span>
            <span className="text-[9px] text-slate-500">
              {logs.length} líneas
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-300 overflow-auto max-h-64 custom-scrollbar">
            <pre className="whitespace-pre-wrap break-all">
              {logs.join('\n')}
            </pre>
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Mensaje de estado cuando se está extrayendo pero aún no hay logs */}
      {isExtracting && logs.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <span className="material-symbols-outlined animate-spin">refresh</span>
          <span>Iniciando extracción...</span>
        </div>
      )}

      {/* Info */}
      <p className="text-[10px] text-slate-500">
        Este proceso navegará automáticamente por las órdenes en estado "Tránsito" 
        de Qualitas y extraerá las piezas de cada una.
      </p>
    </div>
  );
}
