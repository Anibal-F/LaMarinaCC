import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";
import {
  formatDateTime,
  getVehicleTitle,
  insurerTagClasses,
  parseDate,
  relativeTime
} from "./tallerShared.js";

// Metadatos para etapas dinámicas
const STAGE_METADATA = {
  recepcionado: { icon: "assignment_turned_in", targetTime: "00:30:00", label: "Recepcionado" },
  carroceria: { icon: "directions_car", targetTime: "04:00:00", label: "Carroceria" },
  pintura: { icon: "format_paint", targetTime: "05:00:00", label: "Pintura" },
  pulido: { icon: "auto_fix_high", targetTime: "02:00:00", label: "Pulido" },
  armado: { icon: "build", targetTime: "03:00:00", label: "Armado" },
  lavado: { icon: "local_car_wash", targetTime: "01:00:00", label: "Lavado" },
  entrega: { icon: "key", targetTime: "00:30:00", label: "Entrega" }
};

function getCurrentUserLabel() {
  try {
    const raw = window.localStorage.getItem("lmcc_user");
    if (!raw) return "Operador Taller";
    const parsed = JSON.parse(raw);
    return parsed?.nombre || parsed?.name || parsed?.username || "Operador Taller";
  } catch {
    return "Operador Taller";
  }
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    const dateA = parseDate(a.createdAt)?.getTime() || 0;
    const dateB = parseDate(b.createdAt)?.getTime() || 0;
    return dateB - dateA;
  });
}

