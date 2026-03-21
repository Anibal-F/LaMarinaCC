import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";

// Modal de Asignacion
function AsignarModal({ record, isOpen, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Catalogos
  const [paquetes, setPaquetes] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [estaciones, setEstaciones] = useState([]);
  const [etapas, setEtapas] = useState([]);
  
  // Selecciones
  const [selectedPaquete, setSelectedPaquete] = useState("");
  const [selectedPaqueteObj, setSelectedPaqueteObj] = useState(null);
  const [suggestedPaquete, setSuggestedPaquete] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]); // [{etapa_id, personal_id, estacion_id}]
  
  // Búsqueda de paquetes
  const [paqueteSearch, setPaqueteSearch] = useState("");
  const [paqueteDropdownOpen, setPaqueteDropdownOpen] = useState(false);
  const paqueteSearchRef = useRef(null);

  // Resetear estados cuando se cierra el modal
  useEffect(() => {
    if (!isOpen) {
      setPaqueteSearch("");
      setSelectedPaquete("");
      setSelectedPaqueteObj(null);
      setSuggestedPaquete(null);
      setPaqueteDropdownOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !record) return;
    
    const loadCatalogs = async () => {
      try {
        setLoading(true);
        setError("");
        
        // Cargar paquetes SIN ASIGNAR (sin orden_admision_id) - disponibles para asignar
        // Incluir tanto RECIBIDO como COMPLETADO
        const [paquetesRes, personalRes, estacionesRes, etapasRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/inventario/paquetes?sin_asignar=true&limit=500`),
          fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/personal`),
          fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/estaciones`),
          fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`)
        ]);
        
        const paquetesData = paquetesRes.ok ? await paquetesRes.json() : [];
        const personalData = personalRes.ok ? await personalRes.json() : [];
        const estacionesData = estacionesRes.ok ? await estacionesRes.json() : [];
        const etapasData = etapasRes.ok ? await etapasRes.json() : [];
        
        const paquetesList = Array.isArray(paquetesData.items) ? paquetesData.items : Array.isArray(paquetesData) ? paquetesData : [];
        // Filtrar solo paquetes sin orden_admision_id (sin asignar)
        const paquetesSinAsignar = paquetesList.filter(p => !p.orden_admision_id && !p.folio_ot);
        setPaquetes(paquetesSinAsignar);
        setPersonal(Array.isArray(personalData) ? personalData : []);
        setEstaciones(Array.isArray(estacionesData) ? estacionesData : []);
        setEtapas(Array.isArray(etapasData) ? etapasData.filter(e => e.activo !== false).sort((a,b) => (a.orden||0)-(b.orden||0)) : []);
        
        // Buscar paquete sugerido por número de reporte/siniestro (solo entre los sin asignar)
        const reporteSiniestro = record?.folio_seguro || record?.numero_reporte_siniestro;
        if (reporteSiniestro && paquetesSinAsignar.length > 0) {
          const sugerido = paquetesSinAsignar.find(p => 
            p.numero_reporte_siniestro && 
            p.numero_reporte_siniestro.toLowerCase() === reporteSiniestro.toLowerCase()
          );
          if (sugerido) {
            setSuggestedPaquete(sugerido);
            setSelectedPaquete(String(sugerido.id));
            setSelectedPaqueteObj(sugerido);
            setPaqueteSearch(`${sugerido.folio_paquete} - ${sugerido.numero_reporte_siniestro}`);
          }
        }
        
        // Inicializar asignaciones vacías por etapa
        const initialAsignaciones = (Array.isArray(etapasData) ? etapasData.filter(e => e.activo !== false) : [])
          .sort((a,b) => (a.orden||0)-(b.orden||0))
          .map(etapa => ({
            etapa_id: etapa.id,
            etapa_nombre: etapa.nb_etapa,
            personal_id: "",
            estacion_id: ""
          }));
        setAsignaciones(initialAsignaciones);
        
      } catch (err) {
        setError("Error cargando catalogos: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    loadCatalogs();
  }, [isOpen, record]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (paqueteSearchRef.current && !paqueteSearchRef.current.contains(event.target)) {
        setPaqueteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAsignacionChange = (etapaId, field, value) => {
    setAsignaciones(prev => prev.map(a => 
      a.etapa_id === etapaId ? { ...a, [field]: value } : a
    ));
  };

  const handleSave = async () => {
    if (!record) return;
    
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      
      // 1. Asignar paquete si se seleccionó
      if (selectedPaquete) {
        const paqueteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/inventario/paquetes/${selectedPaquete}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orden_admision_id: record.id,
              folio_ot: record.folio_ot || record.folio_recep
            })
          }
        );
        if (!paqueteResponse.ok) {
          const err = await paqueteResponse.json().catch(() => null);
          throw new Error(err?.detail || "Error asignando paquete");
        }
      }
      
      // 2. Asignar personal y estaciones por etapa (ignorando recepcion y entrega)
      const etapasSinAsignacion = ['recepcionado', 'recepcion', 'entrega'];
      const asignacionesValidas = asignaciones.filter(a => {
        const claveEtapa = etapas.find(e => e.id === a.etapa_id)?.clave || '';
        const sinAsignacion = etapasSinAsignacion.includes(claveEtapa.toLowerCase());
        return !sinAsignacion && (a.personal_id || a.estacion_id);
      });
      
      for (const asig of asignacionesValidas) {
        // Obtener la etapa operativa de la OT
        const otStageResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/taller/ordenes/${record.id}/etapas`
        );
        if (!otStageResponse.ok) continue;
        
        const otStages = await otStageResponse.json();
        const targetStage = otStages.find(s => s.etapa_id === asig.etapa_id);
        if (!targetStage) continue;
        
        const updatePayload = {};
        if (asig.personal_id) updatePayload.personal_id_responsable = parseInt(asig.personal_id);
        if (asig.estacion_id) updatePayload.estacion_id = parseInt(asig.estacion_id);
        
        if (Object.keys(updatePayload).length > 0) {
          const updateResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/taller/ordenes/${record.id}/etapas/${targetStage.etapa_id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updatePayload)
            }
          );
          if (!updateResponse.ok) {
            console.error("Error actualizando etapa", asig.etapa_id);
          }
        }
      }
      
      setSuccess("Asignacion guardada correctamente");
      setTimeout(() => {
        onSaved?.();
        onClose();
      }, 1000);
      
    } catch (err) {
      setError(err.message || "Error guardando asignaciones");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-dark bg-background-dark/50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Asignar Recursos</h2>
            <p className="text-sm text-slate-400 mt-1">
              OT #{record?.folio_recep || record?.id} - {record?.vehiculo || "Vehiculo"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
              Cargando catalogos...
            </div>
          ) : (
            <>
              {/* Paquete de Piezas */}
              <section className="rounded-xl border border-border-dark bg-background-dark/30 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary mb-4">
                  <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                  Paquete de Piezas
                  {suggestedPaquete && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-alert-green/20 px-2 py-0.5 text-[10px] font-bold text-alert-green">
                      <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                      Sugerido
                    </span>
                  )}
                </h3>
                
                {suggestedPaquete && (
                  <div className="mb-3 rounded-lg bg-alert-green/10 border border-alert-green/30 p-3">
                    <p className="text-xs text-alert-green flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Se encontró un paquete asociado al reporte <strong>{record?.folio_seguro}</strong>
                    </p>
                  </div>
                )}
                
                {/* Searchable Dropdown para Paquetes */}
                <div className="relative" ref={paqueteSearchRef}>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                      search
                    </span>
                    <input
                      type="text"
                      value={paqueteSearch}
                      onChange={(e) => {
                        setPaqueteSearch(e.target.value);
                        setPaqueteDropdownOpen(true);
                        // Limpiar selección si el usuario borra
                        if (!e.target.value.trim()) {
                          setSelectedPaquete("");
                          setSelectedPaqueteObj(null);
                          setSuggestedPaquete(null);
                        }
                      }}
                      onFocus={() => setPaqueteDropdownOpen(true)}
                      placeholder="Buscar paquete por folio o número de reporte..."
                      className="w-full rounded-lg border border-border-dark bg-background-dark pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500"
                    />
                    {paqueteSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaqueteSearch("");
                          setSelectedPaquete("");
                          setSelectedPaqueteObj(null);
                          setSuggestedPaquete(null);
                          setPaqueteDropdownOpen(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Dropdown de resultados */}
                  {paqueteDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-border-dark bg-surface-dark shadow-xl">
                      {paquetes.filter(p => {
                        const search = paqueteSearch.toLowerCase();
                        return (
                          !search ||
                          p.folio_paquete?.toLowerCase().includes(search) ||
                          p.numero_reporte_siniestro?.toLowerCase().includes(search)
                        );
                      }).length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400">
                          {paqueteSearch ? "No se encontraron paquetes" : "Escribe para buscar paquetes..."}
                        </div>
                      ) : (
                        paquetes
                          .filter(p => {
                            const search = paqueteSearch.toLowerCase();
                            return (
                              !search ||
                              p.folio_paquete?.toLowerCase().includes(search) ||
                              p.numero_reporte_siniestro?.toLowerCase().includes(search)
                            );
                          })
                          .slice(0, 50)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedPaquete(String(p.id));
                                setSelectedPaqueteObj(p);
                                setPaqueteSearch(`${p.folio_paquete} - ${p.numero_reporte_siniestro}`);
                                setPaqueteDropdownOpen(false);
                                // Si no es el sugerido, quitar la marca
                                if (suggestedPaquete?.id !== p.id) {
                                  setSuggestedPaquete(null);
                                }
                              }}
                              className={`w-full px-4 py-3 text-left text-sm hover:bg-white/5 transition-colors border-b border-border-dark last:border-0 ${
                                selectedPaquete === String(p.id) ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-bold text-white">{p.folio_paquete}</span>
                                  <span className="text-slate-400 ml-2">-</span>
                                  <span className="text-slate-300 ml-2">{p.numero_reporte_siniestro}</span>
                                  <span className="text-slate-500 ml-2">({p.total_piezas} piezas)</span>
                                </div>
                                {suggestedPaquete?.id === p.id && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-alert-green/20 px-2 py-0.5 text-[10px] font-bold text-alert-green">
                                    <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                    Sugerido
                                  </span>
                                )}
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
                
                {/* Info del paquete seleccionado */}
                {selectedPaqueteObj && (
                  <div className="mt-3 rounded-lg bg-primary/10 border border-primary/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-primary font-bold">Paquete seleccionado:</p>
                        <p className="text-sm text-white">
                          {selectedPaqueteObj.folio_paquete} - {selectedPaqueteObj.numero_reporte_siniestro}
                        </p>
                        <p className="text-xs text-slate-400">{selectedPaqueteObj.total_piezas} piezas</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPaquete("");
                          setSelectedPaqueteObj(null);
                          setPaqueteSearch("");
                          setSuggestedPaquete(null);
                        }}
                        className="text-slate-400 hover:text-alert-red"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Asignaciones por Etapa */}
              <section className="rounded-xl border border-border-dark bg-background-dark/30 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary mb-4">
                  <span className="material-symbols-outlined text-[18px]">engineering</span>
                  Asignacion por Etapa
                </h3>
                
                <div className="space-y-3">
                  {asignaciones.map((asig) => {
                    // Etapas que no requieren tecnico ni estacion
                    const etapasSinAsignacion = ['recepcionado', 'recepcion', 'entrega'];
                    const claveEtapa = etapas.find(e => e.id === asig.etapa_id)?.clave || '';
                    const sinAsignacion = etapasSinAsignacion.includes(claveEtapa.toLowerCase());
                    
                    return (
                      <div 
                        key={asig.etapa_id}
                        className={`grid grid-cols-1 gap-3 p-3 rounded-lg border border-border-dark bg-surface-dark ${sinAsignacion ? 'md:grid-cols-1' : 'md:grid-cols-3'}`}
                      >
                        <div className="flex items-center gap-2 text-white font-medium">
                          <span className="material-symbols-outlined text-slate-500">flag</span>
                          {asig.etapa_nombre}
                          {sinAsignacion && (
                            <span className="ml-2 text-[10px] text-slate-500 italic">(Sin asignacion requerida)</span>
                          )}
                        </div>
                        {!sinAsignacion && (
                          <>
                            <select
                              value={asig.personal_id}
                              onChange={(e) => handleAsignacionChange(asig.etapa_id, 'personal_id', e.target.value)}
                              className="rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                            >
                              <option value="">Sin tecnico</option>
                              {personal
                                .filter(p => p.etapa_id === asig.etapa_id)
                                .map(p => (
                                  <option key={p.id} value={p.id}>{p.nb_personal}</option>
                                ))}
                            </select>
                            <select
                              value={asig.estacion_id}
                              onChange={(e) => handleAsignacionChange(asig.etapa_id, 'estacion_id', e.target.value)}
                              className="rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                            >
                              <option value="">Sin estacion</option>
                              {estaciones
                                .filter(e => {
                                  const area = etapas.find(et => et.id === asig.etapa_id)?.areas?.find(a => a.id === e.area_id);
                                  return area || e.area_etapa_id === asig.etapa_id;
                                })
                                .map(e => (
                                  <option key={e.id} value={e.id}>{e.nb_estacion}</option>
                                ))}
                            </select>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {error ? (
                <div className="rounded-lg bg-alert-red/10 border border-alert-red/30 p-3 text-sm text-alert-red flex items-center gap-2">
                  <span className="material-symbols-outlined">error</span>
                  {error}
                </div>
              ) : null}
              
              {success ? (
                <div className="rounded-lg bg-alert-green/10 border border-alert-green/30 p-3 text-sm text-alert-green flex items-center gap-2">
                  <span className="material-symbols-outlined">check_circle</span>
                  {success}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-dark bg-background-dark/50 px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-dark px-4 py-2 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                Guardando...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                Guardar Asignacion
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 8;
function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(String(value).replace(" ", "T"));
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function formatIngreso(value) {
  const date = parseDate(value);
  if (!date) return { dateText: "-", timeText: "" };
  return {
    dateText: new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date),
    timeText: new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date)
  };
}

function daysInShop(value) {
  const date = parseDate(value);
  if (!date) return 0;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor(diffMs / dayMs));
}

function dayBadgeClasses(days) {
  if (days >= 4) return "bg-alert-red/20 text-alert-red animate-pulse";
  if (days >= 2) return "bg-alert-amber/20 text-alert-amber";
  return "bg-alert-green/20 text-alert-green";
}

function insurerTagClasses(seguro) {
  const normalized = String(seguro || "").toLowerCase();
  if (normalized.includes("qualitas")) return "bg-violet-500/10 text-violet-300 border-violet-500/30";
  if (normalized.includes("axa")) return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  if (normalized.includes("mapfre")) return "bg-red-500/10 text-red-300 border-red-500/30";
  if (normalized.includes("hdi")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  return "bg-primary/10 text-primary border-primary/30";
}

export default function Taller() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [photoByRecord, setPhotoByRecord] = useState({});
  
  // Modal de asignacion
  const [asignarModalOpen, setAsignarModalOpen] = useState(false);
  const [asignarRecord, setAsignarRecord] = useState(null);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/dashboard/autos-en-sitio`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el listado de taller.");
      }
      const payload = await response.json();
      const recepcionados = Array.isArray(payload) ? payload : [];
      setRecords(recepcionados);
      setPage(1);
    } catch (err) {
      setError(err.message || "No se pudo cargar el listado de taller.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;

    return records.filter((record) => {
      const folio = String(record.folio_recep || "").toLowerCase();
      const placa = String(record.placas || "").toLowerCase();
      const vehiculo = String(record.vehiculo || "").toLowerCase();
      const cliente = String(record.nb_cliente || "").toLowerCase();
      const seguro = String(record.seguro || "").toLowerCase();
      return (
        folio.includes(normalized) ||
        placa.includes(normalized) ||
        vehiculo.includes(normalized) ||
        cliente.includes(normalized) ||
        seguro.includes(normalized)
      );
    });
  }, [records, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    const recordsWithoutPhoto = pagedRecords.filter((record) => photoByRecord[record.id] === undefined);
    if (recordsWithoutPhoto.length === 0) return;

    let active = true;

    const loadThumbs = async () => {
      const results = await Promise.all(
        recordsWithoutPhoto.map(async (record) => {
          try {
            const mediaResponse = await fetch(
              `${import.meta.env.VITE_API_URL}/recepcion/registros/${record.id}/media`
            );
            const media = mediaResponse.ok ? await mediaResponse.json() : [];
            const firstPhoto = (Array.isArray(media) ? media : []).find((item) =>
              String(item.media_type || "").startsWith("photo")
            );
            if (firstPhoto?.file_path) {
              return [record.id, resolveMediaUrl(firstPhoto.file_path)];
            }

            const reportId = String(record.folio_seguro || "").trim();
            if (!reportId) {
              return [record.id, null];
            }

            const expedienteResponse = await fetch(
              `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(reportId)}`
            );
            if (!expedienteResponse.ok) {
              return [record.id, null];
            }
            const expedienteData = await expedienteResponse.json();
            const expedientePhoto = (Array.isArray(expedienteData?.archivos) ? expedienteData.archivos : []).find(
              (item) => {
                const tipo = String(item.tipo || "").toLowerCase();
                const path = String(item.archivo_path || "").toLowerCase();
                const mime = String(item.mime_type || "").toLowerCase();
                return (
                  (tipo === "recepcion_foto" || tipo === "valuacion_foto" || tipo === "archivorecepcion_vehiculo") &&
                  (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => path.endsWith(ext)))
                );
              }
            );
            return [
              record.id,
              expedientePhoto?.archivo_path ? resolveMediaUrl(expedientePhoto.archivo_path) : null
            ];
          } catch {
            return [record.id, null];
          }
        })
      );

      if (!active) return;
      setPhotoByRecord((prev) => {
        const next = { ...prev };
        results.forEach(([id, photoUrl]) => {
          next[id] = photoUrl;
        });
        return next;
      });
    };

    loadThumbs();
    return () => {
      active = false;
    };
  }, [pagedRecords, photoByRecord]);

  const todayReceived = useMemo(() => {
    const now = new Date();
    return records.filter((record) => {
      const date = parseDate(record.fecha_recep);
      if (!date) return false;
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    }).length;
  }, [records]);

  const pendingAssign = useMemo(
    () =>
      records.filter((record) => {
        return !record.personal_responsable || !record.estacion_actual;
      }).length,
    [records]
  );

  const delayedCount = useMemo(
    () => records.filter((record) => daysInShop(record.fecha_recep) >= 4).length,
    [records]
  );

  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Autos en Sitio"
            subtitle="Vehiculos recepcionados activos dentro del modulo de taller."
            showSearch={false}
            actions={
              <>
                <Link
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                  to="/recepcion/nuevo"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nueva recepcion
                </Link>
                <button
                  className="bg-surface-dark hover:bg-primary/20 text-white p-2.5 rounded-lg border border-border-dark transition-colors"
                  title="Actualizar lista"
                  type="button"
                  onClick={loadRecords}
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Recibidos hoy</p>
                <p className="text-3xl font-black text-white mt-2">{todayReceived}</p>
              </article>
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pendientes de asignar</p>
                <p className="text-3xl font-black text-white mt-2">{pendingAssign}</p>
              </article>
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">En retraso</p>
                <p className="text-3xl font-black text-white mt-2">{delayedCount}</p>
              </article>
            </div>

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <section className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <div className="p-4 border-b border-border-dark flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                    search
                  </span>
                  <input
                    className="w-full bg-background-dark border-border-dark rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500"
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por folio, placa, vehiculo o cliente..."
                  />
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-background-dark/50 border-b border-border-dark">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foto</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vehiculo</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Placa</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aseguradora</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingreso</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Dias taller</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-sm text-slate-400">
                          Cargando vehiculos recepcionados...
                        </td>
                      </tr>
                    ) : null}
                    {!loading && filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-sm text-slate-400">
                          No hay vehiculos recepcionados para mostrar.
                        </td>
                      </tr>
                    ) : null}
                    {!loading &&
                      pagedRecords.map((record) => {
                        const ingreso = formatIngreso(record.fecha_recep);
                        const days = daysInShop(record.fecha_recep);
                        const photo = photoByRecord[record.id];
                        const delayed = days >= 4;

                        return (
                          <tr
                            key={record.id}
                            className={`hover:bg-white/5 transition-colors ${
                              delayed ? "bg-alert-red/5 border-l-2 border-l-alert-red" : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-mono text-xs font-bold text-white">
                              #{record.folio_recep || record.id}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-10 w-16 rounded bg-background-dark border border-border-dark overflow-hidden">
                                {photo ? (
                                  <img src={photo} alt={record.vehiculo || "vehiculo"} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                                    <span className="material-symbols-outlined text-sm">directions_car</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                             <p className="text-sm font-semibold text-white">{record.vehiculo || "-"}</p>
                              <p className="text-[11px] text-slate-400">
                                {[
                                  record.etapa_actual_nombre || "Sin etapa",
                                  record.personal_responsable || "Sin responsable",
                                  record.estacion_actual || "Sin estacion"
                                ].join(" - ")}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs font-mono uppercase text-slate-300">
                              {record.placas || "-"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${insurerTagClasses(
                                  record.seguro
                                )}`}
                              >
                                {record.seguro || "Sin seguro"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300">
                              <p>{ingreso.dateText}</p>
                              {ingreso.timeText ? <p className="text-slate-500">{ingreso.timeText}</p> : null}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${dayBadgeClasses(
                                  days
                                )}`}
                              >
                                {days}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!record.personal_responsable && !record.estacion_actual ? (
                                  <button
                                    className="bg-alert-amber/20 text-alert-amber hover:bg-alert-amber/30 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 uppercase tracking-wide"
                                    type="button"
                                    onClick={() => {
                                      setAsignarRecord(record);
                                      setAsignarModalOpen(true);
                                    }}
                                  >
                                    <span className="material-symbols-outlined text-sm">assignment_ind</span>
                                    Asignar
                                  </button>
                                ) : (
                                  <button
                                    className="text-primary hover:text-white hover:bg-primary/20 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 uppercase tracking-wide"
                                    type="button"
                                    onClick={() => navigate(`/taller/autos-en-sitio/${record.id}`, { state: { record } })}
                                  >
                                    Gestionar
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-border-dark bg-background-dark/30 flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-bold tracking-wide">
                  Mostrando {rangeStart} a {rangeEnd} de {filtered.length} resultados
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                    onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                    disabled={page >= pageCount}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
      
      <AsignarModal
        record={asignarRecord}
        isOpen={asignarModalOpen}
        onClose={() => {
          setAsignarModalOpen(false);
          setAsignarRecord(null);
        }}
        onSaved={() => {
          loadRecords();
          setAsignarRecord(null);
        }}
      />
    </div>
  );
}
