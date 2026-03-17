import { useState, useEffect } from 'react';

// URL base de la API - usa el proxy del vite.config.js o la variable de entorno
const getApiUrl = () => {
  // Intentar usar la variable de entorno
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, ''); // quitar slash final
  }
  // Fallback: usar path relativo (funciona con proxy de Vite)
  return '';
};

export default function ChubbExpedientes({ fechaExtraccion, filtroEstadoInicial = '' }) {
  const [expedientes, setExpedientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [estadoFiltro, setEstadoFiltro] = useState(filtroEstadoInicial);
  const [estadosDisponibles, setEstadosDisponibles] = useState([]);
  
  const pageSizeOptions = [10, 25, 50, 100];
  const API_BASE = getApiUrl();

  // Sincronizar filtro inicial desde props
  useEffect(() => {
    setEstadoFiltro(filtroEstadoInicial);
    setPage(1); // Resetear a primera página al cambiar filtro
  }, [filtroEstadoInicial]);

  useEffect(() => {
    fetchExpedientes();
    fetchEstadosDisponibles();
  }, [fechaExtraccion, estadoFiltro]);

  const fetchExpedientes = async () => {
    try {
      setLoading(true);
      
      // Construir URL manualmente sin usar constructor URL
      let url = API_BASE + '/admin/chubb/expedientes';
      
      // Agregar query params
      const params = [];
      if (estadoFiltro) {
        params.push('estado=' + encodeURIComponent(estadoFiltro));
      }
      params.push('limit=500');
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      console.log('[ChubbExpedientes] Fetching:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          setExpedientes([]);
          return;
        }
        throw new Error('Error al cargar expedientes: ' + response.status);
      }
      
      const data = await response.json();
      setExpedientes(data.expedientes || []);
    } catch (err) {
      console.error('[ChubbExpedientes] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstadosDisponibles = async () => {
    try {
      const url = API_BASE + '/admin/chubb/expedientes/estados';
      console.log('[ChubbExpedientes] Fetching estados:', url);
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setEstadosDisponibles(data.estados || []);
      }
    } catch (err) {
      console.error('Error fetching estados:', err);
    }
  };

  // Paginación
  const totalPages = Math.ceil(expedientes.length / pageSize);
  const pagedExpedientes = expedientes.slice((page - 1) * pageSize, page * pageSize);
  
  // Resetear página cuando cambia el tamaño o filtro
  const handlePageSizeChange = (newSize) => {
    setPageSize(Number(newSize));
    setPage(1);
  };

  const handleEstadoChange = (newEstado) => {
    setEstadoFiltro(newEstado);
    setPage(1);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mazatlan',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
      timeZone: 'America/Mazatlan',
      day: '2-digit',
      month: 'short'
    });
  };

  const getEstadoBadgeClass = (estado) => {
    const estadoLower = (estado || '').toLowerCase();
    if (estadoLower.includes('aprobar') || estadoLower.includes('pendiente')) {
      return 'bg-purple-500/20 text-purple-400';
    }
    if (estadoLower.includes('autorizado') || estadoLower.includes('aprobado')) {
      return 'bg-alert-green/20 text-alert-green';
    }
    if (estadoLower.includes('rechazado')) {
      return 'bg-alert-red/20 text-alert-red';
    }
    if (estadoLower.includes('complemento')) {
      return 'bg-alert-amber/20 text-alert-amber';
    }
    return 'bg-slate-700 text-slate-400';
  };

  if (loading) {
    return (
      <div className="mt-6 bg-surface-dark border border-border-dark rounded-xl p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-700 rounded w-1/4"></div>
          <div className="h-20 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 bg-surface-dark border border-border-dark rounded-xl p-4">
        <p className="text-xs text-alert-red">Error cargando expedientes: {error}</p>
      </div>
    );
  }

  if (expedientes.length === 0) {
    return (
      <div className="mt-6 bg-surface-dark border border-border-dark rounded-xl p-4">
        <p className="text-xs text-slate-400 text-center">No hay expedientes disponibles</p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b border-border-dark gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-purple-500">folder_open</span>
          <h4 className="text-sm font-bold text-white">Expedientes</h4>
          <span className="text-xs text-slate-400">({expedientes.length} total)</span>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro por estado */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Estado:</span>
            <select
              value={estadoFiltro}
              onChange={(e) => handleEstadoChange(e.target.value)}
              className="bg-surface-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">Todos</option>
              {estadosDisponibles.map((estado) => (
                <option key={estado.estado} value={estado.estado}>
                  {estado.estado} ({estado.cantidad})
                </option>
              ))}
            </select>
          </div>

          {/* Selector de cantidad */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              className="bg-surface-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          
          <button
            onClick={fetchExpedientes}
            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
            title="Recargar"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* Tabla con scroll y encabezados fijos */}
      <div className="overflow-x-auto">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-dark sticky top-0 z-10">
              <tr className="border-b border-border-dark">
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  No. Expediente
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Tipo Vehículo
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Estado
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Fecha Creación
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Fecha Inspección
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Últ. Actualización
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Placas
                </th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark whitespace-nowrap">
                  Estatus AudaTrace
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedExpedientes.map((exp, idx) => (
                <tr 
                  key={exp.id || idx} 
                  className="border-b border-border-dark/50 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-2 text-xs text-white font-mono whitespace-nowrap">
                    {exp.num_expediente}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 max-w-[150px] truncate" title={exp.tipo_vehiculo}>
                    {exp.tipo_vehiculo || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${getEstadoBadgeClass(exp.estado)}`}>
                      {exp.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
                    {formatShortDate(exp.fecha_creacion)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
                    {formatShortDate(exp.fecha_inspeccion)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
                    {formatDate(exp.fecha_actualizacion)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 font-mono uppercase whitespace-nowrap">
                    {exp.placas || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">
                    {exp.estatus_audatrace || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {(totalPages > 1 || expedientes.length > pageSizeOptions[0]) && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-border-dark gap-3">
          <p className="text-xs text-slate-400">
            Mostrando {pagedExpedientes.length} de {expedientes.length} registros
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-border-dark text-xs disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-400">{page} / {totalPages || 1}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-2 py-1 rounded border border-border-dark text-xs disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