export default function TallerEtapa() {
  const navigate = useNavigate();
  const { id, stageId } = useParams();
  const uploadInputRef = useRef(null);

  const [record, setRecord] = useState(null);
  const [stageRecord, setStageRecord] = useState(null);
  const [stageChecklist, setStageChecklist] = useState([]);
  const [stageNotes, setStageNotes] = useState([]);
  const [allOtStages, setAllOtStages] = useState([]);
  const [catalogEtapas, setCatalogEtapas] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noteInput, setNoteInput] = useState("");

  // Etapas dinámicas desde el catálogo
  const workshopStages = useMemo(() => {
    return catalogEtapas
      .filter(e => e.activo !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(etapa => {
        const meta = STAGE_METADATA[etapa.clave] || { icon: "pending", targetTime: "01:00:00", label: etapa.nb_etapa };
        return {
          id: etapa.clave,
          label: meta.label || etapa.nb_etapa,
          icon: meta.icon,
          targetTime: meta.targetTime,
          etapa_id: etapa.id
        };
      });
  }, [catalogEtapas]);

  const currentStage = useMemo(() => {
    return workshopStages.find((stage) => stage.id === stageId) || workshopStages[0] || { id: stageId, label: stageId, icon: "pending", targetTime: "01:00:00" };
  }, [workshopStages, stageId]);

  const currentStageIndex = useMemo(() => {
    return workshopStages.findIndex((stage) => stage.id === currentStage.id);
  }, [workshopStages, currentStage.id]);

  const nextStage = useMemo(() => {
    return workshopStages[currentStageIndex + 1] || null;
  }, [workshopStages, currentStageIndex]);

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError("");
      const [recordResponse, mediaResponse, stagesResponse, etapasResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}`),
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media`),
        fetch(`${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas`),
        fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`)
      ]);

      if (!recordResponse.ok) {
        throw new Error("No se pudo cargar la etapa solicitada.");
      }
      if (!stagesResponse.ok) {
        throw new Error("No se pudo cargar la operacion de taller.");
      }

      const recordPayload = await recordResponse.json();
      const mediaPayload = mediaResponse.ok ? await mediaResponse.json() : [];
      const stagesPayload = await stagesResponse.json();
      const etapasPayload = etapasResponse.ok ? await etapasResponse.json() : [];
      setCatalogEtapas(Array.isArray(etapasPayload) ? etapasPayload : []);
      const stageItems = Array.isArray(stagesPayload) ? stagesPayload : [];
      const currentStageRecord = stageItems.find((item) => item.clave === stageId);
      if (!currentStageRecord) {
        throw new Error("La etapa seleccionada no existe para esta OT.");
      }
      let expedientePayload = [];
      if (recordPayload?.folio_seguro) {
        const expedienteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(recordPayload.folio_seguro)}`
        );
        if (expedienteResponse.ok) {
          const expedienteData = await expedienteResponse.json();
          expedientePayload = Array.isArray(expedienteData?.archivos) ? expedienteData.archivos : [];
        }
      }
      const [checklistResponse, notesResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${currentStageRecord.etapa_id}/checklist`),
        fetch(`${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${currentStageRecord.etapa_id}/notas`)
      ]);
      if (!checklistResponse.ok) {
        throw new Error("No se pudo cargar el checklist operativo.");
      }
      if (!notesResponse.ok) {
        throw new Error("No se pudieron cargar las notas operativas.");
      }
      const checklistPayload = await checklistResponse.json();
      const notesPayload = await notesResponse.json();
      setRecord(recordPayload);
      setStageRecord(currentStageRecord);
      setAllOtStages(stageItems);
      if (!etapasResponse.ok) setCatalogEtapas([]);
      setStageChecklist(Array.isArray(checklistPayload) ? checklistPayload : []);
      setStageNotes(Array.isArray(notesPayload) ? notesPayload : []);
      setMediaItems(Array.isArray(mediaPayload) ? mediaPayload : []);
      setExpedienteFiles(expedientePayload);
    } catch (err) {
      setError(err.message || "No se pudo cargar la etapa.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [id, stageId]);

  const vehicleTitle = getVehicleTitle(record);

  const operationalTasks = stageChecklist;
  const completedTasks = operationalTasks.filter((item) => item.completado).length;
  const progressValue = operationalTasks.length ? Math.round((completedTasks / operationalTasks.length) * 100) : 0;
  const notes = sortNotes(
    stageNotes.map((note) => ({
      id: note.id,
      author: note.creado_por || "Operador Taller",
      text: note.nota,
      createdAt: note.created_at
    }))
  );

  const expedientePhotoItems = useMemo(
    () =>
      expedienteFiles.filter((item) => {
        const tipo = String(item.tipo || "").toLowerCase();
        const mime = String(item.mime_type || "").toLowerCase();
        const path = String(item.archivo_path || "").toLowerCase();
        return (
          (tipo === "recepcion_foto" || tipo === "valuacion_foto" || tipo === "archivorecepcion_vehiculo") &&
          (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => path.endsWith(ext)))
        );
      }),
    [expedienteFiles]
  );

  const photoItems = useMemo(
    () => mediaItems.filter((item) => String(item.media_type || "").startsWith("photo")),
    [mediaItems]
  );

  const evidenceItems = photoItems.length
    ? photoItems.map((item) => ({ id: item.id, path: item.file_path }))
    : expedientePhotoItems.map((item) => ({ id: item.id, path: item.archivo_path }));

  const primaryPhoto = evidenceItems[0]?.path ? resolveMediaUrl(evidenceItems[0].path) : "";

  const toggleTask = async (taskId) => {
    const targetTask = stageChecklist.find((item) => item.id === taskId);
    if (!targetTask || !stageRecord) return;
    setNotice("");
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${stageRecord.etapa_id}/checklist/${targetTask.checklist_item_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: !targetTask.completado,
            completado_por: getCurrentUserLabel()
          })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo actualizar el checklist.");
      }
      const updatedTask = await response.json();
      const nextChecklist = stageChecklist.map((item) => (item.id === updatedTask.id ? updatedTask : item));
      setStageChecklist(nextChecklist);
      const nextProgress = nextChecklist.length
        ? Math.round((nextChecklist.filter((item) => item.completado).length / nextChecklist.length) * 100)
        : 0;
      const stageResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${stageRecord.etapa_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            progreso: nextProgress,
            estatus: nextProgress >= 100 ? "COMPLETADO" : "EN_PROCESO"
          })
        }
      );
      if (stageResponse.ok) {
        const updatedStage = await stageResponse.json();
        setStageRecord((prev) => ({ ...prev, ...updatedStage }));
      }
    } catch (err) {
      setError(err.message || "No se pudo actualizar el checklist.");
    }
  };

  const handleAddNote = async () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    if (!stageRecord) return;
    try {
      setError("");
      setNotice("");
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${stageRecord.etapa_id}/notas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nota: trimmed,
            creado_por: getCurrentUserLabel()
          })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar la nota.");
      }
      const created = await response.json();
      setStageNotes((prev) => [created, ...prev]);
      setNoteInput("");
      setNotice("Nota operativa agregada.");
    } catch (err) {
      setError(err.message || "No se pudo guardar la nota.");
    }
  };

  const handleCompleteStage = async () => {
    if (!stageRecord) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const completeResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${stageRecord.etapa_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estatus: "COMPLETADO",
            progreso: 100,
            fecha_fin: new Date().toISOString()
          })
        }
      );
      if (!completeResponse.ok) {
        const payload = await completeResponse.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo finalizar la etapa.");
      }

      if (nextStage) {
        const nextStageRecord = allOtStages.find((item) => item.clave === nextStage.id);
        if (nextStageRecord) {
          const nextResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${nextStageRecord.etapa_id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                estatus: "EN_PROCESO",
                progreso: Math.max(Number(nextStageRecord.progreso || 0), 10),
                fecha_inicio: nextStageRecord.fecha_inicio || new Date().toISOString()
              })
            }
          );
          if (!nextResponse.ok) {
            const payload = await nextResponse.json().catch(() => null);
            throw new Error(payload?.detail || "No se pudo activar la siguiente etapa.");
          }
        }
      }

      setNotice(nextStage ? `Etapa finalizada. Siguiente etapa: ${nextStage.label}.` : "Etapa finalizada.");
      await loadRecord();
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError("");
      setNotice("");
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media?media_type=photo`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo cargar la foto.");
      }

      setNotice("Evidencia cargada correctamente.");
      await loadRecord();
    } catch (err) {
      setError(err.message || "No se pudo cargar la evidencia.");
    } finally {
      event.target.value = "";
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-background-dark text-slate-100 antialiased font-display">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
            <AppHeader title="Control de etapa" subtitle="Cargando informacion..." showSearch={false} />
            <div className="flex-1 flex items-center justify-center text-slate-400">Cargando etapa...</div>
          </main>
        </div>
      </div>
    );
  }

  if (!record || !stageRecord) {
    return (
      <div className="bg-background-dark text-slate-100 antialiased font-display">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
            <AppHeader title="Control de etapa" subtitle="No se encontro el registro solicitado." showSearch={false} />
            <div className="flex-1 p-6">
              <Link to="/taller/autos-en-sitio" className="text-primary text-sm font-semibold">
                Volver a autos en sitio
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-dark text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title={`Control de ${currentStage.label}`}
            subtitle="Panel operativo de la etapa seleccionada."
            showSearch={false}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/taller/autos-en-sitio/${id}`)}
                  className="flex items-center gap-2 rounded-lg border border-border-dark bg-surface-dark px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  Gestion
                </button>
                <button
                  type="button"
                  onClick={handleCompleteStage}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-alert-green px-4 py-2 text-sm font-bold text-background-dark transition-colors hover:bg-alert-green/90 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  {saving ? "Finalizando..." : "Finalizar etapa"}
                </button>
              </>
            }
          />

          <div
            className="flex-1 overflow-y-auto custom-scrollbar p-6"
            style={{
              backgroundImage: "radial-gradient(circle at 2px 2px, rgba(63,68,76,0.55) 1px, transparent 0)",
              backgroundSize: "40px 40px"
            }}
          >
            <div className="mx-auto max-w-7xl space-y-6">
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <article className="xl:col-span-7 overflow-hidden rounded-2xl border border-primary/25 bg-surface-dark p-6 shadow-2xl shadow-black/20">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-primary">Etapa de trabajo activa</p>
                      <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                        {currentStage.label}
                      </h2>
                      <p className="mt-3 text-sm text-slate-400">
                        {stageRecord.updated_at ? relativeTime(stageRecord.updated_at) : "Lista para registrar actividad operativa."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border-dark bg-background-dark/70 p-4 text-left lg:min-w-[190px] lg:text-right">
                      <p className="text-sm text-slate-400">Tiempo objetivo</p>
                      <p className="mt-1 text-2xl font-black text-white">{currentStage.targetTime}</p>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      {completedTasks} de {operationalTasks.length} completado
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-lg font-bold uppercase text-white">
                        <span className="material-symbols-outlined text-primary">fact_check</span>
                        Lista de verificacion operacional
                      </h3>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{progressValue}% avance</span>
                    </div>

                    <div className="space-y-3">
                      {operationalTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => toggleTask(task.id)}
                          className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                            task.done
                              ? "border-primary/60 bg-primary/10"
                              : "border-border-dark bg-background-dark/60 hover:border-primary/40"
                          }`}
                        >
                          <div className="shrink-0">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded border-2 ${
                                task.completado ? "border-primary bg-primary text-white" : "border-slate-500 text-transparent"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-black uppercase tracking-widest ${task.completado ? "text-primary" : "text-white"}`}>
                              {task.descripcion}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {task.obligatorio ? "Punto obligatorio para completar la etapa." : "Punto operativo opcional."}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </article>

                <div className="xl:col-span-5 flex flex-col gap-4">
                  <article className="rounded-2xl border border-border-dark bg-surface-dark p-6">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Identidad del vehiculo</h3>
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between gap-4 border-b border-border-dark pb-2 text-sm">
                        <span className="text-slate-400">Placa</span>
                        <span className="font-bold text-white">{record.placas || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-border-dark pb-2 text-sm">
                        <span className="text-slate-400">OT</span>
                        <span className="font-bold text-white">#{record.folio_ot || record.folio_recep || record.id}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-border-dark pb-2 text-sm">
                        <span className="text-slate-400">Modelo</span>
                        <span className="text-right text-white">{vehicleTitle}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-border-dark pb-2 text-sm">
                        <span className="text-slate-400">Cliente</span>
                        <span className="text-right text-white">{record.nb_cliente || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-400">Aseguradora</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${insurerTagClasses(record.seguro)}`}>
                          {record.seguro || "Sin seguro"}
                        </span>
                      </div>
                    </div>
                  </article>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-primary/30 bg-surface-dark p-5 text-primary transition-all hover:bg-primary/5 disabled:opacity-60"
                    >
                      <div className="rounded-full bg-primary/10 p-4">
                        <span className="material-symbols-outlined text-4xl">photo_camera</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest">{uploading ? "Cargando..." : "Capturar foto"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate(`/taller/autos-en-sitio/${id}`)}
                      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-dark bg-surface-dark p-5 text-slate-300 transition-all hover:bg-white/5"
                    >
                      <div className="rounded-full bg-slate-700/50 p-4">
                        <span className="material-symbols-outlined text-4xl">image</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest">Ver galeria</span>
                    </button>
                  </div>

                  <article className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                    <div className="aspect-[16/10] bg-background-dark">
                      {primaryPhoto ? (
                        <img src={primaryPhoto} alt={vehicleTitle} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-500">
                          <span className="material-symbols-outlined text-5xl">directions_car</span>
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-xl font-bold uppercase text-white">
                    <span className="material-symbols-outlined text-primary">comment</span>
                    Observaciones tecnicas
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <article className="rounded-2xl border border-border-dark bg-surface-dark p-5">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Agregar comentario</label>
                    <textarea
                      rows={5}
                      value={noteInput}
                      onChange={(event) => setNoteInput(event.target.value)}
                      className="mt-3 w-full resize-none rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Escribe tus observaciones operativas..."
                    />
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddNote}
                        className="rounded-lg bg-primary px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-primary/90"
                      >
                        Agregar nota
                      </button>
                    </div>
                  </article>

                  <article className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark">
                    <div className="border-b border-border-dark bg-surface-dark px-5 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Historial de notas</p>
                    </div>
                    <div className="max-h-[280px] space-y-3 overflow-y-auto p-5 custom-scrollbar">
                      {notes.length ? (
                        notes.map((note) => (
                          <div key={note.id} className="rounded-xl border-l-2 border-primary/50 bg-background-dark/50 p-4">
                            <div className="mb-1 flex items-start justify-between gap-4">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{note.author}</span>
                              <span className="text-[10px] text-slate-500">{formatDateTime(note.createdAt)}</span>
                            </div>
                            <p className="text-sm text-slate-300">{note.text}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-border-dark bg-background-dark/30 p-4 text-sm text-slate-500">
                          Sin notas registradas para esta etapa.
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              </section>

              {error ? <p className="text-sm text-alert-red">{error}</p> : null}
              {notice ? <p className="text-sm text-primary">{notice}</p> : null}
            </div>

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadPhoto}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
