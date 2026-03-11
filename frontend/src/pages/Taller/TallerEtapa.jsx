import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";
import {
  WORKSHOP_STAGES,
  buildDraft,
  formatDateTime,
  getStageMeta,
  getVehicleTitle,
  insurerTagClasses,
  loadDrafts,
  parseDate,
  relativeTime,
  saveDraft
} from "./tallerShared.js";

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
  const [draft, setDraft] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noteInput, setNoteInput] = useState("");

  const currentStage = getStageMeta(stageId);
  const currentStageIndex = WORKSHOP_STAGES.findIndex((stage) => stage.id === currentStage.id);
  const nextStage = WORKSHOP_STAGES[currentStageIndex + 1] || null;

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError("");
      const [recordResponse, mediaResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}`),
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media`)
      ]);

      if (!recordResponse.ok) {
        throw new Error("No se pudo cargar la etapa solicitada.");
      }

      const recordPayload = await recordResponse.json();
      const mediaPayload = mediaResponse.ok ? await mediaResponse.json() : [];
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

      const existingDraft = loadDrafts()[id];
      setRecord(recordPayload);
      setDraft(buildDraft(recordPayload, existingDraft));
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

  const operationalTasks = draft?.stageTasks?.[currentStage.id] || [];
  const completedTasks = operationalTasks.filter((item) => item.done).length;
  const progressValue = operationalTasks.length ? Math.round((completedTasks / operationalTasks.length) * 100) : 0;
  const notes = sortNotes(draft?.stageNotes?.[currentStage.id] || []);

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

  const persistDraft = (updater, successMessage = "") => {
    setDraft((prev) => {
      const nextDraft = typeof updater === "function" ? updater(prev) : updater;
      const finalDraft = { ...nextDraft, updatedAt: new Date().toISOString() };
      saveDraft(id, finalDraft);
      if (successMessage) setNotice(successMessage);
      return finalDraft;
    });
  };

  const toggleTask = (taskId) => {
    setNotice("");
    persistDraft(
      (prev) => ({
        ...prev,
        stageTasks: {
          ...prev.stageTasks,
          [currentStage.id]: prev.stageTasks[currentStage.id].map((task) =>
            task.id === taskId ? { ...task, done: !task.done } : task
          )
        }
      }),
      ""
    );
  };

  const handleAddNote = () => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;

    const note = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      author: getCurrentUserLabel(),
      text: trimmed,
      createdAt: new Date().toISOString()
    };

    setNotice("");
    persistDraft(
      (prev) => ({
        ...prev,
        stageNotes: {
          ...prev.stageNotes,
          [currentStage.id]: [note, ...(prev.stageNotes?.[currentStage.id] || [])]
        }
      }),
      "Nota operativa agregada."
    );
    setNoteInput("");
  };

  const handleCompleteStage = () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      persistDraft(
        (prev) => ({
          ...prev,
          currentStage: nextStage?.id || currentStage.id
        }),
        nextStage ? `Etapa finalizada. Siguiente etapa: ${nextStage.label}.` : "Etapa finalizada."
      );
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

  if (!record || !draft) {
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
                        {draft.updatedAt ? relativeTime(draft.updatedAt) : "Lista para registrar actividad operativa."}
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
                                task.done ? "border-primary bg-primary text-white" : "border-slate-500 text-transparent"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-black uppercase tracking-widest ${task.done ? "text-primary" : "text-white"}`}>
                              {task.label}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">{task.detail}</p>
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
