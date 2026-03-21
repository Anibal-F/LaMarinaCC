import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

export default function NotificationsSidebar({ isOpen, onClose }) {
  const [piezasVencidas, setPiezasVencidas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchPiezasVencidas();
    }
  }, [isOpen]);

  const fetchPiezasVencidas = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/inventario/piezas?limit=1000`);
      if (!response.ok) throw new Error('Error al cargar piezas');
      
      const data = await response.json();
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Filtrar piezas vencidas (misma lógica que BitacoraPiezas)
      const vencidas = data.filter(pieza => {
        if (!pieza.fecha_promesa) return false;
        
        const fechaPromesa = new Date(pieza.fecha_promesa);
        fechaPromesa.setHours(0, 0, 0, 0);
        const diffTime = fechaPromesa - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Fecha vencida Y no cancelada Y no recibida Y no entregada Y no reasignada/cancelada
        return diffDays < 0 && 
               !pieza.estatus?.toLowerCase().includes('cancelada') && 
               !pieza.recibido && 
               !pieza.entregado &&
               pieza.tipo_registro !== 'Reasignada/Cancelada';
      });

      // Ordenar por fecha_promesa (más viejas primero)
      vencidas.sort((a, b) => new Date(a.fecha_promesa) - new Date(b.fecha_promesa));
      
      setPiezasVencidas(vencidas);
      setCount(vencidas.length);
    } catch (error) {
      console.error('Error fetching piezas vencidas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerTodas = () => {
    onClose();
    navigate('/inventario/bitacora-piezas?vencidas=true');
  };

  const handleVerPieza = (pieza) => {
    onClose();
    // Usar numero_orden o numero_reporte para la búsqueda, codificado para URL
    const searchValue = pieza.numero_orden || pieza.numero_reporte || pieza.nombre;
    if (searchValue) {
      navigate(`/inventario/bitacora-piezas?vencidas=true&search=${encodeURIComponent(searchValue)}`);
    } else {
      navigate('/inventario/bitacora-piezas?vencidas=true');
    }
  };

  const formatDiasVencidos = (fechaPromesa) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaPromesa);
    fecha.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((hoy - fecha) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface-dark border-l border-border-dark z-50 shadow-2xl transform transition-transform duration-300 ease-out animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-alert-red">notifications_active</span>
            <h2 className="text-lg font-bold text-white">Alertas y Notificaciones</h2>
            {count > 0 && (
              <span className="px-2 py-0.5 bg-alert-red text-white text-xs font-bold rounded-full">
                {count}
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Sección Piezas Vencidas */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-alert-red text-base">warning</span>
                Piezas Vencidas
              </h3>
              {count > 0 && (
                <span className="text-xs text-alert-red font-bold">
                  {count} alerta{count !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="material-symbols-outlined animate-spin text-primary">refresh</span>
                <span className="ml-2 text-sm text-slate-400">Cargando...</span>
              </div>
            ) : piezasVencidas.length === 0 ? (
              <div className="bg-background-dark rounded-xl p-6 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">check_circle</span>
                <p className="text-sm text-slate-400">No hay piezas vencidas</p>
                <p className="text-xs text-slate-500 mt-1">Todas las piezas están dentro del tiempo de entrega</p>
              </div>
            ) : (
              <div className="space-y-3">
                {piezasVencidas.slice(0, 10).map((pieza, index) => {
                  const diasVencidos = formatDiasVencidos(pieza.fecha_promesa);
                  return (
                    <div 
                      key={pieza.id || index}
                      onClick={() => handleVerPieza(pieza)}
                      className="bg-background-dark border border-border-dark rounded-xl p-4 hover:border-alert-red/50 hover:bg-alert-red/5 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-alert-red/20 text-alert-red text-[10px] font-bold rounded">
                              {diasVencidos} día{diasVencidos !== 1 ? 's' : ''} vencido{diasVencidos !== 1 ? 's' : ''}
                            </span>
                            {pieza.numero_orden && (
                              <span className="text-xs text-primary font-mono">
                                OT: {pieza.numero_orden}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-alert-red transition-colors">
                            {pieza.nombre || 'Sin nombre'}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {pieza.proveedor?.nombre || pieza.proveedor || 'Sin proveedor'}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">event</span>
                              Promesa: {formatDate(pieza.fecha_promesa)}
                            </span>
                            {pieza.numero_reporte && (
                              <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">description</span>
                                Reporte: {pieza.numero_reporte}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-alert-red transition-colors">
                          chevron_right
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {piezasVencidas.length > 10 && (
                  <p className="text-center text-xs text-slate-500 py-2">
                    Y {piezasVencidas.length - 10} piezas más...
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border-dark my-2" />

          {/* Sección Otras Alertas (placeholder para futuras notificaciones) */}
          <div className="p-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-alert-amber text-base">info</span>
              Otras Alertas
            </h3>
            <div className="bg-background-dark rounded-xl p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">notifications_off</span>
              <p className="text-sm text-slate-400">No hay otras alertas</p>
              <p className="text-xs text-slate-500 mt-1">Las notificaciones aparecerán aquí</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border-dark p-4 shrink-0">
          <button
            onClick={handleVerTodas}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white py-3 rounded-xl font-bold transition-all"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            Ver Bitácora de Piezas
          </button>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
