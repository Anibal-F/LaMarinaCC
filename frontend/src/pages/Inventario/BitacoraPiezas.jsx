import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';
import QualitasPiezasExtractor from '../../components/QualitasPiezasExtractor.jsx';
import ChubbPiezasExtractor from '../../components/ChubbPiezasExtractor.jsx';
import { getSession } from '../../utils/auth.js';

// URL base de la API
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

const API_BASE = getApiUrl();

// Función para extraer todos los dígitos de un string
// Ejemplo: "04 0111577 26 A" → "0401157726"
const extractDigits = (str) => {
  if (!str) return '';
  return String(str).replace(/\D/g, '');
};

// Opciones de ubicación
const UBICACIONES = ['ND', 'ALMACEN', 'PENDIENTE', 'TALLER', 'ENTREGADO'];

// Estatus posibles
const ESTATUS_OPTIONS = ['Todos', 'En Proceso', 'Pendiente', 'Cancelada', 'Entregado', 'Recibido'];

// Tipos de registro
const TIPO_REGISTRO_OPTIONS = ['Todos', 'Proceso de Surtido', 'Reasignada/Cancelada'];

// Definición de columnas
const COLUMN_DEFS = [
  { key: 'tipo', label: 'Tipo', width: '90px', className: 'text-center' },
  { key: 'nombre', label: 'Nombre', width: '150px', className: 'text-left' },
  { key: 'origen', label: 'Origen', width: '100px', className: 'text-left' },
  { key: 'numero_parte', label: '# Parte', width: '100px', className: 'text-left font-mono' },
  { key: 'numero_orden', label: 'Orden', width: '100px', className: 'text-left font-mono' },
  { key: 'numero_reporte', label: 'Reporte', width: '120px', className: 'text-left' },
  { key: 'observaciones', label: 'Observaciones', width: '120px', className: 'text-left' },
  { key: 'proveedor', label: 'Proveedor', width: '140px', className: 'text-left' },
  { key: 'paqueteria', label: 'Paquetería', width: '80px', className: 'text-center' },
  { key: 'fecha_promesa', label: 'Fecha Promesa', width: '110px', className: 'text-left' },
  { key: 'demeritos', label: 'Deméritos', width: '80px', className: 'text-right' },
  { key: 'estatus', label: 'Estatus', width: '100px', className: 'text-center' },
  { key: 'fecha_estatus', label: 'Fecha Estatus', width: '110px', className: 'text-left' },
  { key: 'ubicacion', label: 'Ubicación', width: '100px', className: 'text-center' },
  { key: 'devolucion_proveedor', label: 'Dev. Prov.', width: '70px', className: 'text-center' },
  { key: 'recibido', label: 'Rec. Scrapper', width: '85px', className: 'text-center' },
  { key: 'recibido_sistema', label: 'Rec. Sistema', width: '90px', className: 'text-center' },
  { key: 'entregado', label: 'Entregado', width: '70px', className: 'text-center' },
  { key: 'portal', label: 'Portal', width: '60px', className: 'text-center' }
];

const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map((c) => c.key);
const DEFAULT_HIDDEN_COLUMNS = []; // Por defecto todas visibles
const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c.width]));

// Componente Modal de Proveedor
function ProveedorModal({ proveedor, isOpen, onClose }) {
  if (!isOpen || !proveedor) return null;
  
  const nombreLimpio = cleanProveedorNombre(proveedor.nombre);
  const proveedorId = proveedor.id_externo || proveedor.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-dark border border-border-dark rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Información del Proveedor</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400">close</span>
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-background-dark rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">badge</span>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Identificador</p>
              <p className="text-sm font-bold text-white">{proveedorId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-background-dark rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">business</span>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Nombre</p>
              <p className="text-sm font-bold text-white">{nombreLimpio}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-background-dark rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">email</span>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Email</p>
              <p className="text-sm text-slate-300">{proveedor.email || 'N/A'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-background-dark rounded-lg">
            <span className="material-symbols-outlined text-primary text-2xl">smartphone</span>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Celular</p>
              <p className="text-sm text-slate-300">{proveedor.celular || 'N/A'}</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Función para limpiar nombre de proveedor
function cleanProveedorNombre(nombre) {
  if (!nombre) return 'Sin Asignar';
  // Remover CONTACT y todo lo que sigue
  return nombre.split(/CONTACT/i)[0].trim() || 'Sin Asignar';
}

// Componente de celda de proveedor con ícono
function ProveedorCell({ proveedor, onClickInfo }) {
  // Manejar caso donde proveedor es null/undefined
  if (!proveedor) {
    return (
      <span className="text-xs text-slate-500 italic">Sin proveedor</span>
    );
  }
  
  const nombreOriginal = proveedor.nombre || '';
  const nombreLimpio = cleanProveedorNombre(nombreOriginal);
  const proveedorId = proveedor.id_externo || proveedor.id;
  
  // Es placeholder si el nombre original contiene CONTACT o el nombre limpio es Sin Asignar
  const isContactPlaceholder = nombreOriginal.includes('CONTACT') || nombreLimpio === 'Sin Asignar';
  
  // Texto a mostrar: nombre real o ID del proveedor
  const textoMostrar = isContactPlaceholder ? proveedorId : nombreLimpio;
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 truncate max-w-[140px]" title={textoMostrar}>
        {textoMostrar}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClickInfo();
        }}
        className="p-1 hover:bg-slate-700 rounded transition-colors"
        title="Ver información del proveedor"
      >
        <span className="material-symbols-outlined text-sm text-slate-400 hover:text-blue-400">
          info
        </span>
      </button>
    </div>
  );
}

