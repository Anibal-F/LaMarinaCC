import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const tabs = [
  { id: "evidencia", label: "Evidencia", icon: "photo_library" },
  { id: "presupuesto", label: "Presupuesto", icon: "request_quote" },
  { id: "comparativa", label: "Comparativa", icon: "balance" }
];

const evidenceCategories = [
  { id: "frontal", label: "Frontal", icon: "directions_car" },
  { id: "trasera", label: "Trasera", icon: "settings_backup_restore" },
  { id: "lateral_izquierdo", label: "Lateral Izquierdo", icon: "chevron_left" },
  { id: "lateral_derecho", label: "Lateral Derecho", icon: "chevron_right" },
  { id: "interior", label: "Interior", icon: "airline_seat_recline_extra" },
  { id: "motor", label: "Motor", icon: "engineering" },
  { id: "otros", label: "Otros", icon: "more_horiz" }
];

const annotationShapes = [
  { id: "square", label: "Cuadrado", icon: "crop_square" },
  { id: "circle", label: "Circulo", icon: "circle" },
  { id: "arrow", label: "Flecha", icon: "trending_flat" },
  { id: "line", label: "Linea", icon: "horizontal_rule" }
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function buildVehiculoTitle(record) {
  if (!record) return "Vehiculo";
  if (record.vehiculo) return record.vehiculo;
  return [record.marca_vehiculo, record.modelo_anio, record.tipo_vehiculo, record.color_vehiculo]
    .filter(Boolean)
    .join(" ");
}

function detectCategory(item) {
  const explicit = String(item?.categoria || "")
    .trim()
    .toLowerCase();
  if (explicit && evidenceCategories.some((category) => category.id === explicit)) {
    return explicit;
  }
  const raw = `${item?.archivo_nombre || ""} ${item?.archivo_path || item?.path || ""}`.toLowerCase();
  if (raw.includes("frontal")) return "frontal";
  if (raw.includes("trasera")) return "trasera";
  if (raw.includes("izquierd")) return "lateral_izquierdo";
  if (raw.includes("derech")) return "lateral_derecho";
  if (raw.includes("interior")) return "interior";
  if (raw.includes("motor")) return "motor";
  return "otros";
}

function evidenceTag(item) {
  const raw = `${item?.archivo_nombre || ""} ${item?.archivo_path || item?.path || ""}`.toLowerCase();
  if (raw.includes("preexist")) {
    return { label: "Preexistente", classes: "bg-blue-600/90 border-blue-500/60 text-white" };
  }
  return { label: "Siniestro", classes: "bg-red-600/90 border-red-500/60 text-white" };
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}

function filePreviewUrl(item) {
  const relativePath = item?.archivo_path || item?.path || "";
  if (!relativePath) return "";
  if (/^https?:\/\//.test(relativePath)) return relativePath;
  return `${import.meta.env.VITE_API_URL}${relativePath}`;
}

export default function ValuarVehiculo() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [record, setRecord] = useState(location.state?.record || null);
  const [loading, setLoading] = useState(!record);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("evidencia");

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [evidenceActionError, setEvidenceActionError] = useState("");
  const [deletingEvidenceId, setDeletingEvidenceId] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("frontal");
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = useState(0);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [selectedShape, setSelectedShape] = useState("square");
  const [annotationsByEvidence, setAnnotationsByEvidence] = useState({});
  const [activeAnnotationId, setActiveAnnotationId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const stageRef = useRef(null);

  const [aseguradoras, setAseguradoras] = useState([]);
  const [aseguradoraActiva, setAseguradoraActiva] = useState("");
  const [autorizadoAseguradora, setAutorizadoAseguradora] = useState(8700);
  const [observacionesValuacion, setObservacionesValuacion] = useState("");
  const [savingValuacion, setSavingValuacion] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    if (record || !id) return;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${import.meta.env.VITE_API_URL}/valuacion/vehiculos`);
        if (!response.ok) {
          throw new Error("No se pudo cargar la unidad.");
        }
        const payload = await response.json();
        const selected = payload.find((item) => String(item.id) === String(id));
        if (!selected) {
          throw new Error("Unidad no encontrada.");
        }
        setRecord(selected);
      } catch (err) {
        setError(err.message || "No se pudo cargar la unidad.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [record, id]);

  useEffect(() => {
    if (!record?.reporte_siniestro) return;
    const loadExpediente = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            record.reporte_siniestro
          )}`
        );
        if (!response.ok) return;
        const data = await response.json();
        setExpedienteFiles(data?.archivos || []);
      } catch {
        // ignore
      }
    };
    loadExpediente();
  }, [record?.reporte_siniestro]);

  useEffect(() => {
    if (!record?.id) return;
    const loadValuacion = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/valuacion/ordenes/${record.id}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (data?.aseguradora_activa) setAseguradoraActiva(data.aseguradora_activa);
        if (typeof data?.autorizado_aseguradora === "number") {
          setAutorizadoAseguradora(data.autorizado_aseguradora);
        }
        if (data?.observaciones) setObservacionesValuacion(data.observaciones);
        if (Array.isArray(data?.detalle) && data.detalle.length) {
          setOperations(
            data.detalle.map((item) => ({
              id: item.id || crypto.randomUUID(),
              tipo: item.tipo,
              descripcion: item.descripcion,
              monto: Number(item.monto || 0)
            }))
          );
        }
      } catch {
        // ignore
      }
    };
    loadValuacion();
  }, [record?.id]);

  useEffect(() => {
    const loadAseguradoras = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`);
        if (!response.ok) return;
        const data = await response.json();
        setAseguradoras(data || []);
      } catch {
        // ignore
      }
    };
    loadAseguradoras();
  }, []);

  useEffect(() => {
    if (record?.seguro_comp) {
      setAseguradoraActiva(record.seguro_comp);
    }
  }, [record?.seguro_comp]);

  const vehiculoTitle = useMemo(() => buildVehiculoTitle(record), [record]);
  const valuacionFotos = useMemo(
    () => expedienteFiles.filter((item) => item.tipo === "valuacion_foto"),
    [expedienteFiles]
  );

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(evidenceCategories.map((item) => [item.id, 0]));
    valuacionFotos.forEach((item) => {
      const key = detectCategory(item);
      counts[key] = (counts[key] || 0) + 1;
    });

    // Si no hay coincidencias por nombre, concentramos en frontal para evitar vacios.
    const total = Object.values(counts).reduce((acc, value) => acc + value, 0);
    if (!total && valuacionFotos.length) {
      counts.frontal = valuacionFotos.length;
    }
    return counts;
  }, [valuacionFotos]);

  const visibleEvidence = useMemo(() => {
    if (!valuacionFotos.length) return [];
    if (selectedCategory === "frontal" && !categoryCounts.frontal) {
      return valuacionFotos;
    }
    return valuacionFotos.filter((item) => detectCategory(item) === selectedCategory);
  }, [valuacionFotos, selectedCategory, categoryCounts.frontal]);

  useEffect(() => {
    setSelectedEvidenceIndex(0);
  }, [selectedCategory]);

  useEffect(() => {
    if (!visibleEvidence.length) {
      setSelectedEvidenceIndex(0);
      return;
    }
    if (selectedEvidenceIndex > visibleEvidence.length - 1) {
      setSelectedEvidenceIndex(visibleEvidence.length - 1);
    }
  }, [visibleEvidence, selectedEvidenceIndex]);

  const selectedEvidence = visibleEvidence[selectedEvidenceIndex] || null;
  const selectedEvidenceKey =
    selectedEvidence?.archivo_path || selectedEvidence?.path || selectedEvidence?.archivo_nombre || "";
  const currentAnnotations = useMemo(
    () => annotationsByEvidence[selectedEvidenceKey] || [],
    [annotationsByEvidence, selectedEvidenceKey]
  );

  useEffect(() => {
    setActiveAnnotationId(null);
    setDragState(null);
    setShapeMenuOpen(false);
    setAnnotationMode(false);
  }, [selectedEvidenceKey]);

  const montoPorTipo = useMemo(() => {
    return operations.reduce(
      (acc, item) => {
        const amount = Number(item.monto) || 0;
        if (item.tipo === "MO") acc.mo += amount;
        if (item.tipo === "SUST") acc.sust += amount;
        if (item.tipo === "BYD") acc.byd += amount;
        return acc;
      },
      { mo: 0, sust: 0, byd: 0 }
    );
  }, [operations]);

  const subtotal = montoPorTipo.mo + montoPorTipo.sust + montoPorTipo.byd;
  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  const autorizado = autorizadoAseguradora || 0;
  const diferencia = total - autorizado;

  const handleSaveValuacion = async () => {
    if (!record?.id) return;
    setSavingValuacion(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/valuacion/ordenes/${record.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aseguradora_activa: aseguradoraActiva,
            autorizado_aseguradora: Number(autorizadoAseguradora || 0),
            observaciones: observacionesValuacion,
            detalle: operations.map((item) => ({
              tipo: item.tipo,
              descripcion: item.descripcion,
              monto: Number(item.monto || 0)
            }))
          })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar la valuacion");
      }
      setRecord((prev) => (prev ? { ...prev, estatus: "Borrador" } : prev));
      setSaveSuccess("Valuacion guardada en borrador.");
    } catch (err) {
      setSaveError(err.message || "No se pudo guardar la valuacion");
    } finally {
      setSavingValuacion(false);
    }
  };

  const handleUploadEvidencia = async (event) => {
    if (!record?.reporte_siniestro) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploadError("");
    setEvidenceActionError("");
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("tipo", "valuacion_foto");
        formData.append("categoria", selectedCategory || "otros");
        formData.append("file", file);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            record.reporte_siniestro
          )}/archivos`,
          { method: "POST", body: formData }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir la evidencia.");
        }
        const uploaded = await response.json().catch(() => null);
        if (uploaded) {
          setUploadedFiles((prev) => [uploaded, ...prev]);
          setExpedienteFiles((prev) => [uploaded, ...prev]);
        }
      }
      event.target.value = "";
    } catch (err) {
      setUploadError(err.message || "No se pudo subir la evidencia.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteEvidence = async (item, event) => {
    event?.stopPropagation();
    if (!item?.id) {
      setEvidenceActionError("No se pudo identificar el archivo a eliminar.");
      return;
    }
    const confirmed = window.confirm("¿Eliminar esta fotografia de la galeria?");
    if (!confirmed) return;

    setEvidenceActionError("");
    setDeletingEvidenceId(item.id);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/expedientes/archivos/${item.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar la evidencia.");
      }

      const evidenceKey = item?.archivo_path || item?.path || item?.archivo_nombre || "";
      if (evidenceKey) {
        setAnnotationsByEvidence((prev) => {
          if (!prev[evidenceKey]) return prev;
          const next = { ...prev };
          delete next[evidenceKey];
          return next;
        });
      }
      setExpedienteFiles((prev) => prev.filter((file) => String(file.id) !== String(item.id)));
      setUploadedFiles((prev) => prev.filter((file) => String(file.id) !== String(item.id)));
    } catch (err) {
      setEvidenceActionError(err.message || "No se pudo eliminar la evidencia.");
    } finally {
      setDeletingEvidenceId(null);
    }
  };

  const nextEvidence = () => {
    if (!visibleEvidence.length) return;
    setSelectedEvidenceIndex((prev) => (prev + 1) % visibleEvidence.length);
  };

  const prevEvidence = () => {
    if (!visibleEvidence.length) return;
    setSelectedEvidenceIndex((prev) =>
      prev === 0 ? visibleEvidence.length - 1 : prev - 1
    );
  };

  const updateCurrentAnnotations = (updater) => {
    if (!selectedEvidenceKey) return;
    setAnnotationsByEvidence((prev) => {
      const existing = prev[selectedEvidenceKey] || [];
      const next = typeof updater === "function" ? updater(existing) : updater;
      return { ...prev, [selectedEvidenceKey]: next };
    });
  };

  const handleStageClick = (event) => {
    if (!annotationMode || !selectedEvidenceKey || !stageRef.current) return;
    const target = event.target;
    if (target.closest("[data-annotation-item='true']")) return;

    const rect = stageRef.current.getBoundingClientRect();
    const clickX = ((event.clientX - rect.left) / rect.width) * 100;
    const clickY = ((event.clientY - rect.top) / rect.height) * 100;
    const defaults = {
      square: { w: 14, h: 14, label: "Nuevo cuadrado" },
      circle: { w: 14, h: 14, label: "Nuevo circulo" },
      arrow: { w: 18, h: 8, label: "Nueva flecha" },
      line: { w: 20, h: 4, label: "Nueva linea" }
    };
    const shapeDefaults = defaults[selectedShape] || defaults.square;
    const maxX = 100 - shapeDefaults.w;
    const maxY = 100 - shapeDefaults.h;
    const annotation = {
      id: crypto.randomUUID(),
      type: selectedShape,
      label: shapeDefaults.label,
      x: clamp(clickX - shapeDefaults.w / 2, 0, maxX),
      y: clamp(clickY - shapeDefaults.h / 2, 0, maxY),
      w: shapeDefaults.w,
      h: shapeDefaults.h
    };

    updateCurrentAnnotations((existing) => [...existing, annotation]);
    setActiveAnnotationId(annotation.id);
  };

  const beginMoveAnnotation = (event, annotationId) => {
    event.preventDefault();
    event.stopPropagation();
    const annotation = currentAnnotations.find((item) => item.id === annotationId);
    if (!annotation || !stageRef.current) return;

    setActiveAnnotationId(annotationId);
    setDragState({
      mode: "move",
      annotationId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAnnotation: { ...annotation }
    });
  };

  const beginResizeAnnotation = (event, annotationId) => {
    event.preventDefault();
    event.stopPropagation();
    const annotation = currentAnnotations.find((item) => item.id === annotationId);
    if (!annotation || !stageRef.current) return;

    setActiveAnnotationId(annotationId);
    setDragState({
      mode: "resize",
      annotationId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAnnotation: { ...annotation }
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (event) => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const dxPct = ((event.clientX - dragState.startClientX) / rect.width) * 100;
      const dyPct = ((event.clientY - dragState.startClientY) / rect.height) * 100;

      updateCurrentAnnotations((existing) =>
        existing.map((item) => {
          if (item.id !== dragState.annotationId) return item;

          if (dragState.mode === "move") {
            const nextX = clamp(dragState.startAnnotation.x + dxPct, 0, 100 - item.w);
            const nextY = clamp(dragState.startAnnotation.y + dyPct, 0, 100 - item.h);
            return { ...item, x: nextX, y: nextY };
          }

          const minSize = 3;
          const rawW = clamp(dragState.startAnnotation.w + dxPct, minSize, 100 - item.x);
          const rawH = clamp(dragState.startAnnotation.h + dyPct, minSize, 100 - item.y);

          if (item.type === "square" || item.type === "circle") {
            const edge = clamp(
              Math.max(rawW, rawH),
              minSize,
              Math.min(100 - item.x, 100 - item.y)
            );
            return { ...item, w: edge, h: edge };
          }

          return { ...item, w: rawW, h: rawH };
        })
      );
    };

    const onMouseUp = () => setDragState(null);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, selectedEvidenceKey]);

  const activeAnnotation = currentAnnotations.find((item) => item.id === activeAnnotationId) || null;

  const updateActiveAnnotationLabel = (value) => {
    if (!activeAnnotationId) return;
    updateCurrentAnnotations((existing) =>
      existing.map((item) =>
        item.id === activeAnnotationId ? { ...item, label: value } : item
      )
    );
  };

  const removeActiveAnnotation = () => {
    if (!activeAnnotationId) return;
    updateCurrentAnnotations((existing) =>
      existing.filter((item) => item.id !== activeAnnotationId)
    );
    setActiveAnnotationId(null);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AppHeader
            title="Valuacion del vehiculo"
            subtitle="Panel de evidencia, presupuesto y comparativa con aseguradora."
            showSearch={false}
            actions={
              <>
                <div className="hidden md:flex flex-col items-end border-r border-border-dark pr-4 mr-1">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    Expediente
                  </span>
                  <span className="text-sm font-black text-white">
                    {record?.reporte_siniestro || "Sin folio"}
                  </span>
                </div>
                <button
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-primary/20"
                  type="button"
                  onClick={handleSaveValuacion}
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {savingValuacion ? "Guardando..." : "Guardar cambios"}
                </button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {loading ? <p className="text-sm text-slate-400">Cargando valuacion...</p> : null}
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            {!loading && !error && record ? (
              <div className="space-y-4">
                <section className="border border-border-dark bg-surface-dark rounded-xl px-4 py-4">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-black text-white leading-none">{vehiculoTitle}</h1>
                      <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide">
                        Cliente: {record.nb_cliente || "-"} | Placas: {record.placas || "-"} |
                        Serie: {record.serie_auto || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-background-dark/80 rounded-lg border border-border-dark p-1">
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === tab.id
                              ? "bg-primary text-white"
                              : "text-slate-400 hover:text-white hover:bg-surface-dark"
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {saveError ? <p className="text-xs text-alert-red mt-3">{saveError}</p> : null}
                  {saveSuccess ? <p className="text-xs text-alert-green mt-3">{saveSuccess}</p> : null}
                </section>

                {activeTab === "evidencia" ? (
                  <section className="grid grid-cols-12 gap-4 min-h-[68vh]">
                    <aside className="col-span-12 xl:col-span-3 bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                      <div className="p-4 space-y-6 h-full overflow-y-auto custom-scrollbar">
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                            Captura de datos
                          </h3>
                          <label
                            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-dark px-4 py-8 text-center text-sm text-slate-400 hover:border-primary/60 hover:text-slate-200 transition-colors cursor-pointer bg-background-dark/40"
                            htmlFor="valuacion-evidencia"
                          >
                            <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                            <span className="text-xs font-black uppercase tracking-wider text-white">
                              Cargar fotografias
                            </span>
                            <span className="text-[11px]">Arrastra archivos o haz clic aqui</span>
                            {uploading ? (
                              <span className="text-[10px] text-primary">Subiendo archivos...</span>
                            ) : null}
                            <input
                              id="valuacion-evidencia"
                              className="hidden"
                              type="file"
                              accept=".jpg,.jpeg,.png"
                              multiple
                              onChange={handleUploadEvidencia}
                            />
                          </label>
                          <button
                            type="button"
                            className="w-full mt-3 flex items-center justify-center gap-2 bg-white text-slate-900 py-3 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-all"
                          >
                            <span className="material-symbols-outlined text-base">photo_camera</span>
                            Tomar foto
                          </button>
                          {uploadError ? (
                            <span className="text-[11px] text-alert-red mt-2 block">{uploadError}</span>
                          ) : null}
                          {evidenceActionError ? (
                            <span className="text-[11px] text-alert-red mt-2 block">{evidenceActionError}</span>
                          ) : null}
                          {uploadedFiles.length ? (
                            <p className="mt-2 text-[10px] text-slate-400">
                              Cargadas en esta sesion: {uploadedFiles.length}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                            Categorizacion
                          </h3>
                          <div className="grid grid-cols-1 gap-2">
                            {evidenceCategories.map((category) => {
                              const isActive = selectedCategory === category.id;
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => setSelectedCategory(category.id)}
                                  className={`flex items-center justify-between p-3 rounded border text-xs font-bold transition-colors ${
                                    isActive
                                      ? "bg-primary/20 border-primary text-white"
                                      : "bg-background-dark/30 border-border-dark text-slate-400 hover:text-white hover:border-primary/50"
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">{category.icon}</span>
                                    {category.label}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] ${
                                      isActive ? "bg-primary" : "bg-border-dark text-slate-300"
                                    }`}
                                  >
                                    {categoryCounts[category.id] || 0}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </aside>

                    <section className="col-span-12 xl:col-span-6 bg-background-dark border border-border-dark rounded-xl p-5 relative flex flex-col items-center justify-center">
                      {visibleEvidence.length ? (
                        <>
                          <button
                            type="button"
                            onClick={prevEvidence}
                            className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-surface-dark/80 hover:bg-primary rounded-full border border-border-dark transition-all z-10"
                          >
                            <span className="material-symbols-outlined">chevron_left</span>
                          </button>
                          <button
                            type="button"
                            onClick={nextEvidence}
                            className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-surface-dark/80 hover:bg-primary rounded-full border border-border-dark transition-all z-10"
                          >
                            <span className="material-symbols-outlined">chevron_right</span>
                          </button>

                          <div
                            ref={stageRef}
                            onClick={handleStageClick}
                            className={`relative w-full max-w-3xl aspect-[4/3] bg-surface-dark rounded-lg overflow-hidden border border-border-dark ${annotationMode ? "cursor-crosshair" : "cursor-default"}`}
                          >
                            <img
                              src={filePreviewUrl(selectedEvidence)}
                              alt={selectedEvidence?.archivo_nombre || "Evidencia"}
                              className="w-full h-full object-cover"
                            />

                            <div className="absolute inset-0">
                              {currentAnnotations.map((annotation) => {
                                const isActive = annotation.id === activeAnnotationId;
                                return (
                                  <div
                                    key={annotation.id}
                                    data-annotation-item="true"
                                    onMouseDown={(event) => beginMoveAnnotation(event, annotation.id)}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveAnnotationId(annotation.id);
                                    }}
                                    className={`absolute select-none ${isActive ? "z-20" : "z-10"}`}
                                    style={{
                                      left: `${annotation.x}%`,
                                      top: `${annotation.y}%`,
                                      width: `${annotation.w}%`,
                                      height: `${annotation.h}%`
                                    }}
                                  >
                                    {annotation.type === "square" ? (
                                      <div
                                        className={`w-full h-full border-2 ${isActive ? "border-amber-400" : "border-red-500/80"}`}
                                      />
                                    ) : null}
                                    {annotation.type === "circle" ? (
                                      <div
                                        className={`w-full h-full rounded-full border-2 ${isActive ? "border-amber-400" : "border-red-500/80"}`}
                                      />
                                    ) : null}
                                    {annotation.type === "line" ? (
                                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <line
                                          x1="2"
                                          y1="50"
                                          x2="98"
                                          y2="50"
                                          stroke={isActive ? "#f59e0b" : "#ef4444"}
                                          strokeWidth="8"
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                    ) : null}
                                    {annotation.type === "arrow" ? (
                                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <defs>
                                          <marker
                                            id={`arrow-head-${annotation.id}`}
                                            markerWidth="10"
                                            markerHeight="7"
                                            refX="9"
                                            refY="3.5"
                                            orient="auto"
                                          >
                                            <polygon
                                              points="0 0, 10 3.5, 0 7"
                                              fill={isActive ? "#f59e0b" : "#ef4444"}
                                            />
                                          </marker>
                                        </defs>
                                        <line
                                          x1="2"
                                          y1="50"
                                          x2="96"
                                          y2="50"
                                          stroke={isActive ? "#f59e0b" : "#ef4444"}
                                          strokeWidth="8"
                                          markerEnd={`url(#arrow-head-${annotation.id})`}
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                    ) : null}

                                    <span
                                      className={`absolute -top-6 left-0 text-[10px] font-black px-1.5 py-0.5 rounded border uppercase whitespace-nowrap ${isActive ? "bg-amber-500 text-white border-amber-400" : "bg-red-500/90 text-white border-red-400/70"}`}
                                    >
                                      {annotation.label || "Sin nombre"}
                                    </span>

                                    <button
                                      type="button"
                                      onMouseDown={(event) => beginResizeAnnotation(event, annotation.id)}
                                      onClick={(event) => event.stopPropagation()}
                                      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-sm border ${isActive ? "bg-amber-400 border-amber-300" : "bg-red-500 border-red-400"}`}
                                      title="Redimensionar"
                                    />
                                  </div>
                                );
                              })}
                            </div>

                            {activeAnnotation ? (
                              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-surface-dark/95 border border-border-dark rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg max-w-[92%]">
                                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                                  Nombre
                                </span>
                                <input
                                  className="w-44 bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white"
                                  value={activeAnnotation.label || ""}
                                  onChange={(event) => updateActiveAnnotationLabel(event.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                  placeholder="Ej: Dano defensa"
                                />
                              </div>
                            ) : null}

                            {shapeMenuOpen ? (
                              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-surface-dark/95 border border-border-dark rounded-lg p-2 shadow-xl flex items-center gap-2">
                                {annotationShapes.map((shape) => (
                                  <button
                                    key={shape.id}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedShape(shape.id);
                                      setAnnotationMode(true);
                                    }}
                                    className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-1 ${selectedShape === shape.id ? "bg-primary text-white" : "text-slate-300 hover:text-white hover:bg-background-dark"}`}
                                  >
                                    <span className="material-symbols-outlined text-sm">{shape.icon}</span>
                                    {shape.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-dark/90 backdrop-blur-md px-4 py-2 rounded-full border border-border-dark flex items-center gap-5 shadow-xl z-30">
                              <button type="button" className="text-white hover:text-amber-400 transition-colors">
                                <span className="material-symbols-outlined text-xl">zoom_in</span>
                              </button>
                              <button type="button" className="text-white hover:text-amber-400 transition-colors">
                                <span className="material-symbols-outlined text-xl">zoom_out</span>
                              </button>
                              <div className="w-px h-6 bg-border-dark"></div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShapeMenuOpen((prev) => !prev);
                                  setAnnotationMode(true);
                                }}
                                className={`${shapeMenuOpen || annotationMode ? "text-amber-400" : "text-white hover:text-amber-400"} transition-colors`}
                                title="Anotar"
                              >
                                <span className="material-symbols-outlined text-xl">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeActiveAnnotation();
                                }}
                                className="text-white hover:text-alert-red transition-colors"
                                title="Eliminar anotacion"
                              >
                                <span className="material-symbols-outlined text-xl">delete</span>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 text-center">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded border bg-red-500/20 border-red-500/30 text-red-400 uppercase">
                                {evidenceTag(selectedEvidence).label}
                              </span>
                              <span className="text-xs font-bold text-white uppercase tracking-wider">
                                {selectedEvidence?.archivo_nombre || `foto_${selectedEvidenceIndex + 1}.jpg`}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Evidencia {selectedEvidenceIndex + 1} de {visibleEvidence.length}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full min-h-[360px] rounded-lg border border-dashed border-border-dark bg-surface-dark/40 flex flex-col items-center justify-center text-center p-6">
                          <span className="material-symbols-outlined text-5xl text-slate-500 mb-2">image</span>
                          <p className="text-sm text-slate-300 font-bold uppercase tracking-wider">
                            Sin evidencia para esta categoria
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Cambia de categoria o carga nuevas fotografias.
                          </p>
                        </div>
                      )}
                    </section>

                    <aside className="col-span-12 xl:col-span-3 bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                      <div className="p-4 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                            Galeria de evidencia
                          </h3>
                          <span className="text-[10px] text-slate-500">
                            {visibleEvidence.length} archivos
                          </span>
                        </div>
                        {visibleEvidence.length ? (
                          <div className="grid grid-cols-2 gap-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
                            {visibleEvidence.map((item, index) => {
                              const badge = evidenceTag(item);
                              const selected = index === selectedEvidenceIndex;
                              return (
                                <div
                                  key={item.archivo_path || item.path || item.archivo_nombre || index}
                                  className={`relative aspect-square rounded-lg border overflow-hidden text-left ${
                                    selected
                                      ? "border-primary ring-2 ring-primary/50"
                                      : "border-border-dark hover:border-primary/50"
                                  }`}
                                  onClick={() => setSelectedEvidenceIndex(index)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedEvidenceIndex(index);
                                    }
                                  }}
                                  title={item.archivo_nombre || "Evidencia"}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <img
                                    alt={item.archivo_nombre || "Evidencia"}
                                    className="w-full h-full object-cover"
                                    src={filePreviewUrl(item)}
                                  />
                                  <span
                                    className={`absolute top-2 left-2 text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${badge.classes}`}
                                  >
                                    {badge.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteEvidence(item, event)}
                                    disabled={deletingEvidenceId === item.id}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-white/20 text-white hover:bg-red-600/90 transition-colors disabled:opacity-60 flex items-center justify-center"
                                    title="Eliminar evidencia"
                                  >
                                    <span className="material-symbols-outlined text-sm">
                                      {deletingEvidenceId === item.id ? "hourglass_empty" : "delete"}
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-center border border-dashed border-border-dark rounded-lg bg-background-dark/40 p-4">
                            <p className="text-xs text-slate-500">No hay imagenes en esta categoria.</p>
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t border-border-dark text-[10px] text-slate-400 uppercase font-bold tracking-widest flex items-center justify-between">
                          <span>Total de evidencias</span>
                          <span className="text-white">{valuacionFotos.length} archivos</span>
                        </div>
                      </div>
                    </aside>
                  </section>
                ) : null}

                {activeTab === "presupuesto" ? (
                  <section className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 xl:col-span-8 bg-surface-dark border border-border-dark rounded-xl p-4 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                          Lista de operaciones
                        </h3>
                        <button
                          className="flex items-center gap-1 bg-primary px-3 py-2 rounded text-[10px] font-black uppercase tracking-wider"
                          type="button"
                          onClick={() =>
                            setOperations((prev) => [
                              ...prev,
                              { id: crypto.randomUUID(), tipo: "MO", descripcion: "", monto: 0 }
                            ])
                          }
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Anadir operacion
                        </button>
                      </div>

                      <div className="overflow-x-auto border border-border-dark rounded-lg bg-background-dark/50">
                        <table className="w-full min-w-[720px] text-left">
                          <thead className="bg-background-dark/80">
                            <tr>
                              <th className="text-[10px] font-bold uppercase p-3 text-slate-400">Tipo</th>
                              <th className="text-[10px] font-bold uppercase p-3 text-slate-400">Descripcion</th>
                              <th className="text-[10px] font-bold uppercase p-3 text-slate-400 text-right">Monto</th>
                              <th className="text-[10px] font-bold uppercase p-3 text-slate-400 text-right">Accion</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs">
                            {operations.length ? (
                              operations.map((item) => (
                                <tr key={item.id} className="border-t border-border-dark">
                                  <td className="p-3 w-28">
                                    <select
                                      className="w-full bg-surface-dark border border-border-dark rounded px-2 py-1 text-[10px] text-white"
                                      value={item.tipo}
                                      onChange={(event) =>
                                        setOperations((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id ? { ...row, tipo: event.target.value } : row
                                          )
                                        )
                                      }
                                    >
                                      <option value="SUST">SUST</option>
                                      <option value="MO">MO</option>
                                      <option value="BYD">BYD</option>
                                    </select>
                                  </td>
                                  <td className="p-3">
                                    <input
                                      className="w-full bg-surface-dark border border-border-dark rounded px-2 py-1 text-[11px] text-white"
                                      value={item.descripcion}
                                      onChange={(event) =>
                                        setOperations((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id
                                              ? { ...row, descripcion: event.target.value }
                                              : row
                                          )
                                        )
                                      }
                                      placeholder="Descripcion de operacion"
                                    />
                                  </td>
                                  <td className="p-3 text-right w-40">
                                    <input
                                      type="number"
                                      className="w-full bg-surface-dark border border-border-dark rounded px-2 py-1 text-[11px] text-white text-right"
                                      value={item.monto}
                                      onChange={(event) =>
                                        setOperations((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id
                                              ? { ...row, monto: Number(event.target.value || 0) }
                                              : row
                                          )
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="p-3 text-right w-24">
                                    <button
                                      type="button"
                                      className="text-slate-400 hover:text-alert-red"
                                      onClick={() =>
                                        setOperations((prev) => prev.filter((row) => row.id !== item.id))
                                      }
                                    >
                                      <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="4" className="p-10 text-center text-slate-500 text-sm">
                                  Aun no hay operaciones capturadas.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <aside className="col-span-12 xl:col-span-4 bg-surface-dark border border-border-dark rounded-xl p-5 flex flex-col">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-5">
                        Resumen de presupuesto
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center pb-2 border-b border-border-dark">
                          <span className="text-slate-400">Mano de Obra (MO)</span>
                          <span className="font-bold text-white">{formatCurrency(montoPorTipo.mo)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-border-dark">
                          <span className="text-slate-400">Refacciones (SUST)</span>
                          <span className="font-bold text-white">{formatCurrency(montoPorTipo.sust)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-border-dark">
                          <span className="text-slate-400">Materiales (BYD)</span>
                          <span className="font-bold text-white">{formatCurrency(montoPorTipo.byd)}</span>
                        </div>

                        <div className="pt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Subtotal</span>
                            <span className="font-bold text-white">{formatCurrency(subtotal)}</span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-slate-400">IVA (16%)</span>
                            <span className="font-bold text-white">{formatCurrency(iva)}</span>
                          </div>
                        </div>

                        <div className="bg-background-dark border border-border-dark rounded-lg p-4 mt-2">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] uppercase tracking-widest font-black text-primary">
                              Total valuacion
                            </span>
                            <span className="text-2xl font-black text-white">{formatCurrency(total)}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
                            <p className="text-[10px] uppercase text-amber-400 font-bold">Autorizado</p>
                            <p className="text-sm font-black mt-1 text-white">{formatCurrency(autorizado)}</p>
                          </div>
                          <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                            <p className="text-[10px] uppercase text-red-400 font-bold">Diferencia</p>
                            <p className="text-sm font-black mt-1 text-white">{formatCurrency(diferencia)}</p>
                          </div>
                        </div>
                      </div>
                    </aside>
                  </section>
                ) : null}

                {activeTab === "comparativa" ? (
                  <section className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 xl:col-span-5 bg-surface-dark border border-border-dark rounded-xl p-5">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white mb-4">
                        Conexion con aseguradora
                      </h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-background-dark border border-border-dark rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">
                            Aseguradora activa
                          </p>
                          <select
                            className="w-full bg-surface-dark border border-border-dark text-white text-sm rounded-lg py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary"
                            value={aseguradoraActiva}
                            onChange={(event) => setAseguradoraActiva(event.target.value)}
                          >
                            <option value="">Selecciona aseguradora</option>
                            {aseguradoras.map((item) => (
                              <option key={item.id} value={item.nb_aseguradora}>
                                {item.nb_aseguradora}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="p-4 bg-background-dark border border-border-dark rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">
                            Monto autorizado por aseguradora
                          </p>
                          <input
                            type="number"
                            className="w-full bg-surface-dark border border-border-dark rounded px-3 py-2 text-sm text-white"
                            value={autorizadoAseguradora}
                            onChange={(event) => setAutorizadoAseguradora(Number(event.target.value || 0))}
                          />
                        </div>

                        <button
                          className="w-full py-3 bg-primary hover:bg-primary/80 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
                          type="button"
                        >
                          <span
                            className="material-symbols-outlined animate-spin"
                            style={{ animationDuration: "3s" }}
                          >
                            sync
                          </span>
                          Sincronizar estatus ahora
                        </button>
                      </div>
                    </div>

                    <div className="col-span-12 xl:col-span-7 bg-surface-dark border border-border-dark rounded-xl p-5">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white mb-4">
                        Comparativa financiera
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                        <div className="bg-background-dark border border-border-dark rounded-lg p-4">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                            Total valuacion
                          </p>
                          <p className="text-lg font-black text-white mt-1">{formatCurrency(total)}</p>
                        </div>
                        <div className="bg-background-dark border border-border-dark rounded-lg p-4">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                            Autorizado portal
                          </p>
                          <p className="text-lg font-black text-white mt-1">{formatCurrency(autorizado)}</p>
                        </div>
                        <div className="bg-background-dark border border-border-dark rounded-lg p-4">
                          <p className="text-[10px] uppercase tracking-widest text-red-400 font-bold">
                            Diferencia
                          </p>
                          <p className="text-lg font-black text-red-400 mt-1">{formatCurrency(diferencia)}</p>
                        </div>
                      </div>

                      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-5">
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-amber-400">warning</span>
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                              Diferencia detectada
                            </p>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                              El monto de valuacion no coincide con el autorizado. Ajusta el
                              presupuesto o solicita ampliacion a la aseguradora.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-2 tracking-widest">
                          Observaciones de valuacion
                        </p>
                        <textarea
                          className="w-full bg-background-dark border border-border-dark rounded-lg text-xs p-3 text-white focus:ring-primary focus:border-primary placeholder:text-slate-500"
                          placeholder="Anadir notas internas sobre discrepancias, autorizaciones o cambios de alcance..."
                          rows="6"
                          value={observacionesValuacion}
                          onChange={(event) => setObservacionesValuacion(event.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            <button
              className="mt-6 text-sm text-slate-400 hover:text-white inline-flex items-center gap-2"
              type="button"
              onClick={() => navigate(-1)}
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Volver al listado
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
