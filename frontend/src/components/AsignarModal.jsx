import { useEffect, useMemo, useRef, useState } from "react";

export default function AsignarModal({ record, isOpen, onClose, onSaved }) {
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
  const [asignaciones, setAsignaciones] = useState([]);
  
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
        
        const paquetesSinAsignar = paquetesList.filter(p => !p.folio_ot);
        setPaquetes(paquetesSinAsignar);
        setPersonal(Array.isArray(personalData) ? personalData : []);
        setEstaciones(Array.isArray(estacionesData) ? estacionesData : []);
        setEtapas(Array.isArray(etapasData) ? etapasData.filter(e => e.activo !== false).sort((a,b) => (a.orden||0)-(b.orden||0)) : []);
        
        // Buscar paquete sugerido por número de reporte/siniestro
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
            setPaqueteSearch(`${sugerido.folio} - ${sugerido.numero_reporte_siniestro}`);
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

  // Cerrar modal con tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
      
      // 2. Asignar personal y estaciones por etapa
      const etapasSinAsignacion = ['recepcionado', 'recepcion', 'entrega'];
      const asignacionesValidas = asignaciones.filter(a => {
        const claveEtapa = etapas.find(e => e.id === a.etapa_id)?.clave || '';
        const sinAsignacion = etapasSinAsignacion.includes(claveEtapa.toLowerCase());
        return !sinAsignacion && (a.personal_id || a.estacion_id);
      });
      
      for (const asig of asignacionesValidas) {
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

  const vehicleTitle = useMemo(() => {
    return (
      [record?.vehiculo_marca, record?.vehiculo_modelo, record?.vehiculo_anio].filter(Boolean).join(" ") ||
      record?.vehiculo ||
      "Vehiculo"
    );
  }, [record]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-dark bg-background-dark/50 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Asignar Recursos</h2>
            <p className="text-sm text-slate-400 mt-1">
              OT #{record?.folio_recep || record?.id} - {vehicleTitle}
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
                          p.folio?.toLowerCase().includes(search) ||
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
                              p.folio?.toLowerCase().includes(search) ||
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
                                setPaqueteSearch(`${p.folio} - ${p.numero_reporte_siniestro}`);
                                setPaqueteDropdownOpen(false);
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
                                  <span className="font-bold text-white">{p.folio}</span>
                                  <span className="text-slate-400 ml-2">-</span>
                                  <span className="text-slate-300 ml-2">{p.numero_reporte_siniestro}</span>
                                  <span className="text-slate-500 ml-2">({p.piezas_count || p.total_piezas || 0} piezas)</span>
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
                          {selectedPaqueteObj.folio} - {selectedPaqueteObj.numero_reporte_siniestro}
                        </p>
                        <p className="text-xs text-slate-400">{selectedPaqueteObj.piezas_count || selectedPaqueteObj.total_piezas || 0} piezas</p>
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
