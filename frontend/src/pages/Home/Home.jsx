import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext.jsx";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import QualitasIndicators from "../../components/QualitasIndicators.jsx";
import ChubbIndicators from "../../components/ChubbIndicators.jsx";
import { getVehicleTitle } from "../Taller/tallerShared.js";

// Configuración base de las columnas del Kanban (se complementará con etapas dinámicas)
const BASE_KANBAN_COLUMNS = [
  { id: "recepcionado", label: "Recepción", color: "bg-slate-500" },
  { id: "valuacion", label: "Valuación", color: "bg-blue-500" },
  { id: "carroceria", label: "Taller", color: "bg-primary" },
  { id: "pintura", label: "Pintura", color: "bg-purple-500" },
  { id: "pulido", label: "Pulido", color: "bg-pink-500" },
  { id: "armado", label: "Armado", color: "bg-indigo-500" },
  { id: "lavado", label: "Lavado", color: "bg-cyan-500" },
  { id: "control_calidad", label: "Control Calidad", color: "bg-orange-500" },
  { id: "entrega", label: "Listas", color: "bg-alert-green" },
];

// Mapeo de claves a columnas del kanban
const ETAPA_TO_COLUMN = {
  recepcionado: "recepcionado",
  recepcion: "recepcionado",
  valuacion: "valuacion",
  presupuesto: "valuacion",
  autorizacion: "valuacion",
  carroceria: "carroceria",
  taller: "carroceria",
  mecanica: "carroceria",
  enderezado: "carroceria",
  pintura: "pintura",
  pulido: "pulido",
  armado: "armado",
  montaje: "armado",
  lavado: "lavado",
  control: "control_calidad",
  calidad: "control_calidad",
  qc: "control_calidad",
  entrega: "entrega",
  listo: "entrega",
  terminado: "entrega",
};

// Función para determinar la columna de un vehículo basado en su etapa (clave)
function getColumnForStage(etapaClave = "") {
  const etapa = etapaClave.toLowerCase().trim();
  
  // Buscar coincidencia exacta o parcial
  for (const [key, column] of Object.entries(ETAPA_TO_COLUMN)) {
    if (etapa === key || etapa.includes(key)) {
      return column;
    }
  }
  
  // Por defecto, si tiene etapa va a taller, si no a recepción
  return etapa ? "carroceria" : "recepcionado";
}

// Función para calcular días en taller
function daysInShop(fechaRecep) {
  if (!fechaRecep) return 0;
  const date = new Date(fechaRecep);
  if (isNaN(date.getTime())) return 0;
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor(diffMs / dayMs));
}

