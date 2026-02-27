import { useState, useEffect } from 'react';

export default function QualitasOrdenesAsignadas({ fechaExtraccion }) {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchOrdenes();
  }, [fechaExtraccion]);

  const fetchOrdenes = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/admin/qualitas/ordenes-asignadas`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          setOrdenes([]);
          return;
        }
        throw new Error('Error al cargar órdenes');
      }
      
      const data = await response.json();
      setOrdenes(data.ordenes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Paginación
  const totalPages = Math.ceil(ordenes.length / pageSize);
  const pagedOrdenes = ordenes.slice((page - 1) * pageSize, page * pageSize);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Mazatlan',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <p className="text-xs text-alert-red">Error cargando órdenes: {error}</p>
      </div>
    );
  }

  if (ordenes.length === 0) {
    return null; // No mostrar si no hay datos
  }

  return (
    <div className="mt-6 bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-500">list_alt</span>
          <h4 className="text-sm font-bold text-white">Órdenes Asignadas</h4>
          <span className="text-xs text-slate-400">({ordenes.length} total)</span>
        </div>
        <button
          onClick={fetchOrdenes}
          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          title="Recargar"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-background-dark/50">
            <tr>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">#Exp</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Asignación</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Póliza</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Vehículo</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Año</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Placas</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Riesgo</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {pagedOrdenes.map((orden, idx) => (
              <tr 
                key={orden.id || idx} 
                className="border-b border-border-dark/50 hover:bg-white/5 transition-colors"
              >
                <td className="px-3 py-2 text-xs text-white font-mono">{orden.num_expediente}</td>
                <td className="px-3 py-2 text-xs text-slate-300">{formatDate(orden.fecha_asignacion)}</td>
                <td className="px-3 py-2 text-xs text-slate-300 font-mono">{orden.poliza}</td>
                <td className="px-3 py-2 text-xs text-slate-300 max-w-[150px] truncate" title={orden.vehiculo}>
                  {orden.vehiculo}
                </td>
                <td className="px-3 py-2 text-xs text-slate-300">{orden.anio}</td>
                <td className="px-3 py-2 text-xs text-slate-300 font-mono uppercase">{orden.placas}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    orden.riesgo === 'Tercero' 
                      ? 'bg-alert-amber/20 text-alert-amber' 
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {orden.riesgo}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-alert-green/20 text-alert-green">
                    {orden.estatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-dark">
          <p className="text-xs text-slate-400">
            Mostrando {pagedOrdenes.length} de {ordenes.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-border-dark text-xs disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-400">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded border border-border-dark text-xs disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
