import { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../components/Sidebar.jsx';
import AppHeader from '../../components/AppHeader.jsx';
import QualitasPiezasExtractor from '../../components/QualitasPiezasExtractor.jsx';

// URL base de la API
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

const API_BASE = getApiUrl();

// Opciones de ubicación
const UBICACIONES = ['ND', 'ALMACEN', 'PENDIENTE', 'TALLER', 'ENTREGADO'];

// Estatus posibles
const ESTATUS_OPTIONS = ['Todos', 'En Proceso', 'Pendiente', 'Cancelada', 'Entregado', 'Recibido'];

// Tipos de registro
const TIPO_REGISTRO_OPTIONS = ['Todos', 'Proceso de Surtido', 'Reasignada/Cancelada'];

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
  const nombreLimpio = cleanProveedorNombre(proveedor.nombre);
  const isContactPlaceholder = !proveedor.nombre || proveedor.nombre === 'Sin Asignar' || proveedor.nombre.includes('CONTACT');
  
  // Si es un placeholder tipo CONTACT_, mostrar solo ícono de info
  if (isContactPlaceholder) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClickInfo();
        }}
        className="flex items-center gap-2 p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors group"
        title="Ver información del proveedor"
      >
        <span className="material-symbols-outlined text-lg text-slate-400 group-hover:text-blue-400 transition-colors">
          info
        </span>
        <span className="text-xs text-slate-500">Info</span>
      </button>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 truncate max-w-[120px]" title={nombreLimpio}>
        {proveedor.id_externo || proveedor.id} {nombreLimpio}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Aquí iría la funcionalidad de chat
          }}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Chat con proveedor"
        >
          <span className="material-symbols-outlined text-sm text-slate-400 hover:text-primary">
            chat
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClickInfo();
          }}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Ver información"
        >
          <span className="material-symbols-outlined text-sm text-slate-400 hover:text-primary">
            contact_info
          </span>
        </button>
      </div>
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
          // Fecha promesa ya pasó
          vencidas++;
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
      desc: 'Fecha promesa vencida',
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
      
      {/* Indicadores por estatus */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {estatusPrincipales.map((estatus) => {
          const count = indicadores.porEstatus[estatus] || 0;
          if (count === 0) return null;
          
          const estatusColors = {
            'En Proceso': 'blue',
            'Pendiente': 'amber',
            'Cancelada': 'red',
            'Entregado': 'green',
            'Recibido': 'purple'
          };
          
          const color = estatusColors[estatus] || 'slate';
          const colors = colorClasses[color];
          const isActive = activeFilter === `estatus:${estatus}`;
          
          return (
            <button
              key={estatus}
              onClick={() => handleEstatusClick(estatus)}
              className={`bg-surface-dark border ${isActive ? colors.border : colors.border + '/30'} rounded-lg p-3 transition-all hover:border-${color}-500/50 text-left cursor-pointer ${isActive ? colors.bg : ''} ${isActive ? 'ring-1 ring-' + color : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] ${isActive ? 'text-white' : 'text-slate-400'}`}>{estatus}</span>
                <span className={`text-lg font-bold ${colors.text}`}>{count}</span>
              </div>
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

  // Cargar piezas desde la API
  useEffect(() => {
    fetchPiezas();
  }, [filtroEstatus, filtroTipo, fuenteActiva, filtroFechaInicio, filtroFechaFin]);

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
        observaciones: p.observaciones,
        proveedor: {
          id: p.proveedor_id_externo,
          nombre: p.proveedor_nombre,
          email: p.proveedor_email,
          celular: p.proveedor_celular
        },
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

  // Filtrar piezas
  const piezasFiltradas = useMemo(() => {
    return piezas.filter(pieza => {
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
      
      // Filtro por número de reporte
      if (filtroReporte && pieza.numero_reporte) {
        if (!pieza.numero_reporte.toLowerCase().includes(filtroReporte.toLowerCase())) {
          return false;
        }
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
          
          if (filtroIndicador === 'vencidas' && diffDays >= 0) {
            return false;
          } else if (filtroIndicador === 'porRecibir' && (diffDays < 0 || diffDays > 3)) {
            return false;
          } else if (filtroIndicador === 'enProceso' && diffDays <= 3) {
            return false;
          }
        } else if (filtroIndicador !== 'total' && !pieza.fecha_promesa) {
          return false;
        }
      }
      
      // Filtro por búsqueda general
      if (filtroBusqueda) {
        const searchLower = filtroBusqueda.toLowerCase();
        return (
          pieza.nombre.toLowerCase().includes(searchLower) ||
          pieza.numero_parte.toLowerCase().includes(searchLower) ||
          pieza.proveedor.nombre.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });
  }, [piezas, filtroEstatus, filtroTipo, fuenteActiva, filtroBusqueda, filtroReporte, filtroIndicador]);

  // Paginación
  const totalPages = Math.ceil(piezasFiltradas.length / pageSize);
  const pagedPiezas = piezasFiltradas.slice((page - 1) * pageSize, page * pageSize);

  // Formatear fecha
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
            onSearch={setFiltroBusqueda}
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
                  disabled
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold text-slate-600 cursor-not-allowed"
                  title="Próximamente"
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

            {/* Indicadores */}
            {piezas.length > 0 && (
              <IndicadoresPiezas 
                piezas={piezas} 
                activeFilter={filtroIndicador}
                onFilter={setFiltroIndicador}
              />
            )}

            {/* Indicador de filtro activo */}
            {filtroIndicador && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Filtro activo:</span>
                <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold flex items-center gap-2">
                  {filtroIndicador.startsWith('estatus:') 
                    ? `Estatus: ${filtroIndicador.replace('estatus:', '')}`
                    : filtroIndicador === 'vencidas' ? 'Piezas Vencidas'
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

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-4 bg-surface-dark border border-border-dark rounded-xl p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Estatus:</span>
                <select
                  value={filtroEstatus}
                  onChange={(e) => {
                    setFiltroEstatus(e.target.value);
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                >
                  {ESTATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Tipo:</span>
                <select
                  value={filtroTipo}
                  onChange={(e) => {
                    setFiltroTipo(e.target.value);
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                >
                  {TIPO_REGISTRO_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              
              {/* Filtro por No. Reporte */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">No. Reporte:</span>
                <input
                  type="text"
                  value={filtroReporte}
                  onChange={(e) => {
                    setFiltroReporte(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Ej: 04 0540704"
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary w-36"
                />
                {filtroReporte && (
                  <button
                    onClick={() => setFiltroReporte('')}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400"
                    title="Limpiar"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>
              
              {/* Filtro por rango de fechas */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Fecha Promesa:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filtroFechaInicio}
                    onChange={(e) => {
                      setFiltroFechaInicio(e.target.value);
                      setPage(1);
                    }}
                    className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-slate-500">a</span>
                  <input
                    type="date"
                    value={filtroFechaFin}
                    onChange={(e) => {
                      setFiltroFechaFin(e.target.value);
                      setPage(1);
                    }}
                    className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
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
                <span className="text-xs text-slate-400">Mostrar:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                >
                  {pageSizeOptions.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabla */}
            <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-dark sticky top-0 z-10">
                      <tr className="border-b border-border-dark">
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Tipo</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Nombre</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Origen</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark"># Parte</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Orden</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Reporte</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Observaciones</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Proveedor</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Paquetería</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Fecha Promesa</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Deméritos</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Estatus</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Fecha Estatus</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark">Ubicación</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark text-center">Dev. Prov.</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark text-center">Recibido</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark text-center">Entregado</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase bg-surface-dark text-center">Portal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={18} className="px-3 py-8 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                              <span className="material-symbols-outlined animate-spin">refresh</span>
                              <span className="text-sm">Cargando piezas...</span>
                            </div>
                          </td>
                        </tr>
                      ) : pagedPiezas.length === 0 ? (
                        <tr>
                          <td colSpan={18} className="px-3 py-8 text-center">
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
                            <td className="px-3 py-2">
                              <TipoRegistroBadge tipo={pieza.tipo_registro} />
                            </td>
                            <td className="px-3 py-2 text-xs text-white max-w-[150px] truncate" title={pieza.nombre}>
                              {pieza.nombre}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-300">{pieza.origen}</td>
                            <td className="px-3 py-2 text-xs text-slate-300 font-mono">{pieza.numero_parte}</td>
                            <td className="px-3 py-2 text-xs text-slate-300 font-mono">{pieza.numero_orden}</td>
                            <td className="px-3 py-2 text-xs text-slate-300 max-w-[120px] truncate" title={pieza.numero_reporte}>
                              {pieza.numero_reporte}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400 max-w-[100px] truncate" title={pieza.observaciones}>
                              {pieza.observaciones || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <ProveedorCell 
                                proveedor={pieza.proveedor} 
                                onClickInfo={() => openProveedorModal(pieza.proveedor)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <PaqueteriaCell 
                                paqueteria={pieza.paqueteria} 
                                guia={pieza.guia_paqueteria}
                              />
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-300">{formatDate(pieza.fecha_promesa)}</td>
                            <td className="px-3 py-2 text-xs text-slate-300">
                              ${pieza.demeritos.toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <EstatusBadge estatus={pieza.estatus} />
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-300">{formatDate(pieza.fecha_estatus)}</td>
                            <td className="px-3 py-2">
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
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={pieza.devolucion_proveedor}
                                onChange={(e) => handleCheckboxChange(pieza.id, 'devolucion_proveedor', e.target.checked)}
                                className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={pieza.recibido}
                                onChange={(e) => handleCheckboxChange(pieza.id, 'recibido', e.target.checked)}
                                className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={pieza.entregado}
                                onChange={(e) => handleCheckboxChange(pieza.id, 'entregado', e.target.checked)}
                                className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={pieza.portal}
                                onChange={(e) => handleCheckboxChange(pieza.id, 'portal', e.target.checked)}
                                className="w-4 h-4 rounded border-border-dark bg-background-dark text-primary focus:ring-primary"
                              />
                            </td>
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
              )}
            </div>

            {/* Leyenda de indicadores (como en Qualitas) */}
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