// Función para tiempo relativo
function relativeTime(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return "";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) return `hace ${diffMins}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(date);
}

// Componente de tarjeta Kanban
function KanbanCard({ record, onClick }) {
  const days = daysInShop(record.fecha_recep);
  const etapaNombre = record.etapa_actual_nombre || "Sin etapa";
  const etapaClave = record.etapa_actual || "";
  const vehicleName = getVehicleTitle(record);
  
  // Determinar color del estado
  const getStatusColor = () => {
    if (days >= 5) return { bg: "bg-alert-red/10", border: "border-alert-red/30", text: "text-alert-red", strip: "bg-alert-red" };
    if (days >= 3) return { bg: "bg-alert-amber/10", border: "border-alert-amber/30", text: "text-alert-amber", strip: "bg-alert-amber" };
    return { bg: "bg-alert-green/10", border: "border-alert-green/30", text: "text-alert-green", strip: "bg-alert-green" };
  };
  
  const statusColor = getStatusColor();
  
  // Determinar estado a mostrar
  const getStatusLabel = () => {
    const etapaLower = etapaClave.toLowerCase();
    const estatus = (record.taller_estatus || "").toLowerCase();
    
    if (etapaLower.includes("pendiente") || estatus.includes("pendiente")) return { label: "PRESUPUESTO PENDIENTE", color: "text-alert-amber bg-alert-amber/10" };
    if (etapaLower.includes("retraso") || days >= 5) return { label: "RETRASO: REFACCIONES", color: "text-alert-red bg-alert-red/10" };
    if (etapaLower.includes("acabado")) return { label: "ACABADO", color: "text-slate-500 bg-background-dark" };
    if (etapaLower.includes("proceso") || estatus.includes("proceso")) return { label: "EN PROCESO", color: "text-slate-500 bg-background-dark" };
    if (etapaLower.includes("reproceso")) return { label: "REPROCESO REQ", color: "text-alert-amber bg-alert-amber/10" };
    if (etapaLower.includes("listo") || etapaLower.includes("entrega")) return { label: "LISTO ENTREGA", color: "text-alert-green bg-alert-green/10" };
    if (etapaLower.includes("completado") || estatus.includes("completado")) return { label: "COMPLETADO", color: "text-alert-green bg-alert-green/10" };
    return { label: etapaNombre.toUpperCase(), color: "text-slate-500 bg-background-dark" };
  };
  
  const statusLabel = getStatusLabel();
  
  return (
    <div 
      onClick={onClick}
      className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all cursor-pointer overflow-hidden"
    >
      <div className={`status-strip ${statusColor.strip}`}></div>
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-bold text-primary">
          OT #{record.folio_recep || record.id}
        </span>
        <span className="text-[10px] font-medium text-slate-500">
          {relativeTime(record.fecha_recep)}
        </span>
      </div>
      <p className="text-sm font-bold text-white mb-1 line-clamp-1" title={vehicleName}>
        {vehicleName}
      </p>
      <p className="text-[11px] text-slate-400 mb-3 line-clamp-1">
        Cliente: {record.nb_cliente || "-"}
      </p>
      <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusLabel.color}`}>
          {statusLabel.label}
        </span>
        <span className={`text-[10px] font-bold ${days >= 5 ? 'text-alert-red' : days >= 3 ? 'text-alert-amber' : 'text-slate-400'}`}>
          {days} Día{days !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState("local");
  const [isUpdating, setIsUpdating] = useState(false);
  const [piezasVencidasCount, setPiezasVencidasCount] = useState(0);
  const [piezasVencidasPreview, setPiezasVencidasPreview] = useState([]);
  
  // Estado para datos dinámicos
  const [records, setRecords] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const navigate = useNavigate();
  const { openNotifications } = useNotifications();

  // Cargar etapas dinámicas desde el catálogo
  const loadEtapas = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
      if (!response.ok) return;
      const payload = await response.json();
      const etapasList = Array.isArray(payload) ? payload.filter(e => e.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0)) : [];
      setEtapas(etapasList);
    } catch (err) {
      console.error("Error cargando etapas:", err);
    }
  };

  // Cargar vehículos activos
  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/dashboard/autos-en-sitio`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el listado de vehículos.");
      }
      const payload = await response.json();
      setRecords(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || "Error cargando datos.");
    } finally {
      setLoading(false);
    }
  };

  // Cargar conteo de piezas vencidas
  const fetchPiezasVencidasCount = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
      const response = await fetch(`${API_BASE}/inventario/piezas?limit=1000`);
      if (!response.ok) return;
      
      const data = await response.json();
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const vencidas = data.filter(pieza => {
        if (!pieza.fecha_promesa) return false;
        
        const fechaPromesa = new Date(pieza.fecha_promesa);
        fechaPromesa.setHours(0, 0, 0, 0);
        const diffTime = fechaPromesa - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays < 0 && 
               !pieza.estatus?.toLowerCase().includes('cancelada') && 
               !pieza.recibido && 
               !pieza.entregado &&
               pieza.tipo_registro !== 'Reasignada/Cancelada';
      });

      setPiezasVencidasCount(vencidas.length);
      setPiezasVencidasPreview(vencidas.slice(0, 3));
    } catch (error) {
      console.error('Error fetching piezas vencidas:', error);
    }
  };

  useEffect(() => {
    loadEtapas();
    loadRecords();
    fetchPiezasVencidasCount();
  }, []);

  // Construir columnas dinámicas basadas en etapas del catálogo
  const kanbanColumns = useMemo(() => {
    if (etapas.length === 0) return BASE_KANBAN_COLUMNS;
    
    // Mapear etapas del catálogo a columnas del kanban
    return etapas.map(etapa => {
      const clave = etapa.clave?.toLowerCase() || "";
      
      // Buscar color base predefinido
      const baseColumn = BASE_KANBAN_COLUMNS.find(col => 
        col.id === clave || clave.includes(col.id) || col.id.includes(clave)
      );
      
      return {
        id: clave,
        label: etapa.nb_etapa || etapa.clave,
        color: baseColumn?.color || "bg-primary",
        etapa_id: etapa.id
      };
    });
  }, [etapas]);

  // Calcular métricas para los indicadores
  const metrics = useMemo(() => {
    const total = records.length;
    const atrasadas = records.filter(r => daysInShop(r.fecha_recep) >= 4).length;
    const listas = records.filter(r => {
      const etapa = (r.etapa_actual || "").toLowerCase();
      return etapa.includes("entrega") || etapa.includes("listo");
    }).length;
    
    // Calcular tiempo promedio
    const totalDays = records.reduce((sum, r) => sum + daysInShop(r.fecha_recep), 0);
    const promedio = total > 0 ? (totalDays / total).toFixed(1) : "0";
    
    // Alertas críticas (más de 5 días o con problemas)
    const criticas = records.filter(r => {
      const days = daysInShop(r.fecha_recep);
      const etapa = (r.etapa_actual || "").toLowerCase();
      return days >= 5 || etapa.includes("retraso") || etapa.includes("reproceso");
    }).length;
    
    return { total, atrasadas, listas, promedio, criticas };
  }, [records]);

  // Agrupar vehículos por columna del kanban
  const kanbanData = useMemo(() => {
    const grouped = {};
    
    // Inicializar todas las columnas
    kanbanColumns.forEach(col => {
      grouped[col.id] = [];
    });
    
    // Si no hay columnas, usar las base
    if (kanbanColumns.length === 0) {
      BASE_KANBAN_COLUMNS.forEach(col => {
        grouped[col.id] = [];
      });
    }
    
    // Agrupar registros
    records.forEach(record => {
      const etapaClave = (record.etapa_actual || "").toLowerCase().trim();
      
      // Buscar coincidencia exacta primero
      if (grouped[etapaClave]) {
        grouped[etapaClave].push(record);
        return;
      }
      
      // Si no, usar el mapeo
      const columnId = getColumnForStage(etapaClave);
      if (grouped[columnId]) {
        grouped[columnId].push(record);
      } else {
        // Fallback a recepcionado si no encuentra
        grouped["recepcionado"] = grouped["recepcionado"] || [];
        grouped["recepcionado"].push(record);
      }
    });
    
    return grouped;
  }, [records, kanbanColumns]);

  // Manejar clic en tarjeta
  const handleCardClick = (recordId) => {
    navigate(`/taller/autos-en-sitio/${recordId}`);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            showSearch
            searchPlaceholder="Buscar OT, Vehículo o Cliente..."
            actions={
              <>
                <button 
                  onClick={() => navigate('/recepcion/nuevo')}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nueva OT
                </button>
                <div className="h-8 w-[1px] bg-border-dark mx-2"></div>
              </>
            }
            rightExtras={
              <button className="p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all">
                <span className="material-symbols-outlined">grid_view</span>
              </button>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {/* Switch de vistas */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-surface-dark border border-border-dark rounded-lg p-1">
                <button
                  onClick={() => setActiveView("local")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    activeView === "local"
                      ? "bg-primary text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">home_repair_service</span>
                  Taller
                </button>
                <button
                  onClick={() => setActiveView("qualitas")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    activeView === "qualitas"
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <img src="/assets/Qualitas_profile.jpg" alt="Qualitas" className="w-5 h-5 rounded object-cover" />
                  Qualitas
                </button>
                <button
                  onClick={() => setActiveView("chubb")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    activeView === "chubb"
                      ? "bg-purple-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <img src="/assets/CHUBB_profile.jpg" alt="CHUBB" className="w-5 h-5 rounded object-cover" />
                  CHUBB
                </button>
              </div>
              {isUpdating ? (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                  Actualizando datos...
                </div>
              ) : null}
            </div>

            {/* Contenido según vista activa */}
            {activeView === "local" && (
              // Vista Local - Indicadores del Taller
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      OTs Activas
                    </span>
                    <span className="material-symbols-outlined text-primary text-xl">directions_car</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{metrics.total.toString().padStart(2, '0')}</span>
                    <span className="text-xs font-bold text-alert-green">+{Math.max(0, metrics.total - 30)}%</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-alert-red/30 p-5 rounded-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-alert-red/5 pointer-events-none"></div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-alert-red uppercase tracking-widest">
                      OTs Atrasadas
                    </span>
                    <span className="material-symbols-outlined text-alert-red text-xl">timer_off</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{metrics.atrasadas.toString().padStart(2, '0')}</span>
                    <span className="text-xs font-bold text-alert-red">-{Math.max(0, 10 - metrics.atrasadas)}%</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Listas para Entrega
                    </span>
                    <span className="material-symbols-outlined text-alert-green text-xl">check_circle</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{metrics.listas.toString().padStart(2, '0')}</span>
                    <span className="text-xs font-bold text-slate-400">Estable</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Tiempo Promedio
                    </span>
                    <span className="material-symbols-outlined text-slate-400 text-xl">schedule</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{metrics.promedio}</span>
                    <span className="text-xs font-medium text-slate-400">Días</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Alertas Críticas
                    </span>
                    <span className="material-symbols-outlined text-alert-amber text-xl">warning</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{metrics.criticas.toString().padStart(2, '0')}</span>
                    <span className={`text-xs font-bold ${metrics.criticas > 5 ? 'text-alert-red' : 'text-alert-amber'}`}>
                      {metrics.criticas > 5 ? 'Alta' : 'Media'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeView === "qualitas" ? <QualitasIndicators onRefresh={setIsUpdating} /> : null}

            {activeView === "chubb" ? <ChubbIndicators onRefresh={setIsUpdating} /> : null}
            
            {/* Resto del contenido (Kanban, etc) - solo visible en vista local */}
            {activeView === "local" && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">view_kanban</span>
                      Flujo Operativo
                    </h2>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { loadRecords(); loadEtapas(); }}
                        className="text-xs font-bold bg-surface-dark text-slate-300 px-3 py-1.5 rounded border border-border-dark hover:text-white transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        Actualizar
                      </button>
                      <button className="text-xs font-bold bg-surface-dark text-slate-300 px-3 py-1.5 rounded border border-border-dark hover:text-white transition-colors">
                        Filtros
                      </button>
                    </div>
                  </div>
                  
                  {loading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                      <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                      Cargando flujo operativo...
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center py-12 text-alert-red">
                      <span className="material-symbols-outlined mr-2">error</span>
                      {error}
                    </div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                      {kanbanColumns.map((column) => (
                        <div key={column.id} className="kanban-column flex flex-col gap-3 min-w-[280px]">
                          <div className="flex items-center justify-between px-2">
                            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <span className={`size-2 rounded-full ${column.color}`}></span>
                              {column.label} ({kanbanData[column.id]?.length || 0})
                            </span>
                            <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-white transition-colors">more_horiz</span>
                          </div>
                          
                          {kanbanData[column.id]?.length === 0 ? (
                            <div className="bg-surface-dark/50 border border-border-dark/50 border-dashed p-6 rounded-lg text-center">
                              <span className="material-symbols-outlined text-slate-600 text-2xl mb-2">inbox</span>
                              <p className="text-xs text-slate-500">Sin vehículos</p>
                            </div>
                          ) : (
                            kanbanData[column.id]?.map((record) => (
                              <KanbanCard 
                                key={record.id} 
                                record={record} 
                                onClick={() => handleCardClick(record.id)}
                              />
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
                  <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-alert-red">notification_important</span>
                      Centro de Acción y Tareas Pendientes
                    </h2>
                    <div className="bg-surface-dark border border-border-dark rounded-xl divide-y divide-border-dark overflow-hidden">
                      {/* Alerta de Piezas Vencidas */}
                      {piezasVencidasCount > 0 && (
                        <div className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors bg-alert-red/5">
                          <div className="flex items-center gap-4">
                            <div className="size-8 rounded-full bg-alert-red/20 flex items-center justify-center text-alert-red animate-pulse">
                              <span className="material-symbols-outlined text-xl">inventory_2</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                {piezasVencidasCount} pieza{piezasVencidasCount !== 1 ? 's' : ''} con fecha de entrega vencida
                              </p>
                              <p className="text-xs text-slate-400">
                                {piezasVencidasPreview.length > 0 && (
                                  <>
                                    {piezasVencidasPreview.map((p, i) => (
                                      <span key={i}>
                                        {p.nombre}{i < piezasVencidasPreview.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                    {piezasVencidasCount > 3 && ` y ${piezasVencidasCount - 3} más...`}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => navigate('/inventario/bitacora-piezas?vencidas=true')}
                              className="px-3 py-1.5 bg-alert-red hover:bg-alert-red/90 text-white text-[10px] font-bold rounded uppercase tracking-wider transition-all"
                            >
                              Ver Piezas
                            </button>
                            <button 
                              onClick={openNotifications}
                              className="px-3 py-1.5 bg-surface-dark border border-border-dark text-slate-400 hover:text-white text-[10px] font-bold rounded uppercase tracking-wider transition-all"
                            >
                              Ver Notificaciones
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* OTs Atrasadas */}
                      {records.filter(r => daysInShop(r.fecha_recep) >= 4).slice(0, 3).map((record) => (
                        <div key={record.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="size-8 rounded-full bg-alert-red/20 flex items-center justify-center text-alert-red">
                              <span className="material-symbols-outlined text-xl">timer_off</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                OT #{record.folio_recep || record.id} - {getVehicleTitle(record)}
                              </p>
                              <p className="text-xs text-slate-400">
                                {daysInShop(record.fecha_recep)} días en taller | {record.nb_cliente || "Sin cliente"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleCardClick(record.id)}
                              className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider"
                            >
                              Ver OT
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* OTs Pendientes de Asignación */}
                      {records.filter(r => !r.personal_responsable || !r.estacion_actual).slice(0, 2).map((record) => (
                        <div key={`pending-${record.id}`} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="size-8 rounded-full bg-alert-amber/20 flex items-center justify-center text-alert-amber">
                              <span className="material-symbols-outlined text-xl">person_off</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                Pendiente de asignación - OT #{record.folio_recep || record.id}
                              </p>
                              <p className="text-xs text-slate-400">
                                {getVehicleTitle(record)} | {record.nb_cliente || "Sin cliente"}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => navigate('/taller/autos-en-sitio')}
                              className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider"
                            >
                              Asignar
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Estado vacío si no hay alertas */}
                      {piezasVencidasCount === 0 && 
                       records.filter(r => daysInShop(r.fecha_recep) >= 4).length === 0 &&
                       records.filter(r => !r.personal_responsable).length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                          <span className="material-symbols-outlined text-3xl mb-2">check_circle</span>
                          <p className="text-sm">No hay tareas pendientes críticas</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">analytics</span>
                      Rendimiento
                    </h2>
                    <div className="space-y-4">
                      <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                        <div className="flex justify-between items-center mb-6">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                            Productividad del Taller
                          </p>
                          <span className="text-sm font-bold text-alert-green">88%</span>
                        </div>
                        <div className="h-24 flex items-end gap-1.5">
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "60%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "40%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "75%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "90%" }}
                          ></div>
                          <div className="flex-1 bg-primary rounded-t" style={{ height: "88%" }}></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "65%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "50%" }}
                          ></div>
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          <span>Lun</span>
                          <span>Mar</span>
                          <span>Mié</span>
                          <span>Jue</span>
                          <span>Hoy</span>
                          <span>Sáb</span>
                          <span>Dom</span>
                        </div>
                      </div>
                      <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                            % Entrega a Tiempo
                          </p>
                          <span className="text-sm font-bold text-white">92.4%</span>
                        </div>
                        <div className="relative pt-1">
                          <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-background-dark">
                            <div
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary"
                              style={{ width: "92.4%" }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                            <span>Meta: 90%</span>
                            <span className="text-alert-green">+2.4% vs Mes Anterior</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