// Componente de celda de paquetería
function PaqueteriaCell({ paqueteria, guia }) {
  if (!paqueteria || !guia) return <span className="text-xs text-slate-500">-</span>;
  
  return (
    <div className="flex items-center gap-2">
      <button
        className="p-1 hover:bg-slate-700 rounded transition-colors"
        title={`${paqueteria} - Guía: ${guia}`}
        onClick={(e) => {
          e.stopPropagation();
          // Copiar guía al portapapeles
          navigator.clipboard.writeText(guia);
          alert(`Guía ${guia} copiada al portapapeles`);
        }}
      >
        <span className="material-symbols-outlined text-sm text-blue-400 hover:text-blue-300">
          local_shipping
        </span>
      </button>
      <span className="text-xs text-slate-400 truncate max-w-[80px]" title={guia}>
        {guia}
      </span>
    </div>
  );
}

// Componente de Indicadores de Piezas
function IndicadoresPiezas({ piezas, activeFilter, onFilter }) {
  // Calcular indicadores
  const indicadores = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    let vencidas = 0;
    let porRecibir = 0;
    let enProceso = 0;
    const porEstatus = {};
    
    piezas.forEach(pieza => {
      // Contar por estatus
      const estatus = pieza.estatus || 'Sin Estatus';
      porEstatus[estatus] = (porEstatus[estatus] || 0) + 1;
      
      // Calcular días hasta fecha promesa
      if (pieza.fecha_promesa) {
        const fechaPromesa = new Date(pieza.fecha_promesa);
        fechaPromesa.setHours(0, 0, 0, 0);
        
        const diffTime = fechaPromesa - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
          // Fecha promesa ya pasó, pero solo contar si NO está cancelada Y NO está recibida Y NO está entregada Y NO es Reasignada/Cancelada
          if (!pieza.estatus?.toLowerCase().includes('cancelada') && !pieza.recibido && !pieza.entregado && pieza.tipo_registro !== 'Reasignada/Cancelada') {
            vencidas++;
          }
        } else if (diffDays >= 0 && diffDays <= 3) {
          // 0 a 3 días para vencer
          porRecibir++;
        } else {
          // Más de 3 días
          enProceso++;
        }
      }
    });
    
    return { vencidas, porRecibir, enProceso, porEstatus };
  }, [piezas]);
  
  const tarjetas = [
    {
      key: 'vencidas',
      label: 'Piezas Vencidas',
      value: indicadores.vencidas,
      icon: 'warning',
      color: 'red',
      desc: 'Fecha promesa vencida (no canceladas, recibidas, entregadas ni reasignadas/canceladas)',
      filter: 'vencidas'
    },
    {
      key: 'porRecibir',
      label: 'Por Recibir',
      value: indicadores.porRecibir,
      icon: 'schedule',
      color: 'amber',
      desc: '0-3 días para entrega',
      filter: 'porRecibir'
    },
    {
      key: 'enProceso',
      label: 'En Proceso',
      value: indicadores.enProceso,
      icon: 'timer',
      color: 'blue',
      desc: '> 3 días para entrega',
      filter: 'enProceso'
    },
    {
      key: 'total',
      label: 'Total Piezas',
      value: piezas.length,
      icon: 'inventory_2',
      color: 'slate',
      desc: 'Todas las piezas',
      filter: 'total'
    }
  ];
  
  // Indicadores por estatus (solo los principales)
  const estatusPrincipales = ['En Proceso', 'Pendiente', 'Cancelada', 'Entregado', 'Recibido'];
  
  const colorClasses = {
    red: { border: 'border-alert-red', text: 'text-alert-red', bg: 'bg-alert-red/20', icon: 'text-alert-red' },
    amber: { border: 'border-alert-amber', text: 'text-alert-amber', bg: 'bg-alert-amber/20', icon: 'text-alert-amber' },
    blue: { border: 'border-blue-500', text: 'text-blue-500', bg: 'bg-blue-500/20', icon: 'text-blue-500' },
    slate: { border: 'border-slate-500', text: 'text-slate-400', bg: 'bg-slate-500/20', icon: 'text-slate-400' },
    green: { border: 'border-alert-green', text: 'text-alert-green', bg: 'bg-alert-green/20', icon: 'text-alert-green' },
    purple: { border: 'border-purple-500', text: 'text-purple-500', bg: 'bg-purple-500/20', icon: 'text-purple-500' },
  };
  
  const handleCardClick = (filterKey) => {
    if (onFilter) {
      onFilter(activeFilter === filterKey ? null : filterKey);
    }
  };
  
  const handleEstatusClick = (estatus) => {
    if (onFilter) {
      onFilter(activeFilter === `estatus:${estatus}` ? null : `estatus:${estatus}`);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Indicadores principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tarjetas.map((tarjeta) => {
          const colors = colorClasses[tarjeta.color];
          const isActive = activeFilter === tarjeta.filter;
          return (
            <button
              key={tarjeta.key}
              onClick={() => handleCardClick(tarjeta.filter)}
              className={`bg-surface-dark border ${isActive ? colors.border : colors.border} rounded-xl p-4 transition-all hover:scale-[1.02] text-left cursor-pointer ${isActive ? colors.bg : ''} ${isActive ? 'ring-2 ring-offset-2 ring-offset-background-dark ring-' + tarjeta.color : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {tarjeta.label}
                </span>
                <span className={`material-symbols-outlined ${colors.icon} text-xl`}>
                  {tarjeta.icon}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-extrabold ${colors.text} tracking-tight`}>
                  {tarjeta.value}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {tarjeta.desc}
                {isActive && <span className="ml-1 text-slate-300">(activo)</span>}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Componente Badge de Estatus
function EstatusBadge({ estatus }) {
  const colors = {
    'En Proceso': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Pendiente': 'bg-alert-amber/20 text-alert-amber border-alert-amber/30',
    'Cancelada': 'bg-alert-red/20 text-alert-red border-alert-red/30',
    'Entregado': 'bg-alert-green/20 text-alert-green border-alert-green/30',
    'Recibido': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  
  const colorClass = colors[estatus] || 'bg-slate-700 text-slate-400 border-slate-600';
  
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-bold border ${colorClass}`}>
      {estatus}
    </span>
  );
}

// Componente Badge de Tipo de Registro
function TipoRegistroBadge({ tipo }) {
  const colors = {
    'Proceso de Surtido': 'bg-blue-500/20 text-blue-400',
    'Reasignada/Cancelada': 'bg-orange-500/20 text-orange-400',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${colors[tipo] || 'bg-slate-700 text-slate-400'}`}>
      {tipo}
    </span>
  );
}

export default function BitacoraPiezas() {
  const [piezas, setPiezas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filtros
  const [filtroEstatus, setFiltroEstatus] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroOrden, setFiltroOrden] = useState('');
  const [filtroReporte, setFiltroReporte] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  
  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageSizeOptions = [10, 25, 50, 100];
  
  // Modal de proveedor
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Fuente activa (Qualitas, Chubb, o Todas)
  const [fuenteActiva, setFuenteActiva] = useState('Todas');
  
  // Filtro de indicadores activo
  const [filtroIndicador, setFiltroIndicador] = useState(null);
  
  // Filtro de recepción
  const [filtroRecibido, setFiltroRecibido] = useState('Todos'); // 'Todos', 'Recibidos', 'SinRecepcionar'
  
  // Ordenamiento
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' o 'desc'
  
  // Gestión de columnas
  const session = getSession();
  const userKey = String(session?.id || session?.user_name || session?.email || 'anon').toLowerCase();
  const sessionKey = String(session?.session_started_at || 'no-session');
  const storageKey = `lmcc:piezas:columns:${userKey}`;
  const sessionStorageKey = `lmcc:piezas:columns:${userKey}:${sessionKey}`;
  
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [draggingColumnKey, setDraggingColumnKey] = useState(null);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER);
  const [hiddenColumns, setHiddenColumns] = useState(DEFAULT_HIDDEN_COLUMNS);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Leer parámetros de URL
  const location = useLocation();
  
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      
      // Si viene ?vencidas=true, activar el filtro de vencidas
      if (params.get('vencidas') === 'true') {
        setFiltroIndicador('vencidas');
      }
      
      // Si viene ?search=xxx, aplicar búsqueda (decodificar el valor)
      const searchParam = params.get('search');
      if (searchParam) {
        const decodedSearch = decodeURIComponent(searchParam);
        console.log('URL Search param:', searchParam, 'Decoded:', decodedSearch);
        setFiltroBusqueda(decodedSearch);
      }
    } catch (error) {
      console.error('Error parsing URL params:', error);
    }
  }, [location.search]);

  // Cargar piezas desde la API
  useEffect(() => {
    fetchPiezas();
  }, [filtroEstatus, filtroTipo, fuenteActiva, filtroFechaInicio, filtroFechaFin]);

  // Cerrar modales con tecla ESC
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (modalOpen) {
          setModalOpen(false);
        } else if (proveedorSeleccionado) {
          setProveedorSeleccionado(null);
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [modalOpen, proveedorSeleccionado]);

  const fetchPiezas = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Construir query params
      const params = new URLSearchParams();
      if (fuenteActiva !== 'Todas') params.append('fuente', fuenteActiva);
      if (filtroTipo !== 'Todos') params.append('tipo_registro', filtroTipo);
      if (filtroEstatus !== 'Todos') params.append('estatus', filtroEstatus);
      if (filtroBusqueda) params.append('search', filtroBusqueda);
      if (filtroFechaInicio) params.append('fecha_inicio', filtroFechaInicio);
      if (filtroFechaFin) params.append('fecha_fin', filtroFechaFin);
      params.append('limit', '1000'); // Cargar todas y filtrar en frontend por ahora
      
      const response = await fetch(`${API_BASE}/inventario/piezas?${params}`);
      
      if (!response.ok) {
        throw new Error('Error al cargar piezas');
      }
      
      const data = await response.json();
      
      // Transformar datos para el frontend
      const piezasTransformadas = data.map(p => ({
        id: p.id,
        nombre: p.nombre,
        origen: p.origen,
        numero_parte: p.numero_parte,
        numero_orden: p.numero_orden,
        numero_reporte: p.numero_reporte,
        observaciones: p.observaciones,
        proveedor: {
          id: p.proveedor_id_externo,
          nombre: p.proveedor_nombre,
          email: p.proveedor_email,
          celular: p.proveedor_celular
        },
        paqueteria: p.paqueteria,
        guia_paqueteria: p.guia_paqueteria,
        fecha_promesa: p.fecha_promesa,
        fecha_estatus: p.fecha_estatus,
        estatus: p.estatus,
        demeritos: p.demeritos,
        ubicacion: p.ubicacion,
        devolucion_proveedor: p.devolucion_proveedor,
        recibido: p.recibido,
        entregado: p.entregado,
        portal: p.portal,
        fuente: p.fuente,
        tipo_registro: p.tipo_registro
      }));
      
      setPiezas(piezasTransformadas);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Buscar al presionar Enter o cambiar filtros
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchPiezas();
    }, 300);
    return () => clearTimeout(timeout);
  }, [filtroBusqueda]);
  
  // Cargar preferencias de columnas desde sessionStorage/localStorage
  useEffect(() => {
    const parsePrefs = (raw) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.order) &&
          Array.isArray(parsed.hidden)
        ) {
          return parsed;
        }
      } catch {
        return null;
      }
    };

    const sessionPrefs = parsePrefs(sessionStorage.getItem(sessionStorageKey));
    const localPrefs = parsePrefs(localStorage.getItem(storageKey));
    const prefs = sessionPrefs || localPrefs;
    
    // Si no hay preferencias guardadas, usar defaults
    if (!prefs) {
      setColumnOrder(DEFAULT_COLUMN_ORDER);
      setHiddenColumns(DEFAULT_HIDDEN_COLUMNS);
      setColumnWidths(DEFAULT_COLUMN_WIDTHS);
      return;
    }
    
    // Detectar columnas nuevas que no están en la config guardada
    const savedOrder = prefs.order || [];
    const currentKeys = DEFAULT_COLUMN_ORDER;
    const newColumns = currentKeys.filter(key => !savedOrder.includes(key));
    
    // Combinar: orden guardado + columnas nuevas al final
    const mergedOrder = [...savedOrder, ...newColumns];
    
    // Limpiar columnas que ya no existen de hiddenColumns
    const savedHidden = prefs.hidden || [];
    const cleanedHidden = savedHidden.filter(key => currentKeys.includes(key));
    
    setColumnOrder(mergedOrder);
    setHiddenColumns(cleanedHidden);
    
    // Merge widths: mantener los guardados + defaults para nuevos
    const savedWidths = prefs.widths || {};
    const mergedWidths = { ...DEFAULT_COLUMN_WIDTHS, ...savedWidths };
    setColumnWidths(mergedWidths);
  }, [sessionStorageKey, storageKey]);
  
  // Guardar preferencias de columnas
  useEffect(() => {
    const payload = JSON.stringify({ order: columnOrder, hidden: hiddenColumns, widths: columnWidths });
    sessionStorage.setItem(sessionStorageKey, payload);
    localStorage.setItem(storageKey, payload);
  }, [columnOrder, hiddenColumns, columnWidths, sessionStorageKey, storageKey]);

  // Filtrar y ordenar piezas
  const piezasFiltradas = useMemo(() => {
    let resultado = piezas.filter(pieza => {
      // Filtro por estatus
      if (filtroEstatus !== 'Todos' && pieza.estatus !== filtroEstatus) {
        return false;
      }
      
      // Filtro por tipo de registro
      if (filtroTipo !== 'Todos' && pieza.tipo_registro !== filtroTipo) {
        return false;
      }
      
      // Filtro por fuente
      if (fuenteActiva !== 'Todas' && pieza.fuente !== fuenteActiva) {
        return false;
      }
      
      // Filtro por número de orden
      if (filtroOrden && pieza.numero_orden) {
        if (!pieza.numero_orden.toLowerCase().includes(filtroOrden.toLowerCase())) {
          return false;
        }
      }
      
      // Filtro por número de reporte (normalizado - compara todos los dígitos)
      if (filtroReporte && pieza.numero_reporte) {
        const searchDigits = extractDigits(filtroReporte);
        const reporteDigits = extractDigits(pieza.numero_reporte);
        
        // Si la búsqueda tiene 4+ dígitos, buscar coincidencia en los dígitos del reporte
        if (searchDigits.length >= 4) {
          // Buscar que los dígitos de búsqueda estén contenidos en los dígitos del reporte
          if (!reporteDigits.includes(searchDigits)) {
            return false;
          }
        } else {
          // Búsqueda corta: usar includes normal en el texto original
          if (!pieza.numero_reporte.toLowerCase().includes(filtroReporte.toLowerCase())) {
            return false;
          }
        }
      }
      
      // Filtro por recepción
      if (filtroRecibido === 'Recibidos' && !pieza.recibido) {
        return false;
      }
      if (filtroRecibido === 'SinRecepcionar' && pieza.recibido) {
        return false;
      }
      
      // Filtro por indicador seleccionado
      if (filtroIndicador) {
        if (filtroIndicador.startsWith('estatus:')) {
          const estatusFiltro = filtroIndicador.replace('estatus:', '');
          if (pieza.estatus !== estatusFiltro) {
            return false;
          }
        } else if (filtroIndicador !== 'total' && pieza.fecha_promesa) {
          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);
          const fechaPromesa = new Date(pieza.fecha_promesa);
          fechaPromesa.setHours(0, 0, 0, 0);
          const diffTime = fechaPromesa - hoy;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (filtroIndicador === 'vencidas') {
            // Fecha vencida Y no cancelada Y no recibida Y no entregada Y no es Reasignada/Cancelada
            const isFiltered = diffDays >= 0 || pieza.estatus?.toLowerCase().includes('cancelada') || pieza.recibido || pieza.entregado || pieza.tipo_registro === 'Reasignada/Cancelada';
            
            // Debug para pieza específica
            if (pieza.numero_orden?.includes('8553803')) {
              console.log('Debug vencidas filter:', {
                nombre: pieza.nombre,
                numero_orden: pieza.numero_orden,
                diffDays,
                fecha_promesa: pieza.fecha_promesa,
                estatus: pieza.estatus,
                recibido: pieza.recibido,
                entregado: pieza.entregado,
                tipo_registro: pieza.tipo_registro,
                isFiltered
              });
            }
            
            if (isFiltered) {
              return false;
            }
          } else if (filtroIndicador === 'porRecibir' && (diffDays < 0 || diffDays > 3)) {
            return false;
          } else if (filtroIndicador === 'enProceso' && diffDays <= 3) {
            return false;
          }
        } else if (filtroIndicador !== 'total' && !pieza.fecha_promesa) {
          return false;
        }
      }
      
      // Filtro por búsqueda general (incluye número de reporte y orden normalizados)
      if (filtroBusqueda) {
        const searchLower = filtroBusqueda.toLowerCase();
        const searchDigits = extractDigits(filtroBusqueda);
        const reporteDigits = extractDigits(pieza.numero_reporte);
        const ordenDigits = extractDigits(pieza.numero_orden);
        
        // Debug: mostrar comparación para ciertos valores
        if (searchLower === '8553803' || pieza.numero_orden?.includes('8553803')) {
          console.log('Debug pieza:', {
            nombre: pieza.nombre,
            numero_orden: pieza.numero_orden,
            searchLower,
            ordenDigits,
            searchDigits,
            matchesBasic: (
              pieza.nombre?.toLowerCase().includes(searchLower) ||
              pieza.numero_parte?.toLowerCase().includes(searchLower) ||
              pieza.proveedor?.nombre?.toLowerCase().includes(searchLower) ||
              (pieza.numero_orden && pieza.numero_orden.toLowerCase().includes(searchLower))
            ),
            matchesReporte: searchDigits.length >= 4 && (
              reporteDigits.includes(searchDigits) || 
              ordenDigits.includes(searchDigits)
            )
          });
        }
        
        // Coincidencia por nombre, parte, proveedor o número de orden
        const matchesBasic = (
          pieza.nombre?.toLowerCase().includes(searchLower) ||
          pieza.numero_parte?.toLowerCase().includes(searchLower) ||
          pieza.proveedor?.nombre?.toLowerCase().includes(searchLower) ||
          (pieza.numero_orden && pieza.numero_orden.toLowerCase().includes(searchLower))
        );
        
        // Coincidencia por número de reporte u orden (todos los dígitos)
        // Solo aplica si la búsqueda tiene al menos 4 dígitos
        const matchesReporte = searchDigits.length >= 4 && (
          reporteDigits.includes(searchDigits) || 
          ordenDigits.includes(searchDigits)
        );
        
        return matchesBasic || matchesReporte;
      }
      
      return true;
    });
    
    // Ordenamiento
    if (sortColumn) {
      resultado = [...resultado].sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];
        
        // Manejar valores nulos o undefined
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';
        
        // Ordenamiento de fechas
        if (sortColumn.includes('fecha')) {
          const dateA = valA ? new Date(valA).getTime() : 0;
          const dateB = valB ? new Date(valB).getTime() : 0;
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }
        
        // Ordenamiento numérico
        if (sortColumn === 'demeritos' || sortColumn === 'numero_orden') {
          const numA = parseFloat(valA) || 0;
          const numB = parseFloat(valB) || 0;
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }
        
        // Ordenamiento booleano (checkboxes)
        if (typeof valA === 'boolean' && typeof valB === 'boolean') {
          if (valA === valB) return 0;
          const boolCompare = valA ? 1 : -1;
          return sortDirection === 'asc' ? boolCompare : -boolCompare;
        }
        
        // Ordenamiento de texto (case insensitive)
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
        if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return resultado;
  }, [piezas, filtroEstatus, filtroTipo, fuenteActiva, filtroBusqueda, filtroOrden, filtroReporte, filtroRecibido, filtroIndicador, sortColumn, sortDirection]);

  // Paginación
  const totalPages = Math.ceil(piezasFiltradas.length / pageSize);
  const pagedPiezas = piezasFiltradas.slice((page - 1) * pageSize, page * pageSize);
  
  // Computar columnas visibles
  const columnDefMap = useMemo(
    () => Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c])),
    []
  );
  
  const visibleColumns = useMemo(
    () => columnOrder.filter((key) => !hiddenColumns.includes(key)).map((key) => columnDefMap[key]).filter(Boolean),
    [columnOrder, hiddenColumns, columnDefMap]
  );
  
  // Mover columna (drag and drop)
  const moveColumn = (dragKey, targetKey) => {
    if (!dragKey || !targetKey || dragKey === targetKey) return;
    setColumnOrder((prev) => {
      const fromIndex = prev.indexOf(dragKey);
      const toIndex = prev.indexOf(targetKey);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, dragKey);
      return next;
    });
  };
  
  // Toggle visibilidad de columna
  const toggleColumnVisibility = (key) => {
    setHiddenColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };
  
  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setFiltroEstatus('Todos');
    setFiltroTipo('Todos');
    setFiltroRecibido('Todos');
    setFiltroOrden('');
    setFiltroReporte('');
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
    setFiltroIndicador(null);
    setFiltroBusqueda('');
    setPage(1);
  };
  
  // Verificar si hay filtros activos
  const hasActiveFilters = filtroEstatus !== 'Todos' || 
    filtroTipo !== 'Todos' || 
    filtroRecibido !== 'Todos' || 
    filtroOrden || 
    filtroReporte || 
    filtroFechaInicio || 
    filtroFechaFin || 
    filtroIndicador ||
    filtroBusqueda;
  
  // Resetear columnas a valores por defecto
  const resetColumns = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setHiddenColumns(DEFAULT_HIDDEN_COLUMNS);
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
  };
  
  // Función para ordenar columnas
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      // Si ya está ordenada por esta columna, cambiar dirección o quitar orden
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      // Nueva columna de ordenamiento
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
    setPage(1); // Volver a primera página al ordenar
  };
  
  // Funciones para redimensionar columnas
  const handleResizeStart = (e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(parseInt(columnWidths[columnKey] || '100', 10));
  };
  
  useEffect(() => {
    if (!resizingColumn) return;
    
    const handleMouseMove = (e) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(60, resizeStartWidth + diff); // Mínimo 60px
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: `${newWidth}px` }));
    };
    
    const handleMouseUp = () => {
      setResizingColumn(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // Formatear fecha
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
      timeZone: 'America/Mazatlan',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Manejar cambio de ubicación
  const handleUbicacionChange = async (piezaId, nuevaUbicacion) => {
    try {
      const response = await fetch(`${API_BASE}/inventario/piezas/${piezaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ubicacion: nuevaUbicacion })
      });
      
      if (!response.ok) throw new Error('Error al actualizar');
      
      setPiezas(prev => prev.map(p => 
        p.id === piezaId ? { ...p, ubicacion: nuevaUbicacion } : p
      ));
    } catch (err) {
      console.error('Error actualizando ubicación:', err);
      alert('Error al actualizar ubicación');
    }
  };

  // Manejar cambio de checkbox
  const handleCheckboxChange = async (piezaId, campo, valor) => {
    try {
      const response = await fetch(`${API_BASE}/inventario/piezas/${piezaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor })
      });
      
      if (!response.ok) throw new Error('Error al actualizar');
      
      setPiezas(prev => prev.map(p => 
        p.id === piezaId ? { ...p, [campo]: valor } : p
      ));
    } catch (err) {
      console.error('Error actualizando checkbox:', err);
      alert('Error al actualizar');
    }
  };

  // Abrir modal de proveedor
  const openProveedorModal = (proveedor) => {
    setProveedorSeleccionado(proveedor);
    setModalOpen(true);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            showSearch
            searchPlaceholder="Buscar pieza, # parte o proveedor..."
            searchValue={filtroBusqueda}
            onSearchChange={setFiltroBusqueda}
            rightExtras={
              <button
                onClick={fetchPiezas}
                disabled={loading}
                className="p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all"
                title="Recargar datos"
              >
                <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            }
          />
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-3xl">inventory_2</span>
                  Bitácora de Piezas
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Gestión de piezas de Qualitas y Chubb
                </p>
              </div>
              
              {/* Switch de fuentes */}
              <div className="flex items-center gap-2 bg-surface-dark border border-border-dark rounded-lg p-1">
                <button
                  onClick={() => setFuenteActiva('Todas')}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    fuenteActiva === 'Todas'
                      ? 'bg-primary text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setFuenteActiva('Qualitas')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    fuenteActiva === 'Qualitas'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/assets/Qualitas_profile.jpg" alt="Qualitas" className="w-4 h-4 rounded object-cover" />
                  Qualitas
                </button>
                <button
                  onClick={() => setFuenteActiva('Chubb')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    fuenteActiva === 'Chubb'
                      ? 'bg-green-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/assets/CHUBB_profile.jpg" alt="CHUBB" className="w-4 h-4 rounded object-cover" />
                  CHUBB
                </button>
              </div>
            </div>

            {/* Extracción automática de Qualitas - AHORA ARRIBA DE LA TABLA */}
            {fuenteActiva === 'Qualitas' && (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-500">cloud_download</span>
                  Importar desde Qualitas
                </h3>
                <QualitasPiezasExtractor onExtractionComplete={fetchPiezas} />
              </div>
            )}

            {/* Extracción automática de CHUBB */}
            {fuenteActiva === 'Chubb' && (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-500">cloud_download</span>
                  Importar desde CHUBB
                </h3>
                <ChubbPiezasExtractor onExtractionComplete={fetchPiezas} />
              </div>
            )}

            {/* Indicadores */}
            {piezas.length > 0 && (
              <IndicadoresPiezas 
                piezas={piezas} 
                activeFilter={filtroIndicador}
                onFilter={setFiltroIndicador}
              />
            )}

            {/* Leyenda de indicadores */}
            {piezas.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="font-bold text-slate-500">Indicadores:</span>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span>Aún está a más de 3 días de la fecha promesa</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-alert-green"></span>
                  <span>La refacción está a 0 días de cumplir</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-alert-amber"></span>
                  <span>La refacción está a menos de 3 días</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-alert-red"></span>
                  <span>Ya está vencida la fecha promesa</span>
                </div>
              </div>
            )}

            {/* Indicadores de filtros activos */}
            <div className="flex flex-wrap items-center gap-2">
              {filtroIndicador && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Filtro por indicador:</span>
                  <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold flex items-center gap-2">
                    {filtroIndicador.startsWith('estatus:') 
                      ? `Estatus: ${filtroIndicador.replace('estatus:', '')}`
                      : filtroIndicador === 'vencidas' ? 'Piezas Vencidas (no canceladas, entregadas ni reasignadas)'
                      : filtroIndicador === 'porRecibir' ? 'Por Recibir (0-3 días)'
                      : filtroIndicador === 'enProceso' ? 'En Proceso (>3 días)'
                      : 'Todas las piezas'
                    }
                    <button
                      onClick={() => setFiltroIndicador(null)}
                      className="hover:text-white"
                      title="Quitar filtro"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </span>
                </div>
              )}
              
              {filtroRecibido !== 'Todos' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Filtro por recepción:</span>
                  <span className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold flex items-center gap-2">
                    {filtroRecibido === 'Recibidos' ? 'Recibidos' : 'Sin Recepcionar'}
                    <button
                      onClick={() => setFiltroRecibido('Todos')}
                      className="hover:text-white"
                      title="Quitar filtro"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-4 bg-surface-dark border border-border-dark rounded-xl p-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Estatus</span>
                <select
                  value={filtroEstatus}
                  onChange={(e) => {
                    setFiltroEstatus(e.target.value);
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary min-w-[100px]"
                >
                  {ESTATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Tipo</span>
                <select
                  value={filtroTipo}
                  onChange={(e) => {
                    setFiltroTipo(e.target.value);
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary min-w-[140px]"
                >
                  {TIPO_REGISTRO_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              
              {/* Filtro por Recepción */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Recepción</span>
                <select
                  value={filtroRecibido}
                  onChange={(e) => {
                    setFiltroRecibido(e.target.value);
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary min-w-[130px]"
                >
                  <option value="Todos">Todos</option>
                  <option value="Recibidos">Recibidos</option>
                  <option value="SinRecepcionar">Sin Recepcionar</option>
                </select>
              </div>
              
              {/* Filtro por No. Orden */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">No. Orden</span>
                <div className="relative">
                  <input
                    type="text"
                    value={filtroOrden}
                    onChange={(e) => {
                      setFiltroOrden(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Ej: 778"
                    className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary w-28 pr-8"
                  />
                  {filtroOrden && (
                    <button
                      onClick={() => setFiltroOrden('')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded text-slate-400"
                      title="Limpiar"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Filtro por No. Reporte */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">No. Reporte</span>
                <div className="relative">
                  <input
                    type="text"
                    value={filtroReporte}
                    onChange={(e) => {
                      setFiltroReporte(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Ej: 04 0540704"
                    className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary w-36 pr-8"
                  />
                  {filtroReporte && (
                    <button
                      onClick={() => setFiltroReporte('')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded text-slate-400"
                      title="Limpiar"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Filtro por rango de fechas */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Fecha Promesa</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filtroFechaInicio}
                    onChange={(e) => {
                      setFiltroFechaInicio(e.target.value);
                      setPage(1);
                    }}
                    className="bg-background-dark border border-border-dark rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-slate-500">a</span>
                  <input
                    type="date"
                    value={filtroFechaFin}
                    onChange={(e) => {
                      setFiltroFechaFin(e.target.value);
                      setPage(1);
                    }}
                    className="bg-background-dark border border-border-dark rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-primary"
                  />
                  {(filtroFechaInicio || filtroFechaFin) && (
                    <button
                      onClick={() => {
                        setFiltroFechaInicio('');
                        setFiltroFechaFin('');
                        setPage(1);
                      }}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400"
                      title="Limpiar fechas"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-auto">
                {/* Botón para limpiar todos los filtros */}
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
                    title="Limpiar todos los filtros"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Limpiar</span>
                  </button>
                )}
                
                {/* Botón para gestionar columnas */}
                <button
                  onClick={() => setShowColumnManager(!showColumnManager)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    showColumnManager ? 'bg-primary text-white' : 'bg-background-dark text-slate-400 hover:text-white border border-border-dark'
                  }`}
                  title="Configurar columnas"
                >
                  <span className="material-symbols-outlined text-sm">view_column</span>
                  <span>Columnas</span>
                </button>
              </div>
            </div>
            
            {/* Panel de gestión de columnas */}
            {showColumnManager && (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">view_column</span>
                    Configurar Columnas
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetColumns}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-background-dark rounded-lg transition-colors"
                    >
                      Restablecer
                    </button>
                    <button
                      onClick={() => setShowColumnManager(false)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Arrastra columnas para cambiar orden. Arrastra el borde derecho de los headers para redimensionar. Marca/desmarca para ocultar o mostrar.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {columnOrder.map((columnKey) => {
                    const column = columnDefMap[columnKey];
                    if (!column) return null;
                    const visible = !hiddenColumns.includes(columnKey);
                    return (
                      <div
                        key={columnKey}
                        draggable
                        onDragStart={() => setDraggingColumnKey(columnKey)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          moveColumn(draggingColumnKey, columnKey);
                          setDraggingColumnKey(null);
                        }}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-move transition-colors ${
                          visible 
                            ? 'bg-background-dark border-border-dark hover:border-primary/50' 
                            : 'bg-slate-800/50 border-transparent opacity-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs text-slate-500">drag_indicator</span>
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => toggleColumnVisibility(columnKey)}
                          className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-slate-300 truncate">{column.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabla */}
            <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-dark sticky top-0 z-10">
                      <tr className="border-b border-border-dark">
                        {visibleColumns.map((column) => (
                          <th
                            key={`th-${column.key}`}
                            className={`relative px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark select-none ${column.className || ''}`}
                            style={{ width: columnWidths[column.key] || column.width, minWidth: columnWidths[column.key] || column.width }}
                            draggable
                            onDragStart={() => setDraggingColumnKey(column.key)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              moveColumn(draggingColumnKey, column.key);
                              setDraggingColumnKey(null);
                            }}
                            title="Clic para ordenar. Arrastra para cambiar orden. Arrastra el borde derecho para redimensionar."
                          >
                            <div 
                              className="flex items-center justify-between gap-1 cursor-pointer hover:text-white transition-colors"
                              onClick={() => handleSort(column.key)}
                            >
                              <span className="truncate">{column.label}</span>
                              {sortColumn === column.key && (
                                <span className="material-symbols-outlined text-xs">
                                  {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                </span>
                              )}
                            </div>
                            {/* Resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
                              onMouseDown={(e) => handleResizeStart(e, column.key)}
                              onClick={(e) => e.stopPropagation()}
                              title="Arrastra para redimensionar"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={visibleColumns.length || 1} className="px-3 py-8 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                              <span className="material-symbols-outlined animate-spin">refresh</span>
                              <span className="text-sm">Cargando piezas...</span>
                            </div>
                          </td>
                        </tr>
                      ) : pagedPiezas.length === 0 ? (
                        <tr>
                          <td colSpan={visibleColumns.length || 1} className="px-3 py-8 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                              <span className="material-symbols-outlined text-4xl">inventory_2</span>
                              <span className="text-sm">No hay piezas registradas</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        pagedPiezas.map((pieza) => (
                          <tr 
                            key={pieza.id} 
                            className="border-b border-border-dark/50 hover:bg-white/5 transition-colors"
                          >
                            {visibleColumns.map((column) => {
                              const cellClass = `px-3 py-2 text-xs ${column.className || 'text-slate-300'}`;
                              const cellStyle = { width: columnWidths[column.key] || column.width, minWidth: columnWidths[column.key] || column.width };
                              
                              switch (column.key) {
                                case 'tipo':
                                  return (
                                    <td key={column.key} className={cellClass} style={cellStyle}>
                                      <TipoRegistroBadge tipo={pieza.tipo_registro} />
                                    </td>
                                  );
                                case 'nombre':
                                  return (
                                    <td key={column.key} className={`${cellClass} truncate`} style={cellStyle} title={pieza.nombre}>
                                      <span className="text-white">{pieza.nombre}</span>
                                    </td>
                                  );
                                case 'origen':
                                  return <td key={column.key} className={cellClass} style={cellStyle}>{pieza.origen}</td>;
                                case 'numero_parte':
                                  return <td key={column.key} className={`${cellClass} font-mono`} style={cellStyle}>{pieza.numero_parte}</td>;
                                case 'numero_orden':
                                  return <td key={column.key} className={`${cellClass} font-mono`} style={cellStyle}>{pieza.numero_orden}</td>;
                                case 'numero_reporte':
                                  return (
                                    <td key={column.key} className={`${cellClass} truncate`} style={cellStyle} title={pieza.numero_reporte}>
                                      {pieza.numero_reporte}
                                    </td>
                                  );
                                case 'observaciones':
                                  return (
                                    <td key={column.key} className={`${cellClass} truncate text-slate-400`} style={cellStyle} title={pieza.observaciones}>
                                      {pieza.observaciones || '-'}
                                    </td>
                                  );
                                case 'proveedor':
                                  return (
                                    <td key={column.key} className={cellClass} style={cellStyle}>
                                      <ProveedorCell 
                                        proveedor={pieza.proveedor} 
                                        onClickInfo={() => openProveedorModal(pieza.proveedor)}
                                      />
                                    </td>
                                  );
                                case 'paqueteria':
                                  return (
                                    <td key={column.key} className={cellClass} style={cellStyle}>
                                      <PaqueteriaCell 
                                        paqueteria={pieza.paqueteria} 
                                        guia={pieza.guia_paqueteria}
                                      />
                                    </td>
                                  );
                                case 'fecha_promesa':
                                  return <td key={column.key} className={cellClass} style={cellStyle}>{formatDate(pieza.fecha_promesa)}</td>;
                                case 'demeritos':
                                  return <td key={column.key} className={cellClass} style={cellStyle}>${pieza.demeritos.toLocaleString()}</td>;
                                case 'estatus':
                                  return (
                                    <td key={column.key} className={cellClass} style={cellStyle}>
                                      <EstatusBadge estatus={pieza.estatus} />
                                    </td>
                                  );
                                case 'fecha_estatus':
                                  return <td key={column.key} className={cellClass} style={cellStyle}>{formatDate(pieza.fecha_estatus)}</td>;
                                case 'ubicacion':
                                  return (
                                    <td key={column.key} className={cellClass} style={cellStyle}>
                                      <select
                                        value={pieza.ubicacion}
                                        onChange={(e) => handleUbicacionChange(pieza.id, e.target.value)}
                                        className="bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                                      >
                                        {UBICACIONES.map(ub => (
                                          <option key={ub} value={ub}>{ub}</option>
                                        ))}
                                      </select>
                                    </td>
                                  );
                                case 'devolucion_proveedor':
                                  return (
                                    <td key={column.key} className={`${cellClass} text-center`} style={cellStyle}>
                                      <input
                                        type="checkbox"
                                        checked={pieza.devolucion_proveedor}
                                        onChange={(e) => handleCheckboxChange(pieza.id, 'devolucion_proveedor', e.target.checked)}
                                        className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                                      />
                                    </td>
                                  );
                                case 'recibido':
                                  return (
                                    <td key={column.key} className={`${cellClass} text-center`} style={cellStyle}>
                                      <input
                                        type="checkbox"
                                        checked={pieza.recibido}
                                        onChange={(e) => handleCheckboxChange(pieza.id, 'recibido', e.target.checked)}
                                        className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                                        title="Recibido según Scrapper (RPA)"
                                      />
                                    </td>
                                  );
                                case 'recibido_sistema':
                                  return (
                                    <td key={column.key} className={`${cellClass} text-center`} style={cellStyle}>
                                      <input
                                        type="checkbox"
                                        checked={pieza.recibido_sistema}
                                        disabled
                                        className="w-4 h-4 rounded border-border-dark bg-slate-600 text-primary cursor-not-allowed opacity-70"
                                        title="Recibido en Sistema (Paquetes) - Se sincroniza automáticamente"
                                      />
                                    </td>
                                  );
                                case 'entregado':
                                  return (
                                    <td key={column.key} className={`${cellClass} text-center`} style={cellStyle}>
                                      <input
                                        type="checkbox"
                                        checked={pieza.entregado}
                                        onChange={(e) => handleCheckboxChange(pieza.id, 'entregado', e.target.checked)}
                                        className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                                      />
                                    </td>
                                  );
                                case 'portal':
                                  return (
                                    <td key={column.key} className={`${cellClass} text-center`} style={cellStyle}>
                                      <input
                                        type="checkbox"
                                        checked={pieza.portal}
                                        onChange={(e) => handleCheckboxChange(pieza.id, 'portal', e.target.checked)}
                                        className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                                      />
                                    </td>
                                  );
                                default:
                                  return <td key={column.key} className={cellClass} style={cellStyle}>-</td>;
                              }
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación */}
              {!loading && piezasFiltradas.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border-dark">
                  <p className="text-xs text-slate-400">
                    Mostrando {pagedPiezas.length} de {piezasFiltradas.length} registros
                    {fuenteActiva !== 'Todas' && ` (${fuenteActiva})`}
                  </p>
                  <div className="flex items-center gap-4">
                    {/* Selector de cantidad de registros */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Mostrar:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="bg-background-dark border border-border-dark rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
                      >
                        {pageSizeOptions.map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Controles de paginación */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded border border-border-dark text-xs disabled:opacity-40 hover:bg-slate-700 transition-colors text-slate-300"
                      >
                        Anterior
                      </button>
                      <span className="text-xs text-slate-400">
                        Página {page} de {totalPages || 1}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || totalPages === 0}
                        className="px-3 py-1.5 rounded border border-border-dark text-xs disabled:opacity-40 hover:bg-slate-700 transition-colors text-slate-300"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      
      {/* Modal de Proveedor */}
      <ProveedorModal
        proveedor={proveedorSeleccionado}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
